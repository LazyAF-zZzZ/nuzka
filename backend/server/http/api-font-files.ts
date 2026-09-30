// API ฟอนต์ที่นำเข้า: นำเข้า ดูรายการ ลบ และส่งไฟล์ให้ overlay (domain/font-files.ts)
//
// อัปโหลดเป็นไฟล์ดิบเหมือนภาพ ชื่อที่แสดงมาทาง ?name= ชนิดไฟล์ตัดสินจาก magic bytes
// ไม่สน content-type: ไฟล์ฟอนต์มักถูกส่งมาเป็น application/octet-stream อยู่แล้ว

import path from 'path';
import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { FONT_MAX_BYTES, FONT_MIME, fontExtOf, importedFamily, isFontId } from '../domain/font-files';
import type { FontExt } from '../domain/font-files';
import { dropFontFamily, sanitizeFontFamily } from '../domain/settings';
import { fontName, fontHasThai } from '../domain/font-info';
import { listFonts, addFont, removeFont, findFont, FONT_DIR } from '../store/font-files';
import { getState, emitState } from '../store/live-state';
import { requireControl } from './auth';
import { notifyData } from '../services/sync';

const noSniff = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

interface SystemFont { family: string; thai: boolean; }
let systemFonts: SystemFont[] = [];

export function fontFileRoutes(): Router {
  const router = express.Router();

  router.get('/api/fonts', (_req, res) => {
    res.json({ fonts: listFonts().map((f) => ({ ...f, family: importedFamily(f.id) })) });
  });

  router.post('/api/fonts', requireControl, express.raw({ type: () => true, limit: FONT_MAX_BYTES }), (req, res) => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Empty upload' });
      return;
    }
    const ext = fontExtOf(body);
    if (!ext) {
      res.status(415).json({ error: 'Not a font file. Use TTF, OTF, WOFF or WOFF2.' });
      return;
    }
    // ชื่อกับอักษรไทยอ่านจากตัวไฟล์ก่อน (TTF/OTF) ตัวแก้บนเบราว์เซอร์ส่งมาได้แค่ชื่อไฟล์
    // ที่ส่งมาทาง query ใช้เมื่ออ่านไม่ได้ เช่น WOFF/WOFF2 ที่ตารางถูกบีบอัดไว้
    const readable = ext === 'ttf' || ext === 'otf';
    const queryThai = req.query.thai === '1' ? true : req.query.thai === '0' ? false : null;
    const name = (readable && fontName(body)) || req.query.name;
    const thai = (readable ? fontHasThai(body) : null) ?? queryThai;
    const result = addFont(name, ext, body, thai);
    if (result.error !== undefined) {
      res.status(409).json({ error: result.error });
      return;
    }
    // ฟอนต์ไปกับไฟล์สำรองด้วย บอกให้สำรองข้อมูลอัตโนมัติรู้ว่ามีของใหม่
    notifyData({ topic: 'fonts' });
    res.json({ ok: true, font: { ...result.font, family: importedFamily(result.font.id) } });
  });

  // ลบแล้วทุกบทบาทที่ใช้ฟอนต์นี้อยู่ ทั้งทุกหน้าและเฉพาะหน้า กลับเป็นค่าเดิม overlay เปลี่ยนตามทันที
  // ไม่ปล่อยให้ชี้ไปที่ไฟล์ที่ไม่มีแล้ว
  router.delete('/api/fonts/:id', requireControl, (req, res) => {
    const font = removeFont(req.params.id);
    if (!font) {
      res.status(404).json({ error: 'Font not found' });
      return;
    }
    if (dropFontFamily(getState().fonts, importedFamily(font.id))) emitState();
    notifyData({ topic: 'fonts' });
    res.json({ ok: true });
  });

  // ฟอนต์ที่ลงไว้ในเครื่อง: เบราว์เซอร์ขอรายชื่อจากระบบไม่ได้ แอพ WPF ส่งมาให้ตอนต่อเซิร์ฟเวอร์
  // เก็บในหน่วยความจำอย่างเดียว เปิดแอพใหม่ก็ส่งมาใหม่ ชื่อผ่าน sanitizeFontFamily แบบเดียวกับ state.fonts
  router.get('/api/system-fonts', (_req, res) => {
    res.json({ fonts: systemFonts });
  });

  router.put('/api/system-fonts', requireControl, express.json({ limit: '1mb' }), (req, res) => {
    const list = Array.isArray(req.body?.fonts) ? req.body.fonts.slice(0, 3000) : [];
    const seen = new Set<string>();
    systemFonts = list.map((f: unknown) => {
      const raw = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
      return { family: sanitizeFontFamily(raw.family), thai: raw.thai === true };
    }).filter((f: SystemFont) => f.family && !f.family.startsWith('nzf-') && !seen.has(f.family) && !!seen.add(f.family));
    res.json({ ok: true, count: systemFonts.length });
  });

  // ไฟล์ตาม id โดยไม่ต้องรู้นามสกุล overlay จึงประกอบ URL ได้จากชื่อ family อย่างเดียว
  // ชื่อไฟล์บนดิสก์มาจากรายการที่เซิร์ฟเวอร์สร้าง ไม่เคยมาจาก URL ตรงๆ
  router.get('/user-fonts/:id', noSniff, (req, res) => {
    const id = req.params.id;
    const font = isFontId(id) ? findFont(id) : undefined;
    if (!font) {
      res.status(404).end();
      return;
    }
    const ext = font.file.split('.')[1] as FontExt;
    res.type(FONT_MIME[ext]);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(FONT_DIR, font.file));
  });

  return router;
}
