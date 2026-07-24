import { Toaster } from "@github-account-info/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
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
					<div className="mx-auto flex max-w-6xl items-center justify-between">
						<span className="font-bold text-gray-900 text-xl">
							GitHub 账号信息
						</span>
						<nav className="flex items-center gap-1 text-sm">
							<Link
								to="/accounts"
								className="px-3 py-1.5 text-slate-600 hover:bg-slate-100"
								activeProps={{ className: "bg-slate-900 text-white" }}
							>
								账号
							</Link>
							<Link
								to="/ops"
								className="px-3 py-1.5 text-slate-600 hover:bg-slate-100"
								activeProps={{ className: "bg-slate-900 text-white" }}
							>
								AI Ops
							</Link>
						</nav>
					</div>
				</header>
				<main className="px-6 py-8">
					<Outlet />
				</main>
			</div>
			<Toaster richColors />
		</>
	);
}
