// Overlay รายชื่อทีมที่ลงแข่ง เอาไว้เปิดก่อนเริ่มงาน
//
// เสิร์ฟที่ /overlay-teams ไม่ใช่ /teams
// /teams ถูกใช้เป็นหน้าทะเบียนทีมของคนคุมงานไปแล้วตั้งแต่ Phase 6
//
// พารามิเตอร์ที่รับ (ต่อท้าย URL ใน OBS ได้เลย):
//   ?tournament=<id>   ทัวร์นาเมนต์ที่จะแสดง ไม่ใส่ = ตามแมตช์ที่ออกอากาศ
//   ?title=            เปลี่ยนหัวข้อ ไม่ใส่ = ชื่อทัวร์นาเมนต์
//   ?subtitle=         เปลี่ยนบรรทัดรอง ไม่ใส่ = จำนวนทีม
//   ?columns=1..6      บังคับจำนวนคอลัมน์ ไม่ใส่ = เลือกให้ตามจำนวนทีม
//   ?roster=off        ไม่ต้องแสดงรายชื่อผู้เล่น
//   ?stagger=<ms>      ระยะห่างของการไล่เข้าทีละใบ ไม่ใส่ = 90ms
//   ?perSet=4..64      ทีมสูงสุดต่อชุด ไม่ใส่ = ค่าในแอพ (ดีไซน์ > รายชื่อทีม) ซึ่งเริ่มที่ 32
//   ?seconds=3..120    ชุดหนึ่งค้างบนจอกี่วินาทีก่อนสลับ ไม่ใส่ = 12
//   ?set=<n>           แสดงชุดที่ n ชุดเดียว ไม่วน (เฉพาะสไตล์ sets)
//   ?style=sets|scroll สไตล์รายชื่อ ไม่ใส่ = ค่าในแอพ ซึ่งเริ่มที่ sets
//                      sets = แบ่งเป็นชุดแล้วสลับ, scroll = เลื่อนขึ้นวนไปเรื่อยๆ
//   ?scrollSpeed=10..200  ความเร็วของสไตล์ scroll เป็นพิกเซลต่อวินาที ไม่ใส่ = ค่าในแอพ (40)
//   ?autoText=off      บังคับตัวอักษรบนการ์ดเป็นสีขาวเสมอ ไม่ใส่ = ค่าในแอพ ซึ่งเปิดไว้
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน
// เหมือน /overlay กับ /result และไม่ได้ใช้ app-client.js

const params = new URLSearchParams(window.location.search);

// overlay-size.js ไปอ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศไว้ก่อนไฟล์นั้นถูกโหลด
const socket = io();

// ต้องตรงกับ overlay-teams.css ถ้าแก้ที่ CSS แล้วลืมแก้ที่นี่
// ตัวจับเวลาสำรองจะทำงานก่อนอนิเมชันจบ แล้วจะเห็นการ์ดกระตุกตอนถูกบังคับสถานะ
const ENTER_MS = 560;
const SAFETY_MS = 700;
const DEFAULT_STAGGER = 90;

let settleTimer = null;
let cycleTimer = null;

// ทีมเยอะเกินหนึ่งจอ แบ่งเป็นชุดละไม่เกิน 32 แล้ววนสลับชุดไปเรื่อยๆ (ผู้ใช้ขอ 2026-09-28)
//
// เดิมใช้วิธีย่อทั้งตารางให้พอดีจอ 64 ทีมขึ้นไปตัวหนังสือเล็กจนอ่านบนสตรีมไม่ออก
// ชุดเต็มตามค่าที่ตั้ง ชุดสุดท้ายรับเศษ: 40 ทีม ชุดละ 16 เป็น 16 + 16 + 8
// ตารางทุกชุดมีช่องเท่ากันตามค่าที่ตั้ง (gridFor) การ์ดชุดสุดท้ายจึงขนาดเท่าชุดอื่น แค่มีช่องว่าง
// (เดิมแบ่งเฉลี่ย 40 เป็น 20 + 20 เปลี่ยนเมื่อผู้ใช้ขอให้ 16 ต่อชุดเป็น 2 คอลัมน์ 8 แถวเสมอ)
// ตอนเปิดตัวแก้ layout (?edit=1) ไม่วน ให้ค้างชุดแรก การ์ดจะได้ไม่เปลี่ยนใต้เมาส์
// ?perSet= ใน URL ชนะค่าในแอพ ไม่ใส่ = ตามช่อง "ทีมต่อชุด" ในแอพ ซึ่งมาทาง stateUpdate
// เปลี่ยนในแอพแล้วหน้านี้แบ่งชุดใหม่ทันที ไม่ต้อง Refresh ใน OBS
const urlPerSet = params.get('perSet') ? window.RovOverlay.intParam(params, 'perSet', 32, 4, 64) : 0;
let perSet = urlPerSet || 32;
let shown = null;             // { tournament, teams } ที่แสดงอยู่ ไว้แบ่งชุดใหม่ตอนค่าเปลี่ยน

