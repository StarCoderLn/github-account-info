// command preview-db 是预览环境数据库 schema 的一次性管理命令。
// 它与 HTTP API 分成两个 main 包，分别构建成两个独立可执行文件。
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/postgres"
	"github.com/StarCoderLn/github-account-info/apps/go-api/internal/previewdb"
)

// main 只负责把错误转换成日志和进程退出码，实际逻辑放在 run 中；
// 这样 run 可以返回 error，控制流比在每一步直接 os.Exit 更清晰。
func main() {
	if err := run(); err != nil {
		slog.Error("preview database operation failed", "error", err)
		os.Exit(1)
	}
}

// run 解析 create/drop 子命令，连接 preview 数据库并执行 schema 生命周期操作。
func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: preview-db <create|drop> --pr-number <number>")
	}
	operation := os.Args[1]
	// flag.NewFlagSet 为当前子命令创建独立参数解析器。
	// Int/String 返回指针，解析完成后用 *prNumber、*confirmation 解引用取值。
	flags := flag.NewFlagSet(operation, flag.ContinueOnError)
	prNumber := flags.Int("pr-number", 0, "GitHub pull request number")
	confirmation := flags.String("confirm-schema", "", "exact pr_<number> confirmation required for drop")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	caBundle := strings.TrimSpace(os.Getenv("RDS_CA_BUNDLE"))
	if caBundle == "" || !filepath.IsAbs(caBundle) {
		return errors.New("RDS_CA_BUNDLE must be an absolute path")
	}

	// defer cancel() 表示 run 返回时取消 context，释放关联 timer；
	// 超时信号也会继续传递给数据库连接和 SQL 操作。
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := postgres.Open(ctx, databaseURL, "public", postgres.TLSOptions{
		VerifyFull:          true,
		RootCertificatePath: caBundle,
	})
	if err != nil {
		return fmt.Errorf("connect to preview database: %w", err)
	}
	defer pool.Close()

	// switch 比连续多个 if 更适合处理有限且互斥的子命令。
	switch operation {
	case "create":
		if *confirmation != "" {
			return errors.New("--confirm-schema is only valid for drop")
		}
		if err := previewdb.Create(ctx, pool, *prNumber); err != nil {
			return err
		}
	case "drop":
		if err := previewdb.Drop(ctx, pool, *prNumber, *confirmation); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported operation %q", operation)
	}

	// 这里前面的 create/drop 已经验证过同一个 PR number，因此可明确忽略第二个
	// 返回值 error。下划线 _ 是 Go 的 blank identifier，用于丢弃不需要的值。
	schema, _ := previewdb.SchemaName(*prNumber)
	slog.Info("preview database operation completed", "operation", operation, "schema", schema, "prNumber", *prNumber)
	return nil
}
