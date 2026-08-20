/**
 * Keet-style repeating SVG tiles per room topic. Used as CSS mask + accent fill.
 * @see docs/architecture/pairing-and-topics.md
 */

import type { RoomTopicId } from "@/services/protocol/roomTopics";
import { DEFAULT_ROOM_TOPIC } from "@/services/protocol/roomTopics";

const TILE_SIZE = 168;
const ICON_BOX = 24;

type SvgNode =
  | { tag: "path"; d: string }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | {
      tag: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | {
      tag: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

type GlyphId =
  | "messageSquare"
  | "messageCircle"
  | "briefcase"
  | "laptop"
  | "users"
  | "home"
  | "palmtree"
  | "sun"
  | "plane"
  | "camera"
  | "heart"
  | "coffee"
  | "wallet"
  | "coins"
  | "landmark";

type TilePlacement = {
  glyph: GlyphId;
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
};

/** Lucide-compatible 24×24 stroke glyphs (white mask source). */
const GLYPHS: Record<GlyphId, SvgNode[]> = {
  messageSquare: [
    {
      tag: "path",
      d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    },
  ],
  messageCircle: [
    {
      tag: "path",
      d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
    },
  ],
  briefcase: [
    { tag: "path", d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" },
    { tag: "rect", x: 2, y: 6, width: 20, height: 14, rx: 2 },
  ],
  laptop: [
    { tag: "path", d: "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9" },
    { tag: "path", d: "M22 19H2" },
  ],
  users: [
    { tag: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { tag: "circle", cx: 9, cy: 7, r: 4 },
    { tag: "path", d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { tag: "path", d: "M16 3.13a4 4 0 0 1 0 7.75" },
  ],
  home: [
    { tag: "path", d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
    { tag: "path", d: "M9 22V12h6v10" },
  ],
  palmtree: [
    {
      tag: "path",
      d: "M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1H7l1-1 1 1h2l1-1 1 1h1",
    },
    {
      tag: "path",
      d: "M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-1.89l-1-1-1 1h-1.67l-1-1-1 1h-1.67l-1-1-1 1H13",
    },
    {
      tag: "path",
      d: "M5.89 9.71c-1.015 1.015-1.512 2.406-1.638 3.858L4 15h12l-.25-1.432c-.126-1.452-.623-2.843-1.638-3.858a6.999 6.999 0 0 0-6.474 0",
    },
  ],
  sun: [
    { tag: "circle", cx: 12, cy: 12, r: 4 },
    { tag: "line", x1: 12, y1: 2, x2: 12, y2: 4 },
    { tag: "line", x1: 12, y1: 20, x2: 12, y2: 22 },
    { tag: "line", x1: 4.93, y1: 4.93, x2: 6.34, y2: 6.34 },
    { tag: "line", x1: 17.66, y1: 17.66, x2: 19.07, y2: 19.07 },
    { tag: "line", x1: 2, y1: 12, x2: 4, y2: 12 },
    { tag: "line", x1: 20, y1: 12, x2: 22, y2: 12 },
    { tag: "line", x1: 4.93, y1: 19.07, x2: 6.34, y2: 17.66 },
    { tag: "line", x1: 17.66, y1: 6.34, x2: 19.07, y2: 4.93 },
  ],
  plane: [
    {
      tag: "path",
      d: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
    },
  ],
  camera: [
    {
      tag: "path",
      d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
    },
    { tag: "circle", cx: 12, cy: 13, r: 3 },
  ],
  heart: [
    {
      tag: "path",
      d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
    },
  ],
  coffee: [
    { tag: "path", d: "M10 2v2" },
    { tag: "path", d: "M14 2v2" },
    {
      tag: "path",
      d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
    },
  ],
  wallet: [
    {
      tag: "path",
      d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    },
    { tag: "path", d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" },
  ],
  coins: [
    { tag: "circle", cx: 8, cy: 8, r: 6 },
    { tag: "path", d: "M18.09 10.37A6 6 0 1 1 10.34 18" },
    { tag: "path", d: "M7 6h1v4" },
    { tag: "path", d: "M16 14h1v4" },
  ],
  landmark: [
    { tag: "line", x1: 3, y1: 22, x2: 21, y2: 22 },
    { tag: "line", x1: 6, y1: 18, x2: 6, y2: 11 },
    { tag: "line", x1: 10, y1: 18, x2: 10, y2: 11 },
    { tag: "line", x1: 14, y1: 18, x2: 14, y2: 11 },
    { tag: "line", x1: 18, y1: 18, x2: 18, y2: 11 },
    { tag: "path", d: "M12 2 2 7v2h20V7Z" },
  ],
};

const TOPIC_PLACEMENTS: Record<RoomTopicId, TilePlacement[]> = {
  general: [
    { glyph: "messageSquare", x: 18, y: 22, rotate: -14, scale: 0.95 },
    { glyph: "messageCircle", x: 112, y: 38, rotate: 18, scale: 0.85 },
    { glyph: "messageSquare", x: 78, y: 118, rotate: 8, scale: 1 },
    { glyph: "messageCircle", x: 138, y: 96, rotate: -22, scale: 0.9 },
    { glyph: "messageSquare", x: 42, y: 88, rotate: 12, scale: 0.8 },
  ],
  work: [
    { glyph: "briefcase", x: 24, y: 28, rotate: -10, scale: 0.95 },
    { glyph: "laptop", x: 118, y: 44, rotate: 16, scale: 0.88 },
    { glyph: "briefcase", x: 72, y: 122, rotate: 6, scale: 0.82 },
    { glyph: "laptop", x: 140, y: 102, rotate: -18, scale: 0.92 },
    { glyph: "briefcase", x: 48, y: 94, rotate: 20, scale: 0.78 },
  ],
  family: [
    { glyph: "users", x: 20, y: 26, rotate: -12, scale: 0.92 },
    { glyph: "home", x: 110, y: 36, rotate: 14, scale: 0.86 },
    { glyph: "users", x: 76, y: 116, rotate: 8, scale: 0.98 },
    { glyph: "home", x: 136, y: 98, rotate: -20, scale: 0.84 },
    { glyph: "heart", x: 44, y: 86, rotate: 10, scale: 0.76 },
  ],
  vacation: [
    { glyph: "palmtree", x: 16, y: 24, rotate: -8, scale: 0.9 },
    { glyph: "sun", x: 114, y: 32, rotate: 0, scale: 0.82 },
    { glyph: "plane", x: 70, y: 120, rotate: -16, scale: 0.88 },
    { glyph: "camera", x: 142, y: 94, rotate: 12, scale: 0.86 },
    { glyph: "palmtree", x: 40, y: 90, rotate: 18, scale: 0.78 },
  ],
  friends: [
    { glyph: "heart", x: 22, y: 30, rotate: -14, scale: 0.9 },
    { glyph: "coffee", x: 116, y: 40, rotate: 12, scale: 0.88 },
    { glyph: "heart", x: 74, y: 118, rotate: 6, scale: 0.82 },
    { glyph: "coffee", x: 138, y: 100, rotate: -18, scale: 0.92 },
    { glyph: "heart", x: 46, y: 88, rotate: 20, scale: 0.76 },
  ],
  finance: [
    { glyph: "wallet", x: 18, y: 26, rotate: -10, scale: 0.92 },
    { glyph: "coins", x: 112, y: 38, rotate: 14, scale: 0.86 },
    { glyph: "landmark", x: 78, y: 120, rotate: 4, scale: 0.84 },
    { glyph: "wallet", x: 140, y: 96, rotate: -16, scale: 0.88 },
    { glyph: "coins", x: 44, y: 86, rotate: 18, scale: 0.78 },
  ],
};

function renderNode(node: SvgNode): string {
  switch (node.tag) {
    case "path":
      return `<path d="${node.d}"/>`;
    case "circle":
      return `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}"/>`;
    case "rect":
      return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"${node.rx !== undefined ? ` rx="${node.rx}"` : ""}/>`;
    case "line":
      return `<line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}"/>`;
  }
}

function renderGlyph(glyph: GlyphId): string {
  return GLYPHS[glyph].map(renderNode).join("");
}

function renderPlacement({
  glyph,
  x,
  y,
  rotate = 0,
  scale = 1,
}: TilePlacement): string {
  const half = ICON_BOX / 2;
  return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale}) translate(${-half} ${-half})">${renderGlyph(glyph)}</g>`;
}

/** Build one repeating tile SVG (white strokes for CSS mask). */
export function buildChatTopicTileSvg(topicId: RoomTopicId): string {
  const placements =
    TOPIC_PLACEMENTS[topicId] ?? TOPIC_PLACEMENTS[DEFAULT_ROOM_TOPIC];
  const icons = placements.map(renderPlacement).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
    icons,
    "</svg>",
  ].join("");
}

function svgToMaskUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TILE_MASK_CACHE = new Map<RoomTopicId, string>();

/** Cached data-URI for CSS mask-image (accent applied via background-color). */
export function getChatTopicTileMaskUrl(
  topicId: RoomTopicId | undefined,
): string {
  const id = topicId ?? DEFAULT_ROOM_TOPIC;
  const cached = TILE_MASK_CACHE.get(id);
  if (cached) return cached;
  const url = svgToMaskUrl(buildChatTopicTileSvg(id));
  TILE_MASK_CACHE.set(id, url);
  return url;
}

export const CHAT_TOPIC_TILE_SIZE_PX = TILE_SIZE;
