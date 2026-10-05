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

    // ฟอนต์ที่นำเข้ามาเก็บในแอพ มีชื่อ family เป็น "nzf-<id>" (server/domain/font-files.ts)
    // ไม่ได้ลงไว้ในเครื่อง หน้านี้จึงต้องประกาศ @font-face ให้เองก่อนใช้ ครั้งเดียวต่อฟอนต์
    // id ผ่าน regex เดียวกับเซิร์ฟเวอร์ก่อนต่อเป็น URL
    const IMPORTED = /^nzf-(f[a-z0-9]{10})$/;
    const declared = new Set();
    const faces = document.createElement('style');
    document.head.appendChild(faces);

    function declare(family) {
        const match = IMPORTED.exec(family);
        if (!match || declared.has(family)) return;
        declared.add(family);
        faces.appendChild(document.createTextNode(
            '@font-face { font-family: "' + family + '"; src: url("/user-fonts/' + match[1] + '");'
            + ' font-display: block; }\n'));
        // หน้าที่วัดขนาดตัวหนังสือ (รายชื่อทีม ลายน้ำ) ต้องวัดใหม่เมื่อไฟล์โหลดเสร็จ
        if (document.fonts && document.fonts.load) {
            document.fonts.load('16px "' + family + '"')
                .then(() => window.dispatchEvent(new Event('rov-fonts')))
                .catch(() => { /* ไฟล์หายหรือเสีย: ตกไปที่ Kanit ตามสาย ไม่ต้องทำอะไร */ });
        }
    }

    function apply(fonts) {
        const all = (fonts && fonts.all) || {};
        const page = (fonts && fonts.pages && fonts.pages[scene]) || {};
        const root = document.documentElement;
        ROLES.forEach((role) => {
            // ค่าเฉพาะหน้าชนะค่ารวม ค่าว่างแปลว่า "ไม่ได้ตั้ง" จึงตกไปใช้ตัวถัดไป
            const family = page[role] || all[role] || '';
            declare(family);
            root.style.setProperty('--ov-font-' + role, stack(family));
        });
    }

    // ตั้งค่าเริ่มต้นทันทีตั้งแต่ก่อนต่อ socket ติด
    //
    // ต่อเซิร์ฟเวอร์ไม่ได้ หรือ state ยังไม่มา หน้าก็ต้องมีฟอนต์ใช้ ไม่ใช่รอแล้วขึ้นจอเปล่า
    // และการตั้งค่าเป็น BASE ตรงๆ ทำให้ไม่มีจังหวะที่ตัวหนังสือกระโดดเปลี่ยนฟอนต์กลางอากาศ
    apply(null);

    // overlay-layout.js styles single text parts with a font of the operator's choice (2026-10-05) and needs
    // the same stack and the same @font-face for imported files.
    window.RovFonts = { stack, declare };

    // สีของธีมบนหน้ากลุ่ม "หัวต่อหัว" (2026-10-05): ตารางคะแนน เจอกันมาก่อน พิค/แบนของทีม และการ์ดทีมมีสีน้ำเงิน/แดง/
    // ทอง/ตัวอักษร/ป้ายในแท็บ Style แต่ไม่เคยมีหน้าไหนในกลุ่มนี้เอาค่าจาก state.theme ไปใช้เลย (มีแค่ overlay.js กับ
    // overlay-prev.js) ตั้งสีแล้วไม่เปลี่ยนอะไร ชื่อตัวแปรตรงกับ :root ในแผ่น CSS ของหน้าเหล่านี้ ที่นี่ใช้ที่เดียวเพราะ
    // ไฟล์นี้ทุกหน้าโหลดอยู่แล้วและฟัง stateUpdate อยู่แล้ว
    const THEMED = ['standings', 'matchup', 'team-drafts', 'team-card'];
    const COLOUR_VARS = { blue: '--ov-blue', red: '--ov-red', accent: '--ov-accent', text: '--ov-text', label: '--ov-silver' };
    const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
    function applyColours(theme) {
        if (!theme || typeof theme !== 'object') return;
        const root = document.documentElement;
        Object.keys(COLOUR_VARS).forEach((key) => {
            const value = theme[key];
            if (typeof value !== 'string' || !HEX.test(value)) return;
            root.style.setProperty(COLOUR_VARS[key], value);
            if (key === 'blue' || key === 'red') {
                const m = HEX.exec(value);
                root.style.setProperty('--ov-' + key + '-rgb', parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16));
            }
        });
    }

    if (typeof socket === 'undefined') return;
    socket.on('stateUpdate', (state) => {
        apply(state && state.fonts);
        if (THEMED.includes(scene)) applyColours(state && state.theme);
    });
})();
