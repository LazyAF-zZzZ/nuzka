import { sanitizeFontFamily } from './settings';

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

// How a text part looks, set from the overlay editor (2026-10-05, user's request: every text part
// adjustable, and the operator can add text of their own). Every field is optional: absent means
// "as the page designed it". Stored inside the part's layout entry so a move, a reset and an undo
// treat position and look as one thing.
export interface TextStyle {
  t?: string;   // the words themselves (a static label's wording, or a custom text part's content)
  f?: string;   // font family, same charset as the page fonts
  z?: number;   // font size in 1080p pixels
  w?: number;   // weight 100..900
  c?: string;   // colour #rrggbb
  a?: 'left' | 'center' | 'right';
  ls?: number;  // letter spacing, px
  tt?: 'upper' | 'lower' | 'title';
  oc?: string;  // outline colour
  ow?: number;  // outline width, px
  sc?: string;  // shadow colour
  sb?: number;  // shadow blur
  sx?: number;  // shadow offset
  sy?: number;
  // effects (2026-10-05): gradient fill, glow, an entrance animation and a looping one
  g1?: string;  // gradient start colour; a gradient needs both g1 and g2
  g2?: string;
  ga?: number;  // gradient angle, degrees
  gc?: string;  // glow colour
  gs?: number;  // glow strength (blur radius); 0 or absent = no glow
  en?: 'fade' | 'up' | 'down' | 'left' | 'right' | 'pop' | 'blur';
  ed?: number;  // entrance duration, ms
  edl?: number; // entrance delay, ms
  lp?: 'pulse' | 'shimmer' | 'float' | 'flicker';
  lt?: number;  // loop period, seconds
}

export const TEXT_ENTRANCES = ['fade', 'up', 'down', 'left', 'right', 'pop', 'blur'] as const;
export const TEXT_LOOPS = ['pulse', 'shimmer', 'float', 'flicker'] as const;

export interface LayoutEntry {
  x: number;
  y: number;
  s: number;
  h: boolean;
  tx?: TextStyle;
  // A text part the operator added. It has no page element of its own, so its entry must be kept
  // even when it sits at its starting spot.
  k?: true;
}

export type SceneLayout = Record<string, LayoutEntry>;
export type Layout = Record<string, SceneLayout>;

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_SCENES = 20;
const MAX_ENTRIES = 200;
export const LAYOUT_OFFSET_LIMIT = 3000;
export const LAYOUT_SCALE_RANGE: [number, number] = [0.2, 4];

export const TEXT_MAX_LENGTH = 200;
const HEX = /^#[0-9a-fA-F]{6}$/;

function clampNum(value: unknown, min: number, max: number, step: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const v = Math.round(Math.min(max, Math.max(min, n)) / step) * step;
  return Math.round(v * 100) / 100;
}

// Control characters other than a line break are dropped by code, not by escape sequence (see
// the rule in CLAUDE.md about control bytes in source).
function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let out = '';
  const chars = Array.from(value);
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i]!;
    let code = ch.charCodeAt(0);
    // CR LF and a lone CR both become one line break
    if (code === 13) {
      if (chars[i + 1] && chars[i + 1]!.charCodeAt(0) === 10) i++;
      code = 10;
      ch = String.fromCharCode(10);
    }
    if (code < 32 && code !== 10) continue;
    if (code === 127) continue;
    out += ch;
    if (out.length >= TEXT_MAX_LENGTH) break;
  }
  return out;
}

// undefined when nothing in it differs from the page's own look.
export function sanitizeTextStyle(value: unknown): TextStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const src = value as Record<string, unknown>;
  const tx: TextStyle = {};
  const t = cleanText(src.t);
  if (t !== undefined && t !== '') tx.t = t;
  if (typeof src.f === 'string') {
    const f = sanitizeFontFamily(src.f);
    if (f) tx.f = f;
  }
  const z = clampNum(src.z, 6, 400, 1);
  if (z !== undefined) tx.z = z;
  const w = clampNum(src.w, 100, 900, 100);
  if (w !== undefined) tx.w = w;
  if (typeof src.c === 'string' && HEX.test(src.c)) tx.c = src.c.toLowerCase();
  if (src.a === 'left' || src.a === 'center' || src.a === 'right') tx.a = src.a;
  const ls = clampNum(src.ls, -5, 40, 0.1);
  if (ls !== undefined) tx.ls = ls;
  if (src.tt === 'upper' || src.tt === 'lower' || src.tt === 'title') tx.tt = src.tt;
  if (typeof src.oc === 'string' && HEX.test(src.oc)) tx.oc = src.oc.toLowerCase();
  const ow = clampNum(src.ow, 0, 20, 0.5);
  if (ow !== undefined) tx.ow = ow;
  if (typeof src.sc === 'string' && HEX.test(src.sc)) tx.sc = src.sc.toLowerCase();
  const sb = clampNum(src.sb, 0, 60, 1);
  if (sb !== undefined) tx.sb = sb;
  const sx = clampNum(src.sx, -60, 60, 1);
  if (sx !== undefined) tx.sx = sx;
  const sy = clampNum(src.sy, -60, 60, 1);
  if (sy !== undefined) tx.sy = sy;
  if (typeof src.g1 === 'string' && HEX.test(src.g1)) tx.g1 = src.g1.toLowerCase();
  if (typeof src.g2 === 'string' && HEX.test(src.g2)) tx.g2 = src.g2.toLowerCase();
  // half a gradient is nothing: keep the pair or neither
  if (!tx.g1 || !tx.g2) { delete tx.g1; delete tx.g2; }
  else {
    const ga = clampNum(src.ga, 0, 360, 5);
    if (ga !== undefined) tx.ga = ga;
  }
  if (typeof src.gc === 'string' && HEX.test(src.gc)) tx.gc = src.gc.toLowerCase();
  const gs = clampNum(src.gs, 0, 60, 1);
  if (gs !== undefined) tx.gs = gs;
  const en = TEXT_ENTRANCES.find((e) => e === src.en);
  if (en) {
    tx.en = en;
    const ed = clampNum(src.ed, 100, 3000, 50);
    if (ed !== undefined) tx.ed = ed;
    const edl = clampNum(src.edl, 0, 5000, 50);
    if (edl !== undefined) tx.edl = edl;
  }
  const lp = TEXT_LOOPS.find((e) => e === src.lp);
  if (lp) {
    tx.lp = lp;
    const lt = clampNum(src.lt, 0.5, 10, 0.1);
    if (lt !== undefined) tx.lt = lt;
  }
  return Object.keys(tx).length > 0 ? tx : undefined;
}

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
  const tx = sanitizeTextStyle(source.tx);
  if (tx) entry.tx = tx;
  if (source.k === true) entry.k = true;
  return entry.x === 0 && entry.y === 0 && entry.s === 1 && !entry.h && !entry.tx && !entry.k ? null : entry;
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
