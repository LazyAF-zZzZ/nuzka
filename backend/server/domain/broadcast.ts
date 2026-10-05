// ฉากคั่นรายการ (Starting soon / BRB / Ending), VS, lower third และพื้นหลังเคลื่อนไหว
//
// ที่มา: ชุด overlay ของโปรเจกต์ stock-studio ที่ผู้ใช้ขอให้เอาเข้ามาทั้งหมด (2026-10-01)
// ค่าพวกนี้เป็น "การตั้งค่าเครื่องมือ" ไม่ใช่ข้อมูลของแมตช์ จึงอยู่ใน CARRIED_OVER_KEYS
// กด RESET MATCH หรือเปลี่ยนคู่แล้ว lower third กับนาฬิกานับถอยหลังต้องไม่หาย
//
// นาฬิกานับถอยหลังเก็บเป็น "เวลาสิ้นสุด" (endsAt, ms) ไม่ใช่วินาทีที่เหลือ
// overlay ทุกหน้าที่เปิดอยู่คำนวณเองจากนาฬิกาเครื่องเดียวกัน จึงตรงกันโดยไม่ต้องยิงทุกวินาที
// และเปิดหน้าใหม่กลางทางก็ได้เวลาที่ถูกเลย

import { clampNumber, sanitizeText } from '../lib/sanitize';

// ชื่อต้องตรงกับ STYLES ใน public/js/lib/motion-core.js (เทสต์ตรวจให้)
export const BACKGROUND_STYLES = ['aurora', 'bokeh', 'synthgrid', 'speedlines', 'hexpulse', 'waves'] as const;
export type BackgroundStyle = typeof BACKGROUND_STYLES[number];

// 'theme' = ใช้สีจากธีมของแอพ (น้ำเงิน/แดง/accent) ที่เหลือคือพรีเซ็ตของ motion-core
export const BACKGROUND_PALETTES = [
  'theme', 'neon-violet', 'cyber-teal', 'esports-red', 'royal-gold', 'deep-ocean', 'sunset-drive',
  'toxic-lime', 'ice', 'magma', 'corporate-blue', 'pink-candy', 'emerald'
] as const;
export type BackgroundPalette = typeof BACKGROUND_PALETTES[number];

export interface Background {
  style: BackgroundStyle;
  palette: BackgroundPalette;
  seed: number;
  // 0.25..1 ความละเอียดของ canvas เทียบกับ 1920x1080 ลดได้สำหรับเครื่องที่ช้า
  quality: number;
}

// ฉากที่ตั้งพื้นหลังแยกได้ ว่าง = ใช้ background ตัวกลาง (ของ "ทุกฉาก")
//
// 2026-10-05 (user's request): every page except the draft overlay and the previous picks page can have the
// animated background, and any of them can have it switched off (left transparent). The keys after 'vs' are the
// pages' own data-layout-scene names; 'starting' | 'brb' | 'ending' are the three looks of /overlay-scene.
export const BACKGROUND_SCENES = [
  'starting', 'brb', 'ending', 'vs',
  'result', 'teams', 'standings', 'matchup', 'team-drafts', 'team-card', 'analytics', 'lower-third', 'scoreboard'
] as const;
export type BackgroundScene = typeof BACKGROUND_SCENES[number];
// Whether a scene shows the animation until the operator says otherwise. The break scenes and VS always did;
// every other page has always been transparent over the game or scene underneath, so it stays that way until
// the operator turns the background on (lower third and scoreboard in particular are strips over the game).
export const BACKGROUND_ON_BY_DEFAULT: readonly BackgroundScene[] = ['starting', 'brb', 'ending', 'vs'];
// enabled lives only in a scene's own override: switching one page off must not touch the others.
export interface SceneBackground extends Partial<Background> {
  enabled?: boolean;
}
export type SceneBackgrounds = Partial<Record<BackgroundScene, SceneBackground>>;

