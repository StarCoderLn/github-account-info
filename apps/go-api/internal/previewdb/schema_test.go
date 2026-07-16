package previewdb

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestSchemaNameUsesOnlyBoundedPRNumbers(t *testing.T) {
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

func TestPreviewDDLNeverReferencesProductionTables(t *testing.T) {
	statements := append(createStatements("pr_123"), seedAccountStatement("pr_123"), seedIntroductionStatement("pr_123"))
	joined := strings.Join(statements, "\n")
	if strings.Contains(joined, `"public"`) || strings.Contains(joined, "public.github_account") {
		t.Fatalf("preview DDL references production schema:\n%s", joined)
	}
	if !strings.Contains(joined, `"pr_123"."github_account"`) || !strings.Contains(joined, `"pr_123"."profile_introduction"`) {
		t.Fatalf("preview DDL is not schema-qualified:\n%s", joined)
	}
}

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
	if prNumber, ok := args[0].(int64); !ok || prNumber != 123 {
		t.Fatalf("preview introduction args[0] = %#v, want int64(123)", args[0])
	}
	if content, ok := args[1].(string); !ok || !strings.Contains(content, "PR #123") {
		t.Fatalf("preview introduction args[1] = %#v, want typed content string", args[1])
	}
}

func TestPreviewIntroductionArgsCanBeEncodedByPGX(t *testing.T) {
	args := previewIntroductionArgs(123)
	typeMap := pgtype.NewMap()

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

func TestDropRequiresExactSchemaConfirmation(t *testing.T) {
	err := Drop(t.Context(), panicBeginner{}, 123, "pr_124")
	if !errors.Is(err, ErrUnsafeConfirmation) {
		t.Fatalf("Drop() error = %v, want ErrUnsafeConfirmation", err)
	}
}

type panicBeginner struct{}

func (panicBeginner) Begin(_ context.Context) (pgx.Tx, error) {
	panic("Begin must not be called when confirmation is unsafe")
}
