// Moved, resized and hidden parts of an overlay, and the editor that moves them.
//
// A page opts in with <body data-layout-scene="draft"> and a data-layout="name" on every
// part that may move. Parts nest: moving a group moves everything in it, and a part inside
// it can still be moved on its own. The offsets live in state.layout[scene] on the server
// (server/domain/layout.ts), so OBS follows every change at once.
//
// Offsets use the CSS `translate` and `scale` properties, not `transform`: those compose
// with the transforms and animations the page already has (the banner's slide, the pick
// entrance) instead of overwriting them. They need Chromium 104, which OBS 31 has.
//
// Pages that build their contents in script (team cards, table rows, columns) mark the
// container with data-layout-items: its children are named here as they appear, "team"
// giving team-1, team-2, ... by position, or a list ("blue-column red-column") naming each.
// A moved "team 3" is the third card, whoever is in it.
//
// Open the page with ?edit=1 (the app's Design screen does) for the editor. Without it the
// page only applies the layout, and nothing here reacts to the mouse.
(function () {
    const body = document.body;
    const scene = body.dataset.layoutScene;
    if (!scene || typeof socket === 'undefined') return;

    // Boards that shrink themselves to fit the screen measure where their cards are. A card
    // the operator moved down would read as overflow and shrink the whole board, so the
    // measuring runs with every part back where it was designed. It is synchronous, so
    // nothing is painted in between; transitions are off meanwhile, or the slots with
    // "transition: all" would animate away and back.
    window.RovLayout = {
        measuring: false,
        asDesigned(fn) {
            const moved = Array.from(document.querySelectorAll('[data-layout]'))
                .map((el) => /** @type {HTMLElement} */ (el))
                .filter((el) => el.style.translate || el.style.scale)
                .map((el) => ({ el, translate: el.style.translate, scale: el.style.scale }));
            const html = document.documentElement;
            const settling = html.hasAttribute('data-layout-settling');
            html.setAttribute('data-layout-settling', '');
            moved.forEach(({ el }) => { el.style.translate = ''; el.style.scale = ''; });
            this.measuring = true;
            try {
                return fn();
            } finally {
                this.measuring = false;
                moved.forEach(({ el, translate, scale }) => { el.style.translate = translate; el.style.scale = scale; });
                void html.offsetWidth;   // settle the restored values while transitions are still off
                if (!settling) html.removeAttribute('data-layout-settling');
            }
        }
    };

    const params = new URLSearchParams(location.search);
    const editing = params.get('edit') === '1';
    const th = params.get('lang') === 'th';

    let layout = {};           // this scene's entries, as the server last sent them
    let dragKey = null;        // the part under the mouse right now; the server's echo waits

    /** @type {() => HTMLElement[]} */
    const parts = () => Array.from(document.querySelectorAll('[data-layout]'));
    /** @type {(key: string) => HTMLElement | null} */
    const partByKey = (key) => document.querySelector(`[data-layout="${key}"]`);
    const entryOf = (key) => ({ x: 0, y: 0, s: 1, h: false, ...(layout[key] || {}) });
    const isDefault = (e) => e.x === 0 && e.y === 0 && e.s === 1 && !e.h;

    function applyPart(el, entry) {
        el.style.translate = entry.x || entry.y ? `${entry.x}px ${entry.y}px` : '';
        el.style.scale = entry.s !== 1 ? String(entry.s) : '';
        el.toggleAttribute('data-layout-hidden', entry.h);
    }

    function nameItems() {
        document.querySelectorAll('[data-layout-items]').forEach((box) => {
            const names = (box.getAttribute('data-layout-items') || '').split(/\s+/).filter(Boolean);
            Array.from(box.children).slice(0, 60).forEach((child, i) => {
                const name = names.length > 1 ? names[i] : `${names[0]}-${i + 1}`;
                if (name && child.getAttribute('data-layout') !== name) child.setAttribute('data-layout', name);
            });
        });
    }

    // Anything that clips its contents (the draft banner does, to keep its light sweep
    // inside the frame; some boards clip at the stage) would cut off a part dragged out of
    // it. It lets its contents out only while one of them actually is out. The banner's
    // sweep pauses then, because unclipped it would slide past the banner's ends.
    // Found from the parts' ancestors each time, since boards build their parts late; one
    // already let out is known by its attribute, as its computed overflow no longer says.
    function clippers() {
        const found = new Set();
        parts().forEach((el) => {
            for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
                if (found.has(p)) continue;
                if (p.hasAttribute('data-layout-overflow') || getComputedStyle(p).overflow !== 'visible') found.add(p);
            }
        });
        return found;
    }

    function releaseClipped() {
        clippers().forEach((group) => {
            const box = group.getBoundingClientRect();
            const out = Array.from(group.querySelectorAll('[data-layout]')).some((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.left < box.left - 1 || r.top < box.top - 1
                    || r.right > box.right + 1 || r.bottom > box.bottom + 1);
            });
            group.toggleAttribute('data-layout-overflow', out);
        });
        // The watermark picks a free corner; tell it things have moved (overlay-size.js).
        window.dispatchEvent(new Event('rov-layout'));
    }

    function applyAll() {
        nameItems();
        parts().forEach((el) => {
            const key = el.dataset.layout;
            if (key !== dragKey) applyPart(el, entryOf(key));
        });
        releaseClipped();
        // Parts with a transition (pick and ban slots) are only where they end up once it has run.
        setTimeout(releaseClipped, 400);
        if (editing) refreshPanel();
    }

    const style = document.createElement('style');
    style.textContent = `
        [data-layout-hidden] { visibility: hidden !important; }
        [data-layout-settling] [data-layout] { transition: none !important; }
        [data-layout-overflow] { overflow: visible !important; }
        .pick-section[data-layout-overflow]::before, .pick-section[data-layout-overflow]::after { visibility: hidden !important; }`;
    document.head.appendChild(style);

    // The first layout a page gets is where things are, not a move: without this, every
    // refresh of the OBS source slid the moved slots in from their old places (the slots
    // have a transition). A timer, not requestAnimationFrame: OBS may not paint a hidden source.
    let first = true;
    socket.on('stateUpdate', (state) => {
        const next = state && state.layout && state.layout[scene];
        layout = next && typeof next === 'object' ? next : {};
        if (first) document.documentElement.setAttribute('data-layout-settling', '');
        applyAll();
        if (first) {
            first = false;
            setTimeout(() => document.documentElement.removeAttribute('data-layout-settling'), 100);
        }
    });

    // The 400 ms re-check above assumes the transition runs on time. A page nobody is
    // looking at (a background tab; OBS may throttle a source that is not showing) runs it
    // late, so check again whenever a part's move actually finishes.
    document.addEventListener('transitionend', (ev) => {
        const el = /** @type {HTMLElement} */ (ev.target);
        if ((ev.propertyName === 'translate' || ev.propertyName === 'scale') && el.hasAttribute('data-layout')) releaseClipped();
    });

    // A board rebuilt its rows, or a new card appeared: name and place them before they are
    // painted (observer callbacks run before the next frame), so nothing flashes in its old spot.
    new MutationObserver((records) => {
        const relevant = records.some((r) => (r.target instanceof HTMLElement && r.target.hasAttribute('data-layout-items'))
            || Array.from(r.addedNodes).some((n) => n instanceof HTMLElement
                && (n.matches('[data-layout], [data-layout-items]') || !!n.querySelector('[data-layout], [data-layout-items]'))));
        if (relevant) applyAll();
    }).observe(body, { childList: true, subtree: true });

    if (!editing) return;

    // ------------------------------------------------------------------ editor

    const T = th ? {
        title: 'จัดตำแหน่ง overlay', scene: {
            draft: 'หน้าดราฟต์', result: 'หน้าผลดราฟต์', teams: 'รายชื่อทีม', analytics: 'กระดานสถิติ',
            standings: 'ตารางคะแนน', matchup: 'เจอกันมาก่อน', 'team-drafts': 'พิค/แบนของทีม',
            'team-card': 'การ์ดทีม', prev: 'พิค/แบนเกมก่อน'
        },
        help: 'ลากเพื่อย้าย คลิกเลือกชิ้นเล็กสุดที่อยู่ใต้เมาส์ กด "เลือกทั้งกลุ่ม" หรือ Alt+คลิก เพื่อเลือกกลุ่มที่ครอบอยู่ ปุ่มลูกศรขยับทีละ 1 px (Shift = 10 px) ลากกลับใกล้ที่เดิมจะดูดเข้าที่เดิมเอง',
        none: 'ยังไม่ได้เลือก คลิกชิ้นส่วนบน overlay หรือในรายการด้านล่าง',
        size: 'ขนาด %', parent: 'เลือกทั้งกลุ่ม', hide: 'ซ่อน', show: 'แสดง', reset: 'คืนที่เดิม',
        parts: 'ชิ้นส่วน', resetAll: 'คืนค่าเดิมทั้งหน้า', undo: 'ย้อนกลับ (Ctrl+Z)',
        confirmReset: 'คืนทุกชิ้นส่วนของหน้านี้กลับตำแหน่งเดิมใช่ไหม',
        saved: 'บันทึกทันทีทุกครั้งที่ย้าย OBS เปลี่ยนตามเลย ปิดแท็บนี้ได้เมื่อเสร็จ',
        offline: 'ต่อเซิร์ฟเวอร์ไม่ได้ ตอนนี้ยังไม่ได้บันทึก เปิด Nuzka ไว้แล้วลองใหม่',
        refused: 'เซิร์ฟเวอร์ไม่รับการแก้ไข: ', notShown: 'ตอนนี้ไม่แสดง', moved: 'ย้ายแล้ว'
    } : {
        title: 'Edit overlay layout', scene: {
            draft: 'Draft overlay', result: 'Result', teams: 'Team list', analytics: 'Stats board',
            standings: 'Standings', matchup: 'Head to head', 'team-drafts': 'Team picks & bans',
            'team-card': 'Team card', prev: 'Previous picks & bans'
        },
        help: 'Drag to move. A click picks the smallest part under the mouse; "Select group" or Alt+click picks the group around it. Arrow keys move 1 px (Shift: 10 px). Dragging back near the original spot snaps into it.',
        none: 'Nothing selected. Click a part on the overlay or in the list below.',
        size: 'Size %', parent: 'Select group', hide: 'Hide', show: 'Show', reset: 'Reset',
        parts: 'Parts', resetAll: 'Reset whole overlay', undo: 'Undo (Ctrl+Z)',
        confirmReset: 'Put every part of this overlay back where it was?',
        saved: 'Every move is saved at once and shows in OBS right away. Close this tab when you are done.',
        offline: 'Not connected to Nuzka, so nothing is being saved. Keep the app open and try again.',
        refused: 'The server refused the change: ', notShown: 'not showing now', moved: 'moved'
    };

    const NAMES = th ? {
        banner: 'แบนเนอร์ทั้งแถบ', center: 'กล่องกลาง', tournament: 'ชื่อทัวร์นาเมนต์', score: 'แถวคะแนน',
        'score-numbers': 'ตัวเลขคะแนน', timer: 'เวลา', 'match-title': 'ชื่อแมตช์',
        divider: 'เส้นแบ่งกลาง', header: 'หัวข้อ (ชื่อ + คำอธิบาย)', title: 'ชื่อหัวข้อ', subtitle: 'คำอธิบายใต้หัวข้อ',
        note: 'ข้อความแจ้ง (ตอนไม่มีข้อมูล)', grid: 'การ์ดทีมทั้งหมด', board: 'ตารางทั้งหมด', summary: 'ตัวเลขสรุป',
        groups: 'ตารางทุกกลุ่ม', scope: 'ขอบเขตข้อมูล', columns: 'คอลัมน์ทั้งหมด', games: 'ทุกเกม',
        logo: 'โลโก้', 'side-label': 'ป้ายฝั่ง', name: 'ชื่อทีม', tiles: 'ช่องตัวเลขทั้งหมด',
        'heroes-column': 'คอลัมน์ฮีโร่', 'players-column': 'คอลัมน์ผู้เล่น',
        'game-tag': 'ป้ายเกมที่เท่าไหร่', meetings: 'ซีรีส์ที่เคยเจอกัน'
    } : {
        banner: 'Whole banner', center: 'Centre block', tournament: 'Tournament name', score: 'Score row',
        'score-numbers': 'Score numbers', timer: 'Timer', 'match-title': 'Match title',
        divider: 'Centre divider', header: 'Heading (title + subtitle)', title: 'Title', subtitle: 'Subtitle',
        note: 'Message (when there is no data)', grid: 'All team cards', board: 'Whole table', summary: 'Summary figures',
        groups: 'All groups', scope: 'Data range', columns: 'Both columns', games: 'All games',
        logo: 'Logo', 'side-label': 'Side label', name: 'Team name', tiles: 'All number tiles',
        'heroes-column': 'Heroes column', 'players-column': 'Players column',
        'game-tag': 'Game number tag', meetings: 'Previous meetings'
    };

    const ITEMS = th
        ? { team: 'การ์ดทีม', row: 'แถว', group: 'กลุ่ม', tile: 'ช่องตัวเลข', game: 'เกม' }
        : { team: 'Team card', row: 'Row', group: 'Group', tile: 'Tile', game: 'Game' };

    function nameOf(key) {
        if (NAMES[key]) return NAMES[key];
        const item = /^(team|row|group|tile|game)-(\d+)$/.exec(key);
        if (item) return `${ITEMS[item[1]]} ${item[2]}`;
        const m = /^(blue|red)-(.+?)(?:-(\d+))?$/.exec(key);
        if (!m) return key;
        const side = th ? (m[1] === 'blue' ? 'น้ำเงิน' : 'แดง') : (m[1] === 'blue' ? 'Blue' : 'Red');
        const n = m[3] ? ' ' + m[3] : '';
        const what = th ? {
            bans: `แบนฝั่ง${side}`, ban: `แบน${side}${n}`, 'ban-label': `ป้าย BAN ฝั่ง${side}`,
            picks: `พิคฝั่ง${side}`, pick: `พิค${side}${n}`, team: `ทีม${side}`, half: `ครึ่งฝั่ง${side}`,
            header: `หัวฝั่ง${side} (ชื่อ + แบน)`, column: `คอลัมน์ฝั่ง${side}`, score: `คะแนนซีรีส์ฝั่ง${side}`,
            logo: `โลโก้ทีม${side}`, name: `ชื่อทีม${side}`, tag: `แท็กทีม${side}`
        } : {
            bans: `${side} bans`, ban: `${side} ban${n}`, 'ban-label': `${side} "BAN" label`,
            picks: `${side} picks`, pick: `${side} pick${n}`, team: `${side} team`, half: `${side} half`,
            header: `${side} header (name + bans)`, column: `${side} column`, score: `${side} series score`,
            logo: `${side} logo`, name: `${side} team name`, tag: `${side} team tag`
        };
        return what[m[2]] || key;
    }

    // The editor's own chrome lives on <html>, outside <body>, so fitting the stage to
    // the window (a transform on <body>) does not shrink it.
    const PANEL_W = 360;
    document.documentElement.classList.add('layout-editing');
    style.textContent += `
        html.layout-editing { overflow: hidden; background: #2b2f36
            repeating-conic-gradient(#30353d 0 25%, #2b2f36 0 50%) 0 0 / 32px 32px; }
        html.layout-editing body { transform-origin: 0 0; box-shadow: 0 0 0 1px #ffffff33; }
        html.layout-editing [data-layout-hidden] { visibility: visible !important; opacity: 0.25; }
        html.layout-editing body.overlay-hidden .pick-section { transform: none !important; }
        html.layout-editing [data-layout].layout-dragging { transition: none !important; }
        .le-box { position: fixed; pointer-events: none; z-index: 2147483000; border-radius: 3px; }
        .le-hover { outline: 1px dashed #ffffffaa; }
        .le-sel { outline: 2px solid #3da5ff; box-shadow: 0 0 0 4px #3da5ff33; }
        .le-sel > span { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; white-space: nowrap;
            background: #3da5ff; color: #fff; font: 600 12px 'Segoe UI', Kanit, sans-serif; padding: 2px 6px; border-radius: 3px; }
        #layout-editor { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W}px; z-index: 2147483001;
            background: #16191e; color: #e6e9ef; font: 13px/1.45 'Segoe UI', Kanit, sans-serif;
            display: flex; flex-direction: column; border-left: 1px solid #2c323b; }
        #layout-editor * { box-sizing: border-box; font: inherit; color: inherit; }
        #layout-editor h1 { font-size: 16px; font-weight: 700; margin: 0; }
        #layout-editor .le-sec { padding: 14px 16px; border-bottom: 1px solid #2c323b; }
        #layout-editor .le-muted { color: #9aa3b2; font-size: 12px; margin: 6px 0 0; }
        #layout-editor .le-status { font-size: 12px; margin: 8px 0 0; padding: 6px 8px; border-radius: 4px; background: #1f2a37; }
        #layout-editor .le-status.bad { background: #4a1d22; color: #ffb4b4; }
        #layout-editor .le-selname { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
        #layout-editor .le-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        #layout-editor label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #9aa3b2; }
        #layout-editor input { width: 100%; background: #0f1216; border: 1px solid #353c47; border-radius: 4px;
            padding: 5px 6px; color: #e6e9ef; font-size: 13px; }
        #layout-editor .le-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        #layout-editor button { background: #262c35; border: 1px solid #3a424e; border-radius: 4px; padding: 5px 10px;
            cursor: pointer; font-size: 12px; }
        #layout-editor button:hover:not(:disabled) { background: #313946; }
        #layout-editor button:disabled { opacity: 0.4; cursor: default; }
        #layout-editor button.danger { border-color: #6b2a31; color: #ffb4b4; }
        #layout-editor .le-list { flex: 1; overflow: auto; padding: 6px 8px 12px; }
        #layout-editor .le-item { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-radius: 4px; cursor: pointer; }
        #layout-editor .le-item:hover { background: #20262e; }
        #layout-editor .le-item.sel { background: #1c3550; }
        #layout-editor .le-item .le-n { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #layout-editor .le-item.off .le-n { opacity: 0.45; text-decoration: line-through; }
        #layout-editor .le-item .le-tag { font-size: 10px; color: #3da5ff; }
        #layout-editor .le-item .le-eye { padding: 0 6px; font-size: 11px; background: none; border: none; color: #9aa3b2; }
        #layout-editor .le-foot { padding: 12px 16px; border-top: 1px solid #2c323b; display: flex; gap: 6px; flex-wrap: wrap; }
        #layout-editor .le-tabs { display: flex; gap: 4px; padding: 10px 16px 0; border-bottom: 1px solid #2c323b; }
        #layout-editor .le-tabs button { border: none; border-bottom: 2px solid transparent; border-radius: 0; background: none;
            padding: 8px 12px; font-size: 13px; font-weight: 600; color: #9aa3b2; }
        #layout-editor .le-tabs button.on { color: #e6e9ef; border-bottom-color: #3da5ff; }
        #layout-editor .le-pane { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        #layout-editor .le-pane[hidden] { display: none; }
        #layout-editor .le-style { flex: 1; overflow: auto; padding-bottom: 16px; }
        #layout-editor .st-sec { padding: 14px 16px; border-bottom: 1px solid #2c323b; }
        #layout-editor .st-h { font-size: 14px; font-weight: 700; margin: 0 0 6px; }
        #layout-editor .st-hint { color: #9aa3b2; font-size: 11.5px; margin: 0 0 8px; display: block; }
        #layout-editor .st-row { display: grid; grid-template-columns: 118px 1fr auto; align-items: center; gap: 8px;
            margin: 6px 0; font-size: 12px; color: #c9ced8; }
        #layout-editor .st-row.st-check { display: flex; flex-direction: row; justify-content: flex-start; align-items: center; gap: 8px; text-align: left; }
        #layout-editor .st-row.st-check input { order: 0; margin: 0; width: auto; flex: 0 0 auto; } #layout-editor .st-row.st-check .st-label { order: 1; }
        #layout-editor .st-note { grid-column: 2 / 4; color: #9aa3b2; font-size: 11px; margin-top: -2px; }
        #layout-editor .st-note:empty { display: none; }
        #layout-editor select.st-input, #layout-editor input.st-input { width: 100%; background: #0f1216; border: 1px solid #353c47;
            border-radius: 4px; padding: 5px 6px; color: #e6e9ef; font-size: 12.5px; min-width: 0; }
        #layout-editor input.st-input.short { width: 90px; }
        #layout-editor .st-players { display: grid; gap: 4px; margin: 6px 0 8px; }
        #layout-editor .st-colour { width: 44px; height: 26px; padding: 0; border: 1px solid #353c47; border-radius: 4px; background: none; }
        #layout-editor .st-hex { font-family: Consolas, monospace; font-size: 11.5px; color: #9aa3b2; }
        #layout-editor .st-range { width: 100%; padding: 0; border: none; background: none; }
        #layout-editor .st-value { min-width: 32px; text-align: right; font-size: 11.5px; color: #9aa3b2; }
        #layout-editor .st-btn { margin-top: 8px; }
        #layout-editor .st-btn.small { margin-top: 0; padding: 3px 8px; font-size: 11.5px; }
        #layout-editor .st-lib { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        #layout-editor .st-libitem { display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 4px 8px; background: #1b2027; border-radius: 4px; font-size: 12px; }
        #layout-editor .st-libname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #layout-editor .st-image { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0;
            padding: 8px; background: #1b2027; border-radius: 4px; font-size: 12px; }
        #layout-editor .st-imageinfo { display: flex; flex-direction: column; gap: 1px; }
        #layout-editor .st-imageinfo .st-hint { margin: 0; }
        #layout-editor .st-buttons { display: flex; gap: 6px; }
    `;

    const hoverBox = Object.assign(document.createElement('div'), { className: 'le-box le-hover' });
    const selBox = Object.assign(document.createElement('div'), { className: 'le-box le-sel' });
    selBox.appendChild(document.createElement('span'));
    const panel = document.createElement('div');
    panel.id = 'layout-editor';
    panel.innerHTML = `
        <div class="le-sec">
            <h1></h1>
            <p class="le-muted" data-help></p>
            <p class="le-status" data-status></p>
        </div>
        <div class="le-tabs">
            <button data-tab="layout" class="on"></button>
            <button data-tab="style"></button>
        </div>
        <div class="le-pane" data-pane="layout">
        <div class="le-sec">
            <div class="le-selname" data-selname></div>
            <div class="le-grid">
                <label>X <input type="number" data-f="x" step="1"></label>
                <label>Y <input type="number" data-f="y" step="1"></label>
                <label><span data-sizelabel></span><input type="number" data-f="s" step="5" min="20" max="400"></label>
            </div>
            <div class="le-row">
                <button data-a="parent"></button>
                <button data-a="hide"></button>
                <button data-a="reset"></button>
            </div>
        </div>
        <div class="le-sec" style="padding-bottom:6px"><b data-partstitle></b></div>
        <div class="le-list" data-list></div>
        <div class="le-foot">
            <button data-a="undo"></button>
            <button data-a="resetAll" class="danger"></button>
        </div>
        </div>
        <div class="le-pane" data-pane="style" hidden><div class="le-style" data-style></div></div>`;
    document.documentElement.append(hoverBox, selBox, panel);

    const $ = (sel) => panel.querySelector(sel);
    $('h1').textContent = `${T.title} · ${T.scene[scene] || scene}`;
    $('[data-help]').textContent = T.help;
    $('[data-sizelabel]').textContent = T.size;
    $('[data-partstitle]').textContent = T.parts;
    $('[data-a="parent"]').textContent = T.parent;
    $('[data-a="reset"]').textContent = T.reset;
    $('[data-a="undo"]').textContent = T.undo;
    $('[data-a="resetAll"]').textContent = T.resetAll;

    let selected = null;       // key
    let hovered = null;        // element
    const undoStack = [];      // { key, entry } or { all: {...} }
    let lastNudge = { key: null, at: 0 };

    function setStatus(text, bad) {
        const el = $('[data-status]');
        el.textContent = text;
        el.classList.toggle('bad', !!bad);
    }
    setStatus(socket.connected ? T.saved : T.offline, !socket.connected);
    socket.on('connect', () => setStatus(T.saved, false));
    socket.on('disconnect', () => setStatus(T.offline, true));
    socket.on('controlError', (e) => setStatus(T.refused + ((e && e.message) || ''), true));

    // Fit the 1920x1080 (or 2560x1440) page into the space left of the panel.
    function fit() {
        body.style.transform = '';
        const w = body.offsetWidth || 1920;
        const h = body.offsetHeight || 1080;
        const room = { w: window.innerWidth - PANEL_W - 32, h: window.innerHeight - 48 };
        const k = Math.min(room.w / w, room.h / h, 1);
        const ox = 16 + (room.w - w * k) / 2;
        const oy = 24 + (room.h - h * k) / 2;
        body.style.transform = `translate(${ox}px, ${oy}px) scale(${k})`;
    }
    window.addEventListener('resize', fit);
    new MutationObserver(fit).observe(body, { attributes: true, attributeFilter: ['data-size'] });
    fit();

    function send(key, entry) {
        socket.emit('updateLayout', { scene, key, value: isDefault(entry) ? null : entry });
    }

    // Changes the part here at once and tells the server; the echo then agrees.
    function change(key, entry, { remember = true } = {}) {
        if (remember) undoStack.push({ key, entry: entryOf(key) });
        const el = partByKey(key);
        if (el) applyPart(el, entry);
        releaseClipped();
        setTimeout(releaseClipped, 400);
        if (isDefault(entry)) delete layout[key]; else layout[key] = entry;
        send(key, entry);
        refreshPanel();
    }

    function undo() {
        const step = undoStack.pop();
        if (!step) return;
        if (step.all) {
            Object.keys({ ...layout, ...step.all }).forEach((key) => {
                change(key, { x: 0, y: 0, s: 1, h: false, ...(step.all[key] || {}) }, { remember: false });
            });
        } else {
            change(step.key, step.entry, { remember: false });
        }
    }

    const depthOf = (el) => {
        let d = 0;
        for (let p = el.parentElement; p; p = p.parentElement) if (p.dataset && p.dataset.layout) d++;
        return d;
    };
    /** @type {(el: HTMLElement | null) => HTMLElement | null} */
    const parentPart = (el) => (el && el.parentElement && el.parentElement.closest('[data-layout]')) || null;

    // Our own hit test instead of the event target: parts can have pointer-events: none,
    // and a hidden part must still be grabbable while editing.
    function partAt(x, y) {
        let best = null;
        let bestDepth = -1;
        parts().forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || x < r.left || x > r.right || y < r.top || y > r.bottom) return;
            const d = depthOf(el);
            if (d >= bestDepth) { best = el; bestDepth = d; }
        });
        return best;
    }

    // How many screen pixels one of this part's own offset pixels is: the fit, 1440p's
    // 4/3 and any group it sits in that has been resized.
    function screenScale(el) {
        const parent = el.parentElement;
        if (!parent || !parent.offsetWidth) return 1;
        return parent.getBoundingClientRect().width / parent.offsetWidth || 1;
    }

    function select(key) {
        selected = key;
        refreshPanel();
        if (key) {
            const row = panel.querySelector(`.le-item[data-key="${key}"]`);
            if (row) row.scrollIntoView({ block: 'nearest' });
        }
    }

    function refreshPanel() {
        const entry = selected ? entryOf(selected) : null;
        $('[data-selname]').textContent = selected ? nameOf(selected) : T.none;
        ['x', 'y', 's'].forEach((f) => {
            const input = $(`[data-f="${f}"]`);
            input.disabled = !selected;
            if (document.activeElement === input) return;
            input.value = !entry ? '' : f === 's' ? Math.round(entry.s * 100) : entry[f];
        });
        $('[data-a="parent"]').disabled = !selected || !parentPart(partByKey(selected));
        $('[data-a="hide"]').disabled = !selected;
        $('[data-a="hide"]').textContent = entry && entry.h ? T.show : T.hide;
        $('[data-a="reset"]').disabled = !selected || isDefault(entry);
        $('[data-a="undo"]').disabled = undoStack.length === 0;
        $('[data-a="resetAll"]').disabled = Object.keys(layout).length === 0;

        const list = $('[data-list]');
        const rows = parts().map((el) => {
            const key = el.dataset.layout;
            const e = entryOf(key);
            const shown = el.getBoundingClientRect().width > 0;
            return `<div class="le-item${key === selected ? ' sel' : ''}${e.h ? ' off' : ''}" data-key="${key}"
                style="padding-left:${6 + depthOf(el) * 14}px">
                <span class="le-n">${nameOf(key)}${shown ? '' : ` <i style="opacity:.6">(${T.notShown})</i>`}</span>
                ${e.x || e.y || e.s !== 1 ? `<span class="le-tag">${T.moved}</span>` : ''}
                <button class="le-eye" data-eye="${key}">${e.h ? T.show : T.hide}</button>
            </div>`;
        }).join('');
        if (list.dataset.html !== rows) {
            list.innerHTML = rows;
            list.dataset.html = rows;
        }
    }

    function drawBox(box, el, label) {
        if (!el) { box.style.display = 'none'; return; }
        const r = el.getBoundingClientRect();
        if (!r.width) { box.style.display = 'none'; return; }
        Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        if (label !== undefined) box.firstChild.textContent = label;
    }
    (function frame() {
        const sel = selected ? partByKey(selected) : null;
        drawBox(selBox, sel, selected ? nameOf(selected) : '');
        drawBox(hoverBox, hovered && hovered !== sel ? hovered : null);
        requestAnimationFrame(frame);
    })();

    // --- mouse on the stage
    let drag = null;
    document.addEventListener('pointermove', (ev) => {
        if (panel.contains(/** @type {Node} */ (ev.target))) { hovered = null; return; }
        if (!drag) { hovered = partAt(ev.clientX, ev.clientY); return; }

        let dx = (ev.clientX - drag.startX) / drag.scale;
        let dy = (ev.clientY - drag.startY) / drag.scale;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        let x = Math.round(drag.from.x + dx);
        let y = Math.round(drag.from.y + dy);
        if (Math.abs(x) <= 6) x = 0;   // back home snaps into place
        if (Math.abs(y) <= 6) y = 0;
        drag.entry = { ...drag.from, x, y };
        applyPart(drag.el, drag.entry);
        releaseClipped();
        const now = performance.now();
        if (now - drag.sentAt > 80) { drag.sentAt = now; send(drag.key, drag.entry); }
        refreshPanelSoon();
    }, true);

    /** @type {ReturnType<typeof setTimeout> | 0} */
    let panelTimer = 0;
    function refreshPanelSoon() {
        if (panelTimer) return;
        panelTimer = setTimeout(() => {
            panelTimer = 0;
            if (drag) { layout[drag.key] = drag.entry; refreshPanel(); }
        }, 60);
    }

    document.addEventListener('pointerdown', (ev) => {
        if (panel.contains(/** @type {Node} */ (ev.target)) || ev.button !== 0) return;
        ev.preventDefault();
        let el = partAt(ev.clientX, ev.clientY);
        if (!el) { select(null); return; }
        const current = selected ? partByKey(selected) : null;
        if (ev.altKey) el = (current && current.contains(el) ? parentPart(current) : parentPart(el)) || el;
        else if (current && current.contains(el)) el = current;   // keep dragging the chosen group
        const key = el.dataset.layout;
        select(key);
        drag = {
            key, el, from: entryOf(key), entry: entryOf(key),
            startX: ev.clientX, startY: ev.clientY, scale: screenScale(el), sentAt: 0
        };
        dragKey = key;
        el.classList.add('layout-dragging');
        document.documentElement.setPointerCapture?.(ev.pointerId);
    }, true);

    function endDrag() {
        if (!drag) return;
        const { key, el, from, entry } = drag;
        drag = null;
        dragKey = null;
        el.classList.remove('layout-dragging');
        if (entry.x !== from.x || entry.y !== from.y) {
            undoStack.push({ key, entry: from });
            if (isDefault(entry)) delete layout[key]; else layout[key] = entry;
            send(key, entry);
        }
        refreshPanel();
    }
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);

    // --- panel
    // แท็บ Layout (ย้าย/ย่อ/ซ่อนชิ้นส่วน) กับ Style (สี ฟอนต์ ภาพ ค่าของหน้า: ที่เคยอยู่หน้า Design ของแอพ)
    $('[data-tab="layout"]').textContent = th ? 'ตำแหน่ง' : 'Layout';
    $('[data-tab="style"]').textContent = th ? 'สไตล์' : 'Style';
    if (window.RovStyleEditor) window.RovStyleEditor.mount(/** @type {HTMLElement} */ ($('[data-style]')), { scene, th });
    function showTab(name) {
        panel.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tab === name));
        panel.querySelectorAll('[data-pane]').forEach((p) => { /** @type {HTMLElement} */ (p).hidden = /** @type {HTMLElement} */ (p).dataset.pane !== name; });
        if (name === 'style') select(null);
    }
    if (params.get('tab') === 'style') showTab('style');

    panel.addEventListener('click', (ev) => {
        const tab = /** @type {HTMLElement} */ (ev.target).closest('[data-tab]');
        if (tab) { showTab(/** @type {HTMLElement} */ (tab).dataset.tab || 'layout'); return; }
        const target = /** @type {HTMLElement} */ (ev.target);
        const eye = /** @type {HTMLElement | null} */ (target.closest('[data-eye]'));
        if (eye) {
            const key = eye.dataset.eye;
            change(key, { ...entryOf(key), h: !entryOf(key).h });
            return;
        }
        const row = /** @type {HTMLElement | null} */ (target.closest('.le-item'));
        if (row) { select(row.dataset.key); return; }
        const action = /** @type {HTMLButtonElement | null} */ (target.closest('[data-a]'));
        if (!action || action.disabled) return;
        switch (action.dataset.a) {
            case 'parent': {
                const p = parentPart(partByKey(selected));
                if (p) select(p.dataset.layout);
                break;
            }
            case 'hide': change(selected, { ...entryOf(selected), h: !entryOf(selected).h }); break;
            case 'reset': change(selected, { x: 0, y: 0, s: 1, h: false }); break;
            case 'undo': undo(); break;
            case 'resetAll':
                if (!window.confirm(T.confirmReset)) return;
                undoStack.push({ all: { ...layout } });
                layout = {};
                socket.emit('resetLayout', { scene });
                applyAll();
                break;
        }
    });

    panel.addEventListener('change', (ev) => {
        const input = /** @type {HTMLInputElement} */ (ev.target);
        const f = input.dataset && input.dataset.f;
        if (!f || !selected) return;
        const n = Number(input.value);
        if (!Number.isFinite(n)) { refreshPanel(); return; }
        const value = f === 's' ? Math.min(400, Math.max(20, n)) / 100 : Math.round(n);
        change(selected, { ...entryOf(selected), [f]: value });
    });

    // --- keyboard
    document.addEventListener('keydown', (ev) => {
        // ปุ่มลูกศรในช่องกรอกหรือกล่องเลือก (แท็บ Style) เป็นของช่องนั้น ไม่ใช่การขยับชิ้นส่วน
        if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement
            || ev.target instanceof HTMLTextAreaElement) return;
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
        if (!selected) return;
        const step = ev.shiftKey ? 10 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[ev.key]) {
            ev.preventDefault();
            const e = entryOf(selected);
            // A run of nudges on one part is one undo step.
            const now = performance.now();
            const remember = lastNudge.key !== selected || now - lastNudge.at > 800;
            lastNudge = { key: selected, at: now };
            change(selected, { ...e, x: e.x + moves[ev.key][0], y: e.y + moves[ev.key][1] }, { remember });
        } else if (ev.key === 'Escape') {
            select(null);
        } else if (ev.key.toLowerCase() === 'h') {
            change(selected, { ...entryOf(selected), h: !entryOf(selected).h });
        }
    });

    refreshPanel();
})();
