// Package appserver 封装 HTTP Server 的启动、信号等待和优雅关闭流程。
package appserver

import (
	"context"
	"errors"
	"net/http"
	"time"
)

// HTTPServer 是本包真正需要的最小能力集合。
// Go 的 interface 是隐式实现：任何拥有这两个方法的类型都自动满足接口，
// 因此 *http.Server 和测试 fake 都可以传给 Run。
type HTTPServer interface {
	ListenAndServe() error
	Shutdown(ctx context.Context) error
}

// Run 在后台启动 HTTP Server，并在 Server 退出或 ctx 被取消时返回。
// ctx 取消时会给 Server 一个独立的 shutdownTimeout 完成优雅关闭。
func Run(ctx context.Context, server HTTPServer, shutdownTimeout time.Duration) error {
	// channel 用于 goroutine 之间传递值。容量 1 让发送方即使主流程还没接收
	// 也能写入结果并退出，避免 goroutine 泄漏。
	serverErrors := make(chan error, 1)
	// go 关键字在新的 goroutine 中并发执行匿名函数。
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	// select 会阻塞等待多个 channel，哪个先就绪就执行哪个 case。
	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// <-ctx.Done() 只接收信号而不关心值；context 被取消/超时时 channel 关闭。
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}

		// Shutdown 会让 ListenAndServe 返回 http.ErrServerClosed；等待 goroutine 的
		// 最终结果，确保后台启动流程已经结束。
		err := <-serverErrors
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