// สไตล์ของรายชื่อ (ผู้ใช้ขอ 2026-09-29)
//   sets   = แบ่งเป็นชุดแล้วสลับ (แบบเดิม ยังเป็นค่าเริ่มต้น)
//   scroll = ทุกทีมอยู่ในรายการเดียว เลื่อนขึ้นช้าๆ แล้ววนกลับมาเริ่มใหม่
//
// ?style= กับ ?scrollSpeed= ใน URL ชนะค่าในแอพ เหมือน ?perSet=
// ใครตั้งไว้ใน OBS แล้วจะไม่ถูกแอพเปลี่ยนทีหลัง
const urlStyle = params.get('style') === 'scroll' ? 'scroll'
    : params.get('style') === 'sets' ? 'sets'
    : '';
let listStyle = urlStyle || 'sets';

const urlScrollSpeed = params.get('scrollSpeed')
    ? window.RovOverlay.intParam(params, 'scrollSpeed', 40, 10, 200)
    : 0;
let scrollSpeed = urlScrollSpeed || 40;

// ?autoText=off บังคับตัวอักษรขาวเสมอ ไม่ว่าแอพจะตั้งไว้อย่างไร
const urlAutoText = params.get('autoText') === 'off' ? 'off' : '';

// จำนวนคอลัมน์ 0 = เลือกเองตามจำนวนทีม (แบบเดิม) ?columns= ใน URL ชนะค่าในแอพ
let columnsSetting = 0;

// รอ state แรกก่อนวาด ไม่งั้นหน้าจะวาดด้วย 32 แล้วกระพริบแบ่งใหม่ทันทีที่ค่าจริงมาถึง
// รอไม่เกินหนึ่งวินาทีครึ่ง ต่อเซิร์ฟเวอร์ไม่ได้ก็ยังต้องขึ้นจอ
/** @type {(value?: unknown) => void} */
let markStateSeen = () => {};
const firstState = new Promise((resolve) => {
    markStateSeen = resolve;
    setTimeout(resolve, 1500);
});

// สีการ์ด (state.theme.teamCard) คุมขอบซ้ายกับป้ายตัวย่อพร้อมกัน ให้เข้าชุดกันเสมอ
// (ผู้ใช้ขอ 2026-09-29)
//
// ป้ายตัวย่อเป็นสีเดียวกันแบบจาง ตัวอักษรเป็นสีเดียวกันแบบอ่อน จึงต้องแยกเป็นสามค่า:
// สีเต็มสำหรับขอบ, ค่า "r, g, b" สำหรับ rgba() ของพื้นและขอบป้าย, และตัวผสมขาวสำหรับตัวอักษร
// ผสมในจาวาสคริปต์เพราะ color-mix() ยังใหม่เกินกว่าจะวางใจใน CEF ที่ OBS รุ่นเก่ายังใช้อยู่
const TEAM_CARD_FALLBACK = '#3b82f6';
const TEAM_CARD_BG_FALLBACK = '#111220';

// หยุดที่สองของเกรเดียนต์พื้นการ์ด สว่างกว่าหยุดแรกนิดเดียว
//
// ของเดิมฝังไว้เป็น rgba(17,18,32) -> rgba(24,25,41) ซึ่งห่างกันราวสามเปอร์เซ็นต์ของทางไปขาว
// คิดจากสีเดียวแทนที่จะให้ตั้งสองค่า ผู้ใช้เลือกสีเดียวแล้วได้เกรเดียนต์เดิมทุกประการ
const BG_GRADIENT_LIFT = 0.032;

