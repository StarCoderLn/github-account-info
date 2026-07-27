import type { AppRouter } from "@github-account-info/api/routers/index";
import { Button } from "@github-account-info/ui/components/button";
import { Input } from "@github-account-info/ui/components/input";
import { Skeleton } from "@github-account-info/ui/components/skeleton";
import { cn } from "@github-account-info/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import {
	Bot,
	Check,
	Circle,
	Clock3,
	RefreshCw,
	Search,
	Send,
	ShieldCheck,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/ops")({
	component: OpsPage,
});

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Incident = RouterOutputs["ops"]["list"]["items"][number];
type OpsComponent = "node-api" | "go-api" | "profile-event-consumer";
type WorkflowState = "complete" | "active" | "pending" | "failed";

const COMPONENT_LABELS: Record<OpsComponent, string> = {
	"node-api": "Node API",
	"go-api": "Go API",
	"profile-event-consumer": "Profile Consumer",
};

const STATUS_LABELS: Record<Incident["status"], string> = {
	queued: "排队中",
	investigating: "调查中",
	completed: "已完成",
	failed: "失败",
};

const STATUS_STYLE: Record<Incident["status"], string> = {
	queued: "bg-gray-100 text-gray-600",
	investigating: "bg-blue-100 text-blue-700",
	completed: "bg-emerald-100 text-emerald-700",
	failed: "bg-red-100 text-red-700",
};

const STARTER_PROMPTS: ReadonlyArray<{
	component: OpsComponent;
	label: string;
	reason: string;
}> = [
	{
		component: "node-api",
		label: "检查 Node API 最近是否稳定",
		reason: "检查最近 15 分钟 Node API 的错误率、日志和部署状态是否异常",
	},
	{
		component: "go-api",
		label: "分析 Go API Canary 是否健康",
		reason: "分析 Go API Canary 的健康状态、告警和近期部署事件",
	},
	{
		component: "profile-event-consumer",
		label: "排查事件消费是否积压",
		reason: "检查 Profile Consumer 的主队列、DLQ 和消费日志是否存在积压或失败",
	},
];

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

function Status({ value }: { value: Incident["status"] }) {
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2 py-0.5 font-medium text-xs",
				STATUS_STYLE[value],
			)}
		>
			{STATUS_LABELS[value]}
		</span>
	);
}

function getIncidentPrompt(incident: Incident): string {
	return (
		incident.manualContext?.reason ??
		incident.alarmContext?.reason ??
		incident.title
	);
}

function getWorkflowSteps(
	status: Incident["status"],
): ReadonlyArray<{ label: string; state: WorkflowState }> {
	return [
		{ label: "收到调查问题", state: "complete" },
		{
			label: "进入 AWS 调查队列",
			state: status === "queued" ? "active" : "complete",
		},
		{
			label: "收集并分析只读证据",
			state:
				status === "investigating"
					? "active"
					: status === "completed"
						? "complete"
						: status === "failed"
							? "failed"
							: "pending",
		},
		{
			label: status === "failed" ? "调查未完成" : "生成结论和处置建议",
			state:
				status === "completed"
					? "complete"
					: status === "failed"
						? "failed"
						: "pending",
		},
	];
}

function WorkflowIcon({ state }: { state: WorkflowState }) {
	if (state === "complete") {
		return (
			<span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
				<Check className="size-3.5" aria-hidden="true" />
			</span>
		);
	}
	if (state === "active") {
		return (
			<span className="flex size-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
				<Clock3 className="size-3.5" aria-hidden="true" />
			</span>
		);
	}
	if (state === "failed") {
		return (
			<span className="flex size-6 items-center justify-center rounded-full bg-red-100 text-red-700">
				<TriangleAlert className="size-3.5" aria-hidden="true" />
			</span>
		);
	}
	return (
		<span className="flex size-6 items-center justify-center rounded-full bg-gray-100 text-gray-300">
			<Circle className="size-2.5" aria-hidden="true" />
		</span>
	);
}

