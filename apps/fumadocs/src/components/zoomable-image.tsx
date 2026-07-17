"use client";

import type { StaticImageData } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { useState } from "react";

import { ZoomTriggerIcon, ZoomViewer } from "@/components/zoom-viewer";

type ZoomableImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | Blob | StaticImageData;
};

export function ZoomableImage({
  src,
  alt = "文档图片",
  className,
  width,
  height,
  ...props
}: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  const staticImage = typeof src === "object" && "src" in src ? src : undefined;
  const imageSource = typeof src === "string" ? src : staticImage?.src;
  const imageWidth = width ?? staticImage?.width;
  const imageHeight = height ?? staticImage?.height;

  if (!imageSource) return null;

  const imageClassName = `m-0 block h-auto max-w-full rounded-lg ${className ?? ""}`;

  return (
    <>
      <button
        aria-label={`放大查看：${alt}`}
        className="group relative my-4 block w-full cursor-zoom-in overflow-hidden rounded-lg border bg-fd-card text-left shadow-sm transition hover:border-fd-primary/50"
        onClick={() => setOpen(true)}
        type="button"
      >
        {/* biome-ignore lint/performance/noImgElement: MDX supports both imported static images and ordinary image URLs */}
        <img
          {...props}
          alt={alt}
          className={imageClassName}
          height={imageHeight}
          src={imageSource}
          width={imageWidth}
        />
        <span className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1.5 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomTriggerIcon />
          点击放大
        </span>
      </button>

      <ZoomViewer open={open} title={alt} onClose={() => setOpen(false)}>
        {() => (
          // biome-ignore lint/performance/noImgElement: the original image is required for detailed zoom inspection
          <img
            alt={alt}
            className="block h-auto w-full max-w-none rounded-lg bg-white shadow-2xl"
            height={imageHeight}
            src={imageSource}
            width={imageWidth}
          />
        )}
      </ZoomViewer>
    </>
  );
}
