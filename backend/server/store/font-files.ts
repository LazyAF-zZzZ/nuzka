// คลังฟอนต์ที่นำเข้า: ไฟล์อยู่ใน <media>/fonts และรายการอยู่ใน fonts.json ในโฟลเดอร์เดียวกัน
//
// รายการเป็นของแสดงในแอพ (ชื่อ ขนาด วันที่) ไฟล์จริงคือของที่ overlay โหลด
// ถ้า fonts.json หาย ไฟล์ที่ยังอยู่กลับมาในรายการโดยใช้ id เป็นชื่อ
// ไม่มีวันที่ไฟล์หายแต่รายการยังอ้างถึง: รายการสร้างจากไฟล์ที่มีอยู่จริงทุกครั้ง

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { USER_MEDIA_DIR } from '../config';
import type { FontExt } from '../domain/font-files';
import { isFontFile, sanitizeFontName, FONT_MAX_COUNT } from '../domain/font-files';

export const FONT_DIR = path.join(USER_MEDIA_DIR, 'fonts');
const INDEX = 'fonts.json';

export interface FontEntry {
  id: string;
  file: string;
  name: string;
  bytes: number;
  added: number;
  // บอกโดยแอพตอนนำเข้า (อ่านตาราง glyph ได้เฉพาะ TTF/OTF) null = ไม่รู้
  thai: boolean | null;
}

function readIndex(): FontEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(FONT_DIR, INDEX), 'utf8')) as unknown;
    return Array.isArray(raw)
      ? raw.filter((f): f is FontEntry => !!f && typeof f === 'object' && isFontFile((f as FontEntry).file))
      : [];
  } catch {
    return [];
  }
}

function writeIndex(fonts: FontEntry[]): void {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  const target = path.join(FONT_DIR, INDEX);
  fs.writeFileSync(target + '.tmp', JSON.stringify(fonts, null, 2));
  fs.renameSync(target + '.tmp', target);
}

export function listFonts(): FontEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(FONT_DIR).filter(isFontFile);
  } catch {
    return [];
  }
  const known = new Map(readIndex().map((f) => [f.file, f]));
  return files.map((file): FontEntry => {
    const entry = known.get(file);
    if (entry) return { ...entry, thai: typeof entry.thai === 'boolean' ? entry.thai : null };
    const stat = fs.statSync(path.join(FONT_DIR, file));
    const id = file.split('.')[0]!;
    return { id, file, name: id, bytes: stat.size, added: stat.mtimeMs, thai: null };
  }).sort((a, b) => a.added - b.added);
}

export function findFont(id: string): FontEntry | undefined {
  return listFonts().find((f) => f.id === id);
}

export type AddResult = { font: FontEntry; error?: undefined } | { error: string; font?: undefined };

export function addFont(name: unknown, ext: FontExt, body: Buffer, thai: boolean | null, now = Date.now()): AddResult {
  const fonts = listFonts();
  if (fonts.length >= FONT_MAX_COUNT) return { error: `At most ${FONT_MAX_COUNT} fonts. Delete one first.` };
  let id: string;
  do {
    id = 'f' + crypto.randomBytes(8).toString('hex').replace(/[^a-z0-9]/g, '').slice(0, 10);
  } while (fonts.some((f) => f.id === id));
  const file = `${id}.${ext}`;
  fs.mkdirSync(FONT_DIR, { recursive: true });
  fs.writeFileSync(path.join(FONT_DIR, file), body);
  const font: FontEntry = { id, file, name: sanitizeFontName(name), bytes: body.length, added: now, thai };
  writeIndex([...fonts, font]);
  return { font };
}

// ฟอนต์ทั้งหมดสำหรับไฟล์สำรอง เรียงตามลำดับที่นำเข้า หยุดใส่เมื่อรวมกันเกิน maxTotal
// ที่ไม่ได้ใส่ถูกนับไว้ให้ผู้เรียกบอกต่อ ไม่หายไปเงียบๆ
export function fontsForBackup(maxTotal: number): { fonts: { id: string; name: string; thai: boolean | null; bytes: string }[]; leftOut: number } {
  const fonts: { id: string; name: string; thai: boolean | null; bytes: string }[] = [];
  let total = 0;
  let leftOut = 0;
  listFonts().forEach((font) => {
    let body: Buffer;
    try {
      body = fs.readFileSync(path.join(FONT_DIR, font.file));
    } catch {
      return;   // หายไประหว่างทาง: ไม่มีอะไรให้สำรอง
    }
    if (total + body.length > maxTotal) {
      leftOut += 1;
      return;
    }
    total += body.length;
    fonts.push({ id: font.id, name: font.name, thai: font.thai, bytes: body.toString('base64') });
  });
  return { fonts, leftOut };
}

// กู้ฟอนต์หนึ่งตัวจากไฟล์สำรอง ใช้ id เดิม ชื่อ family บนหน้าจอ (nzf-<id>) จึงยังชี้ถูกตัว
// ไม่เขียนทับของที่มีอยู่ (กฎเดียวกับการกู้ข้อมูลอื่น) คืน true ถ้าเขียนลงไปจริง
export function restoreFont(id: string, name: string, thai: boolean | null, ext: FontExt, body: Buffer, now = Date.now()): boolean {
  const fonts = listFonts();
  if (fonts.some((f) => f.id === id) || fonts.length >= FONT_MAX_COUNT) return false;
  const file = `${id}.${ext}`;
  if (!isFontFile(file)) return false;
  fs.mkdirSync(FONT_DIR, { recursive: true });
  fs.writeFileSync(path.join(FONT_DIR, file), body);
  writeIndex([...fonts, { id, file, name: sanitizeFontName(name), bytes: body.length, added: now, thai }]);
  return true;
}

// คืนรายการที่ลบไป null = ไม่มีฟอนต์นี้
export function removeFont(id: unknown): FontEntry | null {
  const fonts = listFonts();
  const font = fonts.find((f) => f.id === id);
  if (!font) return null;
  try { fs.unlinkSync(path.join(FONT_DIR, font.file)); } catch { /* หายไปแล้วก็ถือว่าลบแล้ว */ }
  writeIndex(fonts.filter((f) => f !== font));
  return font;
}
