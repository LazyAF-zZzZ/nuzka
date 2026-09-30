// อ่านชื่อฟอนต์และดูว่ามีอักษรไทยไหม จากตัวไฟล์ TTF/OTF เอง
//
// เดิมแอพ WPF อ่านสองอย่างนี้ก่อนอัปโหลด (GlyphTypeface) พอย้ายการนำเข้าฟอนต์ไปอยู่ในตัวแก้
// หน้า overlay บนเบราว์เซอร์ (2026-09-30) เบราว์เซอร์อ่านตารางในไฟล์ฟอนต์ไม่ได้ จึงมาอ่านที่นี่
//
// อ่านอย่างเดียว ไม่เชื่ออะไรในไฟล์: ทุก offset ถูกเช็คว่าอยู่ในขอบเขตก่อนอ่าน ไฟล์เสียคืน null
// WOFF/WOFF2 บีบอัดตารางไว้ ไม่อ่าน (คืน null) ใช้ชื่อไฟล์แทนตามเดิม

interface Table { offset: number; length: number; }

function tables(buf: Buffer): Map<string, Table> | null {
  if (buf.length < 12) return null;
  const count = buf.readUInt16BE(4);
  if (count === 0 || 12 + count * 16 > buf.length) return null;
  const out = new Map<string, Table>();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = buf.toString('latin1', at, at + 4);
    const offset = buf.readUInt32BE(at + 8);
    const length = buf.readUInt32BE(at + 12);
    if (offset + length <= buf.length) out.set(tag, { offset, length });
  }
  return out;
}

// ชื่อ family (nameID 16 ถ้ามี ไม่งั้น 1) กับชื่อ subfamily (17/2) เช่น "Kanit" + "Bold"
// เลือกบันทึกภาษาอังกฤษของ Windows ก่อน (platform 3, language 0x409) แล้วค่อยตัวอื่น
export function fontName(buf: Buffer): string | null {
  const t = tables(buf)?.get('name');
  if (!t || t.length < 6) return null;
  const base = t.offset;
  const count = buf.readUInt16BE(base + 2);
  const strings = base + buf.readUInt16BE(base + 4);
  const found = new Map<number, { text: string; score: number }>();

  for (let i = 0; i < count; i++) {
    const rec = base + 6 + i * 12;
    if (rec + 12 > base + t.length) break;
    const platform = buf.readUInt16BE(rec);
    const language = buf.readUInt16BE(rec + 4);
    const id = buf.readUInt16BE(rec + 6);
    const length = buf.readUInt16BE(rec + 8);
    const offset = strings + buf.readUInt16BE(rec + 10);
    if (![1, 2, 4, 16, 17].includes(id) || offset + length > buf.length) continue;

    let text: string;
    if (platform === 3 || platform === 0) {
      const chars: string[] = [];
      for (let j = 0; j + 1 < length; j += 2) chars.push(String.fromCharCode(buf.readUInt16BE(offset + j)));
      text = chars.join('');
    } else if (platform === 1) {
      text = buf.toString('latin1', offset, offset + length);
    } else {
      continue;
    }
    const score = platform === 3 && language === 0x409 ? 3 : platform === 3 ? 2 : 1;
    const had = found.get(id);
    if (text.trim() && (!had || score > had.score)) found.set(id, { text: text.trim(), score });
  }

  const family = found.get(16)?.text || found.get(1)?.text;
  if (!family) return found.get(4)?.text || null;
  const face = found.get(17)?.text || found.get(2)?.text || '';
  return !face || /^(regular|normal|book|roman)$/i.test(face) ? family : `${family} ${face}`;
}

// มีตัว ก (U+0E01) ในตาราง cmap ไหม: ตอบว่าชื่อทีมภาษาไทยจะขึ้นด้วยฟอนต์นี้เอง หรือตกไปที่ Kanit
// อ่านรูปแบบ 4 (BMP) กับ 12 ซึ่งครอบคลุมฟอนต์เกือบทั้งหมด ตารางแบบอื่น = ไม่รู้ (null)
export function fontHasThai(buf: Buffer, code = 0x0e01): boolean | null {
  const t = tables(buf)?.get('cmap');
  if (!t || t.length < 4) return null;
  const base = t.offset;
  const count = buf.readUInt16BE(base + 2);
  let answered: boolean | null = null;

  for (let i = 0; i < count; i++) {
    const rec = base + 4 + i * 8;
    if (rec + 8 > buf.length) break;
    const sub = base + buf.readUInt32BE(rec + 4);
    if (sub + 4 > buf.length) continue;
    const format = buf.readUInt16BE(sub);

    if (format === 4 && sub + 14 <= buf.length) {
      const segs = buf.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      if (starts + segs * 2 > buf.length) continue;
      for (let s = 0; s < segs; s++) {
        const end = buf.readUInt16BE(ends + s * 2);
        const start = buf.readUInt16BE(starts + s * 2);
        if (code >= start && code <= end) return true;
      }
      answered = false;
    } else if (format === 12 && sub + 16 <= buf.length) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12;
        if (at + 12 > buf.length) break;
        if (code >= buf.readUInt32BE(at) && code <= buf.readUInt32BE(at + 4)) return true;
      }
      answered = false;
    }
  }
  return answered;
}
