import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
	addToken,
	getTokens,
	removeToken,
	setSelectedTokenId,
	type SavedToken,
} from "@/utils/token-store";

export const Route = createFileRoute("/")({
	component: TokenPage,
});

function TokenPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [token, setToken] = useState("");
	const [tokens, setTokens] = useState<SavedToken[]>([]);

	useEffect(() => {
		setTokens(getTokens());
	}, []);

	const fetchMut = useMutation(trpc.github.getAccount.mutationOptions());

	const handleAdd = async () => {
		const trimmedName = name.trim();
		const trimmedToken = token.trim();
		if (!trimmedName) { toast.error("请输入 Token 名称"); return; }
		if (!trimmedToken) { toast.error("请输入 Token 值"); return; }
		try {
			const acc = await fetchMut.mutateAsync({ token: trimmedToken });
			const id = crypto.randomUUID();
			const now = new Date();
			const createdAt = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
			const saved: SavedToken = {
				id,
				name: trimmedName,
				token: trimmedToken,
				login: acc.login,
				displayName: acc.name,
				avatarUrl: acc.avatarUrl,
				publicRepos: acc.publicRepos,
				followers: acc.followers,
				following: acc.following,
				createdAt,
			};
			addToken(saved);
			setSelectedTokenId(id);
			setTokens(getTokens());
			setName("");
			setToken("");
			fetchMut.reset();
			toast.success(`Token "${trimmedName}" 已添加`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Token 验证失败");
		}
	};

	const handleCardClick = (t: SavedToken) => {
		setSelectedTokenId(t.id);
		navigate({ to: "/profile" });
	};

	const handleDelete = (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		removeToken(id);
		setTokens(getTokens());
	};

	return (
		<div className="grid gap-6">
			<h2 className="font-semibold text-gray-900 text-xl">Token 管理</h2>

			{/* Add token form */}
			<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h3 className="mb-4 font-medium text-gray-800">添加 Token</h3>
				<div className="grid gap-3">
					<div className="flex flex-col gap-1.5">
						<label className="text-gray-600 text-sm">名称</label>
						<input
							type="text"
							placeholder="我的 GitHub Token"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="text-gray-600 text-sm">Token</label>
						<input
							type="password"
							autoComplete="off"
							placeholder="ghp_..."
							value={token}
							onChange={(e) => setToken(e.target.value)}
							onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
							className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
						/>
					</div>
					<button
						type="button"
						onClick={handleAdd}
						disabled={fetchMut.isPending}
						className="mt-1 w-full rounded-lg bg-blue-600 py-2.5 font-medium text-sm text-white transition hover:bg-blue-700 disabled:opacity-60"
					>
						{fetchMut.isPending ? "验证中…" : "添加 Token"}
					</button>
				</div>
			</div>

			{/* Account cards */}
			{tokens.length > 0 && (
				<div className="grid gap-3 sm:grid-cols-2">
					{tokens.map((t) => (
						<div
							key={t.id}
							onClick={() => handleCardClick(t)}
							className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
						>
							{/* Delete button */}
							<button
								type="button"
								onClick={(e) => handleDelete(e, t.id)}
								className="absolute right-4 top-4 text-gray-300 transition hover:text-red-500"
							>
								<Trash2 className="h-4 w-4" />
							</button>

							{/* Avatar + name */}
							<div className="mb-4 flex items-center gap-3">
								{t.avatarUrl ? (
									<img
										src={t.avatarUrl}
										alt={t.login}
										className="h-12 w-12 rounded-full border border-gray-100"
									/>
								) : (
									<div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-500 text-lg">
										{t.login.slice(0, 1).toUpperCase()}
									</div>
								)}
								<div className="min-w-0">
									<p className="truncate font-semibold text-gray-900 text-sm">
										{t.displayName ?? t.login}
									</p>
									<p className="text-gray-400 text-xs">@{t.login}</p>
								</div>
							</div>

							{/* Stats */}
							<div className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-100 bg-gray-50 text-center text-xs">
								<div className="flex flex-col items-center gap-0.5 py-2.5">
									<BookOpen className="h-3.5 w-3.5 text-blue-400" />
									<span className="font-bold text-blue-600">{t.publicRepos}</span>
									<span className="text-gray-400">公开仓库</span>
								</div>
								<div className="flex flex-col items-center gap-0.5 py-2.5">
									<Users className="h-3.5 w-3.5 text-blue-400" />
									<span className="font-bold text-blue-600">{t.followers}</span>
									<span className="text-gray-400">关注者</span>
								</div>
								<div className="flex flex-col items-center gap-0.5 py-2.5">
									<Users className="h-3.5 w-3.5 text-blue-400" />
									<span className="font-bold text-blue-600">{t.following}</span>
									<span className="text-gray-400">正在关注</span>
								</div>
							</div>

							<p className="mt-3 text-gray-300 text-xs">{t.name} · {t.createdAt}</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
