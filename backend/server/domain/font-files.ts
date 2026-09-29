// ไฟล์ฟอนต์ที่ผู้ใช้นำเข้ามาเก็บไว้ในแอพ (ผู้ใช้ขอ 2026-09-29)
//
// การเลือกฟอนต์ให้บทบาทข้อความอยู่ที่ settings.ts (state.fonts) ซึ่งเก็บเป็นชื่อ family
// ฟอนต์ที่นำเข้าเข้าไปอยู่ในระบบเดียวกันด้วยชื่อ family ปลอม "nzf-<id>" ซึ่งผ่าน
// sanitizeFontFamily ได้พอดี overlay-fonts.js เห็นชื่อแบบนี้แล้วสร้าง @font-face ชี้ไปที่
// /user-fonts/<id> เอง ฟอนต์ที่ลงในเครื่องกับฟอนต์ที่นำเข้าจึงใช้กล่องเลือกกล่องเดียวกัน
//
// ชื่อไฟล์สร้างจากเซิร์ฟเวอร์เสมอ ไม่ได้มาจากชื่อที่ผู้ใช้ตั้ง (กฎเดียวกับโลโก้ใน media.ts)
// ชนิดไฟล์ตัดสินจาก magic bytes ไม่ใช่จากนามสกุลหรือ content-type ที่ผู้ส่งบอก

export type FontExt = 'ttf' | 'otf' | 'woff' | 'woff2';

export const FONT_MAX_BYTES = 20 * 1024 * 1024;
export const FONT_MAX_COUNT = 100;

export const FONT_MIME: Record<FontExt, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2'
};

const ID = /^f[a-z0-9]{10}$/;
const FILE = /^f[a-z0-9]{10}\.(ttf|otf|woff|woff2)$/;
const FAMILY = /^nzf-(f[a-z0-9]{10})$/;

export function isFontId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export function isFontFile(value: unknown): value is string {
  return typeof value === 'string' && FILE.test(value);
}

// ชื่อ family ที่ state.fonts เก็บไว้แทนฟอนต์ที่นำเข้าตัวนี้
export function importedFamily(id: string): string {
  return 'nzf-' + id;
}

// ชื่อ family นี้เป็นฟอนต์ที่นำเข้าหรือเปล่า คืน id ถ้าใช่
export function importedIdOf(family: unknown): string | null {
  const match = typeof family === 'string' ? FAMILY.exec(family) : null;
  return match ? match[1]! : null;
}

// TrueType ขึ้นต้นด้วย 00 01 00 00 หรือ 'true', OpenType แบบ CFF ขึ้นต้นด้วย 'OTTO'
// ไฟล์ .otf ที่ข้างในเป็น TrueType จึงได้นามสกุล ttf ซึ่งถูกต้องกว่า
// 'ttcf' (หลายฟอนต์ในไฟล์เดียว) ไม่รับ: เบราว์เซอร์ใช้ใน @font-face ไม่ได้
export function fontExtOf(body: Buffer): FontExt | null {
  if (body.length < 12) return null;
  const tag = body.subarray(0, 4);
  if (tag.equals(Buffer.from([0, 1, 0, 0])) || tag.toString('latin1') === 'true') return 'ttf';
  switch (tag.toString('latin1')) {
    case 'OTTO': return 'otf';
    case 'wOFF': return 'woff';
    case 'wOF2': return 'woff2';
    default: return null;
  }
}

// ชื่อที่แสดงในแอพ: ข้อความสั้นๆ ไม่มีตัวควบคุม ไม่เคยถูกใช้เป็นชื่อไฟล์หรือใส่ใน CSS
export function sanitizeFontName(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  let clean = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    clean += code < 32 || code === 127 ? ' ' : ch;
  }
  return clean.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Font';
}
