import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

/** Website plus sibling `../content` must share one Turbopack root. */
const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const documentationDir = path.resolve(websiteDir, "..");
const withMDX = createMDX();
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const config: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  outputFileTracingRoot: documentationDir,
  turbopack: {
    root: documentationDir,
  },
  images: {
    unoptimized: true,
  },
  ...(isGitHubPages
    ? {
        basePath: "/getnowhere",
        assetPrefix: "/getnowhere/",
      }
    : {}),
};

export default withMDX(config);
