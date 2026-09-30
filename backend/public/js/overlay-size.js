// ขนาดหน้าจอ overlay เลือกครั้งเดียวจาก Control Panel แล้วทุกหน้าตามทันที
//
// หน้าไหนที่ถูกล็อกขนาดไว้แล้ว (เช่น /overlay-1440 ที่ยังมีคนใส่ไว้ใน OBS)
// ให้ใส่ data-lock-size ไว้ที่ <body> หน้านั้นจะไม่เปลี่ยนตาม
(function () {
    // ย่อตัวหนังสือให้พอดีกล่อง แทนการตัดท้ายเป็น ... (ใช้กับชื่อทีมยาวๆ บนกราฟิก)
    // ลดทีละนิดจนไม่ล้นทั้งกว้างและสูง ไม่ต่ำกว่า min ของขนาดเดิม เกินนั้นให้ CSS ตัดเอง
    window.RovFitText = (el, min = 0.55) => {
        if (!el) return;
        el.style.fontSize = '';
        const base = parseFloat(getComputedStyle(el).fontSize) || 16;
        let size = base;
        // แนวตั้งเผื่อไว้ราวหนึ่งในสามของขนาดตัวอักษร: หัวและหางของ Kanit ยื่นพ้นบรรทัดที่ชิดๆ
        // เสมอ ถ้านับตรงๆ ข้อความที่พอดีอยู่แล้วจะถูกย่อจนเหลือขนาดต่ำสุดทุกครั้ง (เจอบนหน้าดราฟต์)
        const over = () => el.scrollWidth > el.clientWidth + 1
            || el.scrollHeight > el.clientHeight + Math.ceil(size * 0.3);
        for (let i = 0; i < 24 && over() && size > base * min; i++) {
            size = Math.max(base * min, size * 0.94);
            el.style.fontSize = size + 'px';
        }
    };

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
        resultBottom1440: 'result-bottom-1440',
        // ต้องตรงกับ SKIN_SLOTS ใน server/domain/media.ts
        textureDraft: 'texture-draft',
        textureResult: 'texture-result',
        textureTeams: 'texture-teams',
        textureStandings: 'texture-standings',
        textureAnalytics: 'texture-analytics',
        textureMatchup: 'texture-matchup',
        textureTeamDrafts: 'texture-team-drafts',
        textureTeamCard: 'texture-team-card',
        texturePrev: 'texture-prev'
    };

    // --- พื้นผิว (texture) ทับพื้นเดิม ------------------------------------
    // ผู้ใช้ขอ 2026-09-30: นำเข้าภาพมาปูทับพื้นเดิมของแบนเนอร์ดราฟต์และหน้าอื่นๆ
    // ภาพอยู่ในช่อง skin ชื่อ texture<Scene> ค่าวิธีปูอยู่ที่ state.textures[scene]
    //
    // ปูเป็นลูกชิ้นหนึ่ง (.nz-texture) ในแต่ละพื้นที่เป้าหมาย z-index: -1 ภายใต้ isolation: isolate
    // จึงอยู่เหนือพื้นของกล่องเอง แต่ใต้ตัวหนังสือและภาพทุกอย่างในกล่อง และโหมดผสมผสมกับพื้นกล่องเท่านั้น
    // การ์ด แถว และกลุ่มของบางหน้าถูกสร้างใหม่ตลอดเวลา จึงคอยดูด้วย MutationObserver แล้วเติมให้
    const TEXTURE_TARGETS = {
        draft: '.pick-section',
        result: '.team-section',
        teams: '.tl-card',
        standings: '.st-group',
        analytics: '.an-row',
        matchup: '.mu-score, .mu-side, .mu-meetings',
        'team-drafts': '.mu-score, .mu-side, .mu-meetings',
        'team-card': '.tc-logo, .tc-tile, .mu-side',
        prev: '.pv-round'
    };
    const textureScene = body.dataset.layoutScene || '';
    const textureSelector = TEXTURE_TARGETS[textureScene] || '';
    const textureSlot = 'texture' + textureScene.replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
    let textureOn = false;
    if (textureSelector) {
        const css = document.createElement('style');
        css.textContent = `
            .nz-textured { isolation: isolate; }
            .nz-texture { position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit;
                background-image: var(--nz-tex-url); background-repeat: var(--nz-tex-repeat, repeat);
                background-size: var(--nz-tex-size, auto); background-position: center;
                opacity: var(--nz-tex-opacity, 0.35); mix-blend-mode: var(--nz-tex-blend, normal); }
            .has-skin > .nz-texture { display: none; }`;
        document.head.appendChild(css);
    }

    function placeTextures() {
        if (!textureSelector) return;
        document.querySelectorAll(textureSelector).forEach((node) => {
            const el = /** @type {HTMLElement} */ (node);
            const layer = Array.from(el.children).find((c) => c.classList.contains('nz-texture'));
            if (!textureOn) {
                if (layer) layer.remove();
                el.classList.remove('nz-textured');
                return;
            }
            if (layer) return;
            // กล่องต้องเป็นจุดอ้างอิงของ position: absolute ถ้ายังไม่ใช่ ตั้ง relative ให้
            // แต่ถ้ามีลูกที่วางแบบ absolute อ้างกล่องที่อยู่นอกกว่าอยู่แล้ว ตั้ง relative จะพาลูกพวกนั้นย้ายที่ จึงข้าม
            if (getComputedStyle(el).position === 'static') {
                // ลูกที่อ้างกล่องที่อยู่ข้างในอยู่แล้ว (เช่นตัวเลขมุมช่องฮีโร่) ไม่กระทบ นับเฉพาะที่อ้างออกไปข้างนอก
                const anchored = Array.from(el.querySelectorAll('*')).some((c) => {
                    const p = getComputedStyle(c).position;
                    if (p === 'fixed') return true;
                    if (p !== 'absolute') return false;
                    const holder = /** @type {HTMLElement} */ (c).offsetParent;
                    return !holder || !el.contains(holder);
                });
                if (anchored) return;
                el.style.position = 'relative';
            }
            el.classList.add('nz-textured');
            const div = document.createElement('div');
            div.className = 'nz-texture';
            el.appendChild(div);
        });
    }

    /** @type {number} */
    let textureFrame = 0;
    const placeTexturesSoon = () => {
        if (textureFrame) return;
        textureFrame = requestAnimationFrame(() => { textureFrame = 0; placeTextures(); });
    };
    if (textureSelector) {
        new MutationObserver((records) => {
            // การเพิ่มชั้นพื้นผิวเองก็เป็น mutation ข้ามไปถ้ามีแค่นั้น ไม่งั้นวนไม่รู้จบ
            const real = records.some((r) => Array.from(r.addedNodes).some((n) => !(n instanceof HTMLElement && n.classList.contains('nz-texture'))));
            if (real && textureOn) placeTexturesSoon();
        }).observe(body, { childList: true, subtree: true });
    }

    /** @type {Record<string, { w: number, h: number }>} */
    const textureSizes = {};
    function applyTexture(state) {
        if (!textureSelector) return;
        const version = (state && state.skin && state.skin.slots && state.skin.slots[textureSlot]) || 0;
        const set = (state && state.textures && state.textures[textureScene]) || {};
        const opacity = typeof set.opacity === 'number' ? set.opacity : 0.35;
        if (!version || opacity <= 0) {
            textureOn = false;
            placeTextures();
            return;
        }
        findSkinUrl(textureSlot, version).then((url) => {
            if (!url) { textureOn = false; placeTextures(); return; }
            const measure = textureSizes[url]
                ? Promise.resolve(textureSizes[url])
                : new Promise((res) => {
                    const img = new Image();
                    img.onload = () => res(textureSizes[url] = { w: img.naturalWidth, h: img.naturalHeight });
                    img.onerror = () => res({ w: 0, h: 0 });
                    img.src = url;
                });
            measure.then((/** @type {{ w: number, h: number }} */ size) => {
                const style = body.style;
                // 1440p วางทุกอย่างใหญ่ขึ้น 4/3 พื้นผิวก็ต้องใหญ่ตาม ไม่งั้นลายดูถี่กว่าบน 1080p
                const k = ((typeof set.scale === 'number' ? set.scale : 100) / 100) * (body.dataset.size === '1440' ? 4 / 3 : 1);
                const fill = set.fit === 'fill';
                style.setProperty('--nz-tex-url', `url("${url}")`);
                style.setProperty('--nz-tex-repeat', fill ? 'no-repeat' : 'repeat');
                style.setProperty('--nz-tex-size', fill ? 'cover' : size.w ? `${Math.round(size.w * k)}px ${Math.round(size.h * k)}px` : 'auto');
                style.setProperty('--nz-tex-opacity', String(opacity));
                style.setProperty('--nz-tex-blend', set.blend || 'normal');
                textureOn = true;
                placeTextures();
            });
        });
    }
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
    window.reapplySkin = () => { applySkin(window.__lastSkin); applyTexture(window.__lastTextureState); };

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
    // share no stylesheet, and ten copies would drift.
    //
    // Where it goes depends on the data, not the page: 32 teams fill the standings to
    // the bottom edge where 8 teams leave half the screen empty. So it tries the corners
    // in order (the page's <body data-watermark> first, else bottom-right) and takes the
    // first one where nothing drawn sits under it, checking again whenever the page
    // changes. If every corner is busy it takes the one it covers least.
    //
    // The app's shield sits just before the text, a little taller than a capital
    // letter, so the two read as one mark (user's request, 2026-09-28).
    //
    // That height is 1.8em, not more: at 2.8em the shield rendered 63px against 23px of
    // text and made the mark 64px tall, which does not fit under a full 32-team list.
    // The teams overlay at perSet=8 ends its last card at y 1006, leaving a 74px band, so
    // the mark overlapped the bottom row by 4px. 1.8em with bottom:8px clears it by 25px
    // (measured, 2026-09-29). Moving it down alone could never buy more than 10px.
    //
    // A page with a banner marks it <... data-watermark-slot>, and the mark goes inside
    // it instead of in a corner. Being inside the panel, it scales with it at 1440.
    const WATERMARK_TEXT = 'Powered by Nuzka';
    const watermarkStyle = document.createElement('style');
    watermarkStyle.textContent = `
        .rov-watermark {
            position: fixed; right: 18px; bottom: 8px; z-index: 2147483647;
            display: flex; align-items: center; gap: 0.55em;
            font: 700 23px/1 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.04em;
            color: #ffffff;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.7);
            pointer-events: none; user-select: none; white-space: nowrap;
            transform-origin: bottom right;
        }
        .rov-watermark[hidden] { display: none; }
        /* The logo is at full strength like the text; a drop shadow stands in for the text shadow,
           which images do not get. */
        .rov-watermark img {
            height: 1.8em; width: auto;
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
        }
        .rov-watermark[data-corner="top-right"] { top: 14px; bottom: auto; transform-origin: top right; }
        .rov-watermark[data-corner="top-left"] { top: 14px; bottom: auto; left: 18px; right: auto; transform-origin: top left; }
        .rov-watermark[data-corner="bottom-left"] { left: 18px; right: auto; transform-origin: bottom left; }
        body[data-size="1440"] .rov-watermark { transform: scale(calc(4 / 3)); }
        /* Inside the draft overlay's banner (the top strip of .pick-section, 1080 layout
           pixels): right-aligned just left of the red ban slots (x 1600-1906, y 12-70),
           its middle on theirs, 41px down. The container already scales at 1440, so the
           only transform here is that centring. */
        body .rov-watermark.in-banner {
            position: absolute; right: 336px; top: 41px; bottom: auto; transform: translateY(-50%);
            font-size: 21px;
        }
    `;
    document.head.appendChild(watermarkStyle);

    const watermark = document.createElement('div');
    watermark.className = 'rov-watermark';
    const watermarkLogo = document.createElement('img');
    watermarkLogo.src = '/images/watermark-logo.png';
    watermarkLogo.alt = '';
    const watermarkText = document.createElement('span');
    watermarkText.textContent = WATERMARK_TEXT;
    watermark.append(watermarkLogo, watermarkText);
    watermark.hidden = true;

    const slot = document.querySelector('[data-watermark-slot]');
    if (slot) {
        watermark.classList.add('in-banner');
        slot.appendChild(watermark);
    } else {
        body.appendChild(watermark);
    }

    // --- Picking a free corner (full-screen graphics only) -------------------------
    const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const preferred = CORNERS.indexOf(body.dataset.watermark || '') >= 0 ? body.dataset.watermark : 'bottom-right';
    const cornerOrder = [preferred].concat(CORNERS.filter((c) => c !== preferred));

    // What is drawn, in two kinds.
    //   content: text (only where its letters are: a footnote's box can span the whole
    //            screen while its words fill the left third), pictures, and small boxes
    //            with a fill, a picture or a border. The mark must never cover these.
    //   panels:  big painted boxes (a quarter of the screen or more, but not the whole
    //            screen, which is the stage backdrop). The mark may sit on one, but a
    //            corner clear of every panel looks cleaner: under the last row of a full
    //            standings table the mark reads as part of the table.
    // Elements still at opacity 0 count: that is an entrance animation about to show them.
    function drawnBoxes() {
        const screen = window.innerWidth * window.innerHeight;
        const content = [];
        const panels = [];
        body.querySelectorAll('*').forEach((el) => {
            if (el === watermark || watermark.contains(el)) return;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden') return;
            const area = r.width * r.height;
            const media = /^(IMG|SVG|CANVAS|VIDEO|svg)$/.test(el.tagName);
            const painted = cs.backgroundImage !== 'none'
                || (cs.backgroundColor !== 'transparent' && !/rgba(.*,s*0)$/.test(cs.backgroundColor))
                || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
            if (area >= screen / 4) {
                if (painted && area < screen * 0.9) panels.push(r);
            } else if (media || painted) {
                content.push(r);
                return;
            }
            el.childNodes.forEach((n) => {
                if (n.nodeType !== 3 || !n.textContent || !n.textContent.trim()) return;
                const range = document.createRange();
                range.selectNodeContents(n);
                Array.prototype.forEach.call(range.getClientRects(), (tr) => {
                    if (tr.width >= 1 && tr.height >= 1) content.push(tr);
                });
            });
        });
        return { content, panels };
    }

    function overlap(boxes, pad) {
        const r = watermark.getBoundingClientRect();
        let area = 0;
        boxes.forEach((b) => {
            const w = Math.min(r.right + pad, b.right) - Math.max(r.left - pad, b.left);
            const h = Math.min(r.bottom + pad, b.bottom) - Math.max(r.top - pad, b.top);
            if (w > 0 && h > 0) area += w * h;
        });
        return area;
    }

    // Covering content is always worse than sitting on a panel, so it weighs far more.
    // ในแบนเนอร์ดราฟต์: ที่ประจำคือซ้ายของช่องแบนฝั่งแดง แต่ผู้ใช้ย่อขยาย/ย้ายชิ้นส่วนได้ (ตัวแก้ layout)
    // ขยายช่องแบนแล้วทับลายน้ำ (เจอ 2026-09-30) จึงเลื่อนไปตามแถบบนของแบนเนอร์ หาที่ว่างที่ใกล้ที่ประจำที่สุด
    // สลับซ้าย/ขวาทีละ 12px ไม่มีที่ว่างเลยก็เอาที่ทับน้อยที่สุด ตำแหน่งเป็นพิกเซลของแบนเนอร์ (1440 ขยายตามเอง)
    const BANNER_RIGHT = 336;
    function placeInBanner() {
        const drawn = drawnBoxes().content;
        const box = slot.getBoundingClientRect();
        const candidates = [BANNER_RIGHT];
        for (let d = 12; d <= 1900; d += 12) {
            candidates.push(BANNER_RIGHT + d);
            if (BANNER_RIGHT - d >= 8) candidates.push(BANNER_RIGHT - d);
        }
        let best = BANNER_RIGHT;
        let bestScore = Infinity;
        for (const right of candidates) {
            watermark.style.right = right + 'px';
            const r = watermark.getBoundingClientRect();
            if (r.left < box.left + 4 || r.right > box.right - 4) continue;   // ต้องอยู่ในแบนเนอร์ทั้งตัว
            const score = overlap(drawn, 6);
            if (score < bestScore) { best = right; bestScore = score; }
            if (score === 0) break;
        }
        watermark.style.right = best + 'px';
    }

    function placeWatermark() {
        // A hidden mark has no size to measure; lay it out invisibly for the check.
        if (slot) {
            const hid = watermark.hidden;
            if (hid) { watermark.hidden = false; watermark.style.visibility = 'hidden'; }
            placeInBanner();
            if (hid) { watermark.hidden = true; watermark.style.visibility = ''; }
            return;
        }
        const wasHidden = watermark.hidden;
        if (wasHidden) { watermark.hidden = false; watermark.style.visibility = 'hidden'; }
        const drawn = drawnBoxes();
        let best = cornerOrder[0];
        let bestScore = Infinity;
        for (const corner of cornerOrder) {
            watermark.dataset.corner = corner;
            const score = overlap(drawn.content, 8) * 1000 + overlap(drawn.panels, 0);
            if (score < bestScore) { best = corner; bestScore = score; }
            if (score === 0) break;
        }
        watermark.dataset.corner = best;
        if (wasHidden) { watermark.hidden = true; watermark.style.visibility = ''; }
    }

    // Pages fill themselves from the server after load and again on every change, and
    // their rows animate in, so place now, then again a moment after the page stops
    // changing. Only content changes count: moving the mark itself changes an attribute,
    // which is not watched, so it cannot set off another round.
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let placeTimer;
    function placeSoon(delay) {
        clearTimeout(placeTimer);
        placeTimer = setTimeout(placeWatermark, delay);
    }
    if (!slot) {
        watermark.dataset.corner = preferred;
        new MutationObserver(() => placeSoon(600)).observe(body, { childList: true, subtree: true, characterData: true });
        window.addEventListener('resize', () => placeSoon(200));
        // Parts moved with the layout editor (overlay-layout.js) change no content, only where it is.
        window.addEventListener('rov-layout', () => placeSoon(150));
        // ฟอนต์ที่นำเข้าเปลี่ยนความกว้างตัวหนังสือ มุมที่ว่างอาจเปลี่ยน (overlay-fonts.js)
        window.addEventListener('rov-fonts', () => placeSoon(150));
        window.addEventListener('load', () => placeSoon(300));
        placeSoon(300);
        setTimeout(placeWatermark, 2500);   // after entrance animations have settled
    } else {
        // ในแบนเนอร์: ย้ายเมื่อชิ้นส่วนถูกย้าย/ย่อขยาย ฟอนต์เปลี่ยน ขนาดจอสลับ หรือชื่อทัวร์นาเมนต์เปลี่ยนความยาว
        // ภาพแบน/พิคที่เข้ามาไม่เปลี่ยนกรอบของช่อง จึงไม่ต้องดูทุกการเปลี่ยนแปลงแบบหน้าเต็มจอ
        window.addEventListener('rov-layout', () => placeSoon(150));
        window.addEventListener('rov-fonts', () => placeSoon(150));
        window.addEventListener('resize', () => placeSoon(200));
        window.addEventListener('load', () => placeSoon(300));
        new MutationObserver(() => placeSoon(200)).observe(body, { attributes: true, attributeFilter: ['data-size'] });
        const title = document.getElementById('tournamentName');
        if (title) new MutationObserver(() => placeSoon(300)).observe(title, { childList: true, characterData: true, subtree: true });
        placeSoon(300);
        setTimeout(placeWatermark, 2500);
    }

    if (typeof socket !== 'undefined') {
        socket.on('supporter', (status) => {
            watermark.hidden = Boolean(status && status.active);
            if (!watermark.hidden) placeSoon(50);
        });
    }

    // โหลดหน้าใหม่เองเมื่อแอพถูกอัปเดต (ผู้ใช้ขอ 2026-09-30)
    //
    // OBS เปิด browser source ค้างไว้ข้ามการอัปเดต หน้าเดิมจึงวิ่งด้วย JS/CSS รุ่นเก่า
    // จนกว่าจะมีคนกด refresh cache เอง ซึ่งบันทึกประจำรุ่นต้องบอกทุกครั้ง
    // อัปเดตแปลว่าแอพปิดแล้วเปิดใหม่ socket จึงต่อใหม่เสมอ ตอนต่อใหม่เทียบเลขรุ่นกับตอนเปิดหน้า
    // ไม่ตรง = รุ่นใหม่ โหลดหน้าใหม่ครั้งเดียว (ไฟล์ส่งมาพร้อม no-cache จึงได้ของใหม่แน่)
    // ตัวแก้ layout (?edit=1) ไม่โหลดเอง จะได้ไม่หายไปกลางที่ลากอยู่
    if (typeof socket !== 'undefined' && !/[?&]edit=1/.test(location.search)) {
        /** @type {string | null} */
        let seenVersion = null;
        const checkVersion = () => fetch('/api/app-info', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((info) => {
                const version = info && info.version;
                if (!version) return;
                if (seenVersion === null) { seenVersion = version; return; }
                if (version !== seenVersion) location.reload();
            })
            .catch(() => { /* เซิร์ฟเวอร์ยังไม่ขึ้น ตอนต่อได้จะถามใหม่เอง */ });
        socket.on('connect', checkVersion);
        checkVersion();
    }

    applySize(locked || '1080');
    if (locked) {
        // หน้าที่ล็อกขนาดไว้ ยังต้องรับภาพพื้นหลังตามปกติ
        if (typeof socket !== 'undefined') {
            socket.on('stateUpdate', (s) => {
                window.__lastSkin = s && s.skin;
                applySkin(window.__lastSkin);
                window.__lastTextureState = s;
                applyTexture(s);
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
            window.__lastTextureState = state;
            applyTexture(state);
        });
    }
})();
