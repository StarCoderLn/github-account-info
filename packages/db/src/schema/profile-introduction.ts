import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { githubAccount } from "./github-account";

export const profileIntroduction = pgTable("profile_introduction", {
	id: serial("id").primaryKey(),
	githubAccountId: integer("github_account_id")
		.notNull()
		.references(() => githubAccount.id, { onDelete: "cascade" })
		.unique(),
	content: text("content").notNull(),
	generatorVersion: text("generator_version").notNull(),
	sourceHash: text("source_hash").notNull(),
	generatedAt: timestamp("generated_at").notNull().defaultNow(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProfileIntroductionRow = typeof profileIntroduction.$inferSelect;
export type ProfileIntroductionInsert = typeof profileIntroduction.$inferInsert;
