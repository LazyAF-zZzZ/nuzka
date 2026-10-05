// สกอร์บอร์ดบนหัวจอ: ทีม ตัวย่อ โลโก้ และคะแนนซีรีส์ ตามฝั่งบนจอ
// ทีมสลับฝั่งทุกเกม (state.swapSidesEachRound) ป้ายกับสีจึงสลับตามเอง
// คะแนนคือ team.score เดียวกับหน้า Control (+1 / -1) ไม่ได้อ่านจากตารางแข่งเอง
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน

const params = new URLSearchParams(window.location.search);

// overlay-size.js ไปอ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศไว้ก่อนไฟล์นั้นถูกโหลด
const socket = io();

const B = window.RovBroadcast;
// any: ทั้งภาพ canvas และข้อความถูกดึงด้วยฟังก์ชันเดียว ตัวเช็คชนิดไม่รู้ว่า id ไหนเป็นอะไร
const el = (id) => /** @type {any} */ (document.getElementById(id));

if (params.has('preview')) document.body.classList.add('bc-preview');

function score(id, value) {
    // เด้งเฉพาะตอนค่าเปลี่ยนจริง และไม่เด้งตอนแรกที่โหลด (ยังไม่มีค่าเดิม)
    const node = el(id);
    const had = node.textContent !== '';
    if (B.setText(node, value) && had) B.bump(node);
}

function render(state) {
    if (!state || !state.broadcast) return;
    // สีของหน้านี้ (ทับธีมของแอพเฉพาะตัวที่ตั้งแยกไว้) ดู RovBroadcast.coloursFor
    const colours = B.coloursFor(state, 'scoreboard');
    B.applyTheme(colours);
    B.applyFontMode(state.fonts, 'scoreboard');

    const blue = state.teamBlue;
    const red = state.teamRed;
    B.setText(el('blueTag'), blue.tag || blue.name);
    B.setText(el('blueName'), blue.tag ? blue.name : '');
    B.setText(el('redTag'), red.tag || red.name);
    B.setText(el('redName'), red.tag ? red.name : '');
    B.setLogo(el('blueLogo'), B.logoUrl('teamBlue', blue.logo));
    B.setLogo(el('redLogo'), B.logoUrl('teamRed', red.logo));
    score('blueScore', blue.score);
    score('redScore', red.score);

    const info = state.matchInfo || {};
    // ตรงกลางบอกแค่ BO กับเกมที่เท่าไหร่ ชื่อแมตช์ยาวเกินกล่อง (ขอ 2026-10-02)
    // BO อ่านจากท้ายชื่อแมตช์ "[BO5]" ที่ goLive ใส่ให้ แมตช์เดี่ยวไม่มี ก็ไม่ขึ้นบรรทัดนั้น
    const bo = /\[BO(\d{1,2})\]/i.exec(info.title || '');
    B.setText(el('midTitle'), bo ? 'BO' + bo[1] : '');
    el('midTitle').hidden = !bo;
    B.setText(el('midGame'), 'GAME ' + state.round);
    B.setText(el('eventTab'), info.tournament || '');
    el('eventTab').hidden = !info.tournament;
}

socket.on('stateUpdate', render);