function hexToRgb(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ผสมกับขาว ใช้ทำสีตัวอักษรบนป้าย เลือกสีเข้มแค่ไหนตัวย่อก็ยังอ่านออก
function mixWithWhite(rgb, amount) {
    return rgb.map((c) => Math.round(c + (255 - c) * amount));
}

function mixWithBlack(rgb, amount) {
    return rgb.map((c) => Math.round(c * (1 - amount)));
}

// ตัวอักษรบนการ์ดสลับเป็นสีเข้มเองเมื่อพื้นการ์ดสว่าง (ผู้ใช้ขอ 2026-09-29)
//
// ชื่อทีมเป็นสีขาว พื้นสว่างจึงเหลือคอนทราสต์ราว 1.4:1 ซึ่งอ่านไม่ออกบนสตรีม
// ปิดได้ที่ teamListAutoText ถ้าอยากคุมเอง ปิดแล้วตัวอักษรเป็นสีขาวเสมอเหมือนเดิม
const INK_DARK = [13, 17, 23];
const INK_LIGHT = [255, 255, 255];

function relativeLuminance(rgb) {
    const channel = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(a, b) {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// เทียบคอนทราสต์จริงทั้งสองตัว ไม่ได้ตัดที่ค่าความสว่างค่าเดียว
// สีอย่างเหลืองหรือเขียวมะนาวสว่างกว่าที่ตาคิด การเทียบตรงๆ จึงตัดสินได้ถูกกว่า
function inkFor(bg) {
    return contrastRatio(INK_DARK, bg) > contrastRatio(INK_LIGHT, bg) ? INK_DARK : INK_LIGHT;
}

function applyCardColour(theme, autoText) {
    const rgb = hexToRgb(theme && theme.teamCard) || hexToRgb(TEAM_CARD_FALLBACK);
    if (!rgb) return;
    const root = document.documentElement;
    // มุมโค้งเป็นตัวเลขของธีม ไม่ใช่สี แต่มาทางเดียวกันและใช้ที่การ์ดเดียวกัน
    const radius = Number(theme && theme.teamCardRadius);
    root.style.setProperty('--ov-team-card-radius',
        (Number.isFinite(radius) ? Math.min(40, Math.max(0, Math.round(radius))) : 12) + 'px');
    root.style.setProperty('--ov-team-card', 'rgb(' + rgb.join(', ') + ')');
    root.style.setProperty('--ov-team-card-rgb', rgb.join(', '));

    // พื้นการ์ด: สีเดียวคุมทั้งสองหยุดของเกรเดียนต์ ส่วนค่าอัลฟายังอยู่ใน CSS เหมือนเดิม
    const bg = hexToRgb(theme && theme.teamCardBg) || hexToRgb(TEAM_CARD_BG_FALLBACK);
    if (!bg) return;
    root.style.setProperty('--ov-team-card-bg', 'rgb(' + bg.join(', ') + ')');
    root.style.setProperty('--ov-team-card-bg-rgb', bg.join(', '));
    root.style.setProperty('--ov-team-card-bg2-rgb', mixWithWhite(bg, BG_GRADIENT_LIFT).join(', '));

    // ทุกอย่างที่เขียนทับบนการ์ดผูกกับหมึกตัวเดียว ชื่อทีม รายชื่อผู้เล่น ขอบ และช่องโลโก้
    // สลับพร้อมกันหมด ไม่ใช่สลับแค่ชื่อทีมแล้วเหลือรายชื่อจางๆ อ่านไม่ออกอยู่ข้างล่าง
    const ink = autoText ? inkFor(bg) : INK_LIGHT;
    const darkInk = ink === INK_DARK;
    root.style.setProperty('--ov-team-card-ink-rgb', ink.join(', '));
    // ป้ายตัวย่อ: พื้นเข้มผสมขาว พื้นสว่างผสมดำ ไม่งั้นตัวย่อจางกลืนไปกับพื้นป้ายของมันเอง
    root.style.setProperty('--ov-team-card-soft',
        'rgb(' + (darkInk ? mixWithBlack(rgb, 0.55) : mixWithWhite(rgb, 0.72)).join(', ') + ')');
    // กัปตันเป็นสีทอง ซึ่งบนพื้นสว่างแทบมองไม่เห็น ใช้โทนเข้มแทนเมื่อหมึกเป็นสีเข้ม
    root.style.setProperty('--ov-team-card-captain', darkInk ? '#8a5a00' : '#f5b942');
}

// ค่าที่ตั้งในแอพมาทางนี้ทั้งหมด เปลี่ยนแล้วมีผลทันที ไม่ต้อง Refresh ใน OBS
// ตัวไหนถูกกำหนดมาทาง URL แล้ว ตัวนั้นไม่ฟังแอพ
socket.on('stateUpdate', (state) => {
    markStateSeen();
    // สีเป็น CSS variable ล้วนๆ เปลี่ยนแล้วการ์ดเปลี่ยนตามเอง ไม่ต้องวาดใหม่
    applyCardColour(state && state.theme, urlAutoText !== 'off' && (!state || state.teamListAutoText !== false));
    let changed = false;

    if (!urlPerSet) {
        const n = Number(state && state.teamListPerSet);
        const next = Number.isInteger(n) && n >= 4 && n <= 64 ? n : 32;
        if (next !== perSet) { perSet = next; changed = true; }
    }

    if (!urlStyle) {
        const next = state && state.teamListStyle === 'scroll' ? 'scroll' : 'sets';
        if (next !== listStyle) { listStyle = next; changed = true; }
    }

    if (!params.get('columns')) {
        const n = Number(state && state.teamListColumns);
        const next = Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
        if (next !== columnsSetting) { columnsSetting = next; changed = true; }
    }

    if (!urlScrollSpeed) {
        const n = Number(state && state.teamListScrollSpeed);
        const next = Number.isFinite(n) && n >= 10 && n <= 200 ? Math.round(n) : 40;
        if (next !== scrollSpeed) { scrollSpeed = next; changed = true; }
    }

    if (changed && shown) showList(shown.tournament, shown.teams);
});
const holdMs = window.RovOverlay.intParam(params, 'seconds', 12, 3, 120) * 1000;
const FADE_MS = 500;          // ต้องตรงกับ tlCardFadeOut ใน overlay-teams.css
const cycling = params.get('edit') !== '1';

function splitIntoSets(teams) {
    if (teams.length <= perSet) return [teams];
    const sets = [];
    for (let i = 0; i < teams.length; i += perSet) sets.push(teams.slice(i, i + perSet));
    return sets;
}


const stagger = window.RovOverlay.intParam(params, 'stagger', DEFAULT_STAGGER, 0, 1000);


// เวลาไล่เข้าทั้งชุดต้องไม่ยืดเกินไปเมื่อทีมเยอะ
//
// 90ms x 64 ทีม = เกือบหกวินาทีกว่าใบสุดท้ายจะโผล่ ซึ่งนานเกินสำหรับกราฟิกก่อนเริ่มงาน
// จึงบีบระยะห่างลงให้ทั้งชุดจบในราวสองวินาทีครึ่ง
// ถ้าผู้ใช้ระบุ ?stagger= มาเอง ให้เคารพค่านั้น เขาตั้งใจเลือกแล้ว
const MAX_TOTAL_STAGGER_MS = 2200;

function staggerFor(count) {
    if (params.get('stagger')) return stagger;
    if (count <= 1) return stagger;
    return Math.min(stagger, Math.floor(MAX_TOTAL_STAGGER_MS / (count - 1)));
}
async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url + ' returned ' + response.status);
    return response.json();
}

// ข้อความช่วยตอนตั้งค่า จงใจให้จาง ถ้าหลุดออกอากาศจะได้ไม่เด่น


// เลือกทัวร์นาเมนต์: ระบุมาเอง > ตามแมตช์ที่ออกอากาศ > รายการล่าสุด
//
// การตามแมตช์ที่ออกอากาศทำให้ URL เดียวใช้ได้ทั้งงานโดยไม่ต้องแก้ใน OBS
async function resolveTournamentId() {
    const given = params.get('tournament') || params.get('tournamentId');
    if (given) return given;

    try {
        const data = await getJson('/api/live-match');
        if (data.live && data.live.tournamentId) return data.live.tournamentId;
    } catch (error) {
        /* ยังไม่เคยเปิดแมตช์ไหนก็ไม่เป็นไร ไปดูรายการต่อ */
    }

    try {
        const data = await getJson('/api/tournaments');
        const newest = (data.tournaments || [])[0];   // API เรียงใหม่สุดมาก่อน
        if (newest) return newest.id;
    } catch (error) {
        /* ไม่มีอะไรให้แสดง ผู้เรียกจะขึ้นข้อความบอกเอง */
    }

    return null;
}

function placeholderLogo(team) {
    const box = document.createElement('div');
    box.className = 'tl-logo placeholder';
    box.textContent = (team.tag || team.name || '?').slice(0, 3).toUpperCase();
    return box;
}

function logoNode(team) {
    if (!team.logo || !team.logo.v || !team.logo.ext) return placeholderLogo(team);

    const img = document.createElement('img');
    img.className = 'tl-logo';
    img.alt = '';
    img.src = '/images/team-logos/' + encodeURIComponent(team.id) + '.' + team.logo.ext
        + '?v=' + team.logo.v;
    // ไฟล์หายไม่ควรทิ้งช่องโหว่ไว้กลางกราฟิก สลับไปใช้ตัวย่อแทน
    img.addEventListener('error', () => img.replaceWith(placeholderLogo(team)), { once: true });
    return img;
}

// ตารางของชุด คิดจากจำนวนช่องต่อชุด ไม่ใช่จำนวนการ์ดในชุดนี้ ทุกชุดจึงหน้าตาเดียวกัน
//
// ผู้ใช้ขอ: 8 ต่อชุด = 2 คอลัมน์ 4 แถว, 16 ต่อชุด = 2 คอลัมน์ 8 แถว
// ที่เหลือไล่ต่อแบบเดียวกัน แถวไม่เกินแปด: 24 = 3 x 8, 32 = 4 x 8, 40 = 5 x 8, 48 = 6 x 8
// อย่างน้อยสี่แถว ทีมน้อยๆ จะได้ไม่เป็นการ์ดยักษ์สูงเต็มจอ
// กว้างที่ใช้ได้คือ 1736px (1920 ลบขอบสองข้าง)
function gridFor(slots) {
    const cols = params.get('columns') ? window.RovOverlay.intParam(params, 'columns', 2, 1, 6)
        : columnsSetting > 0 ? columnsSetting
        : slots <= 16 ? 2 : Math.min(6, Math.ceil(slots / 8));
    return { cols, rows: Math.max(4, Math.ceil(slots / cols)) };
}

// ขนาดการ์ดตอน --k = 1 วัดจากการ์ดจริง แล้วขยาย/ย่อทุกอย่างในการ์ดด้วย --k ให้เต็มช่องพอดี
//
// แถวยืดเต็มความสูงที่เหลือ (1fr) การ์ดจึงเต็มช่องเสมอ แต่ของข้างในต้องโตตามด้วย
// ไม่งั้น 2 x 4 จะเป็นกล่องสูงเกือบสองร้อยพิกเซลที่มีโลโก้เล็กๆ ลอยอยู่กลาง
// วัดครั้งเดียวต่อการวาด แล้วลดลงทีละนิดถ้ายังล้น (รายชื่อผู้เล่นที่ตัดบรรทัดใหม่เมื่อโตขึ้น)
const K_MIN = 0.5;
const K_MAX = 2.4;

// ระยะห่างระหว่างแถว สไตล์ scroll วาง gap ไว้ที่ .tl-run ไม่ใช่ที่ #grid
// ซึ่งกลายเป็น display:block ไปแล้ว rowGap ของมันจึงอ่านไม่ได้
function rowGapOf(grid) {
    const box = grid.querySelector('.tl-run') || grid;
    return parseFloat(getComputedStyle(box).rowGap) || 0;
}

// ความสูงของหนึ่งแถวเมื่อ perSet ใบเต็มหนึ่งจอพอดี
// สไตล์ scroll ใช้ค่าเดียวกันนี้เป็น grid-auto-rows การ์ดจึงขนาดเท่ากันทั้งสองสไตล์
function rowHeightOf(grid) {
    const rows = Number(grid.style.getPropertyValue('--rows')) || 1;
    const gap = rowGapOf(grid);
    return (grid.clientHeight - gap * (rows - 1)) / rows;
}

function sizeCards() {
    const grid = document.getElementById('grid');
    // สไตล์ scroll มี .tl-run คั่นอยู่ การ์ดจึงไม่ใช่ลูกโดยตรงของ #grid อีกต่อไป
    const cards = /** @type {HTMLElement[]} */ (Array.from(grid.querySelectorAll('.tl-card')));
    if (cards.length === 0) return;

    grid.style.setProperty('--k', '1');
    grid.classList.add('measuring');
    const natural = Math.max(...cards.map((c) => c.offsetHeight));
    grid.classList.remove('measuring');

    const rowH = rowHeightOf(grid);
    if (!natural || rowH <= 0) return;
    grid.style.setProperty('--row-h', rowH + 'px');

    let k = Math.min(K_MAX, Math.max(K_MIN, rowH / natural));
    for (let i = 0; i < 12; i++) {
        grid.style.setProperty('--k', k.toFixed(3));
        if (!cards.some((c) => c.scrollHeight > c.clientHeight + 1) || k <= K_MIN) break;
        k = Math.max(K_MIN, k * 0.94);
    }
}

function teamCard(team, index, showRoster) {
    const card = document.createElement('div');
    card.className = 'tl-card';
    card.style.setProperty('--i', String(index));

    const id = document.createElement('div');
    id.className = 'tl-id';

    const name = document.createElement('div');
    name.className = 'tl-name';
    name.textContent = team.name;
    id.appendChild(name);

    if (team.tag) {
        const tag = document.createElement('span');
        tag.className = 'tl-tag';
        tag.textContent = team.tag;
        id.appendChild(tag);
    }

    if (showRoster) {
        const named = (team.players || []).filter((player) => player.name);
        if (named.length > 0) {
            const roster = document.createElement('div');
            roster.className = 'tl-roster';
            named.forEach((player) => {
                const el = document.createElement('span');
                el.className = 'tl-player' + (player.isCaptain ? ' captain' : '');
                el.textContent = player.name;
                roster.appendChild(el);
            });
            id.appendChild(roster);
        }
    }

    card.append(logoNode(team), id);

    // ทางลัดตอนอนิเมชันได้เล่นจริง ตัวจับเวลาข้างล่างเป็นตัวการันตี ไม่ใช่ตัวนี้
    card.addEventListener('animationend', () => card.classList.add('settled'), { once: true });
    return card;
}

// การันตีว่ารายชื่อจะถูกมองเห็น ต่อให้อนิเมชันไม่เคยเริ่มหรือไม่เคยจบ
//
// OBS หยุด browser source ที่ไม่ได้อยู่ในฉากที่ออกอากาศ อนิเมชันจึงค้างได้
// และ animationend จะไม่ยิงเลย การ์ดทุกใบเริ่มจาก opacity:0
// ถ้าไม่มีตัวนี้ ผลลัพธ์คือจอว่างเปล่าออกอากาศ ซึ่งแย่กว่าการข้ามอนิเมชันไปเลย
function settleSoon(count, step = stagger) {
    clearTimeout(settleTimer);
    const total = step * Math.max(0, count - 1) + ENTER_MS + SAFETY_MS;
    settleTimer = setTimeout(() => {
        document.getElementById('stage').classList.add('settled');
    }, total);
}


// ย่อทั้งตารางลงถ้าจำนวนทีมมากจนล้นผืน 1080
//
// ทัวร์นาเมนต์รับได้ถึง 128 ทีม แต่ผืนจอสูงเท่าเดิม
// ถ้าไม่ย่อ การ์ดที่เกินจะถูก overflow:hidden ตัดทิ้งเงียบๆ
// ซึ่งบนกราฟิกออกอากาศแปลว่ามีทีมหายไปจากรายชื่อโดยไม่มีใครรู้
// ย่อให้เล็กลงอ่านยากขึ้น ยังดีกว่าทีมท้ายๆ ไม่ได้ขึ้นจอเลย
function fitToStage() {
    // สไตล์ scroll ตั้งใจให้รายการยาวเกินจอ นั่นคือสิ่งที่มันเลื่อนผ่าน
    // ปล่อยให้ตัวย่อทำงานเมื่อไหร่ ทั้งรายการจะถูกบีบให้พอดีจอแล้วไม่เหลืออะไรให้เลื่อน
    if (listStyle === 'scroll') return;
    // วัดตามผังเดิม ไม่นับชิ้นที่ผู้ใช้ลากย้ายไว้ในตัวแก้ layout (overlay-layout.js)
    // ไม่งั้นการ์ดที่ถูกลากลงล่างจะดูเหมือนล้นจอ แล้วทั้งตารางถูกย่อตามไปด้วย
    if (window.RovLayout && !window.RovLayout.measuring) return window.RovLayout.asDesigned(fitToStage);
    const grid = document.getElementById('grid');
    const stage = document.getElementById('stage');
    grid.style.transform = '';
    grid.style.width = '';

    const cards = grid.children;
    if (cards.length === 0) return;

    // วัดจากขอบล่างของการ์ดใบสุดท้ายจริงๆ ไม่ใช่ scrollHeight
    //
    // grid ตัวนี้ overflow เป็น visible เนื้อหาที่ล้นจึงไม่ได้อยู่ในเขตที่เลื่อนได้
    // scrollHeight จะคืนค่าเท่ากับ clientHeight เสมอ แปลว่า "ไม่ล้น" ตลอด
    // เคยเขียนแบบนั้นแล้วตัวย่อไม่เคยทำงานเลย ทั้งที่การ์ดล้นออกไปนอกจอจริง
    const gridTop = grid.getBoundingClientRect().top;
    const needed = cards[cards.length - 1].getBoundingClientRect().bottom - gridTop;

    // padding จาก getComputedStyle เป็นค่าก่อนถูกสเกล พิกัดจาก rect เป็นค่าหลังสเกล
    //
    // โหมด 1440 ขยายทั้งเวทีด้วย 4/3 ขอบล่าง 62px จึงกินที่จริง 82.7px
    // เอาสองหน่วยนี้มาลบกันตรงๆ ทำให้ "ที่ว่าง" เกินจริงไป 21px
    // ผลคือตอนที่ตัวย่อทำงาน การ์ดแถวสุดท้ายถูกตัดหายไปนิดหนึ่งเฉพาะที่ 1440
    // offsetHeight เป็นความสูงตามผัง ส่วน rect.height เป็นความสูงที่เห็นจริง
    // อัตราส่วนของสองค่านี้คือสเกลที่กำลังถูกใช้อยู่
    const stageRect = stage.getBoundingClientRect();
    const stageScale = stage.offsetHeight ? stageRect.height / stage.offsetHeight : 1;
    const stageStyle = getComputedStyle(stage);
    const available = stageRect.bottom
        - parseFloat(stageStyle.paddingBottom) * stageScale - gridTop;

    if (needed <= 0 || available <= 0 || needed <= available) return;

    const scale = available / needed;
    // ขยายความกว้างชดเชยก่อนย่อ ไม่งั้นตารางจะหดเข้าทางซ้ายเหลือที่ว่างทางขวา
    grid.style.width = (100 / scale) + '%';
    grid.style.transformOrigin = 'top left';
    grid.style.transform = 'scale(' + scale + ')';
}
// วาดหนึ่งชุด total คือจำนวนทีมทั้งทัวร์นาเมนต์ ไม่ใช่ของชุดนี้
function render(tournament, teams, total = teams.length, setNo = 1, setCount = 1) {
    const grid = document.getElementById('grid');
    const stage = document.getElementById('stage');
    grid.textContent = '';
    // สลับกลับมาจากสไตล์ scroll ต้องถอดสถานะของมันออกให้หมด
    // ไม่งั้น #grid ยังเป็น display:block อยู่ แล้วตารางจะไม่ขึ้นเลย
    grid.classList.remove('scrolling', 'running');
    grid.style.removeProperty('--scroll-distance');
    grid.style.removeProperty('--scroll-duration');
    // หัวข้อเข้ามาครั้งเดียวตอนเปิดหน้า สลับชุดแล้วไม่ต้องเข้าใหม่
    if (stage.classList.contains('settled')) document.getElementById('head').classList.add('settled');
    // ชุดก่อนถูกบังคับจบอนิเมชันไว้แล้ว ต้องถอดออก ไม่งั้นชุดใหม่โผล่มาเฉยๆ ไม่ไล่เข้า
    stage.classList.remove('settled', 'leaving');

    const step = staggerFor(teams.length);
    stage.style.setProperty('--stagger', step + 'ms');
    document.getElementById('title').textContent = params.get('title') || tournament.name || '';
    const counted = total === 1 ? '1 team' : total + ' teams';
    document.getElementById('subtitle').textContent = (params.get('subtitle') || counted)
        + (setCount > 1 ? `  ·  ${setNo} / ${setCount}` : '');
    document.title = (tournament.name || 'Teams') + ' - ROV Team List';

    // ช่องต่อชุด = ค่าที่ตั้ง แต่ไม่เกินจำนวนทีมทั้งหมด (ทีมน้อยกว่าชุดเดียวก็ไม่ต้องเผื่อช่อง)
    const slots = Math.min(perSet, Math.max(1, total));
    const { cols, rows } = gridFor(slots);
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));

    // รายชื่อผู้เล่นมีที่พอเฉพาะตอนแถวสูง: ไม่เกินหกแถว
    const showRoster = params.get('roster') !== 'off' && rows <= 6;
    teams.forEach((team, index) => grid.appendChild(teamCard(team, index, showRoster)));

    window.RovOverlay.note(teams.length === 0 ? 'No teams have been added to this tournament yet.' : '');
    sizeCards();
    fitToStage();
    settleSoon(teams.length, step);
}

