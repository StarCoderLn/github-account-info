package appserver

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

type fakeServer struct {
	started      chan struct{}
	stopped      chan struct{}
	shutdownOnce sync.Once
	listenErr    error
	shutdownErr  error
	shutdownSeen bool
}

func newFakeServer() *fakeServer {
	return &fakeServer{
		started:   make(chan struct{}),
		stopped:   make(chan struct{}),
		listenErr: http.ErrServerClosed,
	}
}

func (f *fakeServer) ListenAndServe() error {
	close(f.started)
	<-f.stopped
	return f.listenErr
}

func (f *fakeServer) Shutdown(_ context.Context) error {
	f.shutdownSeen = true
	if f.shutdownErr == nil {
		f.shutdownOnce.Do(func() { close(f.stopped) })
	}
	return f.shutdownErr
}

func TestRunGracefullyShutsDownOnContextCancellation(t *testing.T) {
	server := newFakeServer()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- Run(ctx, server, time.Second)
	}()

	<-server.started
	cancel()

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

func TestRunReturnsListenFailure(t *testing.T) {
	server := newFakeServer()
	want := errors.New("listen failed")
	server.listenErr = want
	close(server.stopped)

	if err := Run(context.Background(), server, time.Second); !errors.Is(err, want) {
		t.Fatalf("Run() error = %v, want listen failure", err)
	}
}

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