// สีแยกรายหน้า (ผู้ใช้ขอ 2026-10-02): หน้าใหม่ทั้งสี่ตั้งสีของตัวเองได้ แทนที่จะใช้สีธีมของแอพร่วมกัน
// ชื่อหน้าคือ data-layout-scene เดียวกับตัวแก้ layout ('scene' = Starting soon/BRB/Ending ใช้ชุดสีเดียวกัน)
// เก็บเฉพาะสีที่ตั้งแยก สีที่ไม่ได้ตั้งตามธีมของแอพต่อไป จึงเปลี่ยนธีมแล้วหน้าที่ไม่เคยแตะก็เปลี่ยนตาม
export const COLOUR_SCENES = ['scene', 'vs', 'lower-third', 'scoreboard'] as const;
export const COLOUR_KEYS = ['blue', 'red', 'accent', 'text'] as const;
export type ColourScene = typeof COLOUR_SCENES[number];
export type ColourKey = typeof COLOUR_KEYS[number];
export type BroadcastColours = Partial<Record<ColourScene, Partial<Record<ColourKey, string>>>>;

export interface Countdown {
  // เวลาสิ้นสุดเป็น ms ตั้งแต่ epoch หรือ null = ยังไม่ได้ตั้ง
  endsAt: number | null;
  label: string;
}

export interface LowerThird {
  visible: boolean;
  name: string;
  title: string;
  handle: string;
}

// กี่แถบที่ขึ้นพร้อมกันได้ (เช่นผู้บรรยายสองคนกับแขกอีกคน) สี่แถบซ้อนกันยังไม่บังเกมเกินครึ่งจอ
export const LOWER_THIRD_MAX = 4;

export interface SceneText {
  // ว่าง = overlay ใช้ข้อความมาตรฐานของตัวเอง
  startingTitle: string;
  brbTitle: string;
  brbSubtitle: string;
  endingTitle: string;
  endingSubtitle: string;
}

export interface Broadcast {
  background: Background;
  // ค่าที่ฉากนั้นทับ background ตัวกลาง เก็บเฉพาะคีย์ที่ถูกตั้งแยก (ดู effectiveBackground)
  sceneBackgrounds: SceneBackgrounds;
  colours: BroadcastColours;
  countdown: Countdown;
  // แถบชื่อหลายแถบ ขึ้น/ลงแยกกัน อย่างน้อยหนึ่งแถบเสมอ เรียงจากล่างขึ้นบนตามลำดับ
  lowerThirds: LowerThird[];
  text: SceneText;
}

export const BACKGROUND_DEFAULT: Background = {
  style: 'aurora',
  palette: 'theme',
  seed: 1,
  quality: 0.75
};

export function emptyLowerThird(): LowerThird {
  return { visible: false, name: '', title: '', handle: '' };
}

