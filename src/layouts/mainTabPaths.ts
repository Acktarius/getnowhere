/** Primary bottom-nav tab ids kept alive after first visit. */
export type MainTabId = "chats" | "contacts" | "wallet" | "settings";

const TAB_DETAIL = /^\/(contacts|chats)\/[^/]+/;
const SETTINGS_DETAIL = /^\/settings\/.+/;

/** Map pathname → tab; defaults to contacts for unknown wallet paths. */
export function activeTabFromPath(pathname: string): MainTabId {
  if (pathname.startsWith("/chats")) return "chats";
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/wallet")) return "wallet";
  if (pathname.startsWith("/settings")) return "settings";
  return "contacts";
}

/** True on stack screens (room, contact detail, settings sub-pages). */
export function isTabDetailPath(pathname: string): boolean {
  return TAB_DETAIL.test(pathname) || SETTINGS_DETAIL.test(pathname);
}
