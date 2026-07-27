import type { AppRouter } from "@github-account-info/api/routers/index";
import { Button } from "@github-account-info/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@github-account-info/ui/components/card";
import { Skeleton } from "@github-account-info/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@github-account-info/ui/components/table";
import { cn } from "@github-account-info/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	ArrowUpRight,
	Bug,
	ChartNoAxesCombined,
	CircleCheck,
	DatabaseZap,
	Eye,
	Filter,
	Gauge,
	Layers3,
	MousePointerClick,
	Paintbrush,
	RadioTower,
	RefreshCw,
	Server,
	ShieldCheck,
	TriangleAlert,
	Waves,
	Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/performance")({
	component: PerformancePage,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Overview = RouterOutputs["performance"]["overview"];
type Metric = Overview["metrics"][number];
type MetricName = Metric["name"];
type Range = "1h" | "24h" | "7d";

const METRIC_DESCRIPTIONS: Record<MetricName, string> = {
	LCP: "最大内容绘制",
	INP: "交互响应速度",
	CLS: "布局稳定性",
	FCP: "首次内容绘制",
	TTFB: "首字节响应时间",
};

const RATING_LABELS: Record<NonNullable<Metric["rating"]>, string> = {
	good: "良好",
	"needs-improvement": "需要改进",
	poor: "较差",
};

const METRIC_ICONS: Record<MetricName, LucideIcon> = {
	LCP: Layers3,
	INP: MousePointerClick,
	CLS: Gauge,
	FCP: Paintbrush,
	TTFB: Server,
};

const METRIC_STYLES: Record<
	MetricName,
	{
		accent: string;
		icon: string;
		ring: string;
		glow: string;
		bar: string;
	}
> = {
	LCP: {
		accent: "bg-blue-500",
		icon: "bg-blue-50 text-blue-600",
		ring: "ring-blue-100",
		glow: "bg-blue-100/70",
		bar: "bg-blue-500",
	},
	INP: {
		accent: "bg-indigo-500",
		icon: "bg-indigo-50 text-indigo-600",
		ring: "ring-indigo-100",
		glow: "bg-indigo-100/70",
		bar: "bg-indigo-500",
	},
	CLS: {
		accent: "bg-violet-500",
		icon: "bg-violet-50 text-violet-600",
		ring: "ring-violet-100",
		glow: "bg-violet-100/70",
		bar: "bg-violet-500",
	},
	FCP: {
		accent: "bg-cyan-500",
		icon: "bg-cyan-50 text-cyan-600",
		ring: "ring-cyan-100",
		glow: "bg-cyan-100/70",
		bar: "bg-cyan-500",
	},
	TTFB: {
		accent: "bg-sky-500",
		icon: "bg-sky-50 text-sky-600",
		ring: "ring-sky-100",
		glow: "bg-sky-100/70",
		bar: "bg-sky-500",
	},
};

function ratingClassName(metric: Metric): string {
	if (metric.rating === "poor") {
		return "bg-red-50 text-red-600 ring-red-100";
	}
	if (metric.rating === "good") {
		return "bg-emerald-50 text-emerald-600 ring-emerald-100";
	}
	return "bg-amber-50 text-amber-600 ring-amber-100";
}