function InvestigationWorkflow({ incident }: { incident: Incident }) {
	const steps = getWorkflowSteps(incident.status);

	return (
		<div
			className="rounded-lg border border-gray-100 bg-gray-50 p-4"
			aria-live="polite"
		>
			<p className="mb-3 font-medium text-gray-700 text-sm">Agent 调查进度</p>
			<ol className="grid gap-3">
				{steps.map((step) => (
					<li key={step.label} className="flex items-center gap-3">
						<WorkflowIcon state={step.state} />
						<span
							className={cn(
								"text-sm",
								step.state === "active"
									? "font-medium text-blue-700"
									: step.state === "failed"
										? "font-medium text-red-700"
										: step.state === "complete"
											? "text-gray-700"
											: "text-gray-400",
							)}
						>
							{step.label}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}

function OpsPage() {
	const queryClient = useQueryClient();
	const [component, setComponent] = useState<OpsComponent>("node-api");
	const [reason, setReason] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const incidentsQuery = useQuery({
		...trpc.ops.list.queryOptions({ limit: 20 }),
		meta: { suppressGlobalErrorToast: true },
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
			toast.success("Agent 已收到问题，开始调查");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "创建调查失败");
		}
	}

	function useStarterPrompt(prompt: (typeof STARTER_PROMPTS)[number]) {
		setComponent(prompt.component);
		setReason(prompt.reason);
	}

	return (
		<div className="grid gap-6">
			<section className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-4">
					<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
						<Bot className="size-6" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="font-semibold text-gray-900 text-xl">
								AI Ops Agent
							</h1>
							<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700 text-xs">
								<ShieldCheck className="size-3.5" aria-hidden="true" />
								只读模式
							</span>
						</div>
						<p className="mt-2 text-gray-600 text-sm">
							告诉我哪个服务出现了什么异常。我会读取
							CloudWatch、日志、队列和部署事件，
							整理证据并给出可能根因与处理建议。
						</p>
						<p className="mt-1 text-gray-400 text-xs">
							我不会自动修改或删除任何 AWS 资源，所有修复建议都需要你人工确认。
						</p>
					</div>
				</div>
			</section>

			{incidentsQuery.isError ? (
				<section
					className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
					role="alert"
				>
					<div className="flex min-w-0 items-start gap-3">
						<TriangleAlert
							className="mt-0.5 size-5 shrink-0 text-amber-600"
							aria-hidden="true"
						/>
						<div>
							<p className="font-medium text-amber-900 text-sm">
								当前页面未连接 AI Ops 后端
							</p>
							<p className="mt-1 break-words text-amber-700 text-xs">
								{incidentsQuery.error.message}
								。本地可继续查看界面，真实调查请使用已部署的线上页面。
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => incidentsQuery.refetch()}
						disabled={incidentsQuery.isFetching}
						className="rounded-lg border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
					>
						<RefreshCw
							data-icon="inline-start"
							className={incidentsQuery.isFetching ? "animate-spin" : ""}
						/>
						重新连接
					</Button>
				</section>
			) : null}

			<section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<div className="flex items-start gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
						<Sparkles className="size-4" aria-hidden="true" />
					</div>
					<div>
						<h2 className="font-medium text-gray-800">你想调查什么？</h2>
						<p className="mt-1 text-gray-400 text-sm">
							选择一个服务，再描述你观察到的现象。也可以直接使用下面的示例。
						</p>
					</div>
				</div>

				<div className="mt-4 grid gap-2 sm:grid-cols-3">
					{STARTER_PROMPTS.map((prompt) => (
						<Button
							key={prompt.label}
							type="button"
							variant="outline"
							onClick={() => useStarterPrompt(prompt)}
							className="h-auto min-h-10 justify-start whitespace-normal rounded-lg border-gray-200 px-3 py-2 text-left text-gray-600 leading-relaxed hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
						>
							<Search data-icon="inline-start" />
							{prompt.label}
						</Button>
					))}
				</div>

				<div className="mt-5 grid gap-3 sm:grid-cols-[180px_1fr]">
					<div className="grid gap-1.5">
						<label htmlFor="ops-component" className="text-gray-600 text-xs">
							调查对象
						</label>
						<select
							id="ops-component"
							name="ops-component"
							className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100"
							value={component}
							onChange={(event) =>
								setComponent(event.target.value as OpsComponent)
							}
						>
							{Object.entries(COMPONENT_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="grid gap-1.5">
						<label htmlFor="ops-reason" className="text-gray-600 text-xs">
							告诉 Agent 你观察到了什么
						</label>
						<Input
							id="ops-reason"
							name="ops-reason"
							autoComplete="off"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									reason.trim().length >= 3 &&
									!createMutation.isPending
								) {
									createIncident();
								}
							}}
							placeholder="例如：最近 15 分钟接口错误率升高…"
							maxLength={750}
							className="h-10 rounded-lg border-gray-200 px-3 text-sm focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100 md:text-sm"
						/>
					</div>
					<Button
						type="button"
						onClick={createIncident}
						disabled={reason.trim().length < 3 || createMutation.isPending}
						className="h-10 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 sm:col-span-2"
					>
						<Send data-icon="inline-start" />
						{createMutation.isPending ? "正在提交…" : "让 Agent 开始调查"}
					</Button>
				</div>
			</section>

			<div className="grid items-start gap-4 md:grid-cols-[260px_1fr]">
				<section className="self-start rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:sticky md:top-4">
					<div className="flex items-start justify-between gap-2">
						<div>
							<h2 className="font-medium text-gray-800">调查记录</h2>
							<p className="mt-1 text-gray-400 text-sm">
								处理中每 4 秒自动更新。
							</p>
						</div>
						<Button
							type="button"
							size="icon-sm"
							variant="ghost"
							aria-label="刷新调查记录"
							onClick={() => incidentsQuery.refetch()}
							disabled={incidentsQuery.isFetching}
							className="rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700"
						>
							<RefreshCw
								className={incidentsQuery.isFetching ? "animate-spin" : ""}
							/>
						</Button>
					</div>
					<div
						className={cn(
							"mt-4 grid content-start gap-2",
							incidentsQuery.isLoading || incidents.length === 0
								? "h-64"
								: "max-h-[36rem] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] md:max-h-[calc(100vh-9rem)]",
						)}
					>
						{incidentsQuery.isLoading ? (
							<div className="grid h-64 grid-rows-3 gap-2 overflow-hidden">
								{Array.from({ length: 3 }, (_, index) => (
									<div
										key={`incident-skeleton-${index}`}
										className="flex h-full flex-col justify-center gap-2 rounded-lg border border-gray-100 bg-white px-3"
									>
										<Skeleton className="h-3 w-2/5 rounded" />
										<Skeleton className="h-3 w-4/5 rounded" />
									</div>
								))}
							</div>
						) : incidents.length === 0 ? (
							<div className="flex h-64 flex-col items-center justify-center rounded-lg border border-gray-200 border-dashed bg-white px-3 text-center">
								<Clock3 className="size-5 text-gray-300" aria-hidden="true" />
								<p className="mt-2 text-gray-400 text-sm">还没有调查记录</p>
							</div>
						) : (
							incidents.map((incident) => (
								<button
									type="button"
									key={incident.incidentId}
									onClick={() => setSelectedId(incident.incidentId)}
									className={cn(
										"cursor-pointer rounded-lg border p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100",
										selected?.incidentId === incident.incidentId
											? "border-blue-300 bg-blue-50"
											: "border-gray-200 bg-white",
									)}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<Status value={incident.status} />
										<time className="shrink-0 text-gray-400 text-xs">
											{DATE_TIME_FORMATTER.format(new Date(incident.createdAt))}
										</time>
									</div>
									<p className="line-clamp-2 break-words font-medium text-gray-800 text-sm">
										{getIncidentPrompt(incident)}
									</p>
								</button>
							))
						)}
					</div>
				</section>

				<section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2">
						<div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
							<Bot className="size-4" aria-hidden="true" />
						</div>
						<div>
							<h2 className="font-medium text-gray-800">Agent 工作台</h2>
							<p className="text-gray-400 text-sm">
								查看调查过程、证据与结论。
							</p>
						</div>
					</div>

					<div className="mt-4">
						{selected === null ? (
							<div className="flex h-64 flex-col items-center justify-center rounded-lg border border-gray-200 border-dashed bg-white px-5 text-center">
								<Bot className="size-8 text-blue-200" aria-hidden="true" />
								<h3 className="mt-3 font-medium text-gray-700">
									等待你的第一个问题
								</h3>
								<p className="mx-auto mt-1 max-w-sm text-gray-400 text-sm">
									从上方选择一个示例，或描述你观察到的异常，我会开始收集证据。
								</p>
							</div>
						) : (
							<div className="grid gap-4">
								<div className="flex justify-end">
									<div className="max-w-[88%] rounded-xl rounded-br-sm bg-blue-600 px-4 py-3 text-white">
										<p className="text-blue-100 text-xs">你的问题</p>
										<p className="mt-1 break-words text-sm">
											{getIncidentPrompt(selected)}
										</p>
									</div>
								</div>

								<div className="flex items-start gap-3">
									<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
										<Bot className="size-4" aria-hidden="true" />
									</div>
									<div className="min-w-0 flex-1">
										<InvestigationWorkflow incident={selected} />
									</div>
								</div>

								{selected.investigation ? (
									<div className="grid gap-5 border-gray-100 border-t pt-5">
										<div>
											<div className="mb-2 flex flex-wrap items-center gap-2">
												<Status value={selected.status} />
												<span className="text-gray-400 text-sm">
													置信度{" "}
													{Math.round(selected.investigation.confidence * 100)}%
												</span>
											</div>
											<h3 className="font-medium text-gray-800">调查结论</h3>
											<p className="mt-2 break-words text-gray-700 text-sm">
												{selected.investigation.summary}
											</p>
										</div>
										<div>
											<h3 className="font-medium text-gray-800">可能根因</h3>
											<p className="mt-2 break-words text-gray-600 text-sm">
												{selected.investigation.rootCause ??
													"目前证据不足，尚无确定根因"}
											</p>
										</div>
										<div>
											<h3 className="font-medium text-gray-800">关键证据</h3>
											<ul className="mt-2 grid gap-2">
												{selected.investigation.evidence.map((evidence) => (
													<li
														key={evidence.evidenceId}
														className="rounded-lg border border-gray-100 bg-gray-50 p-3"
													>
														<p className="break-words font-mono text-gray-400 text-xs">
															{evidence.evidenceId} · {evidence.source}
														</p>
														<p className="mt-1 break-words text-gray-600 text-sm">
															{evidence.observation}
														</p>
													</li>
												))}
											</ul>
										</div>
										<div>
											<h3 className="font-medium text-gray-800">
												建议操作（需要人工确认）
											</h3>
											{selected.investigation.recommendations.length === 0 ? (
												<p className="mt-2 text-gray-400 text-sm">
													当前无需执行操作。
												</p>
											) : (
												<ul className="mt-2 grid list-disc gap-2 pl-5 text-gray-600 text-sm">
													{selected.investigation.recommendations.map(
														(recommendation) => (
															<li
																key={recommendation.summary}
																className="break-words"
															>
																{recommendation.summary}（风险：
																{recommendation.risk}）
															</li>
														),
													)}
												</ul>
											)}
										</div>
									</div>
								) : selected.status === "failed" ? (
									<div className="rounded-lg border border-red-100 bg-red-50 p-4 text-red-700 text-sm">
										<p className="font-medium">本次调查未完成</p>
										<p className="mt-1 break-words">
											{selected.failure?.message ?? "请稍后重新发起调查。"}
										</p>
									</div>
								) : (
									<p className="text-center text-gray-400 text-sm">
										Agent 正在工作，完成后会自动显示调查结论。
									</p>
								)}
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
