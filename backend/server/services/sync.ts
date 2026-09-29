// สัญญาณบอกว่าข้อมูลเปลี่ยน สำหรับให้หน้าที่เปิดค้างไว้อัปเดตตาม
//
// ปัญหาที่แก้: เปิดหน้าทัวร์นาเมนต์ไว้จอหนึ่ง เปิดหน้าจัดการแข่งไว้อีกจอหนึ่ง
// กรอกผลที่จอหนึ่งแล้วอีกจอยังโชว์ของเก่าจนกว่าจะกด refresh เอง
// ตอนงานจริงคนคุมมักเปิดหลายหน้าพร้อมกัน ข้อมูลไม่ตรงกันคือเรื่องใหญ่
//
// ส่งแค่ "สัญญาณ" ไม่ได้ส่งข้อมูลไปด้วย
//
// เหตุผลเดียวกับห้องสถิติใน Phase 8: แต่ละหน้ากรองคนละขอบเขต
// (ทัวร์นาเมนต์ไหน ทีมไหน) ข้อมูลชุดเดียวจึงใช้ร่วมกันไม่ได้
// บอกว่า "อะไรเปลี่ยน" แล้วให้แต่ละหน้าไปดึงเฉพาะส่วนที่ตัวเองสนใจ
// payload เล็กมาก และเซิร์ฟเวอร์ไม่ต้องรู้ว่าหน้าไหนกำลังดูอะไรอยู่
//
// ส่งเข้าห้องเดียว ไม่ใช่ทุกคนที่ต่ออยู่
// overlay ไม่ได้สนใจว่ามีใครแก้ชื่อทีมในทะเบียน และไม่ควรต้องมารับข้อความทิ้ง

import { emitToRoom } from '../store/live-state';

export const DATA_ROOM = 'data';
export const DATA_EVENT = 'dataChanged';

export type DataTopic =
  | 'teams'        // ทะเบียนทีมกลาง สร้าง/แก้/ลบ/โลโก้
  | 'tournaments'  // ตัวทัวร์นาเมนต์เอง ชื่อ รูปแบบ สถานะ
  | 'roster'       // ทีมที่ลงแข่งในทัวร์นาเมนต์ เพิ่ม/เอาออก/ลำดับวาง
  | 'matches'      // ตารางแข่ง จับคู่ ล้าง กรอกผล
  | 'games'        // ดราฟต์ล็อก หรือบันทึกผู้ชนะของเกม (สถิติขยับ)
  | 'live'         // แมตช์ที่กำลังออกอากาศเปลี่ยนตัว
  | 'fonts';       // ฟอนต์ที่นำเข้า เพิ่ม/ลบ (สำรองข้อมูลอัตโนมัติฟังอยู่ ฟอนต์อยู่ในไฟล์สำรองด้วย)

export interface DataChange {
  topic: DataTopic;
  tournamentId?: string | null;
  teamId?: string | null;
}

// Listeners inside the server that also want to know (automatic backups). Pages still
// get the socket signal above; this is for code that is not a page.
const listeners: ((change: DataChange) => void)[] = [];

export function onDataChange(listener: (change: DataChange) => void): void {
  listeners.push(listener);
}

export function notifyData(change: DataChange): void {
  emitToRoom(DATA_ROOM, DATA_EVENT, change);
  for (const listener of listeners) {
    try { listener(change); } catch (error) { console.warn(`Data listener failed: ${(error as Error).message}`); }
  }
}
