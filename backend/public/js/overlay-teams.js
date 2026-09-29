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
//   ?set=<n>           แสดงชุดที่ n ชุดเดียว ไม่วน
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

// รอ state แรกก่อนวาด ไม่งั้นหน้าจะวาดด้วย 32 แล้วกระพริบแบ่งใหม่ทันทีที่ค่าจริงมาถึง
// รอไม่เกินหนึ่งวินาทีครึ่ง ต่อเซิร์ฟเวอร์ไม่ได้ก็ยังต้องขึ้นจอ
/** @type {(value?: unknown) => void} */
let markStateSeen = () => {};
const firstState = new Promise((resolve) => {
    markStateSeen = resolve;
    setTimeout(resolve, 1500);
});

socket.on('stateUpdate', (state) => {
    markStateSeen();
    if (urlPerSet) return;
    const n = Number(state && state.teamListPerSet);
    const next = Number.isInteger(n) && n >= 4 && n <= 64 ? n : 32;
    if (next === perSet) return;
    perSet = next;
    if (shown) showSets(shown.tournament, shown.teams);
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
    const cols = params.get('columns')
        ? window.RovOverlay.intParam(params, 'columns', 2, 1, 6)
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

function sizeCards() {
    const grid = document.getElementById('grid');
    const cards = /** @type {HTMLElement[]} */ (Array.from(grid.children));
    if (cards.length === 0) return;

    grid.style.setProperty('--k', '1');
    grid.classList.add('measuring');
    const natural = Math.max(...cards.map((c) => c.offsetHeight));
    grid.classList.remove('measuring');

    const rows = Number(grid.style.getPropertyValue('--rows')) || 1;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const rowH = (grid.clientHeight - gap * (rows - 1)) / rows;
    if (!natural || rowH <= 0) return;

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

// ฟอนต์ Kanit โหลดทีหลังได้ ตัวหนังสือเปลี่ยนขนาด ต้องวัดใหม่
if (document.fonts) document.fonts.ready.then(() => { sizeCards(); fitToStage(); });

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
        showSets(data.tournament || {}, data.teams || []);
    } catch (error) {
        window.RovOverlay.note('Could not load that tournament.');
        settleSoon(0);
    }
}

load();