// ชุดปัจจุบันจางออกพร้อมกันทั้งชุด แล้วชุดถัดไปไล่เข้าจากซ้ายทีละใบเหมือนตอนเปิดหน้า
//
// ผู้ใช้ลองแบบจางเข้าทั้งชุด (beta.20-23) แล้วขอกลับมาไล่เข้าทีละใบ แต่ขาออกยังจาง
//
// ใช้ตัวจับเวลาล้วนๆ ไม่รอ animationend เหตุผลเดียวกับ settleSoon:
// OBS หยุด source ที่ไม่ได้ออกอากาศ อนิเมชันขาออกอาจไม่จบ แต่ชุดต้องสลับต่อได้
// สไตล์ scroll: ทุกทีมอยู่ในรายการเดียว เลื่อนขึ้นเรื่อยๆ แล้ววนกลับมาเริ่มใหม่
// (ผู้ใช้ขอ 2026-09-29)
//
// รายการถูกวางซ้ำสองชุดต่อกันใน .tl-track แล้วเลื่อนขึ้นเป็นระยะเท่ากับชุดเดียวบวกช่องไฟ
// พอครบรอบ ชุดที่สองจะมาอยู่ตำแหน่งเดียวกับที่ชุดแรกเริ่มพอดี การวนจึงไม่มีรอยต่อ
// (เลื่อนชุดเดียวแล้วดีดกลับจะเห็นรายการกระโดดทุกรอบ ซึ่งเป็นสิ่งที่คนดูจับได้ทันที)
//
// ความสูงแถวมาจาก perSet เหมือนสไตล์ sets การ์ดจึงขนาดเท่ากันทั้งสองสไตล์
// ต่างกันแค่รายการเลื่อนผ่าน แทนที่จะสลับทีละชุด
//
// การ์ดที่อยู่บนจอตอนเริ่มเท่านั้นที่ไล่เข้าทีละใบ ที่เหลืออยู่ใต้ขอบจออยู่แล้ว
// ให้มองเห็นทันที ไม่งั้นถ้า OBS หยุด source ไว้ อนิเมชันไม่เคยเล่น
// การ์ดที่เริ่มจาก opacity:0 จะไม่โผล่เลยแม้แต่ตอนเลื่อนมาถึง
function renderScroll(tournament, teams) {
    const grid = document.getElementById('grid');
    const stage = document.getElementById('stage');
    grid.textContent = '';
    if (stage.classList.contains('settled')) document.getElementById('head').classList.add('settled');
    stage.classList.remove('settled', 'leaving');
    grid.classList.add('scrolling');
    grid.classList.remove('running');

    const total = teams.length;
    const step = staggerFor(Math.min(total, perSet));
    stage.style.setProperty('--stagger', step + 'ms');
    document.getElementById('title').textContent = params.get('title') || tournament.name || '';
    const counted = total === 1 ? '1 team' : total + ' teams';
    document.getElementById('subtitle').textContent = params.get('subtitle') || counted;
    document.title = (tournament.name || 'Teams') + ' - ROV Team List';

    const slots = Math.min(perSet, Math.max(1, total));
    const { cols, rows } = gridFor(slots);
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));
    const showRoster = params.get('roster') !== 'off' && rows <= 6;

    // ทีมพอดีจอเดียวก็ไม่ต้องเลื่อน วางชุดเดียวนิ่งๆ เหมือนสไตล์ sets ที่มีชุดเดียว
    // ตอนเปิดตัวแก้ layout (?edit=1) ก็ไม่เลื่อน การ์ดจะได้ไม่ไหลหนีเมาส์
    const rowsAll = Math.ceil(total / cols);
    const moving = cycling && total > 0 && rowsAll > rows;
    const track = document.createElement('div');
    track.className = 'tl-track';

    for (let run = 0; run < (moving ? 2 : 1); run++) {
        const box = document.createElement('div');
        box.className = 'tl-run';
        teams.forEach((team, index) => {
            const card = teamCard(team, index, showRoster);
            if (run > 0 || index >= slots) card.classList.add('settled');
            box.appendChild(card);
        });
        track.appendChild(box);
    }
    // ตัวตัดขอบต้องเป็นชั้นในของเราเอง ไม่ใช่ #grid
    //
    // #grid เป็นกลุ่มของตัวแก้ layout (data-layout-items) overlay-layout.js จะเติม
    // data-layout-overflow ให้เมื่อมีชิ้นส่วนอยู่นอกกรอบ ซึ่งมีกฎ overflow: visible !important
    // รออยู่ รายการที่ยาวเกินจอของสไตล์นี้เข้าเงื่อนไขนั้นเต็มๆ ตั้ง overflow ที่ #grid
    // จึงถูกลบล้างทุกครั้ง แล้วการ์ดจะล้นออกไปทับทั้งจอ (เจอจริง 2026-09-29, ดู PLAN §9)
    const viewport = document.createElement('div');
    viewport.className = 'tl-viewport';
    viewport.appendChild(track);
    grid.appendChild(viewport);

    window.RovOverlay.note(total === 0 ? 'No teams have been added to this tournament yet.' : '');
    sizeCards();
    settleSoon(Math.min(total, slots), step);
    if (moving) startScroll(grid, track, rowsAll, step, Math.min(total, slots));
}

