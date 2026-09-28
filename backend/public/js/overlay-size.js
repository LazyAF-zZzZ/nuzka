// ขนาดหน้าจอ overlay เลือกครั้งเดียวจาก Control Panel แล้วทุกหน้าตามทันที
//
// หน้าไหนที่ถูกล็อกขนาดไว้แล้ว (เช่น /overlay-1440 ที่ยังมีคนใส่ไว้ใน OBS)
// ให้ใส่ data-lock-size ไว้ที่ <body> หน้านั้นจะไม่เปลี่ยนตาม
(function () {
    const body = document.body;
    const locked = body.dataset.lockSize;

    // ลิงก์ CSS ของ 1440 จะถูกเปิด/ปิดตามขนาดที่เลือก
    const sheet1440 = /** @type {HTMLLinkElement} */ (document.getElementById('size1440'));

    function applySize(size) {
        const next = size === '1440' ? '1440' : '1080';
        const wantDisabled = next !== '1440';

        // แต่ละอย่างเช็คแยกกัน ไม่ใช้ตัวเดียวคุมทั้งคู่
        // ถ้าเช็คแค่ dataset แล้วรีเทิร์นทิ้ง เวลาที่ dataset กับ stylesheet
        // ไม่ตรงกัน (เช่นถูกสลับจากที่อื่น) จะกลับมาตรงกันไม่ได้เลย
        if (body.dataset.size !== next) body.dataset.size = next;

        // แผ่น 1440 ถูกปิดถาวร ตอนนี้ 1440p ใช้วิธีขยาย layout 1080p ด้วย 4/3
        // แทนการมีชุดขนาดแยกอีกชุด รายละเอียดอยู่ในคอมเมนต์ของ overlay.css
        if (sheet1440 && !sheet1440.disabled) sheet1440.disabled = true;
    }

    window.applyOverlaySize = applySize;

    // --- ภาพพื้นหลังที่ผู้ใช้ออกแบบเอง ------------------------------
    // แต่ละหน้าบอกไว้ที่ <body data-skin-slots> ว่าใช้ slot ไหนกับ element ไหน
    // เช่น "overlayTop:.ban-section, overlayBottom:.pick-section"
    // 1080p กับ 1440p ใช้คนละไฟล์ ชื่อ slot จริงคือ base + ขนาด
    // เช่น overlayTop -> overlayTop1080 หรือ overlayTop1440
    const SKIN_FILES = {
        overlayTop1080: 'overlay-top-1080',
        overlayTop1440: 'overlay-top-1440',
        overlayBottom1080: 'overlay-bottom-1080',
        overlayBottom1440: 'overlay-bottom-1440',
        resultTop1080: 'result-top-1080',
        resultTop1440: 'result-top-1440',
        resultBottom1080: 'result-bottom-1080',
        resultBottom1440: 'result-bottom-1440'
    };
    const skinTargets = (body.dataset.skinSlots || '').split(',')
        .map((pair) => pair.split(':').map((s) => s.trim()))
        .filter(([base, sel]) => base && sel);

    // นามสกุลไฟล์ไม่ได้เก็บไว้ใน state จึงลองทีละแบบจนกว่าจะโหลดได้
    const EXTS = ['png', 'jpg', 'webp'];
    const resolved = {};

    function findSkinUrl(slot, version) {
        const cacheKey = slot + ':' + version;
        if (resolved[cacheKey]) return Promise.resolve(resolved[cacheKey]);

        return EXTS.reduce((chain, ext) => chain.then((found) => {
            if (found) return found;
            const url = `images/skins/${SKIN_FILES[slot]}.${ext}?v=${version}`;
            return new Promise((res) => {
                const img = new Image();
                img.onload = () => res(url);
                img.onerror = () => res(null);
                img.src = url;
            });
        }), Promise.resolve(null)).then((url) => {
            if (url) resolved[cacheKey] = url;
            return url;
        });
    }

    function applySkin(skin) {
        const on = Boolean(skin && skin.enabled);
        body.classList.toggle('skin-on', on);
        body.classList.toggle('panels-off', Boolean(skin) && skin.showPanels === false);

        const size = body.dataset.size === '1440' ? '1440' : '1080';

        skinTargets.forEach(([base, selector]) => {
            const el = /** @type {HTMLElement} */ (document.querySelector(selector));
            if (!el) return;
            const slot = base + size;                       // เลือกไฟล์ตามขนาดที่ใช้อยู่
            const version = (skin && skin.slots && skin.slots[slot]) || 0;

            if (!on || !version || !SKIN_FILES[slot]) {
                el.style.backgroundImage = '';
                el.classList.remove('has-skin');
                return;
            }
            findSkinUrl(slot, version).then((url) => {
                if (!url) return;
                el.style.backgroundImage = `url("${url}")`;
                el.classList.add('has-skin');
            });
        });
    }

    // เปลี่ยนขนาดแล้วต้องสลับไฟล์ภาพตามด้วย
    window.reapplySkin = () => applySkin(window.__lastSkin);

    // --- Watermark (docs/PLAN.md §10) ------------------------------
    // Every broadcast graphic loads this file, so this is the one place the watermark
    // lives. A supporter key hides it; the server says which through the 'supporter'
    // socket event, on connect and on every change.
    //
    // It starts HIDDEN and appears only once the server has said "not a supporter".
    // Showing it first and hiding it after would flash it on a supporter's stream every
    // time OBS loads the source, which is exactly what they paid to be rid of.
    //
    // Its styles are injected here rather than put in each page's CSS: broadcast pages
    // share no stylesheet, and ten copies would drift. A page can move it with
    // <body data-watermark="top-right | top-left | bottom-left"> if bottom-right covers
    // something on that graphic.
    //
    // A page with a banner marks it <... data-watermark-slot>: the text then goes inside
    // the banner, and the app logo sits behind the banner's centre at 60% (user's
    // request, 2026-09-28). Being children of the panel, both scale with it at 1440.
    const WATERMARK_TEXT = 'ROV Overlay Tool · by LazyAF';
    const watermarkStyle = document.createElement('style');
    watermarkStyle.textContent = `
        .rov-watermark {
            position: fixed; right: 18px; bottom: 14px; z-index: 2147483647;
            font: 700 19px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.04em;
            color: rgba(255, 255, 255, 0.85);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.6);
            pointer-events: none; user-select: none; white-space: nowrap;
            transform-origin: bottom right;
        }
        .rov-watermark[hidden] { display: none; }
        body[data-watermark="top-right"] .rov-watermark { top: 14px; bottom: auto; transform-origin: top right; }
        body[data-watermark="top-left"] .rov-watermark { top: 14px; bottom: auto; left: 18px; right: auto; transform-origin: top left; }
        body[data-watermark="bottom-left"] .rov-watermark { left: 18px; right: auto; transform-origin: bottom left; }
        body[data-size="1440"] .rov-watermark { transform: scale(calc(4 / 3)); }
        /* Inside the draft overlay's banner (the top strip of .pick-section, 1080 layout
           pixels): right-aligned just left of the red ban slots (x 1600-1906, y 12-70),
           and centred on them. The container already scales at 1440, so no scale here. */
        body .rov-watermark.in-banner {
            position: absolute; right: 336px; top: 32px; bottom: auto; transform: none;
            font-size: 17px;
        }
        /* Behind the tournament name: prepended to the panel, so everything positioned
           after it in the panel paints on top. The banner is about 95px tall. */
        .rov-watermark-logo {
            position: absolute; left: 50%; top: 6px; height: 84px; transform: translateX(-50%);
            opacity: 0.6; pointer-events: none; user-select: none;
        }
        .rov-watermark-logo[hidden] { display: none; }
    `;
    document.head.appendChild(watermarkStyle);

    const watermark = document.createElement('div');
    watermark.className = 'rov-watermark';
    watermark.textContent = WATERMARK_TEXT;
    watermark.hidden = true;

    const slot = document.querySelector('[data-watermark-slot]');
    /** @type {HTMLImageElement | null} */
    let watermarkLogo = null;
    if (slot) {
        watermark.classList.add('in-banner');
        slot.appendChild(watermark);
        watermarkLogo = document.createElement('img');
        watermarkLogo.className = 'rov-watermark-logo';
        watermarkLogo.src = '/images/watermark-logo.png';
        watermarkLogo.alt = '';
        watermarkLogo.hidden = true;
        slot.prepend(watermarkLogo);
    } else {
        body.appendChild(watermark);
    }

    if (typeof socket !== 'undefined') {
        socket.on('supporter', (status) => {
            const supporter = Boolean(status && status.active);
            watermark.hidden = supporter;
            if (watermarkLogo) watermarkLogo.hidden = supporter;
        });
    }

    applySize(locked || '1080');
    if (locked) {
        // หน้าที่ล็อกขนาดไว้ ยังต้องรับภาพพื้นหลังตามปกติ
        if (typeof socket !== 'undefined') {
            socket.on('stateUpdate', (s) => {
                window.__lastSkin = s && s.skin;
                applySkin(window.__lastSkin);
            });
        }
        return;
    }

    // socket ถูกสร้างไว้แล้วในไฟล์หลักของแต่ละหน้า
    // applySize ต้องมาก่อน applySkin เพราะการเลือกไฟล์ขึ้นกับขนาดที่เพิ่งตั้ง
    if (typeof socket !== 'undefined') {
        socket.on('stateUpdate', (state) => {
            applySize(state && state.overlaySize);
            window.__lastSkin = state && state.skin;
            applySkin(window.__lastSkin);
        });
    }
})();
