// Where the operator has moved, resized or hidden parts of an overlay (2026-09-28: the
// user asked for every element to be draggable to any position).
//
// Shape: layout[scene][element] = { x, y, s, h }
//   scene    a page's name, e.g. "draft" for /overlay and /overlay-1440
//   element  the data-layout name of a part on that page, e.g. "blue-pick-3"
//   x, y     offset in the page's 1080p pixels; 1440p is that layout scaled by 4/3,
//            so one offset serves both sizes
//   s        scale, 1 = as designed
//   h        hidden
//
// Only moved parts are stored: an entry equal to "as designed" is dropped, so a reset is
// simply the key disappearing. Names are restricted to a slug because they end up in a
// CSS attribute selector on the overlay page.

export interface LayoutEntry {
  x: number;
  y: number;
  s: number;
  h: boolean;
}

export type SceneLayout = Record<string, LayoutEntry>;
export type Layout = Record<string, SceneLayout>;

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_SCENES = 20;
const MAX_ENTRIES = 200;
export const LAYOUT_OFFSET_LIMIT = 3000;
export const LAYOUT_SCALE_RANGE: [number, number] = [0.2, 4];

export function isLayoutName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value);
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// null when the entry is "as designed" and should not be stored.
export function sanitizeLayoutEntry(value: unknown): LayoutEntry | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const limit = LAYOUT_OFFSET_LIMIT;
  const [min, max] = LAYOUT_SCALE_RANGE;
  const entry: LayoutEntry = {
    x: Math.round(Math.min(limit, Math.max(-limit, num(source.x, 0)))),
    y: Math.round(Math.min(limit, Math.max(-limit, num(source.y, 0)))),
    // ทีละ 0.1% ไม่ใช่ 1%: ย่อขยายแบบดูดเข้าเส้นนำ ขอบของชิ้นกว้างๆ จะคลาดจากเส้นหลายพิกเซลถ้าปัดทีละ 1%
    s: Math.round(Math.min(max, Math.max(min, num(source.s, 1))) * 1000) / 1000,
    h: source.h === true
  };
  // Math.round(-0.4) is -0; keep the stored JSON tidy.
  if (Object.is(entry.x, -0)) entry.x = 0;
  if (Object.is(entry.y, -0)) entry.y = 0;
  return entry.x === 0 && entry.y === 0 && entry.s === 1 && !entry.h ? null : entry;
}

export function sanitizeSceneLayout(value: unknown): SceneLayout {
  const scene: SceneLayout = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return scene;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(scene).length >= MAX_ENTRIES) break;
    if (!isLayoutName(key)) continue;
    const entry = sanitizeLayoutEntry(raw);
    if (entry) scene[key] = entry;
  }
  return scene;
}

export function sanitizeLayout(value: unknown): Layout {
  const layout: Layout = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return layout;
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(layout).length >= MAX_SCENES) break;
    if (!isLayoutName(name)) continue;
    const scene = sanitizeSceneLayout(raw);
    if (Object.keys(scene).length > 0) layout[name] = scene;
  }
  return layout;
}

// One element changed (value) or put back (value null or "as designed").
export function patchLayout(layout: Layout, scene: unknown, key: unknown, value: unknown): Layout {
  if (!isLayoutName(scene) || !isLayoutName(key)) return layout;
  const next: Layout = { ...layout, [scene]: { ...(layout[scene] || {}) } };
  const entry = sanitizeLayoutEntry(value);
  if (entry) next[scene][key] = entry;
  else delete next[scene][key];
  return sanitizeLayout(next);
}

// A whole scene back to as designed.
export function resetSceneLayout(layout: Layout, scene: unknown): Layout {
  if (!isLayoutName(scene)) return layout;
  const next = { ...layout };
  delete next[scene];
  return next;
}