// ระยะและความเร็วคิดหลังจาก sizeCards() ตั้ง --row-h แล้ว
// เริ่มเลื่อนหลังใบสุดท้ายของจอแรกเข้ามาครบ ไม่งั้นการ์ดจะไล่เข้าไปพร้อมกับที่รายการไหลขึ้น
function startScroll(grid, track, rowsAll, step, entering) {
    const gap = rowGapOf(grid);
    const rowH = rowHeightOf(grid);
    if (rowH <= 0) return;

    const runHeight = rowsAll * rowH + gap * (rowsAll - 1);
    const distance = runHeight + gap;
    grid.style.setProperty('--scroll-distance', distance + 'px');
    grid.style.setProperty('--scroll-duration', (distance / scrollSpeed) + 's');
    track.style.animationDelay = (step * Math.max(0, entering - 1) + ENTER_MS) + 'ms';
    grid.classList.add('running');
}

function showSets(tournament, teams) {
    clearTimeout(cycleTimer);
    shown = { tournament, teams };
    const sets = splitIntoSets(teams);
    const only = window.RovOverlay.intParam(params, 'set', 0, 0, sets.length);
    let index = only ? only - 1 : 0;

    const draw = () => render(tournament, sets[index], teams.length, index + 1, sets.length);
    draw();
    if (only || sets.length < 2 || !cycling) return;

    const next = () => {
        document.getElementById('stage').classList.add('leaving');
        cycleTimer = setTimeout(() => {
            index = (index + 1) % sets.length;
            draw();
            cycleTimer = setTimeout(next, entranceMs(sets[index].length) + holdMs);
        }, FADE_MS);
    };
    cycleTimer = setTimeout(next, entranceMs(sets[index].length) + holdMs);
}

