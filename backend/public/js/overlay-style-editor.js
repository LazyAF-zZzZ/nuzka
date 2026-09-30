// แท็บ "Style" ในตัวแก้ layout: ทุกอย่างที่เคยอยู่หน้า Design ของแอพ (ย้ายมา 2026-09-30)
//
// ผู้ใช้ขอให้ย้ายการออกแบบทั้งหมดมาไว้ที่ตัวแก้ แล้วเอาหน้า Design ออกจากแอพ: สี ขนาดตัวอักษร
// ฟอนต์ (รวมนำเข้า) ภาพพื้นหลัง และค่าของหน้ารายชื่อทีม แต่ละหน้าเห็นเฉพาะที่หน้านั้นใช้จริง
//
// ไฟล์นี้โหลดกับทุกหน้าออกอากาศแต่ไม่ทำอะไรเลย จนกว่า overlay-layout.js จะเรียก mount()
// ตอนเปิดด้วย ?edit=1 ใน OBS จึงไม่มีอะไรเพิ่มขึ้นบนจอ
//
// ส่งค่าผ่าน socket event เดียวกับที่หน้า Design ของแอพเคยส่ง เซิร์ฟเวอร์กรองค่าเองทุกตัว
// (updateTheme, updateFont, updateSkinOptions, updateTeamList*) OBS จึงเปลี่ยนตามทันทีเหมือนเดิม
(function () {
    // สีและขนาดที่แต่ละหน้าอ่านจริง (ยกมาจาก DesignPages ของแอพเดิม ซึ่งไล่จากสไตล์ชีตแล้ว)
    const PAGES = {
        draft: { colours: ['blue', 'red', 'text', 'label'], sizes: true, images: ['overlayBottom'] },
        teams: { colours: [], teamList: true },
        standings: { colours: ['accent', 'text', 'label'] },
        result: { colours: [], images: ['resultTop', 'resultBottom'] },
        analytics: { colours: [] },
        matchup: { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        prev: { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        'team-card': { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        'team-drafts': { colours: ['blue', 'red', 'accent', 'text', 'label'] }
    };

    // ช่วงของค่าตัวเลข ต้องตรงกับ THEME_NUMBER_RANGE ใน server/domain/settings.ts
    const SIZES = [
        ['typeTournament', 10, 48], ['typeTitle', 10, 60], ['typeScore', 12, 96], ['typeTimer', 12, 96],
        ['typePlayer', 10, 48], ['typeCaption', 8, 40], ['logoSize', 40, 260], ['logoInset', -40, 200]
    ];

    // ขนาดภาพที่แนะนำ ต้องตรงกับ SKIN_SLOTS ใน server/domain/media.ts
    const IMAGE_SIZES = {
        overlayBottom1080: [1920, 430], overlayBottom1440: [2560, 573],
        resultTop1080: [1920, 540], resultTop1440: [2560, 720],
        resultBottom1080: [1920, 540], resultBottom1440: [2560, 720]
    };

    const TEXT = {
        en: {
            fonts: 'Fonts', scope: 'Applies to', thisPage: 'This page', allPages: 'All pages',
            heading: 'Headings', name: 'Team and player names', number: 'Scores and timers', body: 'Everything else',
            fontDefault: 'Default (Kanit)', imported: 'Imported', installed: 'Installed on this PC', noThai: '(no Thai)',
            sameAsAll: 'All pages: {0}', importFont: 'Import font…', importing: 'Importing…', del: 'Delete',
            deleteFont: 'Delete {0}? Text using it goes back to Kanit on every page.',
            fontsHint: 'Fonts imported here are saved in Nuzka, so they need no installing. A font without Thai letters shows Thai names in Kanit.',
            colours: 'Colours', shared: 'Shared with other pages that use the same colour.',
            blue: 'Blue team', red: 'Red team', text: 'Text', accent: 'Accent', label: 'Labels',
            sizes: 'Text and logo sizes', typeTournament: 'Tournament name', typeTitle: 'Match title', typeScore: 'Score',
            typeTimer: 'Timer', typePlayer: 'Player name', typeCaption: 'Labels (BAN, phase, VS)', logoSize: 'Logo size',
            logoInset: 'Logo distance from centre', resetTheme: 'Reset colours and sizes',
            resetThemeAsk: 'Put every colour and size back to the original, on every page?',
            images: 'Background images', useImages: 'Use these images', keepPanels: 'Keep the built-in panels',
            upload: 'Upload…', clear: 'Clear', hasImage: 'Image set', noImage: 'No image',
            overlayBottom: 'Banner', resultTop: 'Top half (blue team)', resultBottom: 'Bottom half (red team)',
            teamList: 'Team list', perSet: 'Teams per set', style: 'List style', sets: 'Sets', scroll: 'Scrolling',
            speed: 'Scroll speed (px/s)', columns: 'Columns', auto: 'Auto', cardColour: 'Card colour',
            cardBg: 'Card background', radius: 'Corner radius', autoText: 'Dark text on a light card',
            failed: 'Could not save: '
        },
        th: {
            fonts: 'ฟอนต์', scope: 'ใช้กับ', thisPage: 'หน้านี้', allPages: 'ทุกหน้า',
            heading: 'หัวเรื่อง', name: 'ชื่อทีมและชื่อผู้เล่น', number: 'คะแนนและเวลา', body: 'ข้อความอื่นทั้งหมด',
            fontDefault: 'ตามเดิม (Kanit)', imported: 'นำเข้า', installed: 'ลงไว้ในเครื่อง', noThai: '(ไม่มีภาษาไทย)',
            sameAsAll: 'ทุกหน้า: {0}', importFont: 'นำเข้าฟอนต์…', importing: 'กำลังนำเข้า…', del: 'ลบ',
            deleteFont: 'ลบ {0} ใช่ไหม ข้อความที่ใช้ฟอนต์นี้จะกลับเป็น Kanit ทุกหน้า',
            fontsHint: 'ฟอนต์ที่นำเข้าถูกเก็บไว้ใน Nuzka ไม่ต้องลงในเครื่อง ฟอนต์ที่ไม่มีภาษาไทย ชื่อภาษาไทยจะใช้ Kanit แทน',
            colours: 'สี', shared: 'ใช้ร่วมกับหน้าอื่นที่ใช้สีเดียวกัน',
            blue: 'ทีมน้ำเงิน', red: 'ทีมแดง', text: 'ตัวอักษร', accent: 'สีเน้น', label: 'ป้ายกำกับ',
            sizes: 'ขนาดตัวอักษรและโลโก้', typeTournament: 'ชื่อทัวร์นาเมนต์', typeTitle: 'ชื่อแมตช์', typeScore: 'คะแนน',
            typeTimer: 'นาฬิกา', typePlayer: 'ชื่อผู้เล่น', typeCaption: 'ป้ายกำกับ (BAN, เฟส, VS)', logoSize: 'ขนาดโลโก้',
            logoInset: 'ระยะโลโก้จากกึ่งกลาง', resetTheme: 'คืนสีและขนาดเดิม',
            resetThemeAsk: 'คืนสีและขนาดทั้งหมดกลับเป็นค่าเดิม ทุกหน้า ใช่ไหม',
            images: 'ภาพพื้นหลัง', useImages: 'ใช้ภาพชุดนี้', keepPanels: 'คงกรอบเดิมของแอพไว้',
            upload: 'อัปโหลด…', clear: 'ล้าง', hasImage: 'มีภาพแล้ว', noImage: 'ยังไม่มีภาพ',
            overlayBottom: 'แบนเนอร์', resultTop: 'ครึ่งบน (ทีมน้ำเงิน)', resultBottom: 'ครึ่งล่าง (ทีมแดง)',
            teamList: 'รายชื่อทีม', perSet: 'จำนวนทีมต่อชุด', style: 'รูปแบบ', sets: 'สลับชุด', scroll: 'เลื่อนวน',
            speed: 'ความเร็วเลื่อน (px/วินาที)', columns: 'จำนวนคอลัมน์', auto: 'อัตโนมัติ', cardColour: 'สีการ์ด',
            cardBg: 'สีพื้นการ์ด', radius: 'ความมนของมุม', autoText: 'ตัวหนังสือเข้มบนการ์ดสีอ่อน',
            failed: 'บันทึกไม่ได้: '
        }
    };

    const ROLES = ['heading', 'name', 'number', 'body'];

    /** @param {HTMLElement} box @param {{ scene: string, th: boolean }} ctx */
    function mount(box, ctx) {
        if (typeof socket === 'undefined') return;
        const T = ctx.th ? TEXT.th : TEXT.en;
        const page = PAGES[ctx.scene] || { colours: [] };
        const fmt = (s, v) => s.replace('{0}', v);
        /** @type {any} */
        let state = null;
        /** @type {{ id: string, name: string, family: string, thai: boolean | null, file: string }[]} */
        let imported = [];
        /** @type {{ family: string, thai: boolean }[]} */
        let installed = [];
        let fontScope = ctx.scene;
        /** @type {Record<string, ReturnType<typeof setTimeout>>} */
        const timers = {};
        const later = (key, fn, ms = 150) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };
        const emit = (event, payload) => socket.emit(event, payload);
        const updaters = [];

        const el = (tag, cls, text) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        const section = (title, hint) => {
            const sec = el('div', 'st-sec');
            sec.appendChild(el('h2', 'st-h', title));
            if (hint) sec.appendChild(el('p', 'st-hint', hint));
            box.appendChild(sec);
            return sec;
        };
        const row = (parent, label, control) => {
            const r = el('label', 'st-row');
            r.appendChild(el('span', 'st-label', label));
            r.appendChild(control);
            parent.appendChild(r);
            return r;
        };
        // ไม่เขียนทับช่องที่คนกำลังใช้อยู่ ค่าจาก stateUpdate จะมาถึงระหว่างลากแถบเลื่อน
        const idle = (node) => document.activeElement !== node;

        // ---- fonts
        const fonts = section(T.fonts, T.fontsHint);
        const scopeSel = el('select', 'st-input');
        [[ctx.scene, T.thisPage], ['all', T.allPages]].forEach(([value, text]) => {
            const o = el('option', '', text); o.value = value; scopeSel.appendChild(o);
        });
        scopeSel.addEventListener('change', () => { fontScope = scopeSel.value; refresh(); });
        row(fonts, T.scope, scopeSel);

        const roleSelects = ROLES.map((role) => {
            const sel = el('select', 'st-input');
            sel.addEventListener('change', () => emit('updateFont', { scene: fontScope, role, family: sel.value }));
            const r = row(fonts, T[role], sel);
            const note = el('span', 'st-note');
            r.appendChild(note);
            return { role, sel, note };
        });

        const lib = el('div', 'st-lib');
        fonts.appendChild(lib);
        const file = /** @type {HTMLInputElement} */ (el('input'));
        file.type = 'file';
        file.accept = '.ttf,.otf,.woff,.woff2';
        file.hidden = true;
        const importBtn = el('button', 'st-btn', T.importFont);
        importBtn.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
            const picked = file.files && file.files[0];
            file.value = '';
            if (!picked) return;
            importBtn.textContent = T.importing;
            try {
                const name = picked.name.replace(/\.[^.]+$/, '');
                const res = await fetch('/api/fonts?name=' + encodeURIComponent(name), { method: 'POST', body: picked });
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
                await loadFonts();
            } catch (error) {
                window.alert(T.failed + (error && error.message ? error.message : error));
            } finally {
                importBtn.textContent = T.importFont;
            }
        });
        fonts.append(importBtn, file);

        function fillFontOptions(sel, value) {
            sel.textContent = '';
            const add = (parent, family, text) => {
                const o = el('option', '', text); o.value = family; parent.appendChild(o);
            };
            add(sel, '', T.fontDefault);
            if (imported.length) {
                const g = el('optgroup'); g.label = T.imported;
                imported.forEach((f) => add(g, f.family, f.thai === false ? `${f.name} ${T.noThai}` : f.name));
                sel.appendChild(g);
            }
            if (installed.length) {
                const g = el('optgroup'); g.label = T.installed;
                installed.forEach((f) => add(g, f.family, f.thai ? f.family : `${f.family} ${T.noThai}`));
                sel.appendChild(g);
            }
            // ฟอนต์ที่ตั้งไว้แต่ไม่อยู่ในรายการ (เช่นเปิดตัวแก้จากเครื่องอื่น) ยังต้องขึ้นว่าตั้งอะไรไว้
            if (value && !Array.from(sel.options).some((o) => o.value === value)) add(sel, value, value);
            sel.value = value;
        }

        function displayName(family) {
            if (!family) return T.fontDefault;
            const f = imported.find((x) => x.family === family);
            return f ? f.name : family;
        }

        function renderLibrary() {
            lib.textContent = '';
            imported.forEach((f) => {
                const item = el('div', 'st-libitem');
                item.appendChild(el('span', 'st-libname', f.thai === false ? `${f.name} ${T.noThai}` : f.name));
                const del = el('button', 'st-btn small danger', T.del);
                del.addEventListener('click', async () => {
                    if (!window.confirm(fmt(T.deleteFont, f.name))) return;
                    await fetch('/api/fonts/' + encodeURIComponent(f.id), { method: 'DELETE' });
                    await loadFonts();
                });
                item.appendChild(del);
                lib.appendChild(item);
            });
        }

        async function loadFonts() {
            try {
                const [a, b] = await Promise.all([
                    fetch('/api/fonts').then((r) => r.json()),
                    fetch('/api/system-fonts').then((r) => r.json())
                ]);
                imported = a.fonts || [];
                installed = b.fonts || [];
            } catch { /* ออฟไลน์: เหลือตัวเลือกตามเดิม */ }
            renderLibrary();
            refresh();
        }

        updaters.push(() => {
            const all = (state && state.fonts && state.fonts.all) || {};
            const mine = (state && state.fonts && state.fonts.pages && state.fonts.pages[ctx.scene]) || {};
            roleSelects.forEach(({ role, sel, note }) => {
                const value = fontScope === 'all' ? (all[role] || '') : (mine[role] || '');
                if (idle(sel)) fillFontOptions(sel, value);
                note.textContent = fontScope !== 'all' && !value ? fmt(T.sameAsAll, displayName(all[role] || '')) : '';
            });
        });

        // ---- colours
        const colourInput = (key, sec, label) => {
            const pick = /** @type {HTMLInputElement} */ (el('input', 'st-colour'));
            pick.type = 'color';
            // ค่าต้องจับไว้ตอนเลือก ไม่ใช่ตอนตัวหน่วงเวลาทำงาน: ระหว่างนั้น stateUpdate อาจเขียนค่าเก่ากลับลงช่อง
            // แล้วสีที่ถูกส่งไปคือสีเดิม (เจอตอนทดสอบ 2026-09-30)
            pick.addEventListener('input', () => {
                const value = pick.value;
                later('c-' + key, () => emit('updateTheme', { [key]: value }));
            });
            const r = row(sec, label, pick);
            const hex = el('code', 'st-hex');
            r.appendChild(hex);
            updaters.push(() => {
                const value = state && state.theme && state.theme[key];
                if (typeof value === 'string') {
                    if (idle(pick)) pick.value = value;
                    hex.textContent = value;
                }
            });
        };
        if (page.colours.length) {
            const sec = section(T.colours, T.shared);
            page.colours.forEach((key) => colourInput(key, sec, T[key]));
        }

        // ---- sizes (the draft overlay only)
        const slider = (sec, label, min, max, read, send) => {
            const range = /** @type {HTMLInputElement} */ (el('input', 'st-range'));
            range.type = 'range';
            range.min = String(min);
            range.max = String(max);
            range.step = '1';
            const out = el('span', 'st-value');
            range.addEventListener('input', () => {
                out.textContent = range.value;
                const value = Number(range.value);   // จับไว้ตอนลาก เหตุผลเดียวกับช่องสี
                later('r-' + label, () => send(value), 120);
            });
            const r = row(sec, label, range);
            r.appendChild(out);
            updaters.push(() => {
                const value = read();
                if (typeof value === 'number' && idle(range)) {
                    range.value = String(value);
                    out.textContent = String(value);
                }
            });
        };
        if (page.sizes) {
            const sec = section(T.sizes);
            SIZES.forEach(([key, min, max]) => slider(sec, T[key], min, max,
                () => state && state.theme && state.theme[key], (n) => emit('updateTheme', { [key]: n })));
            const reset = el('button', 'st-btn danger', T.resetTheme);
            reset.addEventListener('click', () => { if (window.confirm(T.resetThemeAsk)) emit('resetTheme', {}); });
            sec.appendChild(reset);
        }

        // ---- background images
        if (page.images) {
            const sec = section(T.images);
            const toggle = (label, read, key) => {
                const box = /** @type {HTMLInputElement} */ (el('input'));
                box.type = 'checkbox';
                box.addEventListener('change', () => emit('updateSkinOptions', { [key]: box.checked }));
                row(sec, label, box).classList.add('st-check');
                updaters.push(() => { box.checked = Boolean(read()); });
            };
            toggle(T.useImages, () => state && state.skin && state.skin.enabled, 'enabled');
            toggle(T.keepPanels, () => !state || !state.skin || state.skin.showPanels !== false, 'showPanels');

            page.images.forEach((base) => ['1080', '1440'].forEach((size) => {
                const slot = base + size;
                const [w, h] = IMAGE_SIZES[slot];
                const r = el('div', 'st-image');
                const info = el('div', 'st-imageinfo');
                info.append(el('b', '', `${T[base]} · ${size}p`), el('span', 'st-hint', `${w} × ${h} px`));
                const status = el('span', 'st-hint');
                info.appendChild(status);
                const input = /** @type {HTMLInputElement} */ (el('input'));
                input.type = 'file';
                input.accept = 'image/png,image/jpeg,image/webp';
                input.hidden = true;
                input.addEventListener('change', async () => {
                    const picked = input.files && input.files[0];
                    input.value = '';
                    if (!picked) return;
                    const res = await fetch('/api/skin/' + slot, {
                        method: 'POST', headers: { 'content-type': picked.type || 'application/octet-stream' }, body: picked
                    });
                    if (!res.ok) window.alert(T.failed + ((await res.json().catch(() => ({}))).error || res.statusText));
                });
                const up = el('button', 'st-btn small', T.upload);
                up.addEventListener('click', () => input.click());
                const clear = el('button', 'st-btn small danger', T.clear);
                clear.addEventListener('click', () => fetch('/api/skin/' + slot, { method: 'DELETE' }));
                const buttons = el('div', 'st-buttons');
                buttons.append(up, clear, input);
                r.append(info, buttons);
                sec.appendChild(r);
                updaters.push(() => {
                    const has = Boolean(state && state.skin && state.skin.slots && state.skin.slots[slot]);
                    status.textContent = has ? T.hasImage : T.noImage;
                    clear.toggleAttribute('disabled', !has);
                });
            }));
        }

        // ---- team list
        if (page.teamList) {
            const sec = section(T.teamList);
            const number = (label, min, max, read, send) => {
                const input = /** @type {HTMLInputElement} */ (el('input', 'st-input short'));
                input.type = 'number';
                input.min = String(min);
                input.max = String(max);
                input.addEventListener('change', () => {
                    const n = Math.max(min, Math.min(max, Math.round(Number(input.value) || min)));
                    input.value = String(n);
                    send(n);
                });
                row(sec, label, input);
                updaters.push(() => { const v = read(); if (typeof v === 'number' && idle(input)) input.value = String(v); });
                return input;
            };
            number(T.perSet, 4, 64, () => state && state.teamListPerSet, (n) => emit('updateTeamListPerSet', { perSet: n }));

            const styleSel = el('select', 'st-input');
            [['sets', T.sets], ['scroll', T.scroll]].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; styleSel.appendChild(o); });
            styleSel.addEventListener('change', () => emit('updateTeamListStyle', { style: styleSel.value }));
            row(sec, T.style, styleSel);
            const speed = number(T.speed, 10, 200, () => state && state.teamListScrollSpeed,
                (n) => emit('updateTeamListScrollSpeed', { speed: n }));
            updaters.push(() => {
                const v = (state && state.teamListStyle) || 'sets';
                if (idle(styleSel)) styleSel.value = v;
                speed.disabled = v !== 'scroll';
            });

            const cols = el('select', 'st-input');
            [0, 1, 2, 3, 4, 5, 6].forEach((n) => { const o = el('option', '', n === 0 ? T.auto : String(n)); o.value = String(n); cols.appendChild(o); });
            cols.addEventListener('change', () => emit('updateTeamListColumns', { columns: Number(cols.value) }));
            row(sec, T.columns, cols);
            updaters.push(() => { if (idle(cols)) cols.value = String((state && state.teamListColumns) || 0); });

            colourInput('teamCard', sec, T.cardColour);
            colourInput('teamCardBg', sec, T.cardBg);
            slider(sec, T.radius, 0, 40, () => state && state.theme && state.theme.teamCardRadius,
                (n) => emit('updateTheme', { teamCardRadius: n }));

            const auto = /** @type {HTMLInputElement} */ (el('input'));
            auto.type = 'checkbox';
            auto.addEventListener('change', () => emit('updateTeamListAutoText', { autoText: auto.checked }));
            row(sec, T.autoText, auto).classList.add('st-check');
            updaters.push(() => { auto.checked = !state || state.teamListAutoText !== false; });
        }

        function refresh() { updaters.forEach((fn) => fn()); }

        socket.on('stateUpdate', (s) => { state = s; refresh(); });
        // ตัวแก้อาจเปิดหลัง stateUpdate แรกผ่านไปแล้ว อ่านครั้งเดียวไว้ก่อน ไม่งั้นแท็บว่างจนกว่าจะมีอะไรเปลี่ยน
        fetch('/api/state').then((r) => r.json()).then((s) => { if (!state) { state = s; refresh(); } }).catch(() => {});
        loadFonts();
        // แอพอาจส่งรายชื่อฟอนต์ในเครื่องมาหลังตัวแก้เปิดแล้ว หรือนำเข้าจากอีกแท็บ กลับมาที่แท็บนี้ก็โหลดใหม่
        window.addEventListener('focus', loadFonts);
    }

    window.RovStyleEditor = { mount };
})();
