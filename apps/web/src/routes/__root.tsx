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
				<header className="border-b border-gray-200 bg-white px-6 py-4">
					<div className="mx-auto flex max-w-3xl items-center justify-between">
						<span className="font-bold text-gray-900 text-xl">
							GitHub 账号信息
						</span>
						<nav className="flex gap-1">
							<Link
								to="/"
								activeOptions={{ exact: true }}
								className="rounded-full px-4 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100"
								activeProps={{ className: "rounded-full px-4 py-1.5 text-sm font-medium bg-blue-50 text-blue-600 transition" }}
							>
								Token 管理
							</Link>
							<Link
								to="/profile"
								className="rounded-full px-4 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100"
								activeProps={{ className: "rounded-full px-4 py-1.5 text-sm font-medium bg-blue-50 text-blue-600 transition" }}
							>
								账号信息
							</Link>
						</nav>
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
