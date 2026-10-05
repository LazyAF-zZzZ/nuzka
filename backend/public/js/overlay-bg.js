// พื้นหลังเคลื่อนไหวของหน้าออกอากาศที่ไม่มีของตัวเอง (ผู้ใช้ขอ 2026-10-05)
//
// ฉากคั่นรายการกับ VS มี <canvas> ของตัวเองและเรียก RovBroadcast.createBackground เอง ไฟล์นี้ให้หน้าที่เหลือ
// (ผลดราฟต์ รายชื่อทีม ตารางคะแนน เจอกันมาก่อน พิค/แบนของทีม การ์ดทีม กระดานสถิติ แถบชื่อ สกอร์บอร์ด)
// ได้แบบเดียวกัน หน้าดราฟต์กับพิค/แบนเกมก่อนไม่ใช้ไฟล์นี้
//
// หน้าเหล่านี้โปร่งใสมาตลอด ค่าตั้งต้นจึง "ปิด" (state.broadcast.sceneBackgrounds[scene].enabled) ผู้ใช้เปิดเอง
// จากแท็บ Style ของตัวแก้ ปิดอยู่ = ไม่สร้างภาพ ไม่วาดอะไรเลย หน้ายังโปร่งใสเหมือนเดิมทุกอย่าง
(function () {
    const body = document.body;
    const scene = body.dataset.layoutScene;
    const B = window.RovBroadcast;
    if (!scene || !B || typeof socket === 'undefined' || document.getElementById('bg')) return;

    // วางไว้หลังเนื้อหาทั้งหมดของหน้า (z-index ติดลบ) และเต็มจอ: ที่ 1440p จอเป็น 2560x1440 canvas ก็ขยายตาม
    const style = document.createElement('style');
    style.textContent = '#nz-bg { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: -1;'
        + ' pointer-events: none; object-fit: cover; } #nz-bg[hidden] { display: none; }';
    document.head.appendChild(style);

    const canvas = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
    canvas.id = 'nz-bg';
    canvas.hidden = true;
    body.insertBefore(canvas, body.firstChild);

    const update = B.createBackground(canvas);
    socket.on('stateUpdate', (state) => {
        if (!state || !state.broadcast) return;
        update(B.backgroundFor(state.broadcast, scene), B.coloursFor(state, scene));
    });
})();
