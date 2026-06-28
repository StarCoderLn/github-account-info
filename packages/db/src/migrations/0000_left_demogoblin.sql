CREATE TABLE "github_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"github_id" bigint NOT NULL,
	"name" text,
	"avatar_url" text,
	"bio" text,
	"company" text,
	"location" text,
	"email" text,
	"public_repos" integer DEFAULT 0 NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"following" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_account_github_id_unique" UNIQUE("github_id")
);
