"use client";

import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { ReactNode, WheelEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

type ZoomViewerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: (scale: number) => ReactNode;
};

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function ZoomViewer({
  open,
  title,
  onClose,
  children,
}: ZoomViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeViewer() {
    setScale(1);
    onClose();
  }

  function changeScale(change: number) {
    setScale((current) => clampScale(current + change));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeScale(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
  }

  if (!portalRoot || !open) return null;

  return createPortal(
    <dialog
      aria-label={`${title}放大预览`}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 text-fd-foreground backdrop:bg-black/75"
      onCancel={(event) => {
        event.preventDefault();
        closeViewer();
      }}
      onClose={() => {
        if (open) closeViewer();
      }}
      ref={dialogRef}
    >
      <div
        className="flex h-full min-h-0 flex-col bg-fd-background/95"
        onWheel={handleWheel}
      >
        <div className="flex shrink-0 items-center gap-2 border-b bg-fd-background px-3 py-2 shadow-sm">
          <div className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </div>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">缩放控制</legend>
            <button
              aria-label="缩小"
              className="rounded-md p-2 hover:bg-fd-accent disabled:opacity-40"
              disabled={scale <= MIN_SCALE}
              onClick={() => changeScale(-SCALE_STEP)}
              type="button"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-14 text-center text-xs tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              aria-label="放大"
              className="rounded-md p-2 hover:bg-fd-accent disabled:opacity-40"
              disabled={scale >= MAX_SCALE}
              onClick={() => changeScale(SCALE_STEP)}
              type="button"
            >
              <Plus className="size-4" />
            </button>
            <button
              aria-label="还原为百分之百"
              className="rounded-md p-2 hover:bg-fd-accent"
              onClick={() => setScale(1)}
              type="button"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              aria-label="关闭预览"
              className="ml-1 rounded-md p-2 hover:bg-fd-accent"
              onClick={closeViewer}
              type="button"
            >
              <X className="size-4" />
            </button>
          </fieldset>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto min-w-0" style={{ width: `${scale * 100}%` }}>
            {children(scale)}
          </div>
        </div>

        <p className="m-0 shrink-0 border-t bg-fd-background px-4 py-2 text-center text-xs text-fd-muted-foreground">
          使用按钮或按住 Ctrl/⌘ 滚动缩放，按 Esc 关闭
        </p>
      </div>
    </dialog>,
    portalRoot,
  );
}

export function ZoomTriggerIcon() {
  return <Maximize2 aria-hidden="true" className="size-4" />;
}
