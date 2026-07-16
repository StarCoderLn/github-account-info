import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BookOpen, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { previewEnvironment } from "@/utils/preview-request";
import {
	addToken,
	getTokens,
	removeToken,
	type SavedToken,
	setSelectedTokenId,
} from "@/utils/token-store";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	beforeLoad: () => {
		if (previewEnvironment !== null) {
			throw redirect({
				to: "/u/$username",
				params: { username: "preview-user" },
				replace: true,
			});
		}
	},
	component: TokenPage,
});

function formatDate(d: Date): string {
	return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type MergedCard = {
	key: string;
	login: string;
	displayName: string | null;
	avatarUrl: string | null;
	publicRepos: number;
	followers: number;
	following: number;
	label: string;
	timestamp: string;
	hasLocalToken: boolean;
	localTokenId: string | undefined;
	dbId: number | undefined;
};

function TokenPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [token, setToken] = useState("");
	const [tokens, setTokens] = useState<SavedToken[]>([]);

	useEffect(() => {
		setTokens(getTokens());
	}, []);

	const listQuery = useQuery(trpc.account.list.queryOptions());
	const fetchMut = useMutation(trpc.github.getAccount.mutationOptions());
	const deleteMut = useMutation(trpc.account.delete.mutationOptions());

	// 合并 DB 记录与本地 localStorage token
	const dbCards: MergedCard[] = (listQuery.data ?? []).map((r) => {
		const localToken = tokens.find((t) => t.login === r.login);
		return {
			key: `db-${r.id}`,
			login: r.login,
			displayName: r.name,
			avatarUrl: r.avatarUrl,
			publicRepos: r.publicRepos,
			followers: r.followers,
			following: r.following,
			label: localToken?.name ?? r.login,
			timestamp: formatDate(new Date(r.updatedAt)),
			hasLocalToken: !!localToken,
			localTokenId: localToken?.id,
			dbId: r.id,
		};
	});

	// 本地有但还未同步到 DB 的 token
	const localOnlyCards: MergedCard[] = tokens
		.filter((t) => !listQuery.data?.some((r) => r.login === t.login))
		.map((t) => ({
			key: `local-${t.id}`,
			login: t.login,
			displayName: t.displayName,
			avatarUrl: t.avatarUrl,
			publicRepos: t.publicRepos,
			followers: t.followers,
			following: t.following,
			label: t.name,
			timestamp: t.createdAt,
			hasLocalToken: true,
			localTokenId: t.id,
			dbId: undefined,
		}));

	const allCards = [...dbCards, ...localOnlyCards];
	const hasEditableCards = allCards.some((c) => c.hasLocalToken);

	const handleAdd = async () => {
		const trimmedName = name.trim();
		const trimmedToken = token.trim();
		if (!trimmedName) {
			toast.error("请输入 Token 名称");
			return;
		}
		if (!trimmedToken) {
			toast.error("请输入 Token 值");
			return;
		}
		try {
			const acc = await fetchMut.mutateAsync({ token: trimmedToken });
			const id = crypto.randomUUID();
			const now = new Date();
			const createdAt = formatDate(now);
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

	const handleCardClick = (card: MergedCard) => {
		if (!card.hasLocalToken || !card.localTokenId) return;
		setSelectedTokenId(card.localTokenId);
		navigate({ to: "/profile" });
	};

	const handleDelete = (e: React.MouseEvent, card: MergedCard) => {
		e.stopPropagation();
		if (card.localTokenId) {
			removeToken(card.localTokenId);
			setTokens(getTokens());
		}
		if (card.dbId !== undefined) {
			queryClient.setQueryData(
				trpc.account.list.queryOptions().queryKey,
				(old: typeof listQuery.data) =>
					old?.filter((r) => r.id !== card.dbId) ?? [],
			);
			deleteMut.mutate(
				{ id: card.dbId },
				{
					onSettled: () =>
						queryClient.invalidateQueries(trpc.account.list.queryFilter()),
				},
			);
		}
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
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAdd();
							}}
							className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
						/>
					</div>
					<button
						type="button"
						onClick={handleAdd}
						disabled={fetchMut.isPending}
						className="mt-1 w-full cursor-pointer rounded-lg bg-blue-600 py-2.5 font-medium text-sm text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{fetchMut.isPending ? "验证中…" : "添加 Token"}
					</button>
				</div>
			</div>

			{/* Account cards */}
			{allCards.length > 0 && (
				<div className="grid gap-3">
					{hasEditableCards && (
						<p className="text-gray-400 text-xs">
							点击卡片可查看并编辑账号信息
						</p>
					)}
					<div className="grid gap-3 sm:grid-cols-2">
						{allCards.map((card) => (
							<div
								key={card.key}
								onClick={() => handleCardClick(card)}
								className={`group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition ${
									card.hasLocalToken
										? "cursor-pointer hover:border-blue-300 hover:shadow-md"
										: "cursor-default opacity-80"
								}`}
							>
								{/* Delete button — 仅本地有 token 时显示 */}
								{card.hasLocalToken && (
									<button
										type="button"
										onClick={(e) => handleDelete(e, card)}
										className="absolute top-4 right-4 cursor-pointer text-gray-300 transition hover:text-red-500"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}

								{/* Avatar + name */}
								<div className="mb-4 flex items-center gap-3">
									{card.avatarUrl ? (
										<img
											src={card.avatarUrl}
											alt={card.login}
											className="h-12 w-12 rounded-full border border-gray-100"
										/>
									) : (
										<div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-500 text-lg">
											{card.login.slice(0, 1).toUpperCase()}
										</div>
									)}
									<div className="min-w-0">
										<p className="truncate font-semibold text-gray-900 text-sm">
											{card.displayName ?? card.login}
										</p>
										<p className="text-gray-400 text-xs">@{card.login}</p>
									</div>
								</div>

								{/* Stats */}
								<div className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-100 bg-gray-50 text-center text-xs">
									<div className="flex flex-col items-center gap-0.5 py-2.5">
										<BookOpen className="h-3.5 w-3.5 text-blue-400" />
										<span className="font-bold text-blue-600">
											{card.publicRepos}
										</span>
										<span className="text-gray-400">公开仓库</span>
									</div>
									<div className="flex flex-col items-center gap-0.5 py-2.5">
										<Users className="h-3.5 w-3.5 text-blue-400" />
										<span className="font-bold text-blue-600">
											{card.followers}
										</span>
										<span className="text-gray-400">关注者</span>
									</div>
									<div className="flex flex-col items-center gap-0.5 py-2.5">
										<Users className="h-3.5 w-3.5 text-blue-400" />
										<span className="font-bold text-blue-600">
											{card.following}
										</span>
										<span className="text-gray-400">正在关注</span>
									</div>
								</div>

								<p className="mt-3 text-gray-300 text-xs">
									{card.label} · {card.timestamp}
								</p>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
