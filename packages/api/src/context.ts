import { db } from "@github-account-info/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext(_options: CreateContextOptions) {
	return {
		auth: null,
		session: null,
		db,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