function formatMetric(name: MetricName, value: number | null): string {
	if (value === null) {
		return "暂无数据";
	}
	if (name === "CLS") {
		return value.toFixed(3);
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(2)} s`;
	}
	return `${Math.round(value)} ms`;
}

function formatDuration(value: number | null): string {
	if (value === null) {
		return "—";
	}
	return value >= 1_000
		? `${(value / 1_000).toFixed(2)} s`
		: `${Math.round(value)} ms`;
}

function MetricCard({ metric }: { metric: Metric }) {
	const Icon = METRIC_ICONS[metric.name];
	const StatusIcon = metric.rating === "poor" ? TriangleAlert : CircleCheck;
	const styles = METRIC_STYLES[metric.name];
	const distribution = [metric.p50, metric.p75, metric.p95];
	const distributionMax = Math.max(
		...distribution.map((value) => value ?? 0),
		1,
	);

	return (
		<Card
			className={cn(
				"relative min-h-48 overflow-hidden rounded-2xl bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none",
				styles.ring,
			)}
			size="sm"
		>
			<div className={cn("absolute inset-x-0 top-0 h-1", styles.accent)} />
			<div
				className={cn(
					"pointer-events-none absolute -top-12 -right-12 size-28 rounded-full blur-3xl",
					styles.glow,
				)}
			/>
			<CardHeader className="gap-4 pt-2">
				<div
					className={cn(
						"flex size-10 items-center justify-center rounded-xl",
						styles.icon,
					)}
				>
					<Icon className="size-5" aria-hidden="true" />
				</div>
				<CardAction
					className={cn(
						"flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ring-1",
						ratingClassName(metric),
					)}
				>
					<StatusIcon className="size-3.5" aria-hidden="true" />
					{metric.rating ? RATING_LABELS[metric.rating] : "等待样本"}
				</CardAction>
				<div>
					<CardTitle>{metric.name} p75</CardTitle>
					<CardDescription>{METRIC_DESCRIPTIONS[metric.name]}</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col justify-end gap-3">
				<div className="flex items-end justify-between gap-3">
					<div>
						<p className="font-bold text-3xl text-gray-950 tabular-nums tracking-tight">
							{formatMetric(metric.name, metric.p75)}
						</p>
						<p className="mt-1 text-gray-400">{metric.count} 个真实用户样本</p>
					</div>
					<div
						className="flex h-11 items-end gap-1.5"
						role="img"
						aria-label={`${metric.name} p50、p75、p95 分布`}
					>
						{distribution.map((value, index) => (
							<span
								key={`${metric.name}-${index}`}
								aria-hidden="true"
								className={cn(
									"w-1.5 rounded-full opacity-35 transition-opacity group-hover/card:opacity-80",
									styles.bar,
								)}
								style={{
									height: `${Math.max(
										24,
										((value ?? 0) / distributionMax) * 100,
									)}%`,
								}}
							/>
						))}
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2 border-t pt-3 text-muted-foreground">
					<span>p50 {formatMetric(metric.name, metric.p50)}</span>
					<span className="text-right">
						p95 {formatMetric(metric.name, metric.p95)}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}

function SummaryCard({
	title,
	description,
	value,
	icon: Icon,
	tone,
}: {
	title: string;
	description: string;
	value: string;
	icon: LucideIcon;
	tone: "rose" | "blue" | "violet";
}) {
	const styles = {
		rose: {
			card: "ring-rose-100",
			icon: "bg-rose-50 text-rose-600",
			glow: "bg-rose-100/70",
		},
		blue: {
			card: "ring-blue-100",
			icon: "bg-blue-50 text-blue-600",
			glow: "bg-blue-100/70",
		},
		violet: {
			card: "ring-violet-100",
			icon: "bg-violet-50 text-violet-600",
			glow: "bg-violet-100/70",
		},
	}[tone];

	return (
		<Card
			className={cn(
				"relative overflow-hidden rounded-2xl bg-white shadow-sm",
				styles.card,
			)}
			size="sm"
		>
			<div
				className={cn(
					"pointer-events-none absolute -right-8 -bottom-10 size-24 rounded-full blur-3xl",
					styles.glow,
				)}
			/>
			<CardContent className="flex items-center gap-4 py-2">
				<div
					className={cn(
						"flex size-11 shrink-0 items-center justify-center rounded-xl",
						styles.icon,
					)}
				>
					<Icon className="size-5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-medium">{title}</p>
					<p className="truncate text-muted-foreground">{description}</p>
				</div>
				<p className="shrink-0 font-semibold text-2xl tabular-nums tracking-tight">
					{value}
				</p>
			</CardContent>
		</Card>
	);
}

function TrendChart({
	overview,
	metricName,
}: {
	overview: Overview;
	metricName: MetricName;
}) {
	const points = useMemo(
		() =>
			overview.trend
				.filter((point) => point.name === metricName && point.p75 !== null)
				.map((point) => ({
					...point,
					p75: point.p75 ?? 0,
				})),
		[overview.trend, metricName],
	);

	if (points.length === 0) {
		return (
			<div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 text-center text-muted-foreground">
				<div className="flex size-11 items-center justify-center rounded-full bg-background">
					<ChartNoAxesCombined className="size-5" aria-hidden="true" />
				</div>
				<div>
					<p className="font-medium text-foreground">
						暂无 {metricName} 趋势数据
					</p>
					<p>采集到新的时间桶后，这里会自动生成趋势线。</p>
				</div>
			</div>
		);
	}

	const width = 900;
	const height = 240;
	const horizontalPadding = 44;
	const verticalPadding = 26;
	const max = Math.max(...points.map((point) => point.p75), 1) * 1.2;
	const coordinates = points.map((point, index) => ({
		x:
			points.length === 1
				? width / 2
				: horizontalPadding +
					(index / (points.length - 1)) * (width - horizontalPadding * 2),
		y:
			height -
			verticalPadding -
			(point.p75 / max) * (height - verticalPadding * 2),
		label: new Date(point.bucket).toLocaleString("zh-CN", {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}),
		value: point.p75,
	}));
	const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
	const area = `${horizontalPadding},${height - verticalPadding} ${line} ${
		width - horizontalPadding
	},${height - verticalPadding}`;
	const gridLines = [0, 1, 2, 3].map(
		(index) => verticalPadding + (index / 3) * (height - verticalPadding * 2),
	);

	return (
		<div className="flex flex-col gap-3 overflow-x-auto">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="min-w-2xl text-blue-500"
				role="img"
				aria-label={`${metricName} p75 时间趋势`}
			>
				<title>{metricName} p75 时间趋势</title>
				<defs>
					<linearGradient
						id={`performance-${metricName.toLowerCase()}-area`}
						x1="0"
						x2="0"
						y1="0"
						y2="1"
					>
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
					</linearGradient>
				</defs>
				{gridLines.map((y) => (
					<line
						key={y}
						x1={horizontalPadding}
						y1={y}
						x2={width - horizontalPadding}
						y2={y}
						stroke="currentColor"
						opacity="0.1"
						strokeDasharray="4 6"
					/>
				))}
				{points.length > 1 ? (
					<>
						<polygon
							points={area}
							fill={`url(#performance-${metricName.toLowerCase()}-area)`}
						/>
						<polyline
							points={line}
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					</>
				) : (
					<line
						x1={horizontalPadding}
						y1={coordinates[0]?.y}
						x2={width - horizontalPadding}
						y2={coordinates[0]?.y}
						stroke="currentColor"
						strokeWidth="2"
						strokeDasharray="7 8"
						opacity="0.45"
					/>
				)}
				{coordinates.map((point) => (
					<g key={`${point.label}-${point.x}`}>
						<circle
							cx={point.x}
							cy={point.y}
							r="12"
							fill="currentColor"
							opacity="0.13"
						/>
						<circle
							cx={point.x}
							cy={point.y}
							r="5"
							fill="currentColor"
							stroke="white"
							strokeWidth="3"
						>
							<title>
								{point.label}：{formatMetric(metricName, point.value)}
							</title>
						</circle>
					</g>
				))}
			</svg>
			{points.length === 1 ? (
				<p className="text-center text-muted-foreground">
					当前只有 1 个时间桶；更多样本到达后将形成连续趋势。
				</p>
			) : null}
		</div>
	);
}

