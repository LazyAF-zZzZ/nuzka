// The few pages a buyer sees after Stripe: their key, "still waiting", "cancelled", and
// errors. Thai or English by ?lang= (the app passes its own language), dark and gold like
// the app. One self-contained HTML string each: no files, no scripts from anywhere else.

const TEXT = {
  en: {
    title: 'Nuzka supporter key',
    thanks: 'Thank you for supporting Nuzka!',
    yourKey: 'Your key',
    copy: 'Copy key',
    copied: 'Copied',
    howTo: 'In Nuzka, open <b>Support</b> (or Settings), paste the key and press <b>Use this key</b>. The watermark goes at once.',
    validUntil: (name, date) => `For <b>${name}</b>, valid until <b>${date}</b> (Bangkok time).`,
    keep: 'Keep this page\'s address: opening it again shows the same key.',
    waitingTitle: 'Waiting for your payment',
    waiting: 'Stripe has not confirmed the payment yet. This page checks again every few seconds.',
    cancelledTitle: 'Payment cancelled',
    cancelled: 'Nothing was charged. You can close this page, or go back to Nuzka and try again.',
    errorTitle: 'Something went wrong',
    notOurs: 'That payment is not a Nuzka supporter payment.',
    badLink: 'This link is not complete. Open the page Stripe sent you to after paying.',
    stripeDown: 'Could not reach the payment service. Please try again in a minute.',
    help: 'Paid but no key? Keep your Stripe receipt and contact the maker of Nuzka.',
    home: 'Nuzka supporter keys. Buy one from inside the app: <b>Support</b> → <b>Get a key</b>.',
    chooseTitle: 'Choose how long to support Nuzka',
    chooseIntro: 'You pay once for the time you pick. Your key works until it runs out and nothing renews by itself.',
    planName: { month: '1 month', quarter: '3 months', year: '1 year' },
    perMonth: (baht) => `about ${baht} a month`,
    save: (baht) => `save ${baht}`,
    choose: 'Choose'
  },
  th: {
    title: 'คีย์ผู้สนับสนุน Nuzka',
    thanks: 'ขอบคุณที่สนับสนุน Nuzka!',
    yourKey: 'คีย์ของคุณ',
    copy: 'คัดลอกคีย์',
    copied: 'คัดลอกแล้ว',
    howTo: 'ในแอป Nuzka เปิดหน้า <b>สนับสนุน</b> (หรือ ตั้งค่า) วางคีย์ แล้วกด <b>ใช้คีย์นี้</b> ลายน้ำจะหายทันที',
    validUntil: (name, date) => `สำหรับ <b>${name}</b> ใช้ได้ถึง <b>${date}</b> (เวลาไทย)`,
    keep: 'เก็บลิงก์หน้านี้ไว้ เปิดอีกครั้งจะเห็นคีย์เดิม',
    waitingTitle: 'กำลังรอการชำระเงิน',
    waiting: 'Stripe ยังไม่ยืนยันการชำระเงิน หน้านี้จะตรวจใหม่ทุกไม่กี่วินาที',
    cancelledTitle: 'ยกเลิกการชำระเงินแล้ว',
    cancelled: 'ไม่มีการตัดเงิน ปิดหน้านี้ได้เลย หรือกลับไปที่ Nuzka แล้วลองใหม่',
    errorTitle: 'เกิดข้อผิดพลาด',
    notOurs: 'รายการนี้ไม่ใช่การสนับสนุน Nuzka',
    badLink: 'ลิงก์นี้ไม่ครบ เปิดหน้าที่ Stripe พามาหลังชำระเงิน',
    stripeDown: 'ติดต่อระบบชำระเงินไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่',
    help: 'จ่ายแล้วแต่ไม่ได้คีย์? เก็บใบเสร็จจาก Stripe ไว้ แล้วติดต่อผู้พัฒนา Nuzka',
    home: 'คีย์ผู้สนับสนุน Nuzka ซื้อได้จากในแอป: <b>สนับสนุน</b> → <b>รับคีย์</b>',
    chooseTitle: 'เลือกระยะเวลาที่จะสนับสนุน Nuzka',
    chooseIntro: 'จ่ายครั้งเดียวตามระยะเวลาที่เลือก คีย์ใช้ได้จนหมดอายุ และไม่ต่ออายุเอง',
    planName: { month: '1 เดือน', quarter: '3 เดือน', year: '1 ปี' },
    perMonth: (baht) => `เฉลี่ยเดือนละ ${baht}`,
    save: (baht) => `ประหยัด ${baht}`,
    choose: 'เลือก'
  }
};

