CREATE TABLE "profile_introduction" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_account_id" integer NOT NULL,
	"content" text NOT NULL,
	"generator_version" text NOT NULL,
	"source_hash" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profile_introduction_github_account_id_unique" UNIQUE("github_account_id")
);
--> statement-breakpoint
ALTER TABLE "profile_introduction" ADD CONSTRAINT "profile_introduction_github_account_id_github_account_id_fk" FOREIGN KEY ("github_account_id") REFERENCES "public"."github_account"("id") ON DELETE cascade ON UPDATE no action;