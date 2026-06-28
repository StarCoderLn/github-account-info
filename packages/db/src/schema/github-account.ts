import {
	bigint,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const githubAccount = pgTable("github_account", {
	id: serial("id").primaryKey(),
	login: text("login").notNull(),
	githubId: bigint("github_id", { mode: "number" }).notNull().unique(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	bio: text("bio"),
	company: text("company"),
	location: text("location"),
	email: text("email"),
	blog: text("blog"),
	twitterUsername: text("twitter_username"),
	publicRepos: integer("public_repos").notNull().default(0),
	followers: integer("followers").notNull().default(0),
	following: integer("following").notNull().default(0),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GithubAccountRow = typeof githubAccount.$inferSelect;
export type GithubAccountInsert = typeof githubAccount.$inferInsert;
