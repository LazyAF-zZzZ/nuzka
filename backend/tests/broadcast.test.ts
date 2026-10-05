import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  BACKGROUND_STYLES,
  BACKGROUND_PALETTES,
  BACKGROUND_DEFAULT,
  COUNTDOWN_MAX_SECONDS,
  defaultBroadcast,
  sanitizeBackground,
  sanitizeBroadcast,
  sanitizeCountdown,
  sanitizeLowerThird,
  sanitizeSceneText,
  countdownEndsAt
} from '../server/domain/broadcast';
import { defaultState, sanitizeState } from '../server/domain/match';
import { carryOverSettings } from '../server/domain/settings';
import { PAGES } from '../server/http/pages';

const publicDir = path.join(__dirname, '..', '..', 'public');
const read = (rel: string) => fs.readFileSync(path.join(publicDir, rel), 'utf8');

test('a state with no broadcast block gets the defaults', () => {
  const state = sanitizeState({});
  assert.deepEqual(state.broadcast, defaultBroadcast());
  assert.equal(state.broadcast.lowerThirds[0].visible, false, 'nothing is on air until the operator says so');
  assert.equal(state.broadcast.countdown.endsAt, null);
});

test('unknown style, palette and junk numbers fall back instead of reaching the page', () => {
  const clean = sanitizeBackground({ style: 'lava-lamp', palette: '"><script>', seed: 'abc', quality: 'high' });
  assert.equal(clean.style, BACKGROUND_DEFAULT.style);
  assert.equal(clean.palette, BACKGROUND_DEFAULT.palette);
  assert.equal(clean.seed, BACKGROUND_DEFAULT.seed, 'a seed nobody can read falls to the default, not 0');
  assert.equal(clean.quality, BACKGROUND_DEFAULT.quality);

  // ค่าที่อยู่นอกช่วงถูกบีบเข้าช่วง ไม่ใช่ถูกทิ้ง
  assert.equal(sanitizeBackground({ quality: 5 }).quality, 1);
  assert.equal(sanitizeBackground({ quality: 0 }).quality, 0.25);
  assert.equal(sanitizeBackground({ seed: 0 }).seed, 0, '0 is a real seed');
  assert.equal(sanitizeBackground({ seed: -4 }).seed, 0);
});

test('every listed style and palette is accepted as is', () => {
  BACKGROUND_STYLES.forEach((style) => assert.equal(sanitizeBackground({ style }).style, style));
  BACKGROUND_PALETTES.forEach((palette) => assert.equal(sanitizeBackground({ palette }).palette, palette));
});

test('the lists the server accepts are exactly what motion-core can draw', () => {
  // motion-core.js ทำงานทั้งในเบราว์เซอร์และใน Node (module.exports) จึงโหลดมาตรวจตรงๆ ได้
  // รายการที่ไม่ตรงกันคือสไตล์ที่เลือกได้ในแอพแต่หน้าจอ throw 'Unknown style' กลางอากาศ
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require(path.join(publicDir, 'js', 'lib', 'motion-core.js')) as {
    STYLES: Record<string, unknown>;
    PALETTES: Record<string, unknown>;
  };
  assert.deepEqual([...BACKGROUND_STYLES].sort(), Object.keys(core.STYLES).sort());
  assert.deepEqual(
    BACKGROUND_PALETTES.filter((name) => name !== 'theme').sort(),
    Object.keys(core.PALETTES).sort()
  );
});

test('countdown keeps a real end time and drops nonsense', () => {
  assert.equal(sanitizeCountdown({ endsAt: 1_900_000_000_000 }).endsAt, 1_900_000_000_000);
  assert.equal(sanitizeCountdown({ endsAt: 'soon' }).endsAt, null);
  assert.equal(sanitizeCountdown({ endsAt: -5 }).endsAt, null);
  assert.equal(sanitizeCountdown({ endsAt: null }).endsAt, null, 'Number(null) is 0, which must not become a time');
  assert.equal(sanitizeCountdown({ label: 'x'.repeat(100) }).label.length, 40);
});

test('countdownEndsAt counts from now and is bounded', () => {
  assert.equal(countdownEndsAt(600, 1000), 1000 + 600_000);
  assert.equal(countdownEndsAt(0, 1000), 1000 + 1000, 'zero seconds still ticks once rather than ending instantly');
  assert.equal(countdownEndsAt(10 ** 9, 0), COUNTDOWN_MAX_SECONDS * 1000);
  assert.equal(countdownEndsAt(null, 1000), null);
  assert.equal(countdownEndsAt('', 1000), null);
  assert.equal(countdownEndsAt('abc', 1000), null);
});