// นับเวลาค้างจากตอนที่ใบสุดท้ายเข้ามาครบ ไม่ใช่จากตอนเริ่มวาด
function entranceMs(count) {
    return staggerFor(count) * Math.max(0, count - 1) + ENTER_MS;
}

// ทางเข้าเดียวของทั้งสองสไตล์
//
// ตัวจับเวลาสลับชุดของสไตล์ sets ต้องถูกล้างทุกครั้ง ไม่งั้นสลับไปสไตล์ scroll กลางอากาศ
// แล้วตัวสลับชุดตัวเก่ายังวิ่งอยู่ เดี๋ยวเดียวมันจะวาดทับรายการที่กำลังเลื่อนอยู่
function showList(tournament, teams) {
    clearTimeout(cycleTimer);
    shown = { tournament, teams };
    // ตัวแก้ layout ลากชิ้นส่วนบนผังที่การ์ดอยู่นิ่ง ?edit=1 จึงกลับไปใช้สไตล์ sets เสมอ
    // ไม่ว่าจะตั้งสไตล์ไหนไว้ ไม่งั้นมีทั้งชั้นห่อและรายการซ้ำสองชุดให้ลากผิดใบ
    if (listStyle === 'scroll' && cycling) renderScroll(tournament, teams);
    else showSets(tournament, teams);
}

