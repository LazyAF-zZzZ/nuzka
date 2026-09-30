// การตั้งค่าเครื่องมือ: ธีม, คีย์ลัด, ขนาดจอ
//
// ต่างจากข้อมูลแมตช์ตรงที่ "ไม่หาย" เวลาเปิดแมตช์ใหม่ขึ้นจอหรือกด RESET MATCH
// ดูที่ CARRIED_OVER_KEYS ท้ายไฟล์

import { deepClone } from '../lib/json';

// เลือกครั้งเดียว มีผลกับทุกหน้าจอ overlay และ result
export const OVERLAY_SIZES = ['1080', '1440'] as const;
export type OverlaySize = typeof OVERLAY_SIZES[number];

// เขียนเป็นค่าคงที่ตรงนี้ ไม่อ้าง defaultState เพราะ match.ts เรียกใช้ไฟล์นี้
// ถ้าอ้างกลับไปจะกลายเป็น import วนกัน
export const DEFAULT_OVERLAY_SIZE: OverlaySize = '1080';

export type ThemeColorKey = 'blue' | 'red' | 'accent' | 'text' | 'label' | 'teamCard' | 'teamCardBg';
export type ThemeNumberKey =
  | 'typeCaption' | 'typePlayer' | 'typeTournament' | 'typeTitle'
  | 'typeScore' | 'typeTimer' | 'logoSize' | 'logoInset' | 'teamCardRadius';

export type Theme = Record<ThemeColorKey, string> & Record<ThemeNumberKey, number>;