test('lower third text is cleaned and capped', () => {
  const lt = sanitizeLowerThird({ visible: true, name: ' Somchai\u0007 ', title: 'x'.repeat(80), handle: 5 });
  assert.equal(lt.visible, true);
  assert.equal(lt.name, 'Somchai', 'control characters and padding are removed');
  assert.equal(lt.title.length, 40);
  assert.equal(lt.handle, '', 'a non-string is empty, not "5"');
  assert.equal(sanitizeLowerThird({ visible: 'true' }).visible, false, 'only a real true puts it on air');
});

test('scene text is capped', () => {
  const text = sanitizeSceneText({ brbSubtitle: 'y'.repeat(200), startingTitle: 7 });
  assert.equal(text.brbSubtitle.length, 60);
  assert.equal(text.startingTitle, '');
});

test('broadcast settings survive switching the match on air', () => {
  const previous = sanitizeState({});
  previous.broadcast.lowerThirds = [{ visible: true, name: 'Caster', title: 'Host', handle: '@caster' }, { visible: false, name: 'Guest', title: '', handle: '' }];
  previous.broadcast.background = sanitizeBackground({ style: 'waves', palette: 'ice', seed: 9 });

  const next = carryOverSettings(sanitizeState({ ...defaultState }), previous);
  assert.deepEqual(next.broadcast, previous.broadcast);
  // และเป็นสำเนา ไม่ใช่ก้อนเดียวกัน ไม่งั้นแก้ฝั่งหนึ่งไปโผล่อีกฝั่ง
  assert.notEqual(next.broadcast, previous.broadcast);
});

test('a saved state is not trusted to hold a valid broadcast', () => {
  const state = sanitizeState({ broadcast: { background: 'nope', countdown: [], lowerThird: 3, text: null } });
  assert.deepEqual(state.broadcast, sanitizeBroadcast({}));
});

// ---- the pages ----

const NEW_PAGES: Record<string, string> = {
  '/overlay-scene': 'overlay-scene.html',
  '/overlay-vs': 'overlay-vs.html',
  '/overlay-lower-third': 'overlay-lower-third.html',
  '/overlay-scoreboard': 'overlay-scoreboard.html'
};

test('the new overlays are routed and their files exist', () => {
  Object.entries(NEW_PAGES).forEach(([route, file]) => {
    assert.equal(PAGES[route], file, `${route} must be routed`);
    assert.ok(fs.existsSync(path.join(publicDir, file)), `${file} is missing`);
  });
});

test('each new overlay loads its scripts in the order that works', () => {
  Object.values(NEW_PAGES).forEach((file) => {
    const html = read(file);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    const page = scripts.find((src) => /\/js\/overlay-(scene|vs|lower-third|scoreboard)\.js$/.test(src));
    assert.ok(page, `${file} must load its own script`);

    const at = (src: string) => scripts.indexOf(src);
    // หน้าประกาศ socket ก่อน overlay-size.js กับ overlay-fonts.js ที่ไปอ่านตัวนั้น
    assert.ok(at(page!) > -1 && at(page!) < at('/js/overlay-size.js'), `${file}: page script before overlay-size.js`);
    assert.ok(at('/js/overlay-size.js') < at('/js/overlay-fonts.js'), `${file}: size before fonts`);
    // ตัวช่วยร่วมต้องมาก่อนหน้า ไม่งั้นหน้าพังที่บรรทัดแรกที่แตะ RovBroadcast
    assert.ok(at('/js/lib/overlay-broadcast.js') > -1 && at('/js/lib/overlay-broadcast.js') < at(page!),
      `${file}: overlay-broadcast.js before the page script`);
    assert.ok(at('/js/lib/motion-core.js') < at('/js/lib/overlay-broadcast.js'),
      `${file}: motion-core.js before overlay-broadcast.js`);
    // กราฟิกออกอากาศไม่โหลดแผ่นสไตล์ของคนคุมงานหรือตัวแปลภาษา (กฎใน backend/CLAUDE.md)
    assert.ok(!html.includes('theme.css') && !html.includes('i18n.js'), `${file} must stay an unthemed broadcast page`);
  });
});

