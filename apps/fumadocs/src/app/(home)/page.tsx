import Link from "next/link";

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
        记录 Node Lambda、Go ECS/Fargate、AWS 网络、CI/CD、PR Preview
        环境和真实故障排查过程。忘记细节时，可以从这里重新学一遍。
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground"
        >
          开始阅读
        </Link>
        <Link
          href="/docs/deployment/go-service"
          className="rounded-lg border px-5 py-3 font-medium hover:bg-fd-accent"
        >
          Go 部署教程
        </Link>
      </div>
    </main>
  );
}
