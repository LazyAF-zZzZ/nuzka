// ของที่ฉากเต็มจอ, VS, lower third และสกอร์บอร์ดใช้ร่วมกัน
//
// ที่มา: ชุด overlay ของ stock-studio (overlay.js) ปรับให้ตามสถานะของ Nuzka แทนที่จะมี
// config.js กับ localStorage ของตัวเอง ทุกอย่างมาทาง stateUpdate เหมือนหน้าออกอากาศอื่น
//
// วิธีใช้ (ลำดับสำคัญ: หน้าต้องประกาศ `const socket = io()` ก่อน overlay-size.js)
//   <script src="/js/lib/motion-core.js"></script>
//   <script src="/js/lib/overlay-broadcast.js"></script>
//   <script src="/js/overlay-xxx.js"></script>   // ประกาศ socket แล้วเรียก RovBroadcast.connect(...)

(function (global) {
  const LOGO_FILES = { teamBlue: 'blue-team', teamRed: 'red-team' };

  // ธีมของแอพ -> ตัวแปร CSS ของชุดนี้ ค่าไม่ถูกต้องถูกกรองมาแล้วที่เซิร์ฟเวอร์ (sanitizeTheme)
  function applyTheme(theme) {
    const root = document.documentElement.style;
    const t = theme || {};
    if (t.blue) root.setProperty('--bc-blue', t.blue);
    if (t.red) root.setProperty('--bc-red', t.red);
    if (t.accent) root.setProperty('--bc-accent', t.accent);
    if (t.text) root.setProperty('--bc-text', t.text);
  }

  // สีที่หน้านี้ใช้จริง: สีของหน้า (state.broadcast.colours[scene]) ทับสีธีมของแอพ ตัวที่ไม่ได้ตั้งตามธีม
  // คืนอ็อบเจ็กต์ที่ใช้แทน theme ได้เลย (ทั้ง applyTheme และพาเลต 'theme' ของพื้นหลัง)
  function coloursFor(state, scene) {
    const own = (state.broadcast && state.broadcast.colours && state.broadcast.colours[scene]) || {};
    return Object.assign({}, state.theme, own);
  }

  // ผู้ใช้เลือกฟอนต์ให้หน้านี้ไว้ไหม (ค่าเฉพาะหน้าชนะค่ารวม เหมือน overlay-fonts.js)
  // name/number ใช้ face เดียวกับหัวเรื่องในชุดนี้ จึงนับรวมกับ heading
  function applyFontMode(fonts, scene) {
    const all = (fonts && fonts.all) || {};
    const page = (fonts && fonts.pages && fonts.pages[scene]) || {};
    const chosen = (role) => Boolean(page[role] || all[role]);
    document.body.classList.toggle('bc-font-heading', ['heading', 'name', 'number'].some(chosen));
    document.body.classList.toggle('bc-font-body', chosen('body'));
  }

  // URL ของโลโก้ทีม หรือ '' ถ้ายังไม่มี เหมือน renderTeamLogo ใน overlay.js:
  // ชื่อไฟล์มาจาก state (logo.src) ไม่ได้เดาจากฝั่ง เพราะทีมสลับฝั่งทุกเกม
  function logoUrl(teamKey, logo) {
    const version = (logo && logo.v) || 0;
    const ext = (logo && logo.ext) || '';
    if (!version || !ext) return '';
    return 'images/team-logos/' + ((logo && logo.src) || LOGO_FILES[teamKey]) + '.' + ext + '?v=' + version;
  }

  // ใส่ภาพเฉพาะตอนที่ URL เปลี่ยนจริง ตั้ง src ซ้ำทุก state ทำให้ภาพกะพริบบนอากาศ
  function setLogo(img, url) {
    if (!img) return;
    if (!url) {
      img.hidden = true;
      img.removeAttribute('src');
      img.dataset.url = '';
      return;
    }
    if (img.dataset.url !== url) {
      img.dataset.url = url;
      // ไฟล์หายแต่ state ยังจำได้ (ย้ายเครื่อง/คืนค่าเก่า): ซ่อนไว้ ไม่ให้เหลือกรอบรูปแตก
      img.onerror = () => {
        img.hidden = true;
        img.dataset.url = '';
      };
      img.src = url;
    }
    img.hidden = false;
  }

  function setText(el, value) {
    if (!el) return false;
    const text = value == null ? '' : String(value);
    if (el.textContent === text) return false;
    el.textContent = text;
    return true;
  }

  // ย้อนอนิเมชัน "เด้ง" เมื่อค่าเปลี่ยน (คะแนน) ไม่ใช่ทุกครั้งที่ state มา
  function bump(el) {
    el.classList.remove('bc-bump');
    void el.offsetWidth;
    el.classList.add('bc-bump');
  }

  // ย่อหัวเรื่องยาวๆ ไม่ให้ล้นจอ (ค่าสูงสุดกว้าง 1720px จากชุดเดิม) ไม่ต่ำกว่า 40px
  function fitHeadline(el, maxWidth) {
    if (!el) return;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize) || 150;
    while (el.scrollWidth > maxWidth && size > 40) {
      size -= 4;
      el.style.fontSize = size + 'px';
    }
  }

  // พื้นหลังที่ฉากนี้ใช้จริง: ตัวกลางแล้วค่าทับของฉาก (ตรงกับ effectiveBackground ฝั่งเซิร์ฟเวอร์)
  // enabled: เปิดอยู่เองเฉพาะฉากที่เคยมีพื้นหลังอยู่แล้ว (ตรงกับ BACKGROUND_ON_BY_DEFAULT ฝั่งเซิร์ฟเวอร์) หน้าอื่นโปร่งใสมาตลอด
  // จึงต้องให้ผู้ใช้เปิดเอง
  const ON_BY_DEFAULT = ['starting', 'brb', 'ending', 'vs'];
  function backgroundFor(broadcast, scene) {
    const own = (broadcast && broadcast.sceneBackgrounds && broadcast.sceneBackgrounds[scene]) || {};
    const merged = Object.assign({}, broadcast && broadcast.background, own);
    merged.enabled = typeof own.enabled === 'boolean' ? own.enabled : ON_BY_DEFAULT.includes(scene);
    return merged;
  }

  // 'theme' = พาเลตจากสีธีมของแอพ ที่เหลือเป็นชื่อพรีเซ็ตใน motion-core
  function themePalette(theme) {
    const M = global.MotionCore;
    const t = theme || {};
    const blue = t.blue || '#38bdf8';
    return {
      name: 'Theme',
      bg: '#060609',
      bg2: M.mix(blue, '#000000', 0.82),
      colors: [blue, t.red || '#f87171', t.accent || '#f59e0b'],
      kw: []
    };
  }

  // พื้นหลังเคลื่อนไหวลงใน <canvas> วาดเฟรมใหม่ด้วย requestAnimationFrame
  //
  // สร้างตัววาดใหม่เมื่อ "ค่าที่มีผลต่อภาพ" เปลี่ยนเท่านั้น (สไตล์ พาเลต seed คุณภาพ สีธีม)
  // state มาทุกวินาทีตอนนับเวลา ถ้าสร้างใหม่ทุกครั้งภาพจะกระตุกกลับไปเฟรมแรก
  function createBackground(canvas) {
    let key = '';
    let raf = 0;
    const startedAt = performance.now();

    return function update(background, theme) {
      const M = global.MotionCore;
      if (!M || !canvas) return;
      const b = background || {};
      // ปิดไว้ = โปร่งใส: หยุดวาด ซ่อน canvas และซ่อนแผ่นเงาที่ทับมันด้วย (body.nz-bg-off)
      const off = b.enabled === false;
      document.body.classList.toggle('nz-bg-off', off);
      canvas.hidden = off;
      if (off) {
        cancelAnimationFrame(raf);
        key = '';
        return;
      }
      const useTheme = b.palette === 'theme' || !M.PALETTES[b.palette];
      const next = JSON.stringify([b.style, b.palette, b.seed, b.quality, useTheme ? theme : null]);
      if (next === key) return;
      key = next;

      const quality = Math.max(0.25, Math.min(1, b.quality || 0.75));
      canvas.width = Math.round(1920 * quality);
      canvas.height = Math.round(1080 * quality);

      const renderer = M.create({
        style: M.STYLES[b.style] ? b.style : 'aurora',
        palette: useTheme ? themePalette(theme) : b.palette,
        seed: Number.isFinite(b.seed) ? b.seed : 1,
        createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })
      });
      const ctx = canvas.getContext('2d');
      const seconds = renderer.style.seconds || 12;

      cancelAnimationFrame(raf);
      const frame = (now) => {
        renderer.draw(ctx, ((now - startedAt) / 1000 / seconds) % 1, canvas.width, canvas.height);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
  }

  // mm:ss ของเวลาที่เหลือ หรือ null ถ้าไม่มีนาฬิกา (ไม่ได้ตั้ง)
  // ต่ำกว่า 0 = ถึงเวลาแล้ว คนเรียกตัดสินเองว่าจะขึ้นอะไร
  function secondsLeft(countdown, now) {
    if (!countdown || !countdown.endsAt) return null;
    return Math.ceil((countdown.endsAt - now) / 1000);
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    const two = (n) => String(n).padStart(2, '0');
    return hours > 0 ? hours + ':' + two(minutes) + ':' + two(seconds) : two(minutes) + ':' + two(seconds);
  }

  // ผู้ชนะซีรีส์จากคะแนน: ทีมที่นำอยู่ ถ้าเสมอคืน null
  // ไม่รู้ว่าแข่ง best-of อะไร (state ของ overlay ไม่เก็บ) ฉากจบจึงขึ้นป้ายผู้ชนะเมื่อมีทีมที่นำเท่านั้น
  function leader(state) {
    const blue = state.teamBlue.score;
    const red = state.teamRed.score;
    if (blue === red) return null;
    return blue > red ? { key: 'teamBlue', team: state.teamBlue } : { key: 'teamRed', team: state.teamRed };
  }

  global.RovBroadcast = {
    applyTheme, coloursFor, applyFontMode, logoUrl, setLogo, setText, bump, fitHeadline,
    createBackground, backgroundFor, secondsLeft, formatClock, leader
  };
})(window);
