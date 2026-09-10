import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

import { BASE_PATH } from "./lib/base-path";

/** Website plus sibling `../content` must share one Turbopack root. */
const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const documentationDir = path.resolve(websiteDir, "..");
const withMDX = createMDX();

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
  ...(BASE_PATH
    ? {
        basePath: BASE_PATH,
        assetPrefix: `${BASE_PATH}/`,
      }
    : {}),
};

export default withMDX(config);
