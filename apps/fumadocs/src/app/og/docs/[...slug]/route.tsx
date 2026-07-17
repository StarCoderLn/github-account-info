import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { getPageImage, source } from "@/lib/source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#09090b",
        color: "#fafafa",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 84px",
        width: "100%",
      }}
    >
      <div style={{ color: "#a1a1aa", display: "flex", fontSize: 26 }}>
        GitHub Account Info
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          Engineering Knowledge Base
        </div>
        <div
          style={{
            color: "#d4d4d8",
            display: "flex",
            fontSize: 30,
            lineHeight: 1.4,
          }}
        >
          {page.slugs.length > 0
            ? page.slugs.join(" / ")
            : "architecture / deployment / operations"}
        </div>
      </div>
      <div style={{ color: "#71717a", display: "flex", fontSize: 22 }}>
        Architecture · Deployment · Operations
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
