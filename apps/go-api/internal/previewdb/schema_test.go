// previewdb 测试验证 schema 命名、SQL 安全边界和 pgx 参数编码，
// 大部分测试不连接数据库即可覆盖高风险逻辑。
package previewdb

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// TestSchemaNameUsesOnlyBoundedPRNumbers 验证 PR schema 名和数值边界。
func TestSchemaNameUsesOnlyBoundedPRNumbers(t *testing.T) {
	// 匿名 struct slice 构成 table-driven test，同时覆盖边界值和非法值。
	for _, test := range []struct {
		pr   int
		want string
		err  bool
	}{
		{pr: 1, want: "pr_1"},
		{pr: MaxPRNumber, want: "pr_49999"},
		{pr: 0, err: true},
		{pr: -1, err: true},
		{pr: MaxPRNumber + 1, err: true},
	} {
		got, err := SchemaName(test.pr)
		if test.err && err == nil {
			t.Fatalf("SchemaName(%d) error = nil", test.pr)
		}
		if !test.err && (err != nil || got != test.want) {
			t.Fatalf("SchemaName(%d) = %q, %v; want %q", test.pr, got, err, test.want)
		}
	}
}

// TestPreviewDDLNeverReferencesProductionTables 验证 preview SQL 绝不指向 public 表。
func TestPreviewDDLNeverReferencesProductionTables(t *testing.T) {
	// append 可一次追加多个 string；再 Join 后整体扫描是否泄漏 public schema。
	statements := append(createStatements("pr_123"), seedAccountStatement("pr_123"), seedIntroductionStatement("pr_123"))
	joined := strings.Join(statements, "\n")
	if strings.Contains(joined, `"public"`) || strings.Contains(joined, "public.github_account") {
		t.Fatalf("preview DDL references production schema:\n%s", joined)
	}
	if !strings.Contains(joined, `"pr_123"."github_account"`) || !strings.Contains(joined, `"pr_123"."profile_introduction"`) {
		t.Fatalf("preview DDL is not schema-qualified:\n%s", joined)
	}
}

// TestPreviewSeedUsesExplicitParameterTypes 验证 SQL 参数位置和 PostgreSQL 类型。
func TestPreviewSeedUsesExplicitParameterTypes(t *testing.T) {
	account := seedAccountStatement("pr_123")
	introduction := seedIntroductionStatement("pr_123")

	if !strings.Contains(account, "$1::bigint") {
		t.Fatalf("account seed does not cast the PR number to bigint:\n%s", account)
	}
	if !strings.Contains(introduction, "$1::bigint") || !strings.Contains(introduction, "$2::text") {
		t.Fatalf("introduction seed does not separate bigint and text parameters:\n%s", introduction)
	}
	if strings.Contains(introduction, "$1::text") || strings.Contains(introduction, "$2::bigint") {
		t.Fatalf("introduction seed mixes bigint and text parameter roles:\n%s", introduction)
	}
	if content := previewIntroductionContent(123); !strings.Contains(content, "PR #123") {
		t.Fatalf("preview introduction content = %q, want PR number", content)
	}
	args := previewIntroductionArgs(123)
	if len(args) != 2 {
		t.Fatalf("preview introduction args length = %d, want 2", len(args))
	}
	// .(int64) 是 type assertion：从 any 中取出 int64，并用 ok 避免类型错误 panic。
	if prNumber, ok := args[0].(int64); !ok || prNumber != 123 {
		t.Fatalf("preview introduction args[0] = %#v, want int64(123)", args[0])
	}
	if content, ok := args[1].(string); !ok || !strings.Contains(content, "PR #123") {
		t.Fatalf("preview introduction args[1] = %#v, want typed content string", args[1])
	}
}

// TestPreviewIntroductionArgsCanBeEncodedByPGX 验证运行时参数能被 pgx 编码。
func TestPreviewIntroductionArgsCanBeEncodedByPGX(t *testing.T) {
	args := previewIntroductionArgs(123)
	typeMap := pgtype.NewMap()

	// 每个表格用例通过 t.Run 创建有名字的子测试，失败输出会包含 test.name。
	for _, test := range []struct {
		name string
		oid  uint32
		arg  any
	}{
		{name: "PR number as bigint", oid: pgtype.Int8OID, arg: args[0]},
		{name: "content as text", oid: pgtype.TextOID, arg: args[1]},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := typeMap.Encode(test.oid, pgx.TextFormatCode, test.arg, nil); err != nil {
				t.Fatalf("pgx encode failed: %v", err)
			}
		})
	}
}

// TestDropRequiresExactSchemaConfirmation 验证危险删除前的精确确认安全门。
func TestDropRequiresExactSchemaConfirmation(t *testing.T) {
	// t.Context() 在测试结束时自动取消，适合传给支持 context 的被测函数。
	err := Drop(t.Context(), panicBeginner{}, 123, "pr_124")
	if !errors.Is(err, ErrUnsafeConfirmation) {
		t.Fatalf("Drop() error = %v, want ErrUnsafeConfirmation", err)
	}
}

// panicBeginner 是安全断言 fake：如果 Drop 在确认失败后仍访问数据库，测试会 panic。
type panicBeginner struct{}

// Begin 一旦被调用就 panic，用来证明不安全输入会在数据库访问前被拒绝。
func (panicBeginner) Begin(_ context.Context) (pgx.Tx, error) {
	panic("Begin must not be called when confirmation is unsafe")
}
