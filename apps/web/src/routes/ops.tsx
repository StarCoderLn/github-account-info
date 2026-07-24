import type { AppRouter } from "@github-account-info/api/routers/index";
import { Button } from "@github-account-info/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@github-account-info/ui/components/card";
import { Input } from "@github-account-info/ui/components/input";
import { Skeleton } from "@github-account-info/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { Bot, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/ops")({
	component: OpsPage,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Incident = RouterOutputs["ops"]["list"]["items"][number];

const STATUS_STYLE: Record<Incident["status"], string> = {
	queued: "bg-slate-100 text-slate-700",
	investigating: "bg-blue-100 text-blue-700",
	completed: "bg-emerald-100 text-emerald-700",
	failed: "bg-red-100 text-red-700",
};

function Status({ value }: { value: Incident["status"] }) {
	return (
		<span
			className={`inline-flex px-2 py-0.5 font-medium text-xs ${STATUS_STYLE[value]}`}
		>
			{value}
		</span>
	);
}

function OpsPage() {
	const queryClient = useQueryClient();
	const [component, setComponent] = useState<
		"node-api" | "go-api" | "profile-event-consumer"
	>("node-api");
	const [reason, setReason] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const incidentsQuery = useQuery({
		...trpc.ops.list.queryOptions({ limit: 20 }),
		refetchInterval: (query) => {
			const data = query.state.data;
			return data?.items.some(
				(item) => item.status === "queued" || item.status === "investigating",
			)
				? 4_000
				: false;
		},
	});
	const incidents = incidentsQuery.data?.items ?? [];
	const selected =
		incidents.find((item) => item.incidentId === selectedId) ??
		incidents[0] ??
		null;
	const createMutation = useMutation(trpc.ops.create.mutationOptions());

	async function createIncident() {
		try {
			const incident = await createMutation.mutateAsync({ component, reason });
			setReason("");
			setSelectedId(incident.incidentId);
			await queryClient.invalidateQueries(trpc.ops.list.queryFilter());
			toast.success("调查任务已进入队列");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "创建调查失败");
		}
	}

	return (
		<div className="mx-auto grid max-w-6xl gap-4">
			<section className="flex flex-wrap items-start justify-between gap-4 border border-slate-200 bg-slate-950 p-5 text-white">
				<div>
					<div className="mb-2 flex items-center gap-2 text-sky-300 text-xs">
						<ShieldCheck className="size-4" />
						READ-ONLY INVESTIGATION
					</div>
					<h1 className="font-semibold text-xl">AI Ops Agent</h1>
					<p className="mt-1 max-w-2xl text-slate-300 text-sm">
						基于 CloudWatch、日志和队列证据定位故障；修复建议始终需要人工审批。
					</p>
				</div>
				<Button
					variant="secondary"
					onClick={() => incidentsQuery.refetch()}
					disabled={incidentsQuery.isFetching}
				>
					<RefreshCw
						className={incidentsQuery.isFetching ? "animate-spin" : ""}
					/>
					刷新
				</Button>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>发起手动调查</CardTitle>
					<CardDescription>
						仅允许选择项目资源目录中的组件，Agent 无法访问任意 ARN。
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
					<select
						className="h-8 border border-input bg-background px-2.5 text-xs"
						value={component}
						onChange={(event) =>
							setComponent(event.target.value as typeof component)
						}
						aria-label="调查组件"
					>
						<option value="node-api">Node API</option>
						<option value="go-api">Go API</option>
						<option value="profile-event-consumer">Profile consumer</option>
					</select>
					<Input
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						placeholder="例如：最近 15 分钟接口错误率升高"
						maxLength={750}
					/>
					<Button
						onClick={createIncident}
						disabled={reason.trim().length < 3 || createMutation.isPending}
					>
						<Bot />
						{createMutation.isPending ? "创建中…" : "开始调查"}
					</Button>
				</CardContent>
			</Card>

			<div className="grid gap-4 lg:grid-cols-[340px_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>事件</CardTitle>
						<CardDescription>最近 20 条，处理中会自动刷新。</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2">
						{incidentsQuery.isLoading ? (
							<div className="grid gap-2">
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
							</div>
						) : incidents.length === 0 ? (
							<p className="text-muted-foreground">暂无调查事件。</p>
						) : (
							incidents.map((incident) => (
								<button
									type="button"
									key={incident.incidentId}
									onClick={() => setSelectedId(incident.incidentId)}
									className={`border p-3 text-left transition-colors hover:bg-slate-50 ${
										selected?.incidentId === incident.incidentId
											? "border-slate-900"
											: "border-slate-200"
									}`}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<Status value={incident.status} />
										<time className="text-slate-500 text-xs">
											{new Date(incident.createdAt).toLocaleString()}
										</time>
									</div>
									<p className="line-clamp-2 font-medium">{incident.title}</p>
								</button>
							))
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>调查结论</CardTitle>
						<CardDescription>
							结论必须引用下方证据；日志内容已在进入模型前脱敏。
						</CardDescription>
					</CardHeader>
					<CardContent>
						{selected === null ? (
							<p className="text-muted-foreground">选择或创建一个事件。</p>
						) : selected.investigation ? (
							<div className="grid gap-5">
								<div>
									<div className="mb-2 flex items-center gap-2">
										<Status value={selected.status} />
										<span className="text-slate-500">
											置信度{" "}
											{Math.round(selected.investigation.confidence * 100)}%
										</span>
									</div>
									<p className="text-sm">{selected.investigation.summary}</p>
								</div>
								<div>
									<h2 className="mb-2 font-medium">可能根因</h2>
									<p className="text-slate-700">
										{selected.investigation.rootCause ??
											"证据不足，尚无确定根因"}
									</p>
								</div>
								<div>
									<h2 className="mb-2 font-medium">证据</h2>
									<ul className="grid gap-2">
										{selected.investigation.evidence.map((evidence) => (
											<li
												key={evidence.evidenceId}
												className="border border-slate-200 bg-slate-50 p-3"
											>
												<p className="font-mono text-slate-500 text-xs">
													{evidence.evidenceId} · {evidence.source}
												</p>
												<p className="mt-1 break-words">
													{evidence.observation}
												</p>
											</li>
										))}
									</ul>
								</div>
								<div>
									<h2 className="mb-2 font-medium">建议（仅供审批）</h2>
									{selected.investigation.recommendations.length === 0 ? (
										<p className="text-slate-500">暂无建议。</p>
									) : (
										<ul className="list-disc space-y-2 pl-5">
											{selected.investigation.recommendations.map(
												(recommendation) => (
													<li key={recommendation.summary}>
														{recommendation.summary}（风险：
														{recommendation.risk}）
													</li>
												),
											)}
										</ul>
									)}
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3 text-slate-600">
								<Bot className="size-5" />
								<p>
									{selected.failure?.message ??
										"Agent 正在收集证据，页面会自动更新。"}
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
