// หัวต่อหัว: สองทีมนี้เคยเจอกันมาแล้วยังไง
//
// ทุกตัวเลขในหน้านี้อ่านจากดราฟต์และผู้ชนะรายเกมที่แอพเก็บอยู่แล้วตั้งแต่ Phase 5
// ไม่มีข้อมูลใหม่ที่ต้องกรอกเพิ่มเลย มันแค่ไม่เคยถูกเอาขึ้นจอ
//
// พารามิเตอร์ที่รับ (ต่อท้าย URL ใน OBS ได้เลย):
//   ?a=<teamId>&b=<teamId>  ระบุคู่เอง ไม่ใส่ = คู่ที่กำลังออกอากาศ
//   ?title=                 เปลี่ยนหัวเรื่อง
//   ?refresh=<วินาที>       ดึงข้อมูลใหม่เป็นระยะ
//
// ไม่ใส่ a/b คือท่าปกติ: URL เดียวใช้ได้ทั้งงาน เปลี่ยนคู่ที่ออกอากาศแล้วกราฟิก
// ตามเอง ไม่ต้องไปแก้ browser source ใน OBS (หลักเดียวกับ /overlay-teams)
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน

const params = new URLSearchParams(window.location.search);

// overlay-size.js อ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศก่อนไฟล์นั้นถูกโหลด
const socket = io();

const ENTER_MS = 520;
const SAFETY_MS = 900;

let settleTimer = null;
let lastSignature = null;

const refreshSeconds = window.RovOverlay.intParam(params, 'refresh', 0, 5, 3600);

function heroRow(list, banned) {
    const box = document.createElement('div');
    box.className = 'mu-heroes';

    if (list.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mu-empty';
        empty.textContent = 'No games on record';
        box.appendChild(empty);
        return box;
    }

    list.forEach((entry) => {
        const cell = document.createElement('div');
        cell.className = 'mu-hero';

        const art = document.createElement('div');
        art.className = banned ? 'mu-art banned' : 'mu-art';
        // ไอคอนก่อน ถอยไปรูปเต็มถ้าไม่มี (ดู lib/hero-art.js)
        window.RovHeroArt.paint(art, entry.hero);
        cell.appendChild(art);

        // แสดงเลขเฉพาะตอนที่หยิบซ้ำ เลข 1 ทุกช่องคือหมึกที่ไม่ได้บอกอะไร
        // อยู่ในกรอบรูป ไม่ใช่ในช่อง: ใต้รูปมีอัตราชนะ ป้ายที่ยึดขอบช่องจะไปตกข้างตัวเลขนั้น
        if (entry.count > 1) {
            const count = document.createElement('div');
            count.className = 'mu-count';
            count.textContent = `x${entry.count}`;
            art.appendChild(count);
        }

        // อัตราชนะในคู่นี้ ใต้ช่องพิคเท่านั้น (แบนไม่มีผลแพ้ชนะของตัวมันเอง)
        if (!banned) {
            const rate = document.createElement('div');
            const decided = Number(entry.decided) || 0;
            const wins = Number(entry.wins) || 0;
            rate.className = decided === 0 ? 'mu-rate none' : wins * 2 < decided ? 'mu-rate low' : 'mu-rate';
            rate.textContent = decided === 0 ? '—' : `${Math.round((wins / decided) * 100)}%`;
            cell.appendChild(rate);
        }

        box.appendChild(cell);
    });

    return box;
}

function sideCard(side, which) {
    const card = document.createElement('div');
    card.className = `mu-side ${which}`;

    const name = document.createElement('div');
    name.className = 'mu-side-name';
    name.textContent = side.name || (which === 'blue' ? 'BLUE' : 'RED');

    const pickLabel = document.createElement('div');
    pickLabel.className = 'mu-label';
    pickLabel.textContent = 'Most picked in this matchup · win rate';

    const banLabel = document.createElement('div');
    banLabel.className = 'mu-label';
    banLabel.textContent = 'Most banned by them';

    card.append(
        name,
        pickLabel, heroRow(side.topPicks || [], false),
        banLabel, heroRow(side.topBans || [], true)
    );
    return card;
}

// ซีรีส์ที่เคยเจอกัน ล่าสุดก่อน สูงสุดสามแถว (API ส่งมาอยู่แล้วแต่ไม่เคยขึ้นจอ รีวิว 2026-09-30)
function roundLabel(meeting) {
    const bracket = meeting.bracket && meeting.bracket !== 'main'
        ? meeting.bracket.charAt(0).toUpperCase() + meeting.bracket.slice(1) + ' '
        : '';
    return `${bracket}Round ${meeting.round}`;
}

