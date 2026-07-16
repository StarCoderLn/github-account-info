package previewdb

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
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
	if !strings.Contains(introduction, "$1::text") || !strings.Contains(introduction, "$1::bigint") {
		t.Fatalf("introduction seed does not cast the PR number for both text and bigint contexts:\n%s", introduction)
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
