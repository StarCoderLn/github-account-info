// command api 是 Go HTTP API 的可执行程序入口。
// package main 表示这个包会被编译成可执行文件，而不是供其他包 import 的库。
package main

// import 块声明当前文件依赖的标准库和项目内部包。
// Go 编译器不允许存在未使用的 import，这能避免依赖列表长期积累垃圾项。
import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/account"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/appserver"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/config"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/httpapi"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/introduction"
	appPostgres "github.com/StarCoderLn/github-account-info/apps/go-api/internal/postgres"
)

// main 是可执行程序的固定入口，没有参数也没有返回值。
// 发生不可恢复的启动错误时记录日志并用非零退出码结束进程。
func main() {
	// := 是短变量声明；编译器会根据右侧值推导 logger 的类型。
	// slog.NewJSONHandler 让日志以 JSON 输出，便于 CloudWatch Logs 检索字段。
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Go 常用“返回值 + error”表达可能失败的操作；err 为 nil 表示成功。
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	// context 用于传递取消/超时信号。这里限制数据库初始化最多 10 秒，
	// 防止网络异常时进程永久卡在启动阶段。
	databaseCtx, cancelDatabase := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := appPostgres.Open(
		databaseCtx,
		cfg.DatabaseURL,
		cfg.DatabaseSchema,
		appPostgres.TLSOptions{
			VerifyFull:          cfg.Production(),
			RootCertificatePath: cfg.RDSCABundle,
		},
	)
	// 初始化调用结束后立即释放 timer 资源；不必等到 main 返回。
	cancelDatabase()
	if err != nil {
		logger.Error("database initialization failed")
		os.Exit(1)
	}
	// defer 会在当前函数 main 退出前执行。数据库池成功创建后，无论后面从
	// 哪条路径退出，都应该关闭连接池。
	defer pool.Close()

	// 下面是手工依赖注入：先创建 Repository，再创建 Service，最后交给 HTTP 层。
	// Go 常用构造函数显式组装依赖，不需要重量级依赖注入框架。
	accountRepository := account.NewRepository(pool)
	introductionRepository := introduction.NewRepository(pool)
	introductionService := introduction.NewService(
		accountRepository,
		introductionRepository,
		introduction.TemplateGenerator{},
	)

	// &T{...} 创建结构体并返回指针。http.Server 使用指针是因为启动和关闭
	// 会修改其内部状态，而且无需复制整个 Server 值。
	server := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Introductions:           introductionService,
			Readiness:               pool,
			Logger:                  logger,
			CORSOrigins:             cfg.CORSOrigins,
			CORSPreviewOriginSuffix: cfg.CORSPreviewOriginSuffix,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// 收到 Ctrl+C(SIGINT) 或容器终止信号(SIGTERM)时取消 ctx，触发优雅关闭。
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("go api listening", "port", cfg.Port)
	// if err := ...; err != nil 是 Go 常见写法：err 只在这个 if/else 作用域内存在。
	if err := appserver.Run(ctx, server, cfg.ShutdownTimeout); err != nil {
		logger.Error("go api stopped with error", "error", err)
		os.Exit(1)
	}
	logger.Info("go api stopped")
}