export function defaultBroadcast(): Broadcast {
  return {
    background: { ...BACKGROUND_DEFAULT },
    sceneBackgrounds: {},
    colours: {},
    countdown: { endsAt: null, label: '' },
    lowerThirds: [emptyLowerThird()],
    text: { startingTitle: '', brbTitle: '', brbSubtitle: '', endingTitle: '', endingSubtitle: '' }
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((candidate) => candidate === value) ?? fallback;
}

export function sanitizeBackground(value: unknown): Background {
  const source = asObject(value);
  const quality = Number(source.quality);
  return {
    style: oneOf(BACKGROUND_STYLES, source.style, BACKGROUND_DEFAULT.style),
    palette: oneOf(BACKGROUND_PALETTES, source.palette, BACKGROUND_DEFAULT.palette),
    // seed 0 ใช้ได้จริง แต่ค่าที่อ่านไม่ออกต้องตกไปที่ค่าเริ่มต้น ไม่ใช่ 0 (clampNumber คืน min เมื่อไม่ใช่ตัวเลข)
    seed: source.seed !== undefined && source.seed !== null && source.seed !== '' && Number.isFinite(Number(source.seed))
      ? clampNumber(source.seed, 0, 999999)
      : BACKGROUND_DEFAULT.seed,
    quality: source.quality !== undefined && source.quality !== null && Number.isFinite(quality)
      ? Math.round(Math.min(1, Math.max(0.25, quality)) * 100) / 100
      : BACKGROUND_DEFAULT.quality
  };
}

// เฉพาะคีย์ที่ส่งมาและใช้ได้จริงเท่านั้นที่ผ่าน คีย์ที่อ่านไม่ออกถูกทิ้ง ไม่ใช่ตกไปเป็นค่าเริ่มต้น
// (ถ้าตกไปเป็นค่าเริ่มต้น ค่าทับของฉากจะกลายเป็น "aurora" ทั้งที่ผู้ใช้ไม่เคยเลือก)
export function sanitizePartialBackground(value: unknown): SceneBackground {
  const source = asObject(value);
  const out: SceneBackground = {};
  if (typeof source.enabled === 'boolean') out.enabled = source.enabled;
  const full = sanitizeBackground(source);
  if (BACKGROUND_STYLES.some((c) => c === source.style)) out.style = full.style;
  if (BACKGROUND_PALETTES.some((c) => c === source.palette)) out.palette = full.palette;
  if (source.seed !== undefined && source.seed !== null && source.seed !== '' && Number.isFinite(Number(source.seed))) out.seed = full.seed;
  if (source.quality !== undefined && source.quality !== null && source.quality !== '' && Number.isFinite(Number(source.quality))) out.quality = full.quality;
  return out;
}

export function sanitizeSceneBackgrounds(value: unknown): SceneBackgrounds {
  const source = asObject(value);
  const out: SceneBackgrounds = {};
  BACKGROUND_SCENES.forEach((scene) => {
    const partial = sanitizePartialBackground(source[scene]);
    if (Object.keys(partial).length > 0) out[scene] = partial;
  });
  return out;
}

// พื้นหลังที่ฉากนี้ใช้จริง: ตัวกลางแล้วค่าทับของฉาก
export function effectiveBackground(
  broadcast: Pick<Broadcast, 'background' | 'sceneBackgrounds'>,
  scene: BackgroundScene
): Background & { enabled: boolean } {
  const own = broadcast.sceneBackgrounds[scene] || {};
  return { ...broadcast.background, ...own, enabled: own.enabled ?? BACKGROUND_ON_BY_DEFAULT.includes(scene) };
}

// ใช้การแก้พื้นหลังกับ "ทุกฉาก" หรือฉากเดียว (reset = ล้างค่าทับของฉากนั้นกลับไปใช้ตัวกลาง)
//
// ทุกฉาก: แก้ตัวกลาง แล้วเอาคีย์เดียวกันออกจากค่าทับของทุกฉาก ไม่งั้นฉากที่เคยตั้งแยกจะไม่ขยับ
// ทั้งที่ผู้ใช้เลือก "ทุกฉาก" (หลักเดียวกับฟอนต์ใน updateFont)
export function applyBackgroundPatch(broadcast: Broadcast, scene: unknown, patch: unknown, reset: boolean): void {
  const target = BACKGROUND_SCENES.find((candidate) => candidate === scene);
  if (target) {
    if (reset) delete broadcast.sceneBackgrounds[target];
    else broadcast.sceneBackgrounds[target] = { ...(broadcast.sceneBackgrounds[target] || {}), ...sanitizePartialBackground(patch) };
    if (broadcast.sceneBackgrounds[target] && Object.keys(broadcast.sceneBackgrounds[target]!).length === 0) delete broadcast.sceneBackgrounds[target];
    return;
  }
  // "All pages" changes the look; whether a page shows it is per page, never global
  const { enabled: _ignored, ...clean } = sanitizePartialBackground(patch);
  broadcast.background = sanitizeBackground({ ...broadcast.background, ...clean });
  BACKGROUND_SCENES.forEach((name) => {
    const own = broadcast.sceneBackgrounds[name];
    if (!own) return;
    (Object.keys(clean) as (keyof Background)[]).forEach((key) => { delete own[key]; });
    if (Object.keys(own).length === 0) delete broadcast.sceneBackgrounds[name];
  });
}

const HEX = /^#[0-9a-f]{6}$/i;

function cleanHex(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}

export function sanitizeColours(value: unknown): BroadcastColours {
  const source = asObject(value);
  const out: BroadcastColours = {};
  COLOUR_SCENES.forEach((scene) => {
    const own = asObject(source[scene]);
    const kept: Partial<Record<ColourKey, string>> = {};
    COLOUR_KEYS.forEach((key) => {
      const hex = cleanHex(own[key]);
      if (hex) kept[key] = hex;
    });
    if (Object.keys(kept).length > 0) out[scene] = kept;
  });
  return out;
}

// ตั้ง/ล้างสีหนึ่งสีของหน้าหนึ่ง value ที่ไม่ใช่สี hex ที่ใช้ได้ = ล้าง (กลับไปตามธีม) หน้าหรือคีย์ที่ไม่รู้จักไม่ทำอะไร
export function applyColourPatch(broadcast: Broadcast, scene: unknown, key: unknown, value: unknown): boolean {
  const page = COLOUR_SCENES.find((candidate) => candidate === scene);
  const colour = COLOUR_KEYS.find((candidate) => candidate === key);
  if (!page || !colour) return false;
  const own = { ...(broadcast.colours[page] || {}) };
  const hex = cleanHex(value);
  if (hex) own[colour] = hex;
  else delete own[colour];
  if (Object.keys(own).length > 0) broadcast.colours[page] = own;
  else delete broadcast.colours[page];
  return true;
}

export function resetColours(broadcast: Broadcast, scene: unknown): boolean {
  const page = COLOUR_SCENES.find((candidate) => candidate === scene);
  if (!page) return false;
  delete broadcast.colours[page];
  return true;
}

// 24 ชั่วโมง พอสำหรับ "เริ่มพรุ่งนี้เช้า" แต่กันค่าขยะที่ทำให้ overlay นับเลขเป็นปี
export const COUNTDOWN_MAX_SECONDS = 24 * 60 * 60;

export function sanitizeCountdown(value: unknown): Countdown {
  const source = asObject(value);
  const endsAt = Number(source.endsAt);
  return {
    endsAt: source.endsAt !== null && source.endsAt !== undefined && Number.isFinite(endsAt) && endsAt > 0
      ? Math.round(endsAt)
      : null,
    label: sanitizeText(source.label, 40)
  };
}

export function sanitizeLowerThird(value: unknown): LowerThird {
  const source = asObject(value);
  return {
    visible: source.visible === true,
    name: sanitizeText(source.name, 40),
    title: sanitizeText(source.title, 40),
    handle: sanitizeText(source.handle, 40)
  };
}

// รายการแถบชื่อ ไฟล์ state รุ่นก่อนมีแถบเดียวที่ key lowerThird จึงยกมาเป็นแถบแรก
// (ไม่งั้นแถบที่ผู้ใช้ตั้งไว้หายตอนอัปเดต) อย่างน้อยหนึ่งแถบ ไม่เกิน LOWER_THIRD_MAX
export function sanitizeLowerThirds(list: unknown, legacy?: unknown): LowerThird[] {
  const source = Array.isArray(list) ? list : (legacy !== undefined ? [legacy] : []);
  const cards = source.slice(0, LOWER_THIRD_MAX).map(sanitizeLowerThird);
  return cards.length > 0 ? cards : [emptyLowerThird()];
}

// ดัชนีที่ใช้ได้จริงหรือ null (ค่าที่ไม่ใช่จำนวนเต็มในช่วงไม่ถูกเดาเป็น 0 ไม่งั้นแก้ผิดแถบ)
export function cardIndex(value: unknown, length: number): number | null {
  if (value === undefined) return 0;
  // Number(null), Number('') และ Number(false) เป็น 0 ทั้งหมด ซึ่งจะไปแก้แถบแรกโดยไม่มีใครสั่ง
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < length ? n : null;
}

export function sanitizeSceneText(value: unknown): SceneText {
  const source = asObject(value);
  return {
    startingTitle: sanitizeText(source.startingTitle, 40),
    brbTitle: sanitizeText(source.brbTitle, 40),
    brbSubtitle: sanitizeText(source.brbSubtitle, 60),
    endingTitle: sanitizeText(source.endingTitle, 40),
    endingSubtitle: sanitizeText(source.endingSubtitle, 60)
  };
}

export function sanitizeBroadcast(value: unknown): Broadcast {
  const source = asObject(value);
  return {
    background: sanitizeBackground(source.background),
    sceneBackgrounds: sanitizeSceneBackgrounds(source.sceneBackgrounds),
    colours: sanitizeColours(source.colours),
    countdown: sanitizeCountdown(source.countdown),
    lowerThirds: sanitizeLowerThirds(source.lowerThirds, source.lowerThird),
    text: sanitizeSceneText(source.text)
  };
}

// นับถอยหลังกี่วินาทีจากตอนนี้ ค่านอกช่วงถูกบีบเข้าช่วง คืน null ถ้าไม่ใช่ตัวเลข
export function countdownEndsAt(seconds: unknown, now: number): number | null {
  const n = Number(seconds);
  if (seconds === null || seconds === undefined || seconds === '' || !Number.isFinite(n)) return null;
  return now + Math.round(Math.min(COUNTDOWN_MAX_SECONDS, Math.max(1, n))) * 1000;
}
