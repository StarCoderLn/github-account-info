import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	AtSign,
	BookOpen,
	ExternalLink,
	RefreshCw,
	Save,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSelectedToken } from "@/utils/token-store";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/profile")({
	component: ProfilePage,
});

function toNull(v: string): string | null {
	return v.trim() === "" ? null : v.trim();
}

const EMPTY_FORM = {
	login: "",
	githubId: 0,
	name: "",
	bio: "",
	company: "",
	location: "",
	email: "",
	blog: "",
	twitterUsername: "",
	avatarUrl: "",
	publicRepos: 0,
	followers: 0,
	following: 0,
};

function ProfilePage() {
	const navigate = useNavigate();
	const selectedToken = getSelectedToken();
	const fetchMut = useMutation(trpc.github.getAccount.mutationOptions());
	const createMut = useMutation(trpc.account.create.mutationOptions());
	const updateMut = useMutation(trpc.account.update.mutationOptions());
	const queryClient = useQueryClient();
	const listQuery = useQuery(trpc.account.list.queryOptions());

	const [form, setForm] = useState(EMPTY_FORM);
	const [ready, setReady] = useState(false);

	const dbRecord =
		listQuery.data?.find((r) => r.login === selectedToken?.login) ?? null;

	// Load data: DB record takes priority; fall back to GitHub fetch
	useEffect(() => {
		if (!selectedToken || listQuery.isPending) return;

		if (dbRecord) {
			setForm({
				login: dbRecord.login,
				githubId: dbRecord.githubId,
				name: dbRecord.name ?? "",
				bio: dbRecord.bio ?? "",
				company: dbRecord.company ?? "",
				location: dbRecord.location ?? "",
				email: dbRecord.email ?? "",
				blog: dbRecord.blog ?? "",
				twitterUsername: dbRecord.twitterUsername ?? "",
				avatarUrl: dbRecord.avatarUrl ?? "",
				publicRepos: dbRecord.publicRepos,
				followers: dbRecord.followers,
				following: dbRecord.following,
			});
			setReady(true);
		} else {
			fetchMut
				.mutateAsync({ token: selectedToken.token })
				.then((acc) => {
					setForm({
						login: acc.login,
						githubId: acc.githubId,
						name: acc.name ?? "",
						bio: acc.bio ?? "",
						company: acc.company ?? "",
						location: acc.location ?? "",
						email: acc.email ?? "",
						blog: acc.blog ?? "",
						twitterUsername: acc.twitterUsername ?? "",
						avatarUrl: acc.avatarUrl ?? "",
						publicRepos: acc.publicRepos,
						followers: acc.followers,
						following: acc.following,
					});
					setReady(true);
				})
				.catch((err) => {
					toast.error(
						err instanceof Error ? err.message : "拉取 GitHub 信息失败",
					);
				});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedToken?.id, listQuery.isPending]);

	// Refresh from GitHub (manual)
	const handleRefresh = async () => {
		if (!selectedToken) return;
		try {
			const acc = await fetchMut.mutateAsync({ token: selectedToken.token });
			setForm({
				login: acc.login,
				githubId: acc.githubId,
				name: acc.name ?? "",
				bio: acc.bio ?? "",
				company: acc.company ?? "",
				location: acc.location ?? "",
				email: acc.email ?? "",
				blog: acc.blog ?? "",
				twitterUsername: acc.twitterUsername ?? "",
				avatarUrl: acc.avatarUrl ?? "",
				publicRepos: acc.publicRepos,
				followers: acc.followers,
				following: acc.following,
			});
			toast.success("已从 GitHub 刷新最新数据");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "刷新失败");
		}
	};

	const handleSave = async () => {
		const payload = {
			login: form.login,
			githubId: form.githubId,
			name: toNull(form.name),
			avatarUrl: toNull(form.avatarUrl),
			bio: toNull(form.bio),
			company: toNull(form.company),
			location: toNull(form.location),
			email: toNull(form.email),
			blog: toNull(form.blog),
			twitterUsername: toNull(form.twitterUsername),
			publicRepos: form.publicRepos,
			followers: form.followers,
			following: form.following,
		};
		try {
			if (dbRecord) {
				await updateMut.mutateAsync({ id: dbRecord.id, ...payload });
				toast.success("账号信息已更新");
			} else {
				await createMut.mutateAsync(payload);
				toast.success("账号信息已保存到数据库");
			}
			queryClient.invalidateQueries(trpc.account.list.queryFilter());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "保存失败");
		}
	};

	const set =
		(field: keyof typeof EMPTY_FORM) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
			setForm((prev) => ({ ...prev, [field]: e.target.value }));

	const isPending = createMut.isPending || updateMut.isPending;
	const isLoading = listQuery.isPending || (fetchMut.isPending && !ready);

	if (!selectedToken) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<p className="text-gray-500 text-sm">
					尚未选择 Token，请先前往{" "}
					<Link
						to="/"
						className="font-medium text-blue-600 underline underline-offset-2"
					>
						Token 管理页
					</Link>{" "}
					添加并选择一个 Token。
				</p>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-20">
				<p className="text-gray-400 text-sm">
					{listQuery.isPending ? "加载中…" : "正在从 GitHub 拉取账号信息…"}
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-6">
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={() => navigate({ to: "/" })}
					className="flex items-center gap-1.5 text-gray-500 text-sm transition hover:text-gray-900"
				>
					<ArrowLeft className="h-4 w-4" />
					返回
				</button>
				<button
					type="button"
					onClick={handleRefresh}
					disabled={fetchMut.isPending}
					className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-gray-500 text-sm transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${fetchMut.isPending ? "animate-spin" : ""}`}
					/>
					从 GitHub 刷新
				</button>
			</div>

			<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				{/* Avatar + login */}
				<div className="mb-6 flex items-center gap-4">
					{form.avatarUrl ? (
						<img
							src={form.avatarUrl}
							alt={form.login}
							className="h-16 w-16 rounded-full border border-gray-200"
						/>
					) : (
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-400 text-xl">
							{form.login.slice(0, 1).toUpperCase()}
						</div>
					)}
					<div>
						<p className="font-semibold text-gray-900">{form.login || "—"}</p>
						<p className="text-gray-400 text-sm">
							GitHub ID: {form.githubId || "—"}
						</p>
						<p className="text-gray-400 text-xs">
							数据来源：{dbRecord ? "数据库" : "GitHub"}
						</p>
					</div>
				</div>

				<div className="grid gap-4">
					<Field
						label="姓名"
						value={form.name}
						onChange={set("name")}
						placeholder="Your Name"
					/>

					<div className="flex flex-col gap-1.5">
						<label className="text-gray-600 text-sm">简介</label>
						<textarea
							value={form.bio}
							onChange={set("bio")}
							placeholder="Tell us about yourself"
							rows={3}
							className="resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<Field
							label="公司"
							value={form.company}
							onChange={set("company")}
							placeholder="Company"
						/>
						<Field
							label="地址"
							value={form.location}
							onChange={set("location")}
							placeholder="Location"
						/>
					</div>

					<Field
						label="邮箱"
						value={form.email}
						onChange={set("email")}
						type="email"
						placeholder="you@example.com"
					/>

					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col gap-1.5">
							<label className="flex items-center gap-1 text-gray-600 text-sm">
								<ExternalLink className="h-3.5 w-3.5" />
								博客 URL
							</label>
							<input
								type="url"
								value={form.blog}
								onChange={set("blog")}
								placeholder="https://example.com"
								className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="flex items-center gap-1 text-gray-600 text-sm">
								<AtSign className="h-3.5 w-3.5" />
								Twitter
							</label>
							<input
								type="text"
								value={form.twitterUsername}
								onChange={set("twitterUsername")}
								placeholder="username (without @)"
								className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
							/>
						</div>
					</div>

					<div className="mt-2 grid grid-cols-3 divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50 text-center text-sm">
						<div className="flex flex-col items-center gap-1 py-3">
							<BookOpen className="h-4 w-4 text-blue-400" />
							<span className="font-bold text-blue-600">
								{form.publicRepos}
							</span>
							<span className="text-gray-400 text-xs">公开仓库</span>
						</div>
						<div className="flex flex-col items-center gap-1 py-3">
							<Users className="h-4 w-4 text-blue-400" />
							<span className="font-bold text-blue-600">{form.followers}</span>
							<span className="text-gray-400 text-xs">关注者</span>
						</div>
						<div className="flex flex-col items-center gap-1 py-3">
							<Users className="h-4 w-4 text-blue-400" />
							<span className="font-bold text-blue-600">{form.following}</span>
							<span className="text-gray-400 text-xs">正在关注</span>
						</div>
					</div>
				</div>

				<div className="mt-6 flex justify-end">
					<button
						type="button"
						onClick={handleSave}
						disabled={isPending}
						className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-sm text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
					>
						<Save className="h-4 w-4" />
						{isPending ? "保存中…" : "保存到数据库"}
					</button>
				</div>
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
	type = "text",
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	type?: string;
	placeholder?: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-gray-600 text-sm">{label}</label>
			<input
				type={type}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
			/>
		</div>
	);
}