export interface HotkeyBinding {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export type HotkeyAction = 'toggleBanner' | 'pauseResume' | 'prevPhase' | 'nextPhase' | 'undo';
export type Hotkeys = Record<HotkeyAction, HotkeyBinding>;

// ธีมของ overlay ทุกค่าตรงกับ CSS custom property ใน overlay.css
// ค่า default ต้องตรงกับ :root ในไฟล์นั้นเป๊ะๆ ไม่งั้นกด Reset แล้วหน้าตาเปลี่ยน
export const THEME_DEFAULTS: Theme = {
  blue: '#38bdf8',
  red: '#f87171',
  accent: '#f59e0b',
  text: '#ffffff',
  label: '#c0c0c0',
  // เส้นขอบซ้ายกับป้ายตัวย่อของการ์ดในหน้ารายชื่อทีม (ผู้ใช้ขอ 2026-09-29)
  // ค่าเดิมที่เคยฝังไว้ใน overlay-teams.css ใครไม่เคยแตะก็จะได้สีเดิมเป๊ะ
  teamCard: '#3b82f6',
  // พื้นการ์ดในหน้ารายชื่อทีม ค่าเดิมคือหยุดแรกของเกรเดียนต์ที่เคยฝังไว้ใน overlay-teams.css
  // ความโปร่งใสไม่ได้ตั้งค่าได้ ฟุตเทจข้างหลังจึงยังทะลุขึ้นมาเหมือนเดิมเสมอ
  teamCardBg: '#111220',
  typeCaption: 14,
  typePlayer: 22,
  typeTournament: 18,
  typeTitle: 24,
  typeScore: 42,
  typeTimer: 40,
  logoSize: 138,
  logoInset: 10,
  teamCardRadius: 12
};

// ช่วงที่ยอมให้ปรับ กว้างพอให้เล่นได้ แต่ไม่ถึงขั้นทำ layout พัง
export const THEME_NUMBER_RANGE: Record<ThemeNumberKey, [number, number]> = {
  typeCaption: [8, 40],
  typePlayer: [10, 48],
  typeTournament: [10, 48],
  typeTitle: [10, 60],
  typeScore: [12, 96],
  typeTimer: [12, 96],
  logoSize: [40, 260],
  logoInset: [-40, 200],
  // มุมโค้งของการ์ดในหน้ารายชื่อทีม 0 = มุมฉาก (ผู้ใช้ขอ 2026-09-29)
  teamCardRadius: [0, 40]
};

export const THEME_COLOR_KEYS: ThemeColorKey[] = ['blue', 'red', 'accent', 'text', 'label', 'teamCard', 'teamCardBg'];

// คีย์ลัดของหน้า Control Panel ตั้งค่าได้จากหน้า /hotkeys
//
// code = event.code ของปุ่มจริง เช่น 'Space', 'KeyZ', 'ArrowLeft'
// ยกเว้นปุ่ม modifier ล้วน เก็บเป็นชื่อจาก event.key ('Alt', 'Control', ...)
// เพราะจะถูกดักตอน "แตะเดี่ยวๆ" ไม่ใช่ตอนกดค้างเป็นคีย์ผสม
export const HOTKEY_MODIFIER_CODES = ['Alt', 'Control', 'Shift', 'Meta'];

export const HOTKEY_DEFAULTS: Hotkeys = {
  toggleBanner: { code: 'Alt', ctrl: false, shift: false, alt: false, meta: false },
  pauseResume: { code: 'Space', ctrl: false, shift: false, alt: false, meta: false },
  prevPhase: { code: 'ArrowLeft', ctrl: false, shift: false, alt: false, meta: false },
  nextPhase: { code: 'ArrowRight', ctrl: false, shift: false, alt: false, meta: false },
  undo: { code: 'KeyZ', ctrl: true, shift: false, alt: false, meta: false }
};

export function sanitizeOverlaySize(value: unknown): OverlaySize {
  const text = String(value);
  return (OVERLAY_SIZES as readonly string[]).includes(text)
    ? (text as OverlaySize)
    : DEFAULT_OVERLAY_SIZE;
}

// สีต้องเป็น #rrggbb เท่านั้น ค่านี้ถูกเอาไปยัดใส่ CSS custom property
// ตรงๆ ปล่อยให้กรอกอะไรก็ได้เท่ากับเปิดช่องให้แทรก CSS
export function sanitizeThemeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

// ทีมสูงสุดต่อชุดของหน้า /overlay-teams (ผู้ใช้ขอช่องตั้งค่าในแอพ 2026-09-28)
// ?perSet= ใน URL ยังชนะค่านี้ ใครใส่ไว้ใน OBS แล้วจะไม่เปลี่ยนเอง
export const TEAM_LIST_PER_SET_DEFAULT = 32;
export const TEAM_LIST_PER_SET_RANGE: [number, number] = [4, 64];

export function sanitizeTeamListPerSet(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return TEAM_LIST_PER_SET_DEFAULT;
  const [min, max] = TEAM_LIST_PER_SET_RANGE;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// สไตล์ของหน้า /overlay-teams (ผู้ใช้ขอ 2026-09-29)
//   sets   = แบ่งเป็นชุดละ teamListPerSet แล้วสลับชุดไปเรื่อยๆ (แบบเดิม)
//   scroll = ทุกทีมอยู่ในรายการเดียว เลื่อนขึ้นช้าๆ แล้ววนกลับมาเริ่มใหม่
//
// ค่าที่อ่านไม่ออกต้องตกมาที่ 'sets' ซึ่งเป็นพฤติกรรมเดิม ไฟล์ state รุ่นเก่า
// ที่ยังไม่มีคีย์นี้จึงแสดงผลเหมือนก่อนอัปเดตทุกประการ
export type TeamListStyle = 'sets' | 'scroll';
export const TEAM_LIST_STYLE_DEFAULT: TeamListStyle = 'sets';

// ตัวอักษรบนการ์ดสลับเป็นสีเข้มเองเมื่อพื้นการ์ดสว่าง (ผู้ใช้ขอ 2026-09-29)
//
// เปิดไว้เป็นค่าเริ่มต้น: พื้นเริ่มต้นเป็นสีเข้มอยู่แล้ว ตัวช่วยนี้จึงไม่เปลี่ยนอะไรเลย
// จนกว่าจะมีคนเลือกพื้นสว่าง ของเดิมของทุกคนจึงหน้าตาเท่าเดิมเป๊ะ
// ไฟล์ state รุ่นเก่าที่ไม่มีคีย์นี้ก็ได้ true ตามกติกา 'ไม่ได้บอกว่าปิด = เปิด'
// จำนวนคอลัมน์ของหน้ารายชื่อทีม 0 = เลือกเองตามจำนวนทีม (ผู้ใช้ขอให้เลือกหนึ่งคอลัมน์ได้ 2026-09-29)
// ?columns= ใน URL ยังชนะค่านี้
export const TEAM_LIST_COLUMNS_DEFAULT = 0;
export const TEAM_LIST_COLUMNS_RANGE: [number, number] = [0, 6];

export function sanitizeTeamListColumns(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) {
    return TEAM_LIST_COLUMNS_DEFAULT;
  }
  const [min, max] = TEAM_LIST_COLUMNS_RANGE;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ฟอนต์ของกราฟิกออกอากาศ (ผู้ใช้ขอ 2026-09-29)
//
// เลือกตาม "บทบาทของข้อความ" ไม่ใช่ทีละชิ้น: หัวเรื่อง ชื่อ ตัวเลข และตัวเนื้อความ
// ตั้งทีเดียวทุกหน้าที่ all แล้วหน้าไหนอยากต่างค่อยทับเฉพาะหน้านั้นที่ pages[scene]
// ค่าว่าง = ใช้ของเดิมของหน้านั้น ซึ่งคือ Kanit ที่แถมมากับตัวแอพ
//
// ชื่อฉากคือ data-layout-scene ของแต่ละหน้า ตัวเดียวกับที่ตัวแก้ layout ใช้อยู่แล้ว
// (/overlay กับ /overlay-1440 เป็นฉาก 'draft' ด้วยกัน ตั้งทีเดียวได้ทั้งคู่)
export type FontRole = 'heading' | 'name' | 'number' | 'body';
export const FONT_ROLES: FontRole[] = ['heading', 'name', 'number', 'body'];

export const FONT_SCENES = [
  'draft', 'teams', 'standings', 'result', 'analytics',
  'matchup', 'prev', 'team-card', 'team-drafts'
] as const;

export type FontChoices = Record<FontRole, string>;

export interface Fonts {
  all: FontChoices;
  pages: Record<string, Partial<FontChoices>>;
}

// ชื่อฟอนต์ถูกยัดลงใน CSS custom property ของกราฟิกที่กำลังออกอากาศ
//
// เหลือไว้แค่ตัวอักษร ตัวเลข ช่องว่าง ขีด และขีดล่าง ซึ่งครอบคลุมชื่อฟอนต์จริงเกือบทั้งหมด
// ชื่อที่มี ; หรือ } หรือเครื่องหมายคำพูดจะพาโค้ด CSS แปลกปลอมเข้าไปในหน้าได้
// ไฟล์สำรองที่มาจากเครื่องอื่นก็ผ่านทางนี้ จึงกรองที่นี่ ไม่ใช่ที่หน้าเว็บ
export function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^A-Za-z0-9 \-_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

// เอา family นี้ออกจากทุกบทบาท ทั้งทุกหน้าและเฉพาะหน้า ใช้ตอนลบฟอนต์ที่นำเข้า
// คืน true ถ้ามีอะไรเปลี่ยน ผู้เรียกจะได้ไม่ส่ง state ซ้ำเมื่อไม่มีใครใช้ฟอนต์นั้นอยู่
export function dropFontFamily(fonts: Fonts, family: string): boolean {
  let changed = false;
  FONT_ROLES.forEach((role) => {
    if (fonts.all[role] === family) {
      fonts.all[role] = '';
      changed = true;
    }
  });
  Object.keys(fonts.pages).forEach((scene) => {
    const page = fonts.pages[scene]!;
    FONT_ROLES.forEach((role) => {
      if (page[role] === family) {
        delete page[role];
        changed = true;
      }
    });
    if (Object.keys(page).length === 0) delete fonts.pages[scene];
  });
  return changed;
}

export function emptyFonts(): Fonts {
  const all = {} as FontChoices;
  FONT_ROLES.forEach((role) => { all[role] = ''; });
  return { all, pages: {} };
}

export function sanitizeFonts(value: unknown): Fonts {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const fonts = emptyFonts();

  const all = (source.all && typeof source.all === 'object' ? source.all : {}) as Record<string, unknown>;
  FONT_ROLES.forEach((role) => { fonts.all[role] = sanitizeFontFamily(all[role]); });

  // ฉากที่ไม่รู้จักถูกทิ้ง ไม่งั้นไฟล์สำรองจะพาคีย์ขยะมาสะสมใน state ได้เรื่อยๆ
  const pages = (source.pages && typeof source.pages === 'object' ? source.pages : {}) as Record<string, unknown>;
  FONT_SCENES.forEach((scene) => {
    const raw = pages[scene];
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: Partial<FontChoices> = {};
    FONT_ROLES.forEach((role) => {
      const family = sanitizeFontFamily(entry[role]);
      if (family) out[role] = family;
    });
    if (Object.keys(out).length > 0) fonts.pages[scene] = out;
  });

  return fonts;
}

// แสดงแท็กทีมบน overlay ดราฟต์ เป็นชิ้นแยกจากชื่อ ผู้ใช้ขอ 2026-09-30 ให้เป็นตัวเลือก ปิดไว้ก่อน
// ทีมที่ไม่มีแท็กไม่ขึ้นอะไร (overlay.js ซ่อนชิ้นนั้นไว้)
export function sanitizeDraftShowTag(value: unknown): boolean {
  return value === true;
}

// พื้นผิวของแต่ละหน้า (ตัวภาพอยู่ใน SKIN_SLOTS ชื่อ texture<Scene>) ค่าที่นี่คือวิธีปูทับ
// ความจาง 0..1, ขนาดเป็นร้อยละของขนาดจริงของภาพ, ปูซ้ำหรือยืดเต็ม, และโหมดผสมกับพื้นเดิม
export const TEXTURE_SCENES = [
  'draft', 'result', 'teams', 'standings', 'analytics', 'matchup', 'team-drafts', 'team-card', 'prev'
] as const;
export type TextureScene = typeof TEXTURE_SCENES[number];
export const TEXTURE_BLENDS = ['normal', 'overlay', 'soft-light', 'screen', 'multiply'] as const;
export type TextureBlend = typeof TEXTURE_BLENDS[number];
export interface TextureSettings {
  opacity: number;
  scale: number;
  fit: 'tile' | 'fill';
  blend: TextureBlend;
}
export const TEXTURE_DEFAULT: TextureSettings = { opacity: 0.35, scale: 100, fit: 'tile', blend: 'normal' };

export function sanitizeTextureSettings(value: unknown): TextureSettings {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const opacity = Number(source.opacity);
  const scale = Number(source.scale);
  return {
    opacity: source.opacity !== undefined && source.opacity !== null && Number.isFinite(opacity)
      ? Math.round(Math.min(1, Math.max(0, opacity)) * 100) / 100 : TEXTURE_DEFAULT.opacity,
    scale: source.scale !== undefined && source.scale !== null && Number.isFinite(scale)
      ? Math.round(Math.min(400, Math.max(10, scale))) : TEXTURE_DEFAULT.scale,
    fit: source.fit === 'fill' ? 'fill' : 'tile',
    blend: (TEXTURE_BLENDS as readonly unknown[]).includes(source.blend) ? source.blend as TextureBlend : TEXTURE_DEFAULT.blend
  };
}

// เก็บเฉพาะหน้าที่เคยตั้งค่า หน้าที่ไม่มีคีย์ใช้ TEXTURE_DEFAULT
export function sanitizeTextures(value: unknown): Partial<Record<TextureScene, TextureSettings>> {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: Partial<Record<TextureScene, TextureSettings>> = {};
  TEXTURE_SCENES.forEach((scene) => {
    if (source[scene] && typeof source[scene] === 'object') out[scene] = sanitizeTextureSettings(source[scene]);
  });
  return out;
}

export const TEAM_LIST_AUTO_TEXT_DEFAULT = true;

export function sanitizeTeamListAutoText(value: unknown): boolean {
  return value !== false;
}

export function sanitizeTeamListStyle(value: unknown): TeamListStyle {
  return value === 'scroll' ? 'scroll' : TEAM_LIST_STYLE_DEFAULT;
}

// ความเร็วของสไตล์ scroll เป็นพิกเซลต่อวินาทีบนผืน 1920x1080
//
// 40px/s = การ์ดสูง ~180px ใช้เวลาราวสี่วินาทีครึ่งต่อแถว ซึ่งพออ่านชื่อทีมทัน
// โหมด 1440 ขยายทั้งเวทีด้วย 4/3 อยู่แล้ว ความเร็วที่เห็นจริงจึงโตตามเอง
export const TEAM_LIST_SCROLL_SPEED_DEFAULT = 40;
export const TEAM_LIST_SCROLL_SPEED_RANGE: [number, number] = [10, 200];

export function sanitizeTeamListScrollSpeed(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    return TEAM_LIST_SCROLL_SPEED_DEFAULT;
  }
  const [min, max] = TEAM_LIST_SCROLL_SPEED_RANGE;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeTheme(value: unknown): Theme {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const theme = {} as Theme;

  THEME_COLOR_KEYS.forEach((key) => {
    theme[key] = sanitizeThemeColor(source[key], THEME_DEFAULTS[key]);
  });

  (Object.entries(THEME_NUMBER_RANGE) as [ThemeNumberKey, [number, number]][])
    .forEach(([key, [min, max]]) => {
      const n = Number(source[key]);
      theme[key] = Number.isFinite(n)
        ? Math.min(max, Math.max(min, Math.round(n)))
        : THEME_DEFAULTS[key];
    });

  return theme;
}

// code มาจากผู้ใช้กดปุ่มอะไรก็ได้ จำกัดรูปแบบไว้ให้เป็นชื่อ code ของ DOM
// เท่านั้น ค่านี้ถูกเอาไปเทียบกับ event.code ตรงๆ ไม่ได้เอาไปต่อเป็น HTML
export function sanitizeHotkeyBinding(value: unknown, fallback: HotkeyBinding): HotkeyBinding {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const code = typeof source.code === 'string' ? source.code.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(code)) return { ...fallback };
  return {
    code,
    ctrl: source.ctrl === true,
    shift: source.shift === true,
    alt: source.alt === true,
    meta: source.meta === true
  };
}

export function sanitizeHotkeys(value: unknown): Hotkeys {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const hotkeys = {} as Hotkeys;
  (Object.entries(HOTKEY_DEFAULTS) as [HotkeyAction, HotkeyBinding][])
    .forEach(([action, fallback]) => {
      hotkeys[action] = sanitizeHotkeyBinding(source[action], fallback);
    });
  return hotkeys;
}

// ระดับเสียงของเอฟเฟกต์แต่ละเหตุการณ์ 0 ถึง 1
//
// เก็บใน state ไม่ใช่ใน URL ตั้งใจ: ปรับแล้วต้องมีผลกับ overlay ที่เปิดค้างอยู่
// ใน OBS ทันที โดยไม่ต้องไปแก้ URL ของ browser source แล้ว Refresh ใหม่
// ซึ่งกลางรายการทำไม่ได้ ค่าเดินทางไปกับ stateUpdate เหมือนธีมกับคีย์ลัด
export const SFX_KEYS = ['pick', 'ban', 'timer'] as const;
export type SfxKey = typeof SFX_KEYS[number];
export type SfxLevels = Record<SfxKey, number>;

// เริ่มที่ดังเต็ม ให้ไปหรี่เอาเองถ้าดังไป
// เงียบโดยไม่รู้ตัวหาสาเหตุยากกว่าดังเกินไปมาก (บทเรียนจากบั๊ก vol=0)
export const SFX_DEFAULTS: SfxLevels = { pick: 1, ban: 1, timer: 1 };

export function sanitizeSfx(value: unknown): SfxLevels {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const levels = {} as SfxLevels;
  SFX_KEYS.forEach((key) => {
    const n = Number(source[key]);
    // ค่าที่ใช้ไม่ได้ให้ถอยไปที่ค่าเริ่มต้น ไม่ใช่ 0
    // Number(undefined) เป็น NaN ตรงนี้จึงปลอดภัย ต่างจาก Number(null) ที่เป็น 0
    levels[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : SFX_DEFAULTS[key];
  });
  return levels;
}

// ค่าที่เป็น "การตั้งค่าเครื่องมือ" ไม่ใช่ข้อมูลของแมตช์
//
// โหลดพรีเซ็ตหรือกด RESET MATCH คือการเปลี่ยน "แมตช์" ไม่ใช่การล้างค่าที่
// ตั้งไว้ ธีมที่ปรับทั้งวัน คีย์ลัดที่ผูกไว้ ภาพพื้นหลังที่อัปโหลด และขนาดจอ
// ต้องอยู่เหมือนเดิม ไม่งั้นโหลดพรีเซ็ตกลางอากาศทีเดียวหน้าตาเปลี่ยนหมด
//
// ตอนทำโหมดทัวร์นาเมนต์ การกดเลือกแมตช์ก็คือการเปลี่ยนแมตช์เหมือนกัน
// ให้ใช้ทางนี้ อย่าเขียนทับ state ทั้งก้อน
export const CARRIED_OVER_KEYS = [
  'overlayVisible', 'overlaySize', 'theme', 'hotkeys', 'skin', 'sfx', 'globalHotkeys', 'swapSidesEachRound', 'layout', 'teamListPerSet',
  'teamListStyle', 'teamListScrollSpeed', 'teamListAutoText', 'teamListColumns', 'fonts',
  'draftShowTag', 'textures'
] as const;

export type CarriedOverKey = typeof CARRIED_OVER_KEYS[number];

// T extends object ไม่ใช่ Record<string, unknown>
// เพราะ interface อย่าง GameState ไม่มี index signature จึงไม่เข้าเงื่อนไขตัวหลัง
export function carryOverSettings<T extends object>(
  nextState: T,
  previous: unknown
): T {
  const source = (previous || {}) as Record<string, unknown>;
  const target = nextState as Record<string, unknown>;
  CARRIED_OVER_KEYS.forEach((key) => {
    if (source[key] !== undefined) target[key] = deepClone(source[key]);
  });
  return nextState;
}

// คีย์ลัดระดับระบบ ทำงานตอนโฟกัสไม่ได้อยู่ที่แอพนี้
//
// คนละเรื่องกับ hotkeys ด้านบน ตัวนั้นหน้า Control ดักเอง ใช้ได้เฉพาะตอนหน้าต่างนั้นถูกโฟกัส
// ซึ่งไม่ใช่สถานการณ์จริงของคนแคสต์: มือหนึ่งอยู่ที่ OBS อีกมืออยู่ที่เกม
// ตัวนี้ Electron ไปจองปุ่มกับระบบปฏิบัติการ (globalShortcut) จึงกดจากที่ไหนก็ได้
//
// การจองแบบนั้นคือการแย่งปุ่มมาจากทุกโปรแกรมในเครื่อง จึงมีกฎบังคับสองข้อ
// 1. สมัย v2 ปิดไว้เป็นค่าเริ่มต้น ตั้งแต่ 3.1.0 เปิดเป็นค่าเริ่มต้นตามที่ผู้ใช้ขอ (ชื่อบนหน้าแอพคือ "คีย์ลัด")
//    ทุกปุ่มจึงต้องอยู่ในบล็อก Ctrl+Alt และปุ่มที่โปรแกรมอื่นจองอยู่ต้องขึ้นสีแดงบนหน้า Hotkeys
// 2. ต้องมี modifier อย่างน้อยหนึ่งตัวเสมอ จอง Space เดี่ยวๆ ไว้ทั้งระบบ
//    แปลว่าทั้งเครื่องพิมพ์เว้นวรรคไม่ได้จนกว่าจะปิดแอพ ซึ่งคนกดจะไม่มีทางเดาถูกว่าเพราะอะไร
//
// ชุดคะแนนกับรอบ (+1 / -1 แต่ละฝั่ง, รอบก่อนหน้า / ถัดไป) เพิ่มใน 3.1.0 ตามที่ผู้ใช้ขอ:
// จังหวะที่ต้องกดมากที่สุดคือตอนเกมจบ ซึ่งคนคุมงานกำลังอยู่ที่ OBS ไม่ใช่ที่หน้าต่างแอพ
// "น้ำเงิน / แดง" คือฝั่งบนจอ ณ ตอนกด เหมือนปุ่มข้างคะแนน ไม่ใช่ทีม A / B
// เพราะคนกดดูจากในเกมว่าฝั่งไหนชนะ และทีมสลับฝั่งกันทุกเกม
export const GLOBAL_HOTKEY_ACTIONS = [
  'toggleBanner', 'pauseResume', 'prevPhase', 'nextPhase', 'undo',
  'bluePlus', 'redPlus', 'blueMinus', 'redMinus', 'prevRound', 'nextRound'
] as const;

export type GlobalHotkeyAction = typeof GLOBAL_HOTKEY_ACTIONS[number];
export type GlobalHotkeyBindings = Record<GlobalHotkeyAction, HotkeyBinding>;

export interface GlobalHotkeys {
  enabled: boolean;
  // ชุดปุ่มเริ่มต้นที่ค่านี้ถูกบันทึกไว้ ใช้ย้ายปุ่มที่ยังเป็นค่าเริ่มต้นเก่าไปชุดใหม่ครั้งเดียว
  // ต้องเก็บไว้ ไม่งั้นคนที่ตั้ง Ctrl+Alt+H กลับมาเองทีหลังจะโดนย้ายซ้ำทุกครั้งที่ state ถูก sanitize
  layout: number;
  bindings: GlobalHotkeyBindings;
}

// ชุดที่ 2 (3.1.0): ทุกปุ่มเป็นบล็อกเดียวใต้มือซ้ายที่กด Ctrl+Alt ค้างไว้
// ชุดที่ 1 มี H, Space และลูกศรซ้ายขวา ซึ่งต้องใช้สองมือ และ Ctrl+Alt+Space ถูกโปรแกรมอื่นจองบนเครื่องจริง
export const GLOBAL_HOTKEY_LAYOUT = 2;

const LAYOUT_1_BINDINGS: Partial<Record<GlobalHotkeyAction, HotkeyBinding>> = {
  toggleBanner: { code: 'KeyH', ctrl: true, shift: false, alt: true, meta: false },
  pauseResume: { code: 'Space', ctrl: true, shift: false, alt: true, meta: false },
  prevPhase: { code: 'ArrowLeft', ctrl: true, shift: false, alt: true, meta: false },
  nextPhase: { code: 'ArrowRight', ctrl: true, shift: false, alt: true, meta: false }
};

function sameBinding(a: HotkeyBinding, b: HotkeyBinding | undefined): boolean {
  return !!b && a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;
}

// Ctrl+Alt เป็นฐาน เพราะแทบไม่มีโปรแกรมไหนใช้ และ OBS เองก็ไม่ได้จองไว้
// ทุกปุ่มอยู่ใต้มือซ้ายที่กด Ctrl+Alt ค้างไว้ มือขวาอยู่ที่เมาส์ใน OBS ต่อได้
//
//   1 2        +1 น้ำเงิน / แดง
//   Q W  E R   -1 น้ำเงิน / แดง     เฟสดราฟต์ก่อน / ถัดไป
//   A S  D F   รอบก่อน / ถัดไป      พัก-เดินนาฬิกา / ซ่อน-แสดงแบนเนอร์
//   Z          ย้อนพิคหรือแบน
//
// ซ้ายคือน้ำเงิน ขวาคือแดง เหมือนบนจอ และซ้ายคือถอยหลัง ขวาคือเดินหน้า
// ชุดคะแนนแรก (Shift+เลข และ PageUp / PageDown) ผู้ใช้บอกว่าปุ่มห่างกันเกินไป ต้องใช้สองมือ
// แล้วขอให้ปุ่มระดับระบบทุกปุ่มเป็นแบบเดียวกัน ปุ่มใหม่ต้องอยู่ในบล็อกนี้
export const GLOBAL_HOTKEY_DEFAULTS: GlobalHotkeys = {
  // เปิดเป็นค่าเริ่มต้นตั้งแต่ 3.1.0 ตามที่ผู้ใช้ขอ: นี่คือ "คีย์ลัด" หลักของแอพแล้ว ไม่ใช่ของเสริม
  enabled: true,
  layout: GLOBAL_HOTKEY_LAYOUT,
  bindings: {
    toggleBanner: { code: 'KeyF', ctrl: true, shift: false, alt: true, meta: false },
    pauseResume: { code: 'KeyD', ctrl: true, shift: false, alt: true, meta: false },
    prevPhase: { code: 'KeyE', ctrl: true, shift: false, alt: true, meta: false },
    nextPhase: { code: 'KeyR', ctrl: true, shift: false, alt: true, meta: false },
    undo: { code: 'KeyZ', ctrl: true, shift: false, alt: true, meta: false },
    bluePlus: { code: 'Digit1', ctrl: true, shift: false, alt: true, meta: false },
    redPlus: { code: 'Digit2', ctrl: true, shift: false, alt: true, meta: false },
    blueMinus: { code: 'KeyQ', ctrl: true, shift: false, alt: true, meta: false },
    redMinus: { code: 'KeyW', ctrl: true, shift: false, alt: true, meta: false },
    prevRound: { code: 'KeyA', ctrl: true, shift: false, alt: true, meta: false },
    nextRound: { code: 'KeyS', ctrl: true, shift: false, alt: true, meta: false }
  }
};

// DOM code -> ชื่อปุ่มในรูปแบบ accelerator ของ Electron
//
// ตารางนี้เป็นทั้งตัวแปลงและตัวจำกัด ปุ่มที่ไม่อยู่ในตารางแปลว่าจองไม่ได้
// อยู่ที่นี่ที่เดียวเพราะทั้งเซิร์ฟเวอร์ (ตอนตรวจค่าที่รับมา) และ electron-main.js
// (ตอนจองจริง) ต้องเห็นรายการเดียวกัน ถ้าแยกกันเขียน วันหนึ่งจะมีปุ่มที่ผ่านการตรวจ
// แล้วไปพังเงียบๆ ตอนจอง ซึ่งคนตั้งค่าจะเห็นแค่ "กดแล้วไม่มีอะไรเกิดขึ้น"
const ACCELERATOR_KEYS: Record<string, string> = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
  Escape: 'Escape', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\',
  Comma: ',', Period: '.', Slash: '/'
};

for (let i = 0; i < 26; i += 1) {
  const letter = String.fromCharCode(65 + i);
  ACCELERATOR_KEYS[`Key${letter}`] = letter;
}
for (let i = 0; i <= 9; i += 1) {
  ACCELERATOR_KEYS[`Digit${i}`] = String(i);
  ACCELERATOR_KEYS[`Numpad${i}`] = `num${i}`;
}
for (let i = 1; i <= 24; i += 1) {
  ACCELERATOR_KEYS[`F${i}`] = `F${i}`;
}

// คืน null = ปุ่มนี้เอาไปจองทั้งระบบไม่ได้ ไม่ใช่ข้อผิดพลาด แค่ใช้ไม่ได้กับงานนี้
// ทั้งหน้าเว็บและตัวจองต้องเช็คค่า null นี้ก่อนเสมอ
export function toAccelerator(binding: HotkeyBinding | null | undefined): string | null {
  if (!binding) return null;
  const key = ACCELERATOR_KEYS[binding.code];
  if (!key) return null;

  const parts: string[] = [];
  if (binding.ctrl) parts.push('Control');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Super');
  // ไม่มี modifier = จองปุ่มเปล่าทั้งระบบ ห้ามเด็ดขาด ดูเหตุผลด้านบน
  if (parts.length === 0) return null;

  parts.push(key);
  return parts.join('+');
}

export function sanitizeGlobalHotkeys(value: unknown): GlobalHotkeys {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawBindings = (source.bindings && typeof source.bindings === 'object'
    ? source.bindings
    : {}) as Record<string, unknown>;

  // บันทึกมาจากชุดเก่า: ปุ่มที่ยังเป็นค่าเริ่มต้นของชุดเก่าย้ายไปชุดใหม่ ปุ่มที่คนตั้งเองไม่แตะ
  // ทำครั้งเดียว เพราะผลลัพธ์ถูกประทับ layout ใหม่ไว้
  const fromOldLayout = source.layout !== GLOBAL_HOTKEY_LAYOUT;

  const bindings = {} as GlobalHotkeyBindings;
  GLOBAL_HOTKEY_ACTIONS.forEach((action) => {
    const fallback = GLOBAL_HOTKEY_DEFAULTS.bindings[action];
    const binding = sanitizeHotkeyBinding(rawBindings[action], fallback);
    if (fromOldLayout && sameBinding(binding, LAYOUT_1_BINDINGS[action])) {
      bindings[action] = { ...fallback };
      return;
    }
    // ผ่านรูปแบบ code แล้วยังไม่พอ ต้องจองได้จริงด้วย ไม่งั้นเก็บค่าที่ใช้ไม่ได้ไว้เฉยๆ
    bindings[action] = toAccelerator(binding) ? binding : { ...fallback };
  });

  // มาจากก่อน 3.1.0 (หรือไฟล์เสีย): เปิดให้ เพราะตอนนั้นค่าเริ่มต้นคือปิด และแยกไม่ออกว่าใครปิดเอง
  // หลังประทับ layout แล้ว ปิดเองคือปิด ค่าที่ไม่ใช่ true ไม่นับเป็นเปิด
  const enabled = fromOldLayout ? true : source.enabled === true;
  return { enabled, layout: GLOBAL_HOTKEY_LAYOUT, bindings };
}

