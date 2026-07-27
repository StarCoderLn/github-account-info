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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { Activity, RefreshCw, TriangleAlert } from "lucide-react";
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
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>{metric.name} p75</CardTitle>
				<CardDescription>{METRIC_DESCRIPTIONS[metric.name]}</CardDescription>
				<CardAction>
					{metric.rating ? RATING_LABELS[metric.rating] : "等待样本"}
				</CardAction>
			</CardHeader>
			<CardContent>
				<p className="font-semibold text-2xl">
					{formatMetric(metric.name, metric.p75)}
				</p>
				<p className="mt-1 text-muted-foreground">
					p50 {formatMetric(metric.name, metric.p50)} · p95{" "}
					{formatMetric(metric.name, metric.p95)} · {metric.count} 个样本
				</p>
			</CardContent>
		</Card>
	);
}

function SummaryCard({
	title,
	description,
	value,
}: {
	title: string;
	description: string;
	value: string;
}) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="font-semibold text-2xl">{value}</p>
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
			<div className="flex min-h-64 items-center justify-center text-muted-foreground">
				暂无 {metricName} 趋势数据
			</div>
		);
	}

	const width = 900;
	const height = 260;
	const padding = 28;
	const max = Math.max(...points.map((point) => point.p75), 1);
	const coordinates = points.map((point, index) => ({
		x:
			padding +
			(index / Math.max(1, points.length - 1)) * (width - padding * 2),
		y: height - padding - (point.p75 / max) * (height - padding * 2),
		label: new Date(point.bucket).toLocaleString("zh-CN", {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}),
		value: point.p75,
	}));
	const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

	return (
		<div className="overflow-x-auto">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="min-w-2xl text-primary"
				role="img"
				aria-label={`${metricName} p75 时间趋势`}
			>
				<title>{metricName} p75 时间趋势</title>
				<line
					x1={padding}
					y1={height - padding}
					x2={width - padding}
					y2={height - padding}
					stroke="currentColor"
					opacity="0.2"
				/>
				<polyline
					points={line}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinejoin="round"
					strokeLinecap="round"
				/>
				{coordinates.map((point) => (
					<circle
						key={`${point.label}-${point.x}`}
						cx={point.x}
						cy={point.y}
						r="4"
						fill="currentColor"
					>
						<title>
							{point.label}：{formatMetric(metricName, point.value)}
						</title>
					</circle>
				))}
			</svg>
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
		meta: { suppressGlobalErrorToast: true },
	});

	if (overviewQuery.isPending) {
		return <LoadingDashboard />;
	}

	if (overviewQuery.isError || !overviewQuery.data) {
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

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl">真实用户性能</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						五项 Web Vitals、前端错误和异步清洗链路统计
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<label htmlFor="performance-range" className="text-sm">
						统计范围
					</label>
					<select
						id="performance-range"
						value={range}
						onChange={(event) => setRange(event.target.value as Range)}
						className="h-8 rounded-md border bg-background px-2 text-sm"
					>
						<option value="1h">最近 1 小时</option>
						<option value="24h">最近 24 小时</option>
						<option value="7d">最近 7 天</option>
					</select>
					<select
						aria-label="筛选运行环境"
						value={environment}
						onChange={(event) => setEnvironment(event.target.value)}
						className="h-8 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">全部环境</option>
						{overview.filters.environments.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
					<select
						aria-label="筛选发布版本"
						value={release}
						onChange={(event) => setRelease(event.target.value)}
						className="h-8 max-w-44 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">全部版本</option>
						{overview.filters.releases.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
					<select
						aria-label="筛选页面路由"
						value={route}
						onChange={(event) => setRoute(event.target.value)}
						className="h-8 max-w-44 rounded-md border bg-background px-2 text-sm"
					>
						<option value="">全部路由</option>
						{overview.filters.routes.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
					<Button
						variant="outline"
						size="sm"
						onClick={() => overviewQuery.refetch()}
						disabled={overviewQuery.isFetching}
					>
						<RefreshCw data-icon="inline-start" />
						刷新
					</Button>
				</div>
			</div>

			<section aria-labelledby="web-vitals-title">
				<h2 id="web-vitals-title" className="sr-only">
					五项 Web Vitals
				</h2>
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
				/>
				<SummaryCard
					title="页面访问量"
					description={`${overview.summary.sessions} 个匿名会话`}
					value={overview.summary.pageViews.toLocaleString("zh-CN")}
				/>
				<SummaryCard
					title="事件处理延迟 p75"
					description="浏览器产生到 ECS 清洗"
					value={formatDuration(overview.summary.processingLagP75)}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Web Vitals p75 趋势</CardTitle>
					<CardDescription>
						切换查看 LCP、INP、CLS、FCP、TTFB 的真实用户趋势
					</CardDescription>
					<CardAction>
						<select
							aria-label="选择趋势指标"
							value={activeMetric}
							onChange={(event) =>
								setActiveMetric(event.target.value as MetricName)
							}
							className="h-8 rounded-md border bg-background px-2 text-sm"
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

			<Card>
				<CardHeader>
					<CardTitle>按页面路由对比</CardTitle>
					<CardDescription>
						每个 route 的访问量与五项 Web Vitals p75
					</CardDescription>
				</CardHeader>
				<CardContent>
					{overview.routes.length === 0 ? (
						<p className="py-12 text-center text-muted-foreground">
							暂无可对比的页面样本
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Route</TableHead>
									<TableHead>Visits</TableHead>
									{overview.metrics.map((metric) => (
										<TableHead key={metric.name}>{metric.name} p75</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{overview.routes.map((route) => (
									<TableRow key={route.route}>
										<TableCell className="font-medium">{route.route}</TableCell>
										<TableCell>{route.visits}</TableCell>
										{overview.metrics.map((metric) => (
											<TableCell key={metric.name}>
												{formatMetric(metric.name, route[metric.name])}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-3 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>慢请求排行</CardTitle>
						<CardDescription>浏览器 fetch/XHR 耗时 p95</CardDescription>
					</CardHeader>
					<CardContent>
						{overview.slowRequests.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground">
								<Activity className="mx-auto mb-2 size-5" aria-hidden="true" />
								暂无请求性能样本
							</p>
						) : (
							<ul className="flex flex-col gap-3">
								{overview.slowRequests.map((request) => (
									<li
										key={request.name}
										className="flex items-center justify-between gap-4"
									>
										<span className="truncate">{request.name}</span>
										<span>
											{formatDuration(request.p95)} · {request.count}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>前端错误分布</CardTitle>
						<CardDescription>按清洗后的错误类型聚合</CardDescription>
					</CardHeader>
					<CardContent>
						{overview.errors.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground">
								<TriangleAlert
									className="mx-auto mb-2 size-5"
									aria-hidden="true"
								/>
								当前范围内没有前端错误
							</p>
						) : (
							<ul className="flex flex-col gap-3">
								{overview.errors.map((error) => (
									<li
										key={error.name}
										className="flex items-center justify-between gap-4"
									>
										<span className="truncate">{error.name}</span>
										<span>{error.count}</span>
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
