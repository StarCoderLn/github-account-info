// 测试文件以 _test.go 结尾，只在 go test 时编译，不进入 production 二进制。
// 使用 package appserver 而非 appserver_test，使测试可以访问包内未导出标识符。
package appserver

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

// fakeServer 是手写测试替身。只要方法集合匹配，就会隐式实现 HTTPServer。
type fakeServer struct {
	started chan struct{}
	stopped chan struct{}
	// sync.Once 保证 stopped channel 只 close 一次；重复 close channel 会 panic。
	shutdownOnce sync.Once
	listenErr    error
	shutdownErr  error
	shutdownSeen bool
}

// newFakeServer 构造每个测试独享的 channel，避免测试间共享状态。
func newFakeServer() *fakeServer {
	return &fakeServer{
		started:   make(chan struct{}),
		stopped:   make(chan struct{}),
		listenErr: http.ErrServerClosed,
	}
}

// ListenAndServe 模拟 Server 启动，并阻塞到测试调用 Shutdown。
func (f *fakeServer) ListenAndServe() error {
	// close(started) 广播“已启动”；从 stopped 接收会阻塞到 Shutdown 关闭它。
	close(f.started)
	<-f.stopped
	return f.listenErr
}

// Shutdown 记录调用，并在成功路径解除 ListenAndServe 的阻塞。
func (f *fakeServer) Shutdown(_ context.Context) error {
	f.shutdownSeen = true
	if f.shutdownErr == nil {
		f.shutdownOnce.Do(func() { close(f.stopped) })
	}
	return f.shutdownErr
}

// TestRunGracefullyShutsDownOnContextCancellation 验证取消信号会触发优雅关闭。
func TestRunGracefullyShutsDownOnContextCancellation(t *testing.T) {
	// 名称以 Test 开头且参数为 *testing.T 的函数会被 go test 自动发现。
	server := newFakeServer()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, server, time.Second)
	}()

	<-server.started
	cancel()

	// 测试用 select + time.After 设置上限，防止代码出错时测试永远挂住。
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Run() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Run() did not stop after cancellation")
	}
	if !server.shutdownSeen {
		t.Fatal("Shutdown() was not called")
	}
}

// TestRunReturnsListenFailure 验证监听失败会原样返回给调用方。
func TestRunReturnsListenFailure(t *testing.T) {
	server := newFakeServer()
	want := errors.New("listen failed")
	server.listenErr = want
	close(server.stopped)

	// t.Fatalf 记录失败并立即终止当前测试；格式化规则与 fmt.Printf 相同。
	if err := Run(context.Background(), server, time.Second); !errors.Is(err, want) {
		t.Fatalf("Run() error = %v, want listen failure", err)
	}
}

// TestRunReturnsShutdownFailure 验证 Shutdown 错误不会被吞掉。
func TestRunReturnsShutdownFailure(t *testing.T) {
	server := newFakeServer()
	server.shutdownErr = errors.New("shutdown failed")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, server, time.Second)
	}()

	<-server.started
	cancel()
	if err := <-done; !errors.Is(err, server.shutdownErr) {
		t.Fatalf("Run() error = %v, want shutdown failure", err)
	}
}
