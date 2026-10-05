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
        draft: { colours: ['blue', 'red', 'text', 'label'], sizes: true, images: ['overlayBottom'],
            text: ['tournament', 'title', 'names', 'tags', 'scores', 'players'] },
        teams: { colours: [], teamList: true },
        standings: { colours: ['accent', 'text', 'label'] },
        result: { colours: [], images: ['resultTop', 'resultBottom'], text: ['title', 'names', 'scores'] },
        analytics: { colours: [] },
        matchup: { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        prev: { colours: ['blue', 'red', 'accent', 'text', 'label'], text: ['tournament', 'names'] },
        'team-card': { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        'team-drafts': { colours: ['blue', 'red', 'accent', 'text', 'label'] },
        // ฉากคั่นรายการและชุดเดียวกัน (2026-10-01) อ่านสีจากธีมเดียวกับหน้าอื่น
        // own: true = สีแยกรายหน้า (state.broadcast.colours) ไม่ใช้ธีมของแอพร่วมกับหน้าอื่น
        scene: { colours: ['blue', 'red', 'accent', 'text'], own: true },
        vs: { colours: ['blue', 'red', 'accent', 'text'], own: true },
        'lower-third': { colours: ['accent', 'text'], own: true },
        scoreboard: { colours: ['blue', 'red', 'accent', 'text'], own: true }
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
            bgSec: 'Animated background', bgShow: 'Show the animated background',
            bgHint: 'Off, this page stays transparent, so whatever is under it in OBS shows through. The look settings below can apply to this page or to every page.',
            bgStyle: 'Style', bgPalette: 'Colours', bgQuality: 'Quality', bgSeed: 'New pattern',
            bgStyles: { aurora: 'Aurora', bokeh: 'Bokeh', synthgrid: 'Synth grid', speedlines: 'Speed lines', hexpulse: 'Hex pulse', waves: 'Waves' },
            bgThemePalette: 'App colours',
            fonts: 'Fonts', scope: 'Applies to', thisPage: 'This page', allPages: 'All pages',
            heading: 'Headings', name: 'Team and player names', number: 'Scores and timers', body: 'Everything else',
            fontDefault: 'Default (Kanit)', bundled: 'Included with Nuzka', imported: 'Imported', installed: 'Installed on this PC', noThai: '(no Thai)',
            sameAsAll: 'All pages: {0}', importFont: 'Import font…', importing: 'Importing…', del: 'Delete',
            deleteFont: 'Delete {0}? Text using it goes back to Kanit on every page.',
            fontsHint: 'Fonts imported here are saved in Nuzka, so they need no installing. A font without Thai letters shows Thai names in Kanit.',
            colours: 'Colours', shared: 'Shared with other pages that use the same colour.',
            ownHint: 'Only this page. Colours you have not changed follow the app colours.', followTheme: 'Use app colour', resetOwn: 'Reset this page\'s colours',
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
            failed: 'Could not save: ',
            texture: 'Texture', textureHint: 'A picture laid over this page\'s own background (the banner, cards or panels), under the text. Background images above replace the background instead; where one is on, the texture hides.',
            texOpacity: 'Strength (%)', texScale: 'Size (%)', texFit: 'Layout', texTile: 'Repeat (tile)', texFill: 'Stretch to fill',
            texBlend: 'Blend', blendNormal: 'Normal', blendOverlay: 'Overlay', blendSoft: 'Soft light', blendScreen: 'Screen (lighten)', blendMultiply: 'Multiply (darken)',
            textSec: 'Text', textHint: 'The same boxes as in Control. Changing either one changes both.',
            tournament: 'Tournament name', title: 'Match title', blueName: 'Blue team name', redName: 'Red team name',
            blueTag: 'Blue team tag', redTag: 'Red team tag', showTag: 'Show team tags',
            tagHint: 'A small tag on each logo, separate from the name; move it in the Layout tab. Tags come from the team list, and a team without one shows none.',
            blueScore: 'Blue score', redScore: 'Red score', bluePlayers: 'Blue players', redPlayers: 'Red players'
        },
        th: {
            bgSec: 'พื้นหลังเคลื่อนไหว', bgShow: 'แสดงพื้นหลังเคลื่อนไหว',
            bgHint: 'ปิดไว้หน้านี้จะโปร่งใส เห็นสิ่งที่อยู่ใต้มันใน OBS ส่วนค่าลักษณะด้านล่างจะใช้กับหน้านี้หรือทุกหน้าก็ได้',
            bgStyle: 'สไตล์', bgPalette: 'สี', bgQuality: 'คุณภาพ', bgSeed: 'สุ่มลายใหม่',
            bgStyles: { aurora: 'ออโรรา', bokeh: 'โบเก้', synthgrid: 'ตารางซินธ์', speedlines: 'เส้นความเร็ว', hexpulse: 'หกเหลี่ยมเต้น', waves: 'คลื่น' },
            bgThemePalette: 'สีของแอพ',
            fonts: 'ฟอนต์', scope: 'ใช้กับ', thisPage: 'หน้านี้', allPages: 'ทุกหน้า',
            heading: 'หัวเรื่อง', name: 'ชื่อทีมและชื่อผู้เล่น', number: 'คะแนนและเวลา', body: 'ข้อความอื่นทั้งหมด',
            fontDefault: 'ตามเดิม (Kanit)', bundled: 'มากับ Nuzka', imported: 'นำเข้า', installed: 'ลงไว้ในเครื่อง', noThai: '(ไม่มีภาษาไทย)',
            sameAsAll: 'ทุกหน้า: {0}', importFont: 'นำเข้าฟอนต์…', importing: 'กำลังนำเข้า…', del: 'ลบ',
            deleteFont: 'ลบ {0} ใช่ไหม ข้อความที่ใช้ฟอนต์นี้จะกลับเป็น Kanit ทุกหน้า',
            fontsHint: 'ฟอนต์ที่นำเข้าถูกเก็บไว้ใน Nuzka ไม่ต้องลงในเครื่อง ฟอนต์ที่ไม่มีภาษาไทย ชื่อภาษาไทยจะใช้ Kanit แทน',
            colours: 'สี', shared: 'ใช้ร่วมกับหน้าอื่นที่ใช้สีเดียวกัน',
            ownHint: 'เฉพาะหน้านี้ สีที่ยังไม่ได้เปลี่ยนจะตามสีของแอพ', followTheme: 'ใช้สีของแอพ', resetOwn: 'คืนสีของหน้านี้',
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
            failed: 'บันทึกไม่ได้: ',
            texture: 'พื้นผิว (texture)', textureHint: 'ภาพที่ปูทับพื้นเดิมของหน้านี้ (แบนเนอร์ การ์ด หรือกรอบ) อยู่ใต้ตัวหนังสือ ส่วนภาพพื้นหลังด้านบนคือแทนพื้นเดิมไปเลย ช่องที่ใช้ภาพพื้นหลังอยู่จะไม่ขึ้นพื้นผิว',
            texOpacity: 'ความเข้ม (%)', texScale: 'ขนาด (%)', texFit: 'การวาง', texTile: 'ปูซ้ำ', texFill: 'ยืดเต็มกรอบ',
            texBlend: 'โหมดผสม', blendNormal: 'ปกติ', blendOverlay: 'Overlay', blendSoft: 'Soft light', blendScreen: 'Screen (สว่างขึ้น)', blendMultiply: 'Multiply (เข้มขึ้น)',
            textSec: 'ข้อความ', textHint: 'ช่องเดียวกับในหน้า Control แก้ที่ไหนก็เปลี่ยนทั้งสองที่',
            tournament: 'ชื่อทัวร์นาเมนต์', title: 'ชื่อแมตช์', blueName: 'ชื่อทีมน้ำเงิน', redName: 'ชื่อทีมแดง',
            blueTag: 'แท็กทีมน้ำเงิน', redTag: 'แท็กทีมแดง', showTag: 'แสดงแท็กทีม',
            tagHint: 'ป้ายแท็กเล็กๆ ที่โลโก้ แยกจากชื่อ ย้ายได้ในแท็บตำแหน่ง แท็กมาจากรายชื่อทีม ทีมที่ไม่มีแท็กจะไม่ขึ้น',
            blueScore: 'คะแนนน้ำเงิน', redScore: 'คะแนนแดง', bluePlayers: 'ผู้เล่นทีมน้ำเงิน', redPlayers: 'ผู้เล่นทีมแดง'
        }
    };

    const ROLES = ['heading', 'name', 'number', 'body'];
    // ต้องตรงกับ BACKGROUND_STYLES / BACKGROUND_PALETTES ใน server/domain/broadcast.ts (เทสต์ตรวจ)
    const BG_STYLES = ['aurora', 'bokeh', 'synthgrid', 'speedlines', 'hexpulse', 'waves'];
    const BG_PALETTES = ['theme', 'neon-violet', 'cyber-teal', 'esports-red', 'royal-gold', 'deep-ocean', 'sunset-drive',
        'toxic-lime', 'ice', 'magma', 'corporate-blue', 'pink-candy', 'emerald'];
    // หน้าดราฟต์กับพิค/แบนเกมก่อนไม่มีพื้นหลังเคลื่อนไหว (ผู้ใช้ขอ 2026-10-05)
    const NO_BACKGROUND = ['draft', 'prev'];
    // ต้องตรงกับ @font-face ท้าย css/fonts.css (เทสต์ broadcast.test.ts ตรวจว่าไฟล์อยู่ครบ)
    const BUNDLED_FONTS = ['Oxanium', 'Rajdhani'];

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

        // ---- text (ผู้ใช้ขอ 2026-09-30: แก้ข้อความจากตัวแก้ได้ด้วย และยังคงช่องในหน้า Control ไว้)
        //
        // ส่ง event เดียวกับหน้า Control (updateMatchInfo, updateTeamName, updateScore, updatePlayerName)
        // สองที่จึงไม่มีทางเห็นค่าไม่ตรงกัน ช่องว่างถูกเซิร์ฟเวอร์ปฏิเสธและคงค่าเดิมไว้ เหมือนใน Control
        if (page.text) {
            const sec = section(T.textSec, T.textHint);
            const want = (key) => page.text.includes(key);
            const textBox = (parent, label, max, read, send) => {
                const input = /** @type {HTMLInputElement} */ (el('input', 'st-input'));
                input.type = 'text';
                input.maxLength = max;
                input.addEventListener('input', () => {
                    const value = input.value;   // จับไว้ตอนพิมพ์ เหตุผลเดียวกับช่องสี
                    if (value.trim()) later('t-' + label, () => send(value), 300);
                });
                // ลบจนว่างแล้วออกจากช่อง: คืนค่าที่ใช้อยู่ให้เห็น แทนที่จะค้างว่างทั้งที่จอยังแสดงชื่อเดิม
                input.addEventListener('blur', () => { if (!input.value.trim()) input.value = read() || ''; });
                if (label) row(parent, label, input);
                else parent.appendChild(input);
                updaters.push(() => { const v = read(); if (typeof v === 'string' && idle(input)) input.value = v; });
                return input;
            };
            const info = () => (state && state.matchInfo) || {};
            const matchInfo = (patch) => emit('updateMatchInfo', { title: info().title, tournament: info().tournament, ...patch });
            if (want('tournament')) textBox(sec, T.tournament, 50, () => info().tournament, (v) => matchInfo({ tournament: v }));
            if (want('title')) textBox(sec, T.title, 80, () => info().title, (v) => matchInfo({ title: v }));
            const sides = [['teamBlue', 'blue'], ['teamRed', 'red']];
            if (want('names')) sides.forEach(([team, c]) => textBox(sec, T[c + 'Name'], 24,
                () => state && state[team] && state[team].name, (name) => emit('updateTeamName', { team, name })));
            if (want('tags')) {
                const show = /** @type {HTMLInputElement} */ (el('input'));
                show.type = 'checkbox';
                show.addEventListener('change', () => emit('updateDraftShowTag', { enabled: show.checked }));
                row(sec, T.showTag, show).classList.add('st-check');
                updaters.push(() => { show.checked = Boolean(state && state.draftShowTag); });
                sides.forEach(([team, c]) => {
                    // แท็กว่างได้ จึงส่งทุกครั้ง ไม่ใช้ textBox ที่ข้ามค่าว่าง
                    const input = /** @type {HTMLInputElement} */ (el('input', 'st-input short'));
                    input.type = 'text';
                    input.maxLength = 6;
                    input.addEventListener('input', () => {
                        const tag = input.value;
                        later('tag-' + team, () => emit('updateTeamTag', { team, tag }), 300);
                    });
                    row(sec, T[c + 'Tag'], input);
                    updaters.push(() => {
                        const v = state && state[team] && state[team].tag;
                        if (idle(input)) input.value = typeof v === 'string' ? v : '';
                    });
                });
                sec.appendChild(el('p', 'st-hint', T.tagHint));
            }
            if (want('scores')) sides.forEach(([team, c]) => {
                const input = /** @type {HTMLInputElement} */ (el('input', 'st-input short'));
                input.type = 'number';
                input.min = '0';
                input.max = '99';
                input.addEventListener('change', () => {
                    const score = Math.max(0, Math.min(99, Math.round(Number(input.value) || 0)));
                    input.value = String(score);
                    emit('updateScore', { team, score });
                });
                row(sec, T[c + 'Score'], input);
                updaters.push(() => {
                    const v = state && state[team] && state[team].score;
                    if (typeof v === 'number' && idle(input)) input.value = String(v);
                });
            });
            if (want('players')) sides.forEach(([team, c]) => {
                const group = el('div', 'st-players');
                group.appendChild(el('span', 'st-label', T[c + 'Players']));
                for (let index = 0; index < 5; index++) {
                    textBox(group, '', 24, () => state && state[team] && state[team].players && state[team].players[index],
                        (name) => emit('updatePlayerName', { team, index, name }));
                }
                sec.appendChild(group);
            });
        }

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
            // ฟอนต์ที่แถมมากับแอพ (public/css/fonts.css) เลือกได้เลยโดยไม่ต้องลงในเครื่อง
            // เป็นลาตินล้วน ชื่อภาษาไทยจึงตกไปใช้ Kanit ตามสายเหมือนฟอนต์อื่นที่ไม่มีภาษาไทย
            const gb = el('optgroup'); gb.label = T.bundled;
            BUNDLED_FONTS.forEach((family) => add(gb, family, `${family} ${T.noThai}`));
            sel.appendChild(gb);
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

        // ---- animated background (2026-10-05)
        //
        // เปิด/ปิดเป็นรายหน้า (sceneBackgrounds[key].enabled) ปิด = โปร่งใส ส่วนลักษณะ (สไตล์ สี คุณภาพ ลาย) ตั้งให้หน้านี้
        // หรือทุกหน้าก็ได้ เหมือนฟอนต์ ฉากคั่นรายการ (Starting/BRB/Ending) แยกกันสามฉาก ตามที่เปิดด้วย ?scene=
        if (!NO_BACKGROUND.includes(ctx.scene)) {
            const asked = new URLSearchParams(location.search).get('scene');
            const bgKey = ctx.scene === 'scene' ? (['starting', 'brb', 'ending'].includes(asked || '') ? asked : 'starting') : ctx.scene;
            let bgScope = 'page';
            const bg = section(T.bgSec, T.bgHint);
            const bgOn = /** @type {HTMLInputElement} */ (el('input'));
            bgOn.type = 'checkbox';
            bgOn.addEventListener('change', () => emit('updateBackground', { scene: bgKey, enabled: bgOn.checked }));
            row(bg, T.bgShow, bgOn).classList.add('st-check');
            const bgScopeSel = /** @type {HTMLSelectElement} */ (el('select', 'st-input'));
            [['page', T.thisPage], ['all', T.allPages]].forEach(([value, label]) => {
                const o = el('option', '', label); o.value = value; bgScopeSel.appendChild(o);
            });
            bgScopeSel.addEventListener('change', () => { bgScope = bgScopeSel.value; refresh(); });
            row(bg, T.scope, bgScopeSel);
            // ค่าที่ส่ง: หน้านี้ใส่ scene ทุกหน้าไม่ใส่ (เซิร์ฟเวอร์แยกกันด้วยการมี scene)
            const sendLook = (patch) => emit('updateBackground', bgScope === 'page' ? { scene: bgKey, ...patch } : patch);
            const look = () => {
                const b = (state && state.broadcast) || {};
                const own = (b.sceneBackgrounds && b.sceneBackgrounds[bgKey]) || {};
                return bgScope === 'all' ? (b.background || {}) : Object.assign({}, b.background, own);
            };
            const bgSelect = (label, options, key) => {
                const sel = /** @type {HTMLSelectElement} */ (el('select', 'st-input'));
                options.forEach(([value, text]) => { const o = el('option', '', text); o.value = value; sel.appendChild(o); });
                sel.addEventListener('change', () => sendLook({ [key]: sel.value }));
                row(bg, label, sel);
                updaters.push(() => { const v = look()[key]; if (v !== undefined && idle(sel)) sel.value = String(v); });
            };
            bgSelect(T.bgStyle, BG_STYLES.map((n) => [n, T.bgStyles[n]]), 'style');
            bgSelect(T.bgPalette, BG_PALETTES.map((n) => [n, n === 'theme' ? T.bgThemePalette : n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())]), 'palette');
            const quality = /** @type {HTMLInputElement} */ (el('input', 'st-range'));
            quality.type = 'range'; quality.min = '25'; quality.max = '100'; quality.step = '5';
            const qualityOut = el('span', 'st-value');
            quality.addEventListener('input', () => {
                qualityOut.textContent = quality.value + '%';
                const q = Number(quality.value) / 100;
                later('bg-q', () => sendLook({ quality: q }), 200);
            });
            row(bg, T.bgQuality, quality).appendChild(qualityOut);
            updaters.push(() => {
                const q = look().quality;
                if (typeof q === 'number' && idle(quality)) { quality.value = String(Math.round(q * 100)); qualityOut.textContent = quality.value + '%'; }
            });
            const reroll = el('button', 'st-btn', T.bgSeed);
            reroll.addEventListener('click', () => sendLook({ seed: Math.floor(Math.random() * 999999) }));
            bg.appendChild(reroll);
            updaters.push(() => {
                const b = (state && state.broadcast) || {};
                const own = (b.sceneBackgrounds && b.sceneBackgrounds[bgKey]) || {};
                // ตรงกับ BACKGROUND_ON_BY_DEFAULT ฝั่งเซิร์ฟเวอร์
                const on = typeof own.enabled === 'boolean' ? own.enabled : ['starting', 'brb', 'ending', 'vs'].includes(bgKey);
                if (idle(bgOn)) bgOn.checked = on;
            });
        }

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
        // สีแยกรายหน้า (หน้าใหม่ทั้งสี่): เขียน/ล้างที่ state.broadcast.colours[scene] ไม่ยุ่งกับธีมของแอพ
        // ช่องแสดงสีที่ใช้จริง (ของหน้าถ้าตั้งไว้ ไม่งั้นสีธีม) และปุ่ม × คืนสีนั้นให้ตามธีม
        const ownColourInput = (key, sec, label) => {
            const pick = /** @type {HTMLInputElement} */ (el('input', 'st-colour'));
            pick.type = 'color';
            // จับค่าตอนเลือก ไม่ใช่ตอนตัวหน่วงทำงาน เหตุผลเดียวกับ colourInput ด้านบน
            pick.addEventListener('input', () => {
                const value = pick.value;
                later('oc-' + key, () => emit('updateBroadcastColour', { scene: ctx.scene, key, value }));
            });
            const r = row(sec, label, pick);
            const hex = el('code', 'st-hex');
            const clear = el('button', 'st-btn small', '\u00d7');
            clear.title = T.followTheme;
            clear.addEventListener('click', () => emit('updateBroadcastColour', { scene: ctx.scene, key, value: '' }));
            // แถวเป็นกริดสามช่อง (ป้าย ตัวเลือก ท้ายแถว) จึงรวมรหัสสีกับปุ่ม × ไว้ในช่องท้ายช่องเดียว
            const tail = el('span', 'st-tail');
            tail.style.cssText = 'display:flex;align-items:center;gap:6px';
            tail.append(hex, clear);
            r.appendChild(tail);
            updaters.push(() => {
                const mine = state && state.broadcast && state.broadcast.colours && state.broadcast.colours[ctx.scene];
                const own = mine && mine[key];
                const value = own || (state && state.theme && state.theme[key]);
                if (typeof value === 'string') {
                    if (idle(pick)) pick.value = value;
                    hex.textContent = own ? value : value + ' \u00b7 ' + T.followTheme.toLowerCase();
                }
                clear.hidden = !own;
            });
        };
        if (page.colours.length && page.own) {
            const sec = section(T.colours, T.ownHint);
            page.colours.forEach((key) => ownColourInput(key, sec, T[key]));
            const resetOwn = el('button', 'st-btn danger', T.resetOwn);
            resetOwn.addEventListener('click', () => emit('resetBroadcastColours', { scene: ctx.scene }));
            sec.appendChild(resetOwn);
        } else if (page.colours.length) {
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

        // ---- texture (ผู้ใช้ขอ 2026-09-30) ทุกหน้ามี ภาพอยู่ในช่อง skin ชื่อ texture<Scene>
        // ค่าวิธีปูไปที่ updateTexture ของหน้านี้เท่านั้น overlay-size.js เป็นคนปูจริง
        // หน้าใหม่สี่หน้า (own) ไม่มีช่อง texture ในเซิร์ฟเวอร์ (TEXTURE_SCENES) จึงไม่แสดงช่องที่ใช้ไม่ได้
        if (!page.own) {
            const slot = 'texture' + ctx.scene.replace(/(^|-)([a-z])/g, (_m, _d, c) => c.toUpperCase());
            const sec = section(T.texture, T.textureHint);
            const tex = () => (state && state.textures && state.textures[ctx.scene]) || {};
            const sendTex = (patch) => emit('updateTexture', { scene: ctx.scene, ...patch });

            const r = el('div', 'st-image');
            const status = el('span', 'st-hint');
            const info = el('div', 'st-imageinfo');
            info.append(el('b', '', T.texture), status);
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

            slider(sec, T.texOpacity, 0, 100, () => Math.round((typeof tex().opacity === 'number' ? tex().opacity : 0.35) * 100),
                (n) => sendTex({ opacity: n / 100 }));
            slider(sec, T.texScale, 10, 400, () => (typeof tex().scale === 'number' ? tex().scale : 100),
                (n) => sendTex({ scale: n }));
            const select = (label, options, read, key) => {
                const sel = el('select', 'st-input');
                options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.appendChild(o); });
                sel.addEventListener('change', () => sendTex({ [key]: sel.value }));
                row(sec, label, sel);
                updaters.push(() => { if (idle(sel)) sel.value = read(); });
            };
            select(T.texFit, [['tile', T.texTile], ['fill', T.texFill]], () => tex().fit || 'tile', 'fit');
            select(T.texBlend, [['normal', T.blendNormal], ['overlay', T.blendOverlay], ['soft-light', T.blendSoft],
                ['screen', T.blendScreen], ['multiply', T.blendMultiply]], () => tex().blend || 'normal', 'blend');
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

    // The same font lists for the Text section of the layout tab (a single part's own font).
    async function fontLists() {
        let imported = [];
        let installed = [];
        try {
            const [a, b] = await Promise.all([
                fetch('/api/fonts').then((r) => r.json()),
                fetch('/api/system-fonts').then((r) => r.json())
            ]);
            imported = a.fonts || [];
            installed = b.fonts || [];
        } catch { /* offline: the bundled fonts still work */ }
        return { bundled: BUNDLED_FONTS, imported, installed };
    }

    window.RovStyleEditor = { mount, fontLists };
})();