// ฟอนต์ Kanit โหลดทีหลังได้ ตัวหนังสือเปลี่ยนขนาด ต้องวัดใหม่
// สไตล์ scroll ต้องคิดระยะเลื่อนใหม่ตามไปด้วย วาดใหม่ทั้งหน้าถูกกว่าไล่แก้ทีละค่า
function remeasure() {
    if (listStyle === 'scroll') {
        if (shown) showList(shown.tournament, shown.teams);
        return;
    }
    sizeCards();
    fitToStage();
}
if (document.fonts) document.fonts.ready.then(remeasure);
// ฟอนต์ที่นำเข้าในแอพโหลดทีหลังสุด (overlay-fonts.js ยิงเหตุการณ์นี้เมื่อไฟล์มาถึง)
window.addEventListener('rov-fonts', remeasure);

async function load() {
    await firstState;
    const id = await resolveTournamentId();
    if (!id) {
        window.RovOverlay.note('No tournament found. Create one, or add ?tournament=<id> to this URL.');
        settleSoon(0);
        return;
    }

    try {
        const data = await getJson('/api/tournaments/' + encodeURIComponent(id));
        showList(data.tournament || {}, data.teams || []);
    } catch (error) {
        window.RovOverlay.note('Could not load that tournament.');
        settleSoon(0);
    }
}

load();
