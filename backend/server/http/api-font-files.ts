// API ฟอนต์ที่นำเข้า: นำเข้า ดูรายการ ลบ และส่งไฟล์ให้ overlay (domain/font-files.ts)
//
// อัปโหลดเป็นไฟล์ดิบเหมือนภาพ ชื่อที่แสดงมาทาง ?name= ชนิดไฟล์ตัดสินจาก magic bytes
// ไม่สน content-type: ไฟล์ฟอนต์มักถูกส่งมาเป็น application/octet-stream อยู่แล้ว

import path from 'path';
import express, { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { FONT_MAX_BYTES, FONT_MIME, fontExtOf, importedFamily, isFontId } from '../domain/font-files';
import type { FontExt } from '../domain/font-files';
import { dropFontFamily } from '../domain/settings';
import { listFonts, addFont, removeFont, findFont, FONT_DIR } from '../store/font-files';
import { getState, emitState } from '../store/live-state';
import { requireControl } from './auth';

const noSniff = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

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
    const thai = req.query.thai === '1' ? true : req.query.thai === '0' ? false : null;
    const result = addFont(req.query.name, ext, body, thai);
    if (result.error !== undefined) {
      res.status(409).json({ error: result.error });
      return;
    }
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
    res.json({ ok: true });
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