function renderMeetings(matchup) {
    const box = document.getElementById('meetings');
    if (!box) return;
    box.textContent = '';
    const list = (matchup.meetings || []).slice(0, 3);
    box.hidden = list.length === 0;
    if (list.length === 0) return;

    const label = document.createElement('div');
    label.className = 'mu-label';
    label.textContent = 'Previous meetings';
    box.appendChild(label);

    list.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'mu-meeting';

        const where = document.createElement('div');
        where.className = 'mu-meeting-where';
        where.textContent = `${m.tournamentName} · ${roundLabel(m)}`;

        const score = document.createElement('div');
        score.className = 'mu-meeting-score';
        const a = document.createElement('span');
        a.className = m.winnerId === matchup.a.teamId ? 'blue won' : 'blue';
        a.textContent = String(m.scoreA);
        const b = document.createElement('span');
        b.className = m.winnerId === matchup.b.teamId ? 'red won' : 'red';
        b.textContent = String(m.scoreB);
        score.append(a, document.createTextNode(' – '), b);

        const who = document.createElement('div');
        who.className = 'mu-meeting-winner';
        who.textContent = m.winnerId === null ? 'In progress'
            : m.winnerId === matchup.a.teamId ? `${matchup.a.name} won` : `${matchup.b.name} won`;

        row.append(where, score, who);
        box.appendChild(row);
    });
}

function settleSoon() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
        document.getElementById('stage').classList.add('settled');
    }, ENTER_MS + SAFETY_MS);
}

function render(matchup) {
    // ข้อความแจ้งเตือนต้องถูกตัดสินใหม่ทุกครั้งที่โหลดสำเร็จ ไม่ใช่เฉพาะตอนข้อมูลเปลี่ยน
    //
    // ต้องอยู่ "เหนือ" ด่านลายเซ็นข้างล่าง วัดมาแล้ว: ดึงพลาดหนึ่งครั้งจะขึ้น
    // "Could not load the head to head." แล้วการดึงรอบถัดไปที่สำเร็จได้ข้อมูล
    // ชุดเดิม ลายเซ็นจึงเท่าเดิม แล้วออกตั้งแต่บรรทัดล่างนี้ ผลคือข้อความว่า
    // โหลดไม่ได้ค้างอยู่บนออกอากาศตลอดไป ทั้งที่ข้อมูลมาครบแล้ว
    window.RovOverlay.note(matchup.seriesPlayed === 0 ? 'These two have not met before.' : '');

    // วาดใหม่เฉพาะตอนข้อมูลเปลี่ยนจริง
    //
    // หน้านี้ดึงข้อมูลซ้ำได้ทั้งจาก ?refresh= และจากการเปลี่ยนคู่ที่ออกอากาศ
    // วาดใหม่ทุกครั้งแปลว่าอนิเมชันเข้าเล่นซ้ำเรื่อยๆ บนจอที่ไม่มีอะไรเปลี่ยน
    const signature = JSON.stringify(matchup);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const stage = document.getElementById('stage');
    stage.classList.remove('settled');

    document.getElementById('title').textContent =
        params.get('title') || `${matchup.a.name} vs ${matchup.b.name}`;
    document.getElementById('subtitle').textContent = params.get('subtitle') || 'Head to head';
    document.title = `${matchup.a.name} vs ${matchup.b.name} - Nuzka`;

    document.getElementById('nameA').textContent = matchup.a.name || 'BLUE';
    document.getElementById('nameB').textContent = matchup.b.name || 'RED';

    const numA = document.getElementById('numA');
    const numB = document.getElementById('numB');
    numA.textContent = String(matchup.a.seriesWon);
    numB.textContent = String(matchup.b.seriesWon);
    numA.classList.toggle('lead', matchup.a.seriesWon > matchup.b.seriesWon);
    numB.classList.toggle('lead', matchup.b.seriesWon > matchup.a.seriesWon);

    const scope = document.getElementById('scope');
    scope.textContent = matchup.seriesPlayed === 0
        ? 'First meeting'
        : `${matchup.seriesPlayed} series · ${matchup.gamesPlayed} games · `
          + `${matchup.a.gamesWon}-${matchup.b.gamesWon} on games`;

    const cols = document.getElementById('cols');
    cols.textContent = '';
    cols.append(sideCard(matchup.a, 'blue'), sideCard(matchup.b, 'red'));
    renderMeetings(matchup);

    settleSoon();
}

async function load() {
    const query = [];
    if (params.get('a')) query.push(`a=${encodeURIComponent(params.get('a'))}`);
    if (params.get('b')) query.push(`b=${encodeURIComponent(params.get('b'))}`);
    const url = `/api/matchup${query.length ? `?${query.join('&')}` : ''}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            window.RovOverlay.note('No match is on air yet.');
            settleSoon();
            return;
        }
        const data = await response.json();
        render(data.matchup);
    } catch (error) {
        window.RovOverlay.note('Could not load the head to head.');
        settleSoon();
    }
}

load();
if (refreshSeconds > 0) setInterval(load, refreshSeconds * 1000);
