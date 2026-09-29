// ฟอนต์ของกราฟิกออกอากาศ (ผู้ใช้ขอ 2026-09-29)
//
// ทุกหน้าที่ออกอากาศโหลดไฟล์นี้ เหมือน overlay-size.js จึงมีที่เดียวที่รู้เรื่องฟอนต์
// หน้าไหนเป็นฉากอะไรอ่านจาก <body data-layout-scene> ซึ่งมีอยู่แล้วเพื่อตัวแก้ layout
// (/overlay กับ /overlay-1440 เป็นฉาก 'draft' ด้วยกัน ตั้งทีเดียวได้ทั้งคู่)
//
// เลือกตามบทบาทของข้อความสี่แบบ แล้ว CSS ของแต่ละหน้าไปหยิบไปใช้เอง:
//   --ov-font-heading  หัวเรื่องของหน้า
//   --ov-font-name     ชื่อทีมและชื่อผู้เล่น
//   --ov-font-number   ตัวเลขที่ต้องอ่านเร็ว คะแนนกับนาฬิกา
//   --ov-font-body     ที่เหลือทั้งหมด เป็นค่าตั้งต้นที่ body ใช้
//
// สำคัญ: Kanit ต้องอยู่ท้ายสายเสมอ
//
// ฟอนต์ที่ผู้ใช้เลือกมาจากเครื่องที่ลง OBS ไว้ ส่วนใหญ่เป็นฟอนต์ลาตินที่ไม่มีอักขระไทย
// ถ้าเอา Kanit ออกจากสาย ชื่อทีมภาษาไทยจะตกไปที่ Arial กลางอากาศ ซึ่งเป็นอาการที่
// fonts.css เตือนไว้ตั้งแต่ต้น วางเรียงแบบนี้เบราว์เซอร์จะหยิบทีละอักขระ:
// ตัวลาตินได้ฟอนต์ที่เลือก ส่วนตัวไทยตกมาที่ Kanit เอง โดยไม่ต้องให้ใครมาคอยดู
(() => {
    const ROLES = ['heading', 'name', 'number', 'body'];
    const BASE = "'Kanit', 'Segoe UI', Arial, sans-serif";
    const scene = document.body.dataset.layoutScene || '';

    // ชื่อฟอนต์ถูกกรองมาแล้วที่เซิร์ฟเวอร์ (sanitizeFontFamily) เหลือแต่ตัวอักษร ตัวเลข
    // ช่องว่าง ขีด และขีดล่าง ใส่เครื่องหมายคำพูดอีกชั้นกันชื่อที่มีช่องว่างหรือขึ้นต้นด้วยตัวเลข
    function stack(family) {
        return family ? '"' + family + '", ' + BASE : BASE;
    }

    function apply(fonts) {
        const all = (fonts && fonts.all) || {};
        const page = (fonts && fonts.pages && fonts.pages[scene]) || {};
        const root = document.documentElement;
        ROLES.forEach((role) => {
            // ค่าเฉพาะหน้าชนะค่ารวม ค่าว่างแปลว่า "ไม่ได้ตั้ง" จึงตกไปใช้ตัวถัดไป
            root.style.setProperty('--ov-font-' + role, stack(page[role] || all[role] || ''));
        });
    }

    // ตั้งค่าเริ่มต้นทันทีตั้งแต่ก่อนต่อ socket ติด
    //
    // ต่อเซิร์ฟเวอร์ไม่ได้ หรือ state ยังไม่มา หน้าก็ต้องมีฟอนต์ใช้ ไม่ใช่รอแล้วขึ้นจอเปล่า
    // และการตั้งค่าเป็น BASE ตรงๆ ทำให้ไม่มีจังหวะที่ตัวหนังสือกระโดดเปลี่ยนฟอนต์กลางอากาศ
    apply(null);

    if (typeof socket === 'undefined') return;
    socket.on('stateUpdate', (state) => apply(state && state.fonts));
})();
