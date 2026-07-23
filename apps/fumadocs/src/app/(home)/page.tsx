import Link from "next/link";

const quickLinks = [
  { href: "/docs/deployment", label: "当前部署全景" },
  { href: "/docs/deployment/architecture-gallery", label: "架构图总览" },
  {
    href: "/docs/deployment/operations-reliability",
    label: "稳定性与异步事件",
  },
  { href: "/docs/deployment/node-lambda", label: "Node Lambda 部署" },
  { href: "/docs/deployment/go-service", label: "Go 服务部署" },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
      <p className="mb-4 font-mono text-sm text-fd-muted-foreground">
        github-account-info / engineering notes
      </p>
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
        从部署结果回到每一步原理
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
        记录 Node Lambda、Go ECS/Fargate、AWS 网络、CI/CD、PR Preview，
        以及 Synthetics 巡检、SNS/SQS/DLQ 事件链路和灰度发布实践。
        忘记细节时，可以从这里重新学一遍。
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground"
        >
          开始阅读
        </Link>
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border px-5 py-3 font-medium transition-colors hover:bg-fd-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
