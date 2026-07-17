import { Button } from "@github-account-info/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@github-account-info/ui/components/card";
import { Skeleton } from "@github-account-info/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	BookOpen,
	ExternalLink,
	MapPin,
	RefreshCw,
	Users,
} from "lucide-react";

import {
	PublicIntroductionApiError,
	publicIntroductionQueryOptions,
} from "@/utils/introduction-api";

const INTRODUCTION_CARD_CLASS =
	"rounded-xl border border-gray-200 bg-white shadow-sm ring-0";

export const Route = createFileRoute("/u/$username")({
	component: PublicIntroductionPage,
	head: ({ params }) => ({
		meta: [
			{ title: `@${params.username} 的个人介绍` },
			{
				name: "description",
				content: `查看 GitHub 用户 @${params.username} 的公开个人介绍`,
			},
		],
	}),
});

function PublicIntroductionPage() {
	const { username } = Route.useParams();
	const introductionQuery = useQuery(publicIntroductionQueryOptions(username));

	if (introductionQuery.isPending) {
		return <IntroductionSkeleton />;
	}

	if (introductionQuery.isError) {
		return (
			<IntroductionError
				error={introductionQuery.error}
				onRetry={() => introductionQuery.refetch()}
				isRetrying={introductionQuery.isFetching}
			/>
		);
	}

	const profile = introductionQuery.data;
	const displayName = profile.name ?? profile.githubUsername;
	const blogUrl = toPublicHttpUrl(profile.blog);

	return (
		<div className="flex flex-col gap-4">
			<Link
				to="/"
				className="flex cursor-pointer items-center gap-1.5 self-start text-gray-500 text-sm transition hover:text-gray-900"
			>
				<ArrowLeft className="size-4" />
				返回
			</Link>

			<Card className={INTRODUCTION_CARD_CLASS}>
				<CardHeader className="px-6">
					<div className="flex min-w-0 items-center gap-3">
						{profile.avatarUrl ? (
							<img
								src={profile.avatarUrl}
								alt={`${displayName} 的 GitHub 头像`}
								className="size-14 rounded-full object-cover"
							/>
						) : (
							<div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-blue-50 font-medium text-blue-500">
								{profile.githubUsername.slice(0, 1).toUpperCase()}
							</div>
						)}
						<div className="min-w-0">
							<CardTitle className="text-gray-900">{displayName}</CardTitle>
							<CardDescription className="text-gray-400">
								@{profile.githubUsername}
							</CardDescription>
						</div>
					</div>
					<CardAction>
						<Button
							variant="outline"
							size="sm"
							render={
								<a
									href={`https://github.com/${encodeURIComponent(profile.githubUsername)}`}
									target="_blank"
									rel="noreferrer"
								/>
							}
							className="rounded-lg border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
						>
							GitHub
							<ExternalLink data-icon="inline-end" />
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent className="flex flex-col gap-5 px-6">
					<section
						aria-labelledby="introduction-heading"
						className="flex flex-col gap-2"
					>
						<h1
							id="introduction-heading"
							className="font-semibold text-base text-gray-900"
						>
							个人介绍
						</h1>
						<p className="whitespace-pre-wrap text-gray-700 text-sm/relaxed">
							{profile.introduction}
						</p>
					</section>

					{profile.bio ? (
						<section
							aria-labelledby="bio-heading"
							className="flex flex-col gap-2"
						>
							<h2
								id="bio-heading"
								className="font-medium text-gray-700 text-sm"
							>
								GitHub Bio
							</h2>
							<p className="text-gray-400 text-sm/relaxed">{profile.bio}</p>
						</section>
					) : null}

					<div className="flex flex-wrap gap-x-5 gap-y-2 text-gray-500">
						{profile.company ? <span>{profile.company}</span> : null}
						{profile.location ? (
							<span className="inline-flex items-center gap-1">
								<MapPin aria-hidden="true" className="size-4 text-gray-400" />
								{profile.location}
							</span>
						) : null}
						{blogUrl ? (
							<a
								href={blogUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-blue-600 underline underline-offset-4 hover:text-blue-700"
							>
								个人网站
								<ExternalLink aria-hidden="true" className="size-4" />
							</a>
						) : null}
					</div>

					<dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-100 bg-gray-50 text-center text-xs">
						<Stat
							icon={
								<BookOpen aria-hidden="true" className="size-4 text-blue-400" />
							}
							label="公开仓库"
							value={profile.publicRepos}
						/>
						<Stat
							icon={
								<Users aria-hidden="true" className="size-4 text-blue-400" />
							}
							label="关注者"
							value={profile.followers}
						/>
						<Stat
							icon={
								<Users aria-hidden="true" className="size-4 text-blue-400" />
							}
							label="正在关注"
							value={profile.following}
						/>
					</dl>
				</CardContent>

				<CardFooter className="justify-end border-gray-200 px-6 text-gray-400">
					<time dateTime={profile.generatedAt}>
						生成于 {formatDate(profile.generatedAt)}
					</time>
				</CardFooter>
			</Card>
		</div>
	);
}

function IntroductionSkeleton() {
	return (
		<Card aria-label="正在加载个人介绍" className={INTRODUCTION_CARD_CLASS}>
			<CardHeader>
				<div className="flex items-center gap-3">
					<Skeleton className="size-14 rounded-full" />
					<div className="flex flex-col gap-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-20" />
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</CardContent>
			<CardFooter>
				<Skeleton className="h-3 w-40" />
			</CardFooter>
		</Card>
	);
}

function IntroductionError({
	error,
	onRetry,
	isRetrying,
}: {
	error: Error;
	onRetry: () => void;
	isRetrying: boolean;
}) {
	const apiError =
		error instanceof PublicIntroductionApiError ? error : undefined;
	const isNotGenerated =
		apiError?.status === 404 && apiError.code === "introduction_not_found";
	const isAccountNotFound =
		apiError?.status === 404 && apiError.code === "github_account_not_found";
	const isInvalidUsername = apiError?.status === 400;

	const title = isNotGenerated
		? "个人介绍尚未生成"
		: isAccountNotFound
			? "没有找到该 GitHub 用户"
			: isInvalidUsername
				? "GitHub username 不正确"
				: "暂时无法读取个人介绍";
	const description = isNotGenerated
		? "该账号已经存在，但还没有发布个人介绍。请由账号管理者先完成生成。"
		: isAccountNotFound
			? "数据库中还没有保存这个 GitHub 用户的账号资料。"
			: isInvalidUsername
				? "请检查地址中的 GitHub username 后重试。"
				: "Go 服务当前不可用或响应异常，请稍后重试。";

	return (
		<Card className={INTRODUCTION_CARD_CLASS}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground">
					错误代码：{apiError?.code ?? "unknown_error"}
				</p>
			</CardContent>
			<CardFooter className="gap-2">
				<Button variant="outline" render={<Link to="/" />}>
					<ArrowLeft data-icon="inline-start" />
					返回首页
				</Button>
				{isInvalidUsername ? null : (
					<Button onClick={onRetry} disabled={isRetrying}>
						<RefreshCw
							data-icon="inline-start"
							className={isRetrying ? "animate-spin" : undefined}
						/>
						{isRetrying ? "重试中…" : "重试"}
					</Button>
				)}
			</CardFooter>
		</Card>
	);
}

function Stat({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
}) {
	return (
		<div className="flex flex-col items-center gap-1 py-3">
			{icon}
			<dd className="font-bold text-blue-600">{value}</dd>
			<dt className="text-gray-400">{label}</dt>
		</div>
	);
}

function formatDate(value: string): string {
	return new Intl.DateTimeFormat("zh-CN", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function toPublicHttpUrl(value: string | null): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}
