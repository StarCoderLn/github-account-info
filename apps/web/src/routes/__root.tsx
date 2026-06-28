import { Toaster } from "@github-account-info/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";

import type { trpc } from "@/utils/trpc";

import "../index.css";

export interface RouterAppContext {
	trpc: typeof trpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "GitHub 账号信息" },
			{
				name: "description",
				content: "管理 GitHub Token 并编辑账号信息",
			},
		],
		links: [{ rel: "icon", href: "/favicon.ico" }],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div className="min-h-svh bg-gray-50">
				<header className="border-gray-200 border-b bg-white px-6 py-4">
					<div className="mx-auto flex max-w-3xl items-center">
						<span className="font-bold text-gray-900 text-xl">
							GitHub 账号信息
						</span>
					</div>
				</header>
				<main className="mx-auto max-w-3xl px-6 py-8">
					<Outlet />
				</main>
			</div>
			<Toaster richColors />
		</>
	);
}