export function pickLang(value) {
  return value === 'th' ? 'th' : 'en';
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// "2026-10-28" as people write it; Thai uses the Buddhist year, as the app does.
function showDate(iso, lang) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function layout(lang, title, inner, { refresh } = {}) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ''}
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#0d0f14; --card:#161a22; --line:#262b36; --text:#e8e8ea; --muted:#9aa0ab; --gold:#d9b36c; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px 16px;
         background:var(--bg); color:var(--text); font:15px/1.55 "Segoe UI", "Noto Sans Thai", system-ui, sans-serif; }
  main { width:100%; max-width:560px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:28px; }
  .brand { color:var(--gold); font-weight:700; letter-spacing:.08em; font-size:13px; margin-bottom:14px; }
  h1 { font-size:21px; margin:0 0 10px; }
  p { margin:10px 0; color:var(--muted); }
  p b { color:var(--text); }
  .label { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:20px 0 6px; }
  .key { font:13px/1.45 Consolas, "Cascadia Mono", monospace; word-break:break-all; background:#0a0c10;
         border:1px solid var(--line); border-radius:8px; padding:12px; color:var(--text); user-select:all; }
  button { margin-top:12px; background:var(--gold); color:#1a1408; border:0; border-radius:7px; padding:10px 18px;
           font:600 14px "Segoe UI", system-ui, sans-serif; cursor:pointer; }
  .small { font-size:12.5px; }
  .plans { display:grid; gap:10px; margin-top:18px; }
  a.plan { display:flex; align-items:center; justify-content:space-between; gap:12px; text-decoration:none; color:var(--text);
           background:#0f131a; border:1px solid var(--line); border-radius:9px; padding:14px 16px; }
  a.plan:hover, a.plan:focus-visible { border-color:var(--gold); outline:none; }
  .plan .what { font-weight:600; }
  .plan .note { color:var(--muted); font-size:12.5px; margin-top:2px; }
  .plan .price { font-weight:700; font-size:18px; color:var(--gold); white-space:nowrap; }
  .plan .save { color:var(--gold); }
</style>
</head>
<body><main><div class="brand">NUZKA</div>${inner}</main></body>
</html>`;
}

export function keyPage(lang, { key, name, expires }) {
  const t = TEXT[lang];
  const inner = `
<h1>${t.thanks}</h1>
<p>${t.validUntil(escapeHtml(name), escapeHtml(showDate(expires, lang)))}</p>
<div class="label">${t.yourKey}</div>
<div class="key" id="key">${escapeHtml(key)}</div>
<button id="copy" type="button">${t.copy}</button>
<p>${t.howTo}</p>
<p class="small">${t.keep}</p>
<script>
  document.getElementById('copy').addEventListener('click', async function () {
    var text = document.getElementById('key').textContent;
    try { await navigator.clipboard.writeText(text); } catch (e) {
      var range = document.createRange(); range.selectNodeContents(document.getElementById('key'));
      var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); document.execCommand('copy');
    }
    this.textContent = ${JSON.stringify(t.copied)};
  });
</script>`;
  return layout(lang, t.title, inner);
}

export function waitingPage(lang) {
  const t = TEXT[lang];
  return layout(lang, t.title, `<h1>${t.waitingTitle}</h1><p>${t.waiting}</p><p class="small">${t.help}</p>`, { refresh: 5 });
}

export function cancelledPage(lang) {
  const t = TEXT[lang];
  return layout(lang, t.title, `<h1>${t.cancelledTitle}</h1><p>${t.cancelled}</p>`);
}

export function errorPage(lang, reason) {
  const t = TEXT[lang];
  return layout(lang, t.title, `<h1>${t.errorTitle}</h1><p>${t[reason] || t.stripeDown}</p><p class="small">${t.help}</p>`);
}

// ฿1,650 from 165000 satang. Whole baht: every plan price is a round number of baht.
function baht(satang) {
  return '฿' + Math.round(satang / 100).toLocaleString('en-US');
}

// The plan chooser. Savings are worked out from the live prices against paying month by month,
// so they stay true when a price changes and never need editing here.
export function planPage(lang, plans) {
  const t = TEXT[lang];
  const month = plans.find((p) => p.months === 1);
  const rows = plans.map((plan) => {
    let note = '';
    if (plan.months > 1) {
      const saved = month ? month.price * plan.months - plan.price : 0;
      const parts = [t.perMonth(baht(plan.price / plan.months))];
      if (saved > 0) parts.push(`<span class="save">${escapeHtml(t.save(baht(saved)))}</span>`);
      note = `<div class="note">${parts.join(' · ')}</div>`;
    }
    return `<a class="plan" href="/buy?plan=${escapeHtml(plan.id)}&amp;lang=${lang}">
  <span><span class="what">${escapeHtml(t.planName[plan.id] || plan.id)}</span>${note}</span>
  <span class="price">${escapeHtml(baht(plan.price))}</span>
</a>`;
  }).join('\n');
  return layout(lang, t.title, `<h1>${t.chooseTitle}</h1><p>${t.chooseIntro}</p><div class="plans">\n${rows}\n</div>`);
}

export function homePage(lang) {
  const t = TEXT[lang];
  return layout(lang, t.title, `<h1>${t.title}</h1><p>${t.home}</p>`);
}