test('every element id a page script reaches for exists in its page', () => {
  // getElementById คืน null แล้วหน้าพังตอนมีข้อมูลเข้า (ไม่ใช่ตอนเปิด) จึงตรวจให้ครบ
  Object.values(NEW_PAGES).forEach((file) => {
    const html = read(file);
    const js = read(`js/${file.replace('.html', '.js')}`);
    const ids = new Set([...js.matchAll(/\bel\('([A-Za-z]+)'\)/g)].map((m) => m[1]));
    const scoreIds = [...js.matchAll(/\bscore\('([A-Za-z]+)'/g)].map((m) => m[1]);
    scoreIds.forEach((id) => ids.add(id));
    assert.ok(ids.size > 0, `${file}: found no ids to check, the pattern is stale`);
    ids.forEach((id) => assert.ok(html.includes(`id="${id}"`), `${file} has no #${id}`));
  });
});

test('the OBS source lists agree on the new overlays', () => {
  const web = read('js/lib/obs-sources.js');
  const desktop = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'desktop', 'RovOverlay.Desktop', 'ViewModels', 'PageViewModels.cs'), 'utf8'
  );
  [
    ['/overlay-scene', 'scene=starting'], ['/overlay-scene', 'scene=brb'], ['/overlay-scene', 'scene=ending'],
    ['/overlay-vs', ''], ['/overlay-lower-third', ''], ['/overlay-scoreboard', '']
  ].forEach(([route, query]) => {
    assert.ok(web.includes(`path: '${route}'`), `obs-sources.js lacks ${route}`);
    assert.ok(desktop.includes(`"${route}${query ? '?' + query : ''}"`), `PageViewModels.cs lacks ${route} ${query}`);
  });
});

test('the bundled fonts are declared and shipped with their licence', () => {
  const css = read('css/fonts.css');
  ['Oxanium', 'Rajdhani'].forEach((family) => {
    assert.match(css, new RegExp(`font-family: '${family}'`), `${family} must be declared`);
    const dir = path.join(publicDir, 'fonts', family.toLowerCase());
    assert.ok(fs.existsSync(path.join(dir, 'OFL.txt')), `${family} ships without its licence`);
    // ทุกไฟล์ที่ CSS อ้างต้องมีอยู่จริง: ฟอนต์หายแล้วหน้าตกไป Kanit เงียบๆ
    [...css.matchAll(new RegExp(String.raw`url\('\.\./fonts/${family.toLowerCase()}/([^']+)'\)`, 'g'))].forEach((m) => {
      assert.ok(fs.existsSync(path.join(dir, m[1])), `${m[1]} is named in fonts.css but missing`);
    });
  });
});

// ---- per-scene backgrounds ----

import {
  applyBackgroundPatch,
  effectiveBackground,
  sanitizePartialBackground
} from '../server/domain/broadcast';

test('a scene background only stores what was set, and unreadable keys are dropped not defaulted', () => {
  assert.deepEqual(sanitizePartialBackground({ style: 'waves' }), { style: 'waves' });
  assert.deepEqual(sanitizePartialBackground({ style: 'lava', palette: 7, seed: 'x', quality: null }), {});
  assert.deepEqual(sanitizePartialBackground({ seed: 0, quality: 9 }), { seed: 0, quality: 1 });
});

test('editing one scene leaves the others on the shared background', () => {
  const b = defaultBroadcast();
  applyBackgroundPatch(b, 'brb', { style: 'waves', palette: 'ice' }, false);
  assert.equal(effectiveBackground(b, 'brb').style, 'waves');
  assert.equal(effectiveBackground(b, 'brb').seed, b.background.seed, 'unset keys follow the shared one');
  assert.equal(effectiveBackground(b, 'starting').style, BACKGROUND_DEFAULT.style);
  assert.equal(b.background.style, BACKGROUND_DEFAULT.style, 'the shared one is untouched');
});

test('editing all scenes also moves a scene that had its own value for that key', () => {
  const b = defaultBroadcast();
  applyBackgroundPatch(b, 'vs', { style: 'bokeh', seed: 5 }, false);
  applyBackgroundPatch(b, 'all', { style: 'hexpulse' }, false);
  assert.equal(effectiveBackground(b, 'vs').style, 'hexpulse');
  assert.equal(effectiveBackground(b, 'vs').seed, 5, 'a key that was not edited stays');
  applyBackgroundPatch(b, undefined, { seed: 9 }, false);
  assert.equal(b.sceneBackgrounds.vs, undefined, 'an empty override is dropped');
  assert.equal(effectiveBackground(b, 'vs').seed, 9);
});

