"use client";

import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

import { ZoomTriggerIcon, ZoomViewer } from "@/components/zoom-viewer";

type MermaidModule = typeof import("mermaid");
type RenderedDiagram = {
  svg: string;
  bindFunctions?: (element: Element) => void;
};

let mermaidModulePromise: Promise<MermaidModule> | undefined;
let renderSequence = 0;

function loadMermaid() {
  mermaidModulePromise ??= import("mermaid");
  return mermaidModulePromise;
}

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted)
    return <div className="h-48 animate-pulse rounded-lg bg-fd-muted" />;

  return <MermaidContent chart={chart} />;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "default";
  const [rendered, setRendered] = useState<RenderedDiagram | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const renderId = `${id}-${renderSequence++}`.replaceAll(":", "");

    setRendered(null);
    setFailed(false);

    async function renderDiagram() {
      const { default: mermaid } = await loadMermaid();
      const source = chart.replaceAll("\\n", "\n");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "inherit",
        theme,
      });

      // parse() 不操作 DOM。先完成纯语法校验，避免 render() 在失败时把 Mermaid
      // 自带的 error SVG 追加到 document.body，污染文档底部。
      await mermaid.parse(source);
      const result = await mermaid.render(renderId, source);

      if (active) setRendered(result);
    }

    renderDiagram().catch(() => {
      if (active) setFailed(true);
    });

    return () => {
      active = false;
    };
  }, [chart, id, theme]);

  if (failed) {
    return (
      <div className="my-6 rounded-lg border border-fd-warning/50 bg-fd-warning/10 p-4 text-sm">
        Mermaid 图表渲染失败，请查看下方源码或刷新页面重试。
      </div>
    );
  }

  if (!rendered)
    return <div className="h-48 animate-pulse rounded-lg bg-fd-muted" />;

  return (
    <>
      <div className="group relative my-6 rounded-lg border bg-fd-card">
        <button
          aria-label="放大查看流程图"
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1.5 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={() => setViewerOpen(true)}
          type="button"
        >
          <ZoomTriggerIcon />
          放大
        </button>
        <div
          className="overflow-x-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          ref={(container) => {
            if (container) rendered.bindFunctions?.(container);
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted repository diagrams are rendered with Mermaid securityLevel=strict
          dangerouslySetInnerHTML={{ __html: rendered.svg }}
        />
      </div>

      <ZoomViewer
        open={viewerOpen}
        title="流程图"
        onClose={() => setViewerOpen(false)}
      >
        {() => (
          <div
            className="rounded-lg bg-white p-6 shadow-2xl [&_svg]:h-auto [&_svg]:w-full"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted repository diagrams are rendered with Mermaid securityLevel=strict
            dangerouslySetInnerHTML={{ __html: rendered.svg }}
          />
        )}
      </ZoomViewer>
    </>
  );
}
