// ฉากเต็มจอคั่นรายการ: Starting soon, BRB, Ending
//
//   ?scene=starting|brb|ending   ไม่ใส่ = starting
//
// ข้อความหัวเรื่องมาจาก state.broadcast.text (ว่าง = ข้อความมาตรฐานด้านล่าง)
// นาฬิกานับถอยหลังมาจาก state.broadcast.countdown และเดินด้วยนาฬิกาเครื่อง ไม่ใช่ทุก stateUpdate
// ไม่แตะ DOM ถ้าค่าไม่เปลี่ยน: stateUpdate มาถี่ ถ้าเขียนซ้ำอนิเมชันเข้าจะเล่นใหม่ทุกครั้ง
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน เหมือน /overlay-teams

const params = new URLSearchParams(window.location.search);

// overlay-size.js ไปอ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศไว้ก่อนไฟล์นั้นถูกโหลด
const socket = io();

const B = window.RovBroadcast;
const scene = ['starting', 'brb', 'ending'].includes(params.get('scene') || '') ? params.get('scene') : 'starting';

const DEFAULTS = {
    starting: { title: 'STARTING SOON', subtitle: '' },
    brb: { title: 'BE RIGHT BACK', subtitle: 'We will be back shortly' },
    ending: { title: 'THANKS FOR WATCHING', subtitle: 'See you next time' }
};

// any: ทั้งภาพ canvas และข้อความถูกดึงด้วยฟังก์ชันเดียว ตัวเช็คชนิดไม่รู้ว่า id ไหนเป็นอะไร
const el = (id) => /** @type {any} */ (document.getElementById(id));
const updateBackground = B.createBackground(el('bg'));
let countdown = null;

if (params.has('preview')) document.body.classList.add('bc-preview');

function texts(state) {
    const t = (state.broadcast && state.broadcast.text) || {};
    const d = DEFAULTS[scene];
    if (scene === 'starting') return { title: t.startingTitle || d.title, subtitle: '' };
    if (scene === 'brb') return { title: t.brbTitle || d.title, subtitle: t.brbSubtitle || d.subtitle };
    return { title: t.endingTitle || d.title, subtitle: t.endingSubtitle || d.subtitle };
}

function tickClock() {
    const box = el('count');
    if (scene !== 'starting') { box.hidden = true; return; }
    const left = B.secondsLeft(countdown, Date.now());
    // ไม่ได้ตั้งนาฬิกา: ไม่ขึ้นกล่องว่างๆ บนจอ
    if (left === null) { box.hidden = true; return; }
    box.hidden = false;
    B.setText(el('clock'), left > 0 ? B.formatClock(left) : 'LIVE NOW');
}
setInterval(tickClock, 250);

function render(state) {
    if (!state || !state.broadcast) return;
    // สีของหน้านี้ (ทับธีมของแอพเฉพาะตัวที่ตั้งแยกไว้) ดู RovBroadcast.coloursFor
    const colours = B.coloursFor(state, 'scene');
    B.applyTheme(colours);
    B.applyFontMode(state.fonts, 'scene');
    updateBackground(B.backgroundFor(state.broadcast, scene), colours);

    const { title, subtitle } = texts(state);
    const info = state.matchInfo || {};
    const headlineChanged = B.setText(el('headline'), title);
    B.setText(el('kicker'), info.tournament || '');
    B.setText(el('subline'), subtitle);
    el('subline').hidden = !subtitle;
    // บรรทัดบนบอกรายการแล้ว แถบล่างจึงบอกคู่กับเกมที่เท่าไหร่ ไม่พูดซ้ำ
    // BO อ่านจาก "[BO5]" ท้ายชื่อแมตช์ (ชื่อเต็มยาวเกินแถบ) แมตช์เดี่ยวไม่มี ก็ไม่ขึ้นป้ายนี้
    const bo = /\[BO(\d{1,2})\]/i.exec(info.title || '');
    B.setText(el('chipLeft'), bo ? 'BO' + bo[1] : '');
    el('chipLeft').hidden = !bo;
    B.setText(el('chipRight'), 'GAME ' + state.round);
    el('chipRight').hidden = scene === 'ending';
    if (headlineChanged) B.fitHeadline(el('headline'), 1720);

    countdown = state.broadcast.countdown;
    const label = (countdown && countdown.label) || '';
    B.setText(el('countLabel'), label);
    el('countLabel').hidden = !label;
    tickClock();

    // BRB: คะแนนตอนนี้ ใช้ป้ายตามฝั่งบนจอ (ทีมสลับฝั่งทุกเกม)
    el('scoreLine').hidden = scene !== 'brb';
    if (scene === 'brb') {
        B.setText(el('blueTag'), state.teamBlue.tag || state.teamBlue.name);
        B.setText(el('redTag'), state.teamRed.tag || state.teamRed.name);
        B.setText(el('blueScore'), state.teamBlue.score);
        B.setText(el('redScore'), state.teamRed.score);
    }

    // Ending: ป้ายผู้ชนะ ขึ้นเมื่อมีทีมนำเท่านั้น (ดู RovBroadcast.leader)
    const lead = scene === 'ending' ? B.leader(state) : null;
    el('winner').hidden = !lead;
    if (lead) {
        B.setText(el('winnerLabel'), 'WINNER');
        B.setText(el('winnerName'), lead.team.name);
        el('winnerName').style.background = lead.key === 'teamBlue' ? 'var(--bc-blue)' : 'var(--bc-red)';
    }
}

socket.on('stateUpdate', render);