test('reset sends a scene back to the shared background; a made-up scene is the shared one', () => {
  const b = defaultBroadcast();
  applyBackgroundPatch(b, 'ending', { style: 'waves' }, false);
  applyBackgroundPatch(b, 'ending', {}, true);
  assert.deepEqual(b.sceneBackgrounds, {});
  applyBackgroundPatch(b, 'nonsense', { style: 'waves' }, false);
  assert.equal(b.background.style, 'waves');
  assert.deepEqual(b.sceneBackgrounds, {});
});

test('scene backgrounds survive a save and a switch of match', () => {
  const prev = sanitizeState({});
  applyBackgroundPatch(prev.broadcast, 'brb', { palette: 'magma' }, false);
  const reloaded = sanitizeState(JSON.parse(JSON.stringify(prev)));
  assert.deepEqual(reloaded.broadcast.sceneBackgrounds, { brb: { palette: 'magma' } });
  const next = carryOverSettings(sanitizeState({}), prev);
  assert.deepEqual(next.broadcast.sceneBackgrounds, { brb: { palette: 'magma' } });
});

test('each scene page reads its own background and the VS page shows BO and game', () => {
  assert.match(read('js/overlay-scene.js'), /backgroundFor\(state\.broadcast, scene\)/);
  assert.match(read('js/overlay-vs.js'), /backgroundFor\(state\.broadcast, 'vs'\)/);
  assert.ok(read('js/overlay-vs.js').includes(String.raw`/\[BO(\d{1,2})\]/i`), 'VS reads the best-of from the match title');
});

// ---- several lower thirds ----

import { LOWER_THIRD_MAX, cardIndex, sanitizeLowerThirds } from '../server/domain/broadcast';

test('there is always at least one lower third and never more than the maximum', () => {
  assert.equal(sanitizeLowerThirds(undefined).length, 1);
  assert.equal(sanitizeLowerThirds([]).length, 1);
  assert.equal(sanitizeLowerThirds(Array.from({ length: 20 }, () => ({ name: 'x' }))).length, LOWER_THIRD_MAX);
  assert.equal(sanitizeLowerThirds('nope').length, 1);
});

test('the single lower third of an older state file becomes the first card', () => {
  const state = sanitizeState({ broadcast: { lowerThird: { visible: true, name: 'Old caster', title: 'Host' } } });
  assert.equal(state.broadcast.lowerThirds.length, 1);
  assert.equal(state.broadcast.lowerThirds[0].name, 'Old caster');
  assert.equal(state.broadcast.lowerThirds[0].visible, true, 'a bar that was on air stays on air');
  // the new key wins when both exist
  const both = sanitizeState({ broadcast: { lowerThird: { name: 'Old' }, lowerThirds: [{ name: 'New A' }, { name: 'New B' }] } });
  assert.deepEqual(both.broadcast.lowerThirds.map((c) => c.name), ['New A', 'New B']);
});

test('a card index must be a real card, and a missing one means the first', () => {
  assert.equal(cardIndex(undefined, 3), 0);
  assert.equal(cardIndex(2, 3), 2);
  assert.equal(cardIndex('1', 3), 1);
  assert.equal(cardIndex(3, 3), null);
  assert.equal(cardIndex(-1, 3), null);
  assert.equal(cardIndex(1.5, 3), null);
  assert.equal(cardIndex('abc', 3), null, 'junk is not guessed to be card 0');
  assert.equal(cardIndex(null, 3), null);
});

test('the lower third page builds a card per entry and no longer reads the single-card key', () => {
  const js = read('js/overlay-lower-third.js');
  assert.ok(js.includes('state.broadcast.lowerThirds'), 'it must read the list');
  assert.ok(!js.includes('broadcast.lowerThird;'), 'the old single key is gone');
  assert.ok(read('overlay-lower-third.html').includes('data-layout-items="card"'), 'cards are named for the layout editor');
});

// ---- per-page colours ----

import { applyColourPatch, resetColours, sanitizeColours } from '../server/domain/broadcast';