function LoadingDashboard() {
	return (
		<div
			className="flex flex-col gap-6"
			role="status"
			aria-label="正在加载性能数据"
		>
			<div className="grid gap-3 md:grid-cols-5">
				{Array.from({ length: 5 }, (_, index) => (
					<Skeleton key={index} className="h-32" />
				))}
			</div>
			<Skeleton className="h-72" />
			<Skeleton className="h-64" />
		</div>
	);
}

function PerformancePage() {
	const [range, setRange] = useState<Range>("24h");
	const [activeMetric, setActiveMetric] = useState<MetricName>("LCP");
	const [environment, setEnvironment] = useState("");
	const [release, setRelease] = useState("");
	const [route, setRoute] = useState("");
	const overviewQuery = useQuery({
		...trpc.performance.overview.queryOptions({
			range,
			environment: environment || undefined,
			release: release || undefined,
			route: route || undefined,
		}),
		placeholderData: keepPreviousData,
		meta: { suppressGlobalErrorToast: true },
	});

	if (overviewQuery.isPending) {
		return <LoadingDashboard />;
	}

	if (!overviewQuery.data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>性能统计暂时不可用</CardTitle>
					<CardDescription>
						请确认数据库迁移和 performance processor 已完成配置。
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => overviewQuery.refetch()} variant="outline">
						<RefreshCw data-icon="inline-start" />
						重新加载
					</Button>
				</CardContent>
			</Card>
		);
	}

	const overview = overviewQuery.data;
	const healthyMetrics = overview.metrics.filter(
		(metric) => metric.rating === "good",
	).length;

	return (
		<div className="flex flex-col gap-5">
			<section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 text-white shadow-blue-200/50 shadow-xl">
				<div
					className="pointer-events-none absolute -top-32 right-12 size-80 rounded-full bg-cyan-300/25 blur-3xl"
					aria-hidden="true"
				/>
				<div
					className="pointer-events-none absolute -bottom-44 left-1/3 size-96 rounded-full bg-indigo-900/35 blur-3xl"
					aria-hidden="true"
				/>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.08]"
					aria-hidden="true"
					style={{
						backgroundImage:
							"linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
						backgroundSize: "42px 42px",
						maskImage: "linear-gradient(to bottom, black, transparent 85%)",
					}}
				/>
				<div className="relative flex flex-col gap-7 p-6 md:p-8">
					<div className="flex flex-wrap items-center justify-between gap-5">
						<div className="flex items-center gap-4">
							<div className="flex size-13 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
								<RadioTower className="size-6" aria-hidden="true" />
							</div>
							<div className="flex flex-col gap-1">
								<p className="font-medium text-blue-100 text-xs tracking-[0.18em]">
									RUM OBSERVABILITY CENTER
								</p>
								<h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
									真实用户性能
								</h1>
								<p className="max-w-2xl text-blue-100">
									从浏览器采集到异步清洗，集中观察五项 Web
									Vitals、错误与访问体验。
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-md">
							<span className="relative flex size-3">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-60 motion-reduce:animate-none" />
								<span className="relative inline-flex size-3 rounded-full bg-cyan-300" />
							</span>
							<div>
								<p className="font-medium">采集链路已接入</p>
								<p className="text-blue-100">按需处理 · 数据保留 7 天</p>
							</div>
						</div>
					</div>
					<div className="grid gap-2 sm:grid-cols-3">
						<div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
							<Waves className="size-4 text-cyan-200" aria-hidden="true" />
							<p>
								<span className="font-semibold">5 项</span>{" "}
								<span className="text-blue-100">Web Vitals</span>
							</p>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
							<Eye className="size-4 text-cyan-200" aria-hidden="true" />
							<p>
								<span className="font-semibold">
									{overview.summary.pageViews.toLocaleString("zh-CN")} 次
								</span>{" "}
								<span className="text-blue-100">页面访问</span>
							</p>
						</div>
						<div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
							<ShieldCheck
								className="size-4 text-cyan-200"
								aria-hidden="true"
							/>
							<p>
								<span className="font-semibold">{healthyMetrics}/5</span>{" "}
								<span className="text-blue-100">当前良好</span>
							</p>
						</div>
					</div>
				</div>
			</section>

			<Card
				className="rounded-2xl bg-white shadow-blue-100/50 shadow-md ring-blue-100"
				size="sm"
			>
				<CardContent className="flex flex-col gap-4 py-1">
					<div className="flex items-center gap-2 text-blue-700">
						<div className="flex size-8 items-center justify-center rounded-lg bg-blue-50">
							<Filter className="size-4" aria-hidden="true" />
						</div>
						<div>
							<p className="font-semibold">筛选数据视图</p>
							<p className="text-blue-500 text-xs">
								切换维度后自动刷新当前统计
							</p>
						</div>
						<p
							className={cn(
								"ml-auto min-h-5 text-xs",
								overviewQuery.isError ? "text-rose-600" : "text-blue-500",
							)}
							aria-live="polite"
						>
							{overviewQuery.isFetching
								? "正在更新…"
								: overviewQuery.isError
									? "更新失败，已保留上次数据"
									: ""}
						</p>
					</div>
					<div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
						<label
							className="flex flex-col gap-1.5"
							htmlFor="performance-range"
						>
							<span className="font-medium text-muted-foreground">
								统计范围
							</span>
							<select
								id="performance-range"
								value={range}
								onChange={(event) => setRange(event.target.value as Range)}
								className="h-10 rounded-xl border border-blue-100 bg-blue-50/40 px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							>
								<option value="1h">最近 1 小时</option>
								<option value="24h">最近 24 小时</option>
								<option value="7d">最近 7 天</option>
							</select>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-muted-foreground">
								运行环境
							</span>
							<select
								aria-label="筛选运行环境"
								value={environment}
								onChange={(event) => setEnvironment(event.target.value)}
								className="h-10 rounded-xl border border-blue-100 bg-blue-50/40 px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							>
								<option value="">全部环境</option>
								{overview.filters.environments.map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<label className="flex min-w-0 flex-col gap-1.5">
							<span className="font-medium text-muted-foreground">
								发布版本
							</span>
							<select
								aria-label="筛选发布版本"
								value={release}
								onChange={(event) => setRelease(event.target.value)}
								className="h-10 min-w-0 rounded-xl border border-blue-100 bg-blue-50/40 px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							>
								<option value="">全部版本</option>
								{overview.filters.releases.map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<label className="flex min-w-0 flex-col gap-1.5">
							<span className="font-medium text-muted-foreground">
								页面路由
							</span>
							<select
								aria-label="筛选页面路由"
								value={route}
								onChange={(event) => setRoute(event.target.value)}
								className="h-10 min-w-0 rounded-xl border border-blue-100 bg-blue-50/40 px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							>
								<option value="">全部路由</option>
								{overview.filters.routes.map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<Button
							size="sm"
							onClick={() => overviewQuery.refetch()}
							disabled={overviewQuery.isFetching}
							className="h-10 rounded-xl bg-blue-600 px-4 text-white shadow-blue-200 shadow-sm hover:bg-blue-700"
						>
							<RefreshCw
								data-icon="inline-start"
								className={cn(overviewQuery.isFetching && "animate-spin")}
							/>
							刷新
						</Button>
					</div>
				</CardContent>
			</Card>

			<section
				aria-labelledby="web-vitals-title"
				className="flex flex-col gap-3"
			>
				<div className="flex items-end justify-between gap-4">
					<div>
						<p className="font-medium text-blue-600 text-xs tracking-[0.16em]">
							CORE WEB VITALS
						</p>
						<h2 id="web-vitals-title" className="font-semibold text-xl">
							核心体验指标
						</h2>
						<p className="text-muted-foreground">
							p75 代表 75% 用户获得的体验水平
						</p>
					</div>
					<div className="hidden items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-blue-700 ring-1 ring-blue-100 sm:flex">
						<ArrowUpRight className="size-3.5" aria-hidden="true" />
						<p>
							共{" "}
							{overview.metrics.reduce((sum, metric) => sum + metric.count, 0)}{" "}
							个指标样本
						</p>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
					{overview.metrics.map((metric) => (
						<MetricCard key={metric.name} metric={metric} />
					))}
				</div>
			</section>

			<section className="grid gap-3 md:grid-cols-3" aria-label="采集摘要">
				<SummaryCard
					title="前端错误率"
					description={`${overview.summary.errorCount} 个错误`}
					value={`${overview.summary.errorRate.toFixed(2)}%`}
					icon={Bug}
					tone="rose"
				/>
				<SummaryCard
					title="页面访问量"
					description={`${overview.summary.sessions} 个匿名会话`}
					value={overview.summary.pageViews.toLocaleString("zh-CN")}
					icon={Eye}
					tone="blue"
				/>
				<SummaryCard
					title="事件处理延迟 p75"
					description="浏览器产生到 ECS 清洗"
					value={formatDuration(overview.summary.processingLagP75)}
					icon={DatabaseZap}
					tone="violet"
				/>
			</section>

			<section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
				<Card className="overflow-hidden rounded-2xl bg-white shadow-sm ring-blue-100">
					<CardHeader className="border-blue-100 border-b bg-gradient-to-r from-blue-50/80 to-transparent">
						<CardTitle className="flex items-center gap-2">
							<ChartNoAxesCombined
								className="size-4 text-blue-600"
								aria-hidden="true"
							/>
							Web Vitals p75 趋势
						</CardTitle>
						<CardDescription>
							观察所选指标在当前时间范围内的变化
						</CardDescription>
						<CardAction>
							<select
								aria-label="选择趋势指标"
								value={activeMetric}
								onChange={(event) =>
									setActiveMetric(event.target.value as MetricName)
								}
								className="h-9 rounded-lg border border-blue-100 bg-white px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							>
								{overview.metrics.map((metric) => (
									<option key={metric.name} value={metric.name}>
										{metric.name}
									</option>
								))}
							</select>
						</CardAction>
					</CardHeader>
					<CardContent>
						<TrendChart overview={overview} metricName={activeMetric} />
					</CardContent>
				</Card>

				<Card className="overflow-hidden rounded-2xl bg-white shadow-sm ring-blue-100">
					<CardHeader className="border-blue-100 border-b bg-gradient-to-r from-indigo-50/80 to-transparent">
						<CardTitle className="flex items-center gap-2">
							<ShieldCheck
								className="size-4 text-indigo-600"
								aria-hidden="true"
							/>
							性能健康概览
						</CardTitle>
						<CardDescription>五项核心指标的当前评级</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-1">
							{overview.metrics.map((metric) => {
								const Icon = METRIC_ICONS[metric.name];
								const styles = METRIC_STYLES[metric.name];
								return (
									<li
										key={metric.name}
										className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-blue-50/60"
									>
										<div
											className={cn(
												"flex size-8 items-center justify-center rounded-lg",
												styles.icon,
											)}
										>
											<Icon className="size-4" aria-hidden="true" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="font-medium">{metric.name}</p>
											<p className="truncate text-muted-foreground">
												{METRIC_DESCRIPTIONS[metric.name]}
											</p>
										</div>
										<div className="text-right">
											<p
												className={cn(
													"rounded-full px-2 py-0.5 font-medium ring-1",
													ratingClassName(metric),
												)}
											>
												{metric.rating
													? RATING_LABELS[metric.rating]
													: "等待样本"}
											</p>
											<p className="text-muted-foreground">
												{formatMetric(metric.name, metric.p75)}
											</p>
										</div>
									</li>
								);
							})}
						</ul>
					</CardContent>
				</Card>
			</section>

			<Card className="gap-0 overflow-hidden rounded-2xl bg-white py-0 shadow-sm ring-blue-100">
				<CardHeader className="border-blue-100 border-b bg-gradient-to-r from-blue-50/70 to-transparent py-4">
					<CardTitle className="flex items-center gap-2">
						<Layers3 className="size-4 text-blue-600" aria-hidden="true" />
						按页面路由对比
					</CardTitle>
					<CardDescription>
						定位访问量高、体验表现需要优先优化的页面
					</CardDescription>
				</CardHeader>
				<CardContent className="p-3">
					{overview.routes.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
							<Eye className="size-5" aria-hidden="true" />
							<p>暂无可对比的页面样本</p>
						</div>
					) : (
						<div className="overflow-x-auto rounded-xl border border-blue-100">
							<Table>
								<TableHeader className="bg-blue-50/70">
									<TableRow>
										<TableHead>页面路由</TableHead>
										<TableHead>访问量</TableHead>
										{overview.metrics.map((metric) => (
											<TableHead key={metric.name}>{metric.name} p75</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{overview.routes.map((route) => (
										<TableRow key={route.route}>
											<TableCell className="font-medium">
												{route.route}
											</TableCell>
											<TableCell className="tabular-nums">
												{route.visits}
											</TableCell>
											{overview.metrics.map((metric) => (
												<TableCell key={metric.name} className="tabular-nums">
													{formatMetric(metric.name, route[metric.name])}
												</TableCell>
											))}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-3 md:grid-cols-2">
				<Card className="gap-0 self-start overflow-hidden rounded-2xl bg-white py-0 shadow-sm ring-cyan-100">
					<CardHeader className="border-cyan-100 border-b bg-gradient-to-r from-cyan-50/80 to-transparent py-4">
						<CardTitle className="flex items-center gap-2">
							<Zap className="size-4 text-cyan-600" aria-hidden="true" />
							慢请求排行
						</CardTitle>
						<CardDescription>浏览器 fetch/XHR 耗时 p95</CardDescription>
					</CardHeader>
					<CardContent className="p-3">
						{overview.slowRequests.length === 0 ? (
							<div className="flex items-center justify-center gap-2 rounded-xl bg-cyan-50/50 px-3 py-5 text-center text-muted-foreground ring-1 ring-cyan-100">
								<Activity className="size-5 text-cyan-600" aria-hidden="true" />
								<p>暂无请求性能样本</p>
							</div>
						) : (
							<ul className="flex flex-col gap-2">
								{overview.slowRequests.map((request, index) => (
									<li
										key={request.name}
										className="flex items-center gap-3 rounded-xl bg-cyan-50/60 px-3 py-2.5 ring-1 ring-cyan-100"
									>
										<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background font-medium">
											{index + 1}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{request.name}
										</span>
										<span className="shrink-0 font-medium">
											{formatDuration(request.p95)} · {request.count}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card className="gap-0 self-start overflow-hidden rounded-2xl bg-white py-0 shadow-sm ring-rose-100">
					<CardHeader className="border-rose-100 border-b bg-gradient-to-r from-rose-50/80 to-transparent py-4">
						<CardTitle className="flex items-center gap-2">
							<TriangleAlert
								className="size-4 text-rose-600"
								aria-hidden="true"
							/>
							前端错误分布
						</CardTitle>
						<CardDescription>按清洗后的错误类型聚合</CardDescription>
					</CardHeader>
					<CardContent className="p-3">
						{overview.errors.length === 0 ? (
							<div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50/50 px-3 py-5 text-center text-muted-foreground ring-1 ring-emerald-100">
								<CircleCheck
									className="size-5 text-emerald-600"
									aria-hidden="true"
								/>
								<p>当前范围内没有前端错误</p>
							</div>
						) : (
							<ul className="flex flex-col gap-2">
								{overview.errors.map((error) => (
									<li
										key={error.name}
										className="flex items-center gap-3 rounded-xl bg-rose-50/60 px-3 py-2.5 ring-1 ring-rose-100"
									>
										<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background">
											<Bug className="size-4" aria-hidden="true" />
										</div>
										<span className="min-w-0 flex-1 truncate">
											{error.name}
										</span>
										<span className="shrink-0 font-medium">
											{error.count} 次
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
