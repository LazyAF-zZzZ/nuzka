// หน้า VS: สองทีมที่กำลังจะเจอกัน ตามฝั่งบนจอ (น้ำเงินซ้าย แดงขวา)
// ทีมสลับฝั่งทุกเกม (state.swapSidesEachRound) หน้านี้จึงสลับตามเอง ไม่ต้องตั้งอะไร
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน

const params = new URLSearchParams(window.location.search);

// overlay-size.js ไปอ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศไว้ก่อนไฟล์นั้นถูกโหลด
const socket = io();

const B = window.RovBroadcast;
// any: ทั้งภาพ canvas และข้อความถูกดึงด้วยฟังก์ชันเดียว ตัวเช็คชนิดไม่รู้ว่า id ไหนเป็นอะไร
const el = (id) => /** @type {any} */ (document.getElementById(id));
const updateBackground = B.createBackground(el('bg'));
let lastSides = '';

if (params.has('preview')) document.body.classList.add('bc-preview');

function replayEntrance() {
    document.querySelectorAll('.bc-side, .bc-vs, .bc-footer').forEach((node) => {
        const target = /** @type {HTMLElement} */ (node);
        target.style.animation = 'none';
        void target.offsetWidth;
        target.style.animation = '';
    });
}

function render(state) {
    if (!state || !state.broadcast) return;
    // สีของหน้านี้ (ทับธีมของแอพเฉพาะตัวที่ตั้งแยกไว้) ดู RovBroadcast.coloursFor
    const colours = B.coloursFor(state, 'vs');
    B.applyTheme(colours);
    B.applyFontMode(state.fonts, 'vs');
    updateBackground(B.backgroundFor(state.broadcast, 'vs'), colours);

    const blue = state.teamBlue;
    const red = state.teamRed;
    // ทีมที่ไม่มีแท็กขึ้นชื่อเต็มตัวใหญ่ ชื่อยาวต้องย่อไม่ให้ทับกลางจอ (กว้างสูงสุด 640px ต่อฝั่ง: ครึ่งจอ 960 หักขอบ 140 และเว้นที่ให้ตัว VS)
    if (B.setText(el('blueTag'), blue.tag || blue.name)) B.fitHeadline(el('blueTag'), 640);
    B.setText(el('blueName'), blue.tag ? blue.name : '');
    if (B.setText(el('redTag'), red.tag || red.name)) B.fitHeadline(el('redTag'), 640);
    B.setText(el('redName'), red.tag ? red.name : '');
    B.setLogo(el('blueLogo'), B.logoUrl('teamBlue', blue.logo));
    B.setLogo(el('redLogo'), B.logoUrl('teamRed', red.logo));
    B.setText(el('footTournament'), (state.matchInfo && state.matchInfo.tournament) || '');
    // ล่างจอบอกแค่ BO กับเกมที่เท่าไหร่ เหมือนสกอร์บอร์ด (ชื่อแมตช์ยาวเกิน) BO อ่านจาก "[BO5]" ท้ายชื่อแมตช์
    const bo = /\[BO(\d{1,2})\]/i.exec((state.matchInfo && state.matchInfo.title) || '');
    B.setText(el('footTitle'), (bo ? 'BO' + bo[1] + ' · ' : '') + 'GAME ' + state.round);

    // เล่นอนิเมชันเข้าใหม่เมื่อคู่เปลี่ยน (หรือสลับฝั่ง) ไม่ใช่ทุก state
    const sides = [blue.name, red.name, blue.logo && blue.logo.v, red.logo && red.logo.v].join('|');
    if (lastSides && sides !== lastSides) replayEntrance();
    lastSides = sides;
}

socket.on('stateUpdate', render);