test('a page colour is a real hex colour on a known page, and anything else is dropped', () => {
  assert.deepEqual(sanitizeColours({ vs: { blue: '#00FF99', red: 'red', accent: '#12', text: 5 }, nowhere: { blue: '#000000' } }),
    { vs: { blue: '#00ff99' } });
  assert.deepEqual(sanitizeColours('x'), {});
  assert.deepEqual(sanitizeColours({ scene: {} }), {}, 'an empty page is not stored');
});

test('setting one colour on one page leaves every other page and colour alone', () => {
  const b = defaultBroadcast();
  assert.equal(applyColourPatch(b, 'scoreboard', 'blue', '#112233'), true);
  assert.equal(applyColourPatch(b, 'scoreboard', 'accent', '#445566'), true);
  assert.equal(applyColourPatch(b, 'vs', 'blue', '#abcdef'), true);
  assert.deepEqual(b.colours, { scoreboard: { blue: '#112233', accent: '#445566' }, vs: { blue: '#abcdef' } });
  // an empty or invalid value follows the app theme again
  assert.equal(applyColourPatch(b, 'scoreboard', 'blue', ''), true);
  assert.deepEqual(b.colours.scoreboard, { accent: '#445566' });
  assert.equal(applyColourPatch(b, 'scoreboard', 'accent', 'nonsense'), true);
  assert.equal(b.colours.scoreboard, undefined, 'the last override going removes the page entry');
});

test('an unknown page or colour changes nothing', () => {
  const b = defaultBroadcast();
  assert.equal(applyColourPatch(b, 'draft', 'blue', '#112233'), false, 'the draft overlay is not one of these pages');
  assert.equal(applyColourPatch(b, 'vs', 'label', '#112233'), false);
  assert.equal(applyColourPatch(b, undefined, 'blue', '#112233'), false);
  assert.deepEqual(b.colours, {});
});

test('resetting a page clears only that page', () => {
  const b = defaultBroadcast();
  applyColourPatch(b, 'vs', 'red', '#111111');
  applyColourPatch(b, 'scene', 'red', '#222222');
  assert.equal(resetColours(b, 'vs'), true);
  assert.deepEqual(b.colours, { scene: { red: '#222222' } });
  assert.equal(resetColours(b, 'draft'), false);
});

test('page colours survive a save and a change of match, and every page reads them', () => {
  const prev = sanitizeState({});
  applyColourPatch(prev.broadcast, 'lower-third', 'accent', '#ff00aa');
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(prev))).broadcast.colours, { 'lower-third': { accent: '#ff00aa' } });
  assert.deepEqual(carryOverSettings(sanitizeState({}), prev).broadcast.colours, { 'lower-third': { accent: '#ff00aa' } });
  Object.entries({ 'overlay-scene.js': 'scene', 'overlay-vs.js': 'vs', 'overlay-lower-third.js': 'lower-third', 'overlay-scoreboard.js': 'scoreboard' })
    .forEach(([file, scene]) => assert.ok(read(`js/${file}`).includes(`coloursFor(state, '${scene}')`), `${file} must read its own colours`));
});

test('the style editor edits these four pages\' colours per page, and the others still share', () => {
  const js = read('js/overlay-style-editor.js');
  assert.equal([...js.matchAll(/own: true }/g)].length, 4, 'exactly the four new pages are per-page');
  assert.ok(js.includes("emit('updateBroadcastColour'"), 'it writes through the per-page command');
});

// ---- the animated background can be switched off per page, and reaches every page (2026-10-05)

test('a page shows the background by default only where it always did', async () => {
  const { effectiveBackground, BACKGROUND_SCENES, BACKGROUND_ON_BY_DEFAULT } = await import('../server/domain/broadcast');
  const b = defaultBroadcast();
  for (const scene of BACKGROUND_SCENES) {
    assert.equal(effectiveBackground(b, scene).enabled, BACKGROUND_ON_BY_DEFAULT.includes(scene), scene);
  }
  assert.deepEqual([...BACKGROUND_ON_BY_DEFAULT], ['starting', 'brb', 'ending', 'vs']);
  // the draft overlay and previous picks are not on the list
  assert.ok(!(BACKGROUND_SCENES as readonly string[]).includes('draft'));
  assert.ok(!(BACKGROUND_SCENES as readonly string[]).includes('prev'));
});

