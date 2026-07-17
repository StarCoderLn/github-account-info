import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

import { Mermaid } from "@/components/mermaid";
import { ZoomableImage } from "@/components/zoomable-image";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    img: ZoomableImage,
    Mermaid,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
