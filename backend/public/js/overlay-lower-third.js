// แถบชื่อ (ผู้บรรยาย แขก ผู้เล่น) ขึ้นและลงจากแผงควบคุม: state.broadcast.lowerThird
// ไม่มีข้อความเลยทั้งสามช่อง = ไม่ขึ้น แม้จะสั่งให้ขึ้น ไม่ให้แถบว่างค้างบนอากาศ
//
// เปลี่ยนข้อความตอนแถบขึ้นอยู่ จะพาแถบลงแล้วขึ้นใหม่ให้อนิเมชันเข้าเล่นอีกรอบ
// ส่วนตอนแถบลงอยู่ ข้อความเปลี่ยนเงียบๆ ไม่ต้องรอ
//
// หน้านี้เป็นหน้าดูอย่างเดียว ต่อ socket เปล่าๆ ไม่ต้องมีโทเคน

const params = new URLSearchParams(window.location.search);

// overlay-size.js ไปอ่านตัวแปรชื่อ socket ตัวนี้ ต้องประกาศไว้ก่อนไฟล์นั้นถูกโหลด
const socket = io();

const B = window.RovBroadcast;
// any: ทั้งภาพ canvas และข้อความถูกดึงด้วยฟังก์ชันเดียว ตัวเช็คชนิดไม่รู้ว่า id ไหนเป็นอะไร
const el = (id) => /** @type {any} */ (document.getElementById(id));
// ต้องตรงกับ transition ใน overlay-broadcast.css (.bc-lt) ที่ใช้เวลาลง
const HIDE_MS = 600;

if (params.has('preview')) document.body.classList.add('bc-preview');

// แถบหนึ่งแถบ: องค์ประกอบ ข้อความที่ขึ้นอยู่ และตัวจับเวลาของมันเอง (แต่ละแถบลงขึ้นอิสระ)
const cards = [];

function build() {
    const box = document.createElement('div');
    box.className = 'bc-lt';
    box.hidden = true;
    box.innerHTML = '<div class="stripe"></div><div class="body bc-panel bc-cut-r">'
        + '<div class="name"></div><div class="meta"><span class="title"></span><span class="handle"></span></div></div>';
    const card = {
        box, shown: '', timer: 0,
        name: box.querySelector('.name'), title: box.querySelector('.title'), handle: box.querySelector('.handle')
    };
    el('stack').appendChild(box);
    return card;
}

function paint(card, lt) {
    B.setText(card.name, lt.name);
    B.setText(card.title, lt.title);
    B.setText(card.handle, lt.handle);
    card.title.hidden = !lt.title;
    card.handle.hidden = !lt.handle;
}

function show(card) {
    card.box.hidden = false;
    // ให้เบราว์เซอร์เห็นสถานะซ่อนก่อน ไม่งั้นแถบที่เพิ่งโผล่ไม่เล่นอนิเมชันเข้า
    void card.box.offsetWidth;
    card.box.classList.add('on');
}

function update(card, lt) {
    const text = [lt.name, lt.title, lt.handle].join('|');
    const want = lt.visible && (lt.name || lt.title || lt.handle);
    const on = card.box.classList.contains('on');

    clearTimeout(card.timer);
    if (!want) {
        card.box.classList.remove('on');
        // ข้อความค้างไว้ให้ลงสวยๆ แล้วค่อยล้างและเอาออกจากการจัดวาง ไม่งั้นแถบว่างกินที่ของแถบถัดไป
        card.timer = window.setTimeout(() => {
            if (card.box.classList.contains('on')) return;
            paint(card, lt);
            card.box.hidden = true;
        }, HIDE_MS);
        card.shown = '';
        return;
    }
    if (on && card.shown !== text) {
        // เปลี่ยนข้อความตอนขึ้นอยู่: ลงแล้วขึ้นใหม่ให้อนิเมชันเข้าเล่นอีกรอบ
        card.box.classList.remove('on');
        card.timer = window.setTimeout(() => { paint(card, lt); show(card); }, HIDE_MS);
    } else {
        paint(card, lt);
        show(card);
    }
    card.shown = text;
}

function render(state) {
    if (!state || !state.broadcast) return;
    // สีของหน้านี้ (ทับธีมของแอพเฉพาะตัวที่ตั้งแยกไว้) ดู RovBroadcast.coloursFor
    const colours = B.coloursFor(state, 'lower-third');
    B.applyTheme(colours);
    B.applyFontMode(state.fonts, 'lower-third');

    const list = state.broadcast.lowerThirds || [];
    while (cards.length < list.length) cards.push(build());
    // แถบที่ถูกลบ: เอาออกจากหน้าเลย (ไม่ต้องเล่นอนิเมชันลง ผู้ใช้สั่งลบแล้ว)
    while (cards.length > list.length) {
        const gone = cards.pop();
        clearTimeout(gone.timer);
        gone.box.remove();
    }
    list.forEach((lt, i) => update(cards[i], lt));
}

socket.on('stateUpdate', render);