test('switching one page on or off touches only that page and survives a style change for all pages', async () => {
  const { applyBackgroundPatch, effectiveBackground } = await import('../server/domain/broadcast');
  const b = defaultBroadcast();
  applyBackgroundPatch(b, 'standings', { enabled: true }, false);
  applyBackgroundPatch(b, 'vs', { enabled: false }, false);
  assert.equal(effectiveBackground(b, 'standings').enabled, true);
  assert.equal(effectiveBackground(b, 'vs').enabled, false);
  assert.equal(effectiveBackground(b, 'teams').enabled, false);
  // "all pages" changes the look, never whether a page shows it
  applyBackgroundPatch(b, 'all', { style: 'waves', enabled: true }, false);
  assert.equal(effectiveBackground(b, 'teams').style, 'waves');
  assert.equal(effectiveBackground(b, 'teams').enabled, false);
  assert.equal(effectiveBackground(b, 'vs').enabled, false);
  assert.equal(effectiveBackground(b, 'standings').enabled, true);
  assert.equal((b.background as unknown as Record<string, unknown>).enabled, undefined);
  // reset puts the page back to its default
  applyBackgroundPatch(b, 'vs', {}, true);
  assert.equal(effectiveBackground(b, 'vs').enabled, true);
  // a value that is not a boolean is ignored
  applyBackgroundPatch(b, 'result', { enabled: 'yes' }, false);
  assert.equal(effectiveBackground(b, 'result').enabled, false);
});

test('the editor offers exactly the background styles, palettes and scenes the server knows', async () => {
  const { BACKGROUND_SCENES } = await import('../server/domain/broadcast');
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const editor = fs.readFileSync(path.join(publicDir, 'js', 'overlay-style-editor.js'), 'utf8');
  const list = (name: string) => {
    const start = editor.indexOf(`const ${name} = [`) + `const ${name} = [`.length;
    return [...editor.slice(start, editor.indexOf(']', start)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  assert.deepEqual(list('BG_STYLES'), [...BACKGROUND_STYLES]);
  assert.deepEqual(list('BG_PALETTES'), [...BACKGROUND_PALETTES]);
  // every page that can show a background loads the script that draws it, and the two that cannot do not
  const noBackground = ['draft', 'prev'];
  const own = ['scene', 'vs'];
  const pagesDir = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));
  for (const file of pagesDir) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    const scene = /<body[^>]*data-layout-scene="([^"]+)"/.exec(html)?.[1];
    if (!scene) continue;
    const loads = html.includes('overlay-bg.js');
    if (noBackground.includes(scene)) assert.equal(loads, false, `${file} must not draw a background`);
    else if (!own.includes(scene)) assert.equal(loads, true, `${file} should load overlay-bg.js`);
    if (!noBackground.includes(scene) && !own.includes(scene)) {
      assert.ok((BACKGROUND_SCENES as readonly string[]).includes(scene), `${scene} is not in BACKGROUND_SCENES`);
    }
  }
});

// The Style tab offers blue/red/accent/text/label on these pages, so each must actually apply state.theme.
// Only the draft overlay and previous picks did until 2026-10-05, so setting a colour changed nothing here.
test('every page whose Style tab offers theme colours applies them', () => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const editor = fs.readFileSync(path.join(publicDir, 'js', 'overlay-style-editor.js'), 'utf8');
  const fonts = fs.readFileSync(path.join(publicDir, 'js', 'overlay-fonts.js'), 'utf8');
  const themed = /const THEMED = \[([^\]]*)\]/.exec(fonts.split(String.fromCharCode(92)).join(''))![1]!;
  const applied = [...themed.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  // a page entry with colours that are not its own (state.broadcast.colours) reads the shared theme
  const wanted: string[] = [];
  for (const m of editor.matchAll(/^\s*'?([a-z-]+)'?: \{ colours: \[([^\]]+)\]([^}]*)\}/gm)) {
    const [, page, colours, rest] = m;
    if (rest!.includes('own: true')) continue;
    if (page === 'draft' || page === 'prev') continue; // overlay.js and overlay-prev.js apply their own
    if (/blue|red|accent|text|label/.test(colours!)) wanted.push(page!);
  }
  assert.ok(wanted.length >= 4, 'expected the four head-to-head style pages');
  assert.deepEqual([...applied].sort(), [...wanted].sort());
});
