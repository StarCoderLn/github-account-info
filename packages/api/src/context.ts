import { db } from "@github-account-info/db";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
	managementApiEnabled: boolean;
};

export async function createContext(options: CreateContextOptions) {
	return {
		auth: null,
		session: null,
		db,
		managementApiEnabled: options.managementApiEnabled,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
