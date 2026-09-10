/** Same flag as `next.config.ts` — GitHub project Pages vs local `/`. */
export const BASE_PATH =
  process.env.GITHUB_ACTIONS === "true" ? "/getnowhere" : "";

export function withBasePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
