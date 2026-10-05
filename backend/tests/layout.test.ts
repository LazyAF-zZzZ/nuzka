import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  sanitizeLayout, sanitizeLayoutEntry, patchLayout, resetSceneLayout
} from '../server/domain/layout';
import { sanitizeState, defaultState } from '../server/domain/match';
import {
  carryOverSettings,
  sanitizeTeamListAutoText,
  sanitizeTeamListColumns,
  sanitizeTeamListPerSet,
  sanitizeTeamListScrollSpeed,
  sanitizeTeamListStyle
} from '../server/domain/settings';

test('an entry is rounded and clamped', () => {
  assert.deepEqual(sanitizeLayoutEntry({ x: 10.6, y: -99999, s: 9, h: true }), { x: 11, y: -3000, s: 4, h: true });
  assert.deepEqual(sanitizeLayoutEntry({ x: '5', y: 0, s: 0.01 }), { x: 5, y: 0, s: 0.2, h: false });
  assert.deepEqual(sanitizeLayoutEntry({ x: -0.3, y: 2, s: 1.23456 }), { x: 0, y: 2, s: 1.235, h: false });
});

test('an entry equal to as designed is not stored', () => {
  assert.equal(sanitizeLayoutEntry({ x: 0, y: 0, s: 1, h: false }), null);
  assert.equal(sanitizeLayoutEntry({ x: 'a', y: null }), null);
  assert.equal(sanitizeLayoutEntry(null), null);
  assert.equal(sanitizeLayoutEntry('x'), null);
});

test('names must be slugs, so they are safe in a CSS selector', () => {
  const layout = sanitizeLayout({
    draft: { 'blue-pick-1': { x: 5 }, '"]{}': { x: 5 }, 'Blue': { x: 5 } },
    '../x': { a: { x: 1 } },
    empty: { a: { x: 0 } }
  });
  assert.deepEqual(layout, { draft: { 'blue-pick-1': { x: 5, y: 0, s: 1, h: false } } });
  assert.deepEqual(sanitizeLayout([1, 2]), {});
  assert.deepEqual(sanitizeLayout('x'), {});
});

test('patch sets, replaces and removes one element', () => {
  let layout = patchLayout({}, 'draft', 'timer', { x: 20, y: -4 });
  assert.deepEqual(layout, { draft: { timer: { x: 20, y: -4, s: 1, h: false } } });
  layout = patchLayout(layout, 'draft', 'score', { h: true });
  assert.equal(layout.draft.score.h, true);
  layout = patchLayout(layout, 'draft', 'timer', null);
  assert.deepEqual(Object.keys(layout.draft), ['score']);
  layout = patchLayout(layout, 'draft', 'score', { x: 0, y: 0, s: 1, h: false });
  assert.deepEqual(layout, {});
  assert.deepEqual(patchLayout({}, 'bad name', 'x', { x: 1 }), {});
});

test('reset removes one scene only', () => {
  const layout = sanitizeLayout({ draft: { a: { x: 1 } }, result: { b: { y: 2 } } });
  assert.deepEqual(Object.keys(resetSceneLayout(layout, 'draft')), ['result']);
});

test('the state keeps the layout, and loading a match does not lose it', () => {
  assert.deepEqual(defaultState.layout, {});
  const state = sanitizeState({ layout: { draft: { timer: { x: 3 } } } });
  assert.deepEqual(state.layout, { draft: { timer: { x: 3, y: 0, s: 1, h: false } } });
  const next = carryOverSettings(sanitizeState({}), state);
  assert.deepEqual(next.layout, state.layout);
});

test('both draft overlays load the layout script after the one that opens the socket, with the same parts', () => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const pages = ['overlay.html', 'overlay-1440.html'].map((file) => {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert.match(html, /<body data-layout-scene="draft"/, `${file} names its scene`);
    const own = html.indexOf('src="js/overlay.js"');
    const layout = html.indexOf('src="js/overlay-layout.js"');
    assert.ok(own > 0 && layout > own, `${file} loads overlay-layout.js after overlay.js`);
    const names = [...html.matchAll(/data-layout="([^"]+)"/g)].map((m) => m[1] as string);
    assert.strictEqual(new Set(names).size, names.length, `${file} uses each part name once`);
    names.forEach((name) => assert.match(name, /^[a-z0-9][a-z0-9-]{0,39}$/, `${name} is a name the server keeps`));
    return names;
  });
  // One saved layout serves both sizes, so their parts must be the same.
  assert.deepStrictEqual(pages[0], pages[1]);
});

test('every broadcast graphic has a layout scene and loads the layout script last', () => {
  const { PAGES } = require('../server/http/pages') as typeof import('../server/http/pages');
  const publicDir = path.join(__dirname, '..', '..', 'public');
  // Derived from PAGES, like the watermark test, so a new overlay cannot be left out.
  const broadcast = Object.entries(PAGES).filter(([route]) => route.startsWith('/overlay') || route === '/result');
  const scenes = new Map<string, string>();
  for (const [route, file] of broadcast) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    const scene = /<body data-layout-scene="([a-z0-9-]+)"/.exec(html)?.[1];
    assert.ok(scene, `${route} names its layout scene`);
    const scripts = [...html.matchAll(/src="(\/?js\/[^"]+\.js)"/g)].map((m) => m[1] as string);
    assert.match(scripts[scripts.length - 1] as string, /overlay-layout\.js$/, `${route} loads overlay-layout.js last`);
    assert.ok(html.includes('data-layout="'), `${route} has parts to move`);
    // Only the two draft overlays share a scene: one is the other scaled by 4/3.
    if (scenes.has(scene) && scene !== 'draft') assert.fail(`${route} and ${scenes.get(scene)} share the scene ${scene}`);
    scenes.set(scene, route);
  }
});

test('teams per set on the team list: 32 unless set, kept between 4 and 64, and kept across matches', () => {
  assert.strictEqual(defaultState.teamListPerSet, 32);
  assert.strictEqual(sanitizeTeamListPerSet(undefined), 32);
  assert.strictEqual(sanitizeTeamListPerSet('abc'), 32);
  assert.strictEqual(sanitizeTeamListPerSet(''), 32);
  assert.strictEqual(sanitizeTeamListPerSet(1), 4);
  assert.strictEqual(sanitizeTeamListPerSet(500), 64);
  assert.strictEqual(sanitizeTeamListPerSet('24.4'), 24);
  const state = sanitizeState({ teamListPerSet: 20 });
  assert.strictEqual(state.teamListPerSet, 20);
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).teamListPerSet, 20);
});

test('team list style: sets unless asked for scroll, and kept across matches', () => {
  // A state file written before this setting existed must look exactly as it did.
  assert.strictEqual(defaultState.teamListStyle, 'sets');
  assert.strictEqual(sanitizeState({}).teamListStyle, 'sets');
  assert.strictEqual(sanitizeTeamListStyle(undefined), 'sets');
  assert.strictEqual(sanitizeTeamListStyle('marquee'), 'sets');
  assert.strictEqual(sanitizeTeamListStyle(''), 'sets');
  assert.strictEqual(sanitizeTeamListStyle(1), 'sets');
  assert.strictEqual(sanitizeTeamListStyle('scroll'), 'scroll');
  const state = sanitizeState({ teamListStyle: 'scroll' });
  assert.strictEqual(state.teamListStyle, 'scroll');
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).teamListStyle, 'scroll');
});

test('the team list card colour is a theme colour: blue unless set, and kept across matches', () => {
  // The value that used to be hard-coded in overlay-teams.css, so a theme nobody has
  // touched still draws exactly the card it drew before this setting existed.
  assert.strictEqual(defaultState.theme.teamCard, '#3b82f6');
  assert.strictEqual(sanitizeState({}).theme.teamCard, '#3b82f6');
  assert.strictEqual(sanitizeState({ theme: { teamCard: 'not a colour' } }).theme.teamCard, '#3b82f6');
  const state = sanitizeState({ theme: { teamCard: '#ff0000' } });
  assert.strictEqual(state.theme.teamCard, '#ff0000');
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).theme.teamCard, '#ff0000');
});

test('the team list card background is a theme colour, and keeps its transparency', () => {
  // The first stop of the gradient that used to be hard-coded in overlay-teams.css.
  assert.strictEqual(defaultState.theme.teamCardBg, '#111220');
  assert.strictEqual(sanitizeState({}).theme.teamCardBg, '#111220');
  assert.strictEqual(sanitizeState({ theme: { teamCardBg: 'nope' } }).theme.teamCardBg, '#111220');
  const state = sanitizeState({ theme: { teamCardBg: '#2a0a3d' } });
  assert.strictEqual(state.theme.teamCardBg, '#2a0a3d');
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).theme.teamCardBg, '#2a0a3d');

  // The alpha stays in the stylesheet and is not settable: whatever colour the operator
  // picks, the footage behind the overlay still shows through the card.
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'overlay-teams.css'), 'utf8');
  assert.match(css, /rgba\(var\(--ov-team-card-bg-rgb,[^)]*\), 0\.94\)/, 'first stop keeps its alpha');
  assert.match(css, /rgba\(var\(--ov-team-card-bg2-rgb,[^)]*\), 0\.86\)/, 'second stop keeps its alpha');
});

test('dark text on a light card: on unless turned off, and kept across matches', () => {
  // On by default, and a no-op while the background is dark, so nobody's overlay changes.
  assert.strictEqual(defaultState.teamListAutoText, true);
  assert.strictEqual(sanitizeState({}).teamListAutoText, true);
  assert.strictEqual(sanitizeTeamListAutoText(undefined), true);
  assert.strictEqual(sanitizeTeamListAutoText('nonsense'), true);
  assert.strictEqual(sanitizeTeamListAutoText(false), false);
  const state = sanitizeState({ teamListAutoText: false });
  assert.strictEqual(state.teamListAutoText, false);
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).teamListAutoText, false);
});

test('every surface drawn on a card follows the one ink value', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'overlay-teams.css'), 'utf8');
  // Flipping only the team name would leave the roster and the borders unreadable under it,
  // so nothing on the card may keep a hard-coded white.
  const cardBlock = css.slice(css.indexOf('.tl-card {'), css.indexOf('/* CARD CONTENT'));
  const contentBlock = css.slice(css.indexOf('/* CARD CONTENT'), css.indexOf('.tl-note'));
  [cardBlock, contentBlock].forEach((block) => {
    assert.ok(!/rgba\(255, 255, 255/.test(block), 'a card surface still has a hard-coded white');
    assert.ok(!/#ffffff/.test(block), 'a card surface still has a hard-coded white');
  });
  assert.match(css, /--ov-team-card-captain/, 'the captain colour flips too');
});

test('team list columns: auto unless set, 0 to 6, and kept across matches', () => {
  // 0 means "work it out from the team count", which is what it always did.
  assert.strictEqual(defaultState.teamListColumns, 0);
  assert.strictEqual(sanitizeTeamListColumns(undefined), 0);
  assert.strictEqual(sanitizeTeamListColumns('abc'), 0);
  assert.strictEqual(sanitizeTeamListColumns(-3), 0);
  assert.strictEqual(sanitizeTeamListColumns(99), 6);
  assert.strictEqual(sanitizeTeamListColumns(1), 1);
  const state = sanitizeState({ teamListColumns: 1 });
  assert.strictEqual(state.teamListColumns, 1);
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).teamListColumns, 1);
});

test('the card corner radius is a theme number the card actually reads', () => {
  assert.strictEqual(defaultState.theme.teamCardRadius, 12);
  assert.strictEqual(sanitizeState({ theme: { teamCardRadius: 99 } }).theme.teamCardRadius, 40);
  assert.strictEqual(sanitizeState({ theme: { teamCardRadius: -5 } }).theme.teamCardRadius, 0);
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'overlay-teams.css'), 'utf8');
  // Still multiplied by --k, or a shrunken table would keep full-size corners.
  assert.ok(
    css.includes('border-radius: calc(var(--ov-team-card-radius, 12px) * var(--k, 1))'),
    'the card radius reads the theme token and is still scaled by --k'
  );
});

test('the card colour drives the stripe and the tag from one value', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'overlay-teams.css'), 'utf8');
  // Both surfaces must read the same variable, or picking a colour recolours half the card.
  assert.match(css, /border-left: 4px solid var\(--ov-team-card,/, 'the stripe reads the token');
  assert.match(css, /background: rgba\(var\(--ov-team-card-rgb,/, 'the tag fill reads the same colour');
  assert.match(css, /color: var\(--ov-team-card-soft,/, 'the tag text reads the softened colour');
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'overlay-teams.js'), 'utf8');
  // color-mix() is too new for the CEF in older OBS builds, so the tint is mixed here.
  assert.ok(!/color-mix\(/.test(css), 'no color-mix(): older OBS would drop the whole declaration');
  assert.match(js, /--ov-team-card-soft/, 'the softened tint is computed in js');
});

test('team list scroll speed: 40 unless set, kept between 10 and 200, and kept across matches', () => {
  assert.strictEqual(defaultState.teamListScrollSpeed, 40);
  assert.strictEqual(sanitizeTeamListScrollSpeed(undefined), 40);
  assert.strictEqual(sanitizeTeamListScrollSpeed('abc'), 40);
  assert.strictEqual(sanitizeTeamListScrollSpeed(''), 40);
  assert.strictEqual(sanitizeTeamListScrollSpeed(1), 10);
  assert.strictEqual(sanitizeTeamListScrollSpeed(9999), 200);
  assert.strictEqual(sanitizeTeamListScrollSpeed('55.6'), 56);
  const state = sanitizeState({ teamListScrollSpeed: 80 });
  assert.strictEqual(state.teamListScrollSpeed, 80);
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).teamListScrollSpeed, 80);
});

test('every broadcast page loads the style editor, just before the layout script that mounts it', () => {
  const { PAGES } = require('../server/http/pages') as typeof import('../server/http/pages');
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const broadcast = Object.entries(PAGES).filter(([route]) => route.startsWith('/overlay') || route === '/result');
  for (const [route, file] of broadcast) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    const styleAt = html.search(/src="\/?js\/overlay-style-editor\.js"/);
    const layoutAt = html.search(/src="\/?js\/overlay-layout\.js"/);
    assert.ok(styleAt > 0, `${route} loads overlay-style-editor.js`);
    assert.ok(styleAt < layoutAt, `${route}: the style editor is defined before overlay-layout.js calls it`);
  }
});

test('team tag on the draft: off unless asked, kept across matches, and each side keeps a short tag', () => {
  assert.strictEqual(defaultState.draftShowTag, false);
  assert.strictEqual(sanitizeState({ draftShowTag: 'yes' }).draftShowTag, false);
  const on = sanitizeState({ draftShowTag: true });
  assert.strictEqual(carryOverSettings(sanitizeState({}), on).draftShowTag, true);
  assert.strictEqual(defaultState.teamBlue.tag, '');
  assert.strictEqual(sanitizeState({ teamBlue: { name: 'Alpha', tag: 'ALPHAWOLF' } }).teamBlue.tag, 'ALPHAW');
  // state.json จากรุ่นก่อนไม่มีแท็ก ต้องได้ค่าว่าง ไม่ใช่ undefined
  assert.strictEqual(sanitizeState({ teamRed: { name: 'Old' } }).teamRed.tag, '');
});

test('page textures: defaults, clamping, unknown pages dropped, kept across matches', async () => {
  const settings = await import('../server/domain/settings');
  const media = await import('../server/domain/media');
  assert.deepEqual(settings.sanitizeTextureSettings(undefined), { opacity: 0.35, scale: 100, fit: 'tile', blend: 'normal' });
  assert.deepEqual(settings.sanitizeTextureSettings({ opacity: 3, scale: 9999, fit: 'fill', blend: 'weird' }),
    { opacity: 1, scale: 400, fit: 'fill', blend: 'normal' });
  assert.deepEqual(settings.sanitizeTextureSettings({ opacity: 0, scale: 1, blend: 'overlay' }),
    { opacity: 0, scale: 10, fit: 'tile', blend: 'overlay' });
  const textures = settings.sanitizeTextures({ draft: { opacity: 0.5 }, nowhere: { opacity: 1 } });
  assert.deepEqual(Object.keys(textures), ['draft']);
  const state = sanitizeState({ textures: { prev: { blend: 'screen' } } });
  assert.strictEqual(carryOverSettings(sanitizeState({}), state).textures.prev?.blend, 'screen');
  // every page that can take a texture has its own image slot, and it never switches background images on
  settings.TEXTURE_SCENES.forEach((scene) => {
    const slot = 'texture' + scene.replace(/(^|-)([a-z])/g, (_m, _d, c: string) => c.toUpperCase());
    assert.ok(slot in media.SKIN_SLOTS, `${slot} is a known slot`);
    assert.ok(media.isTextureSlot(slot));
  });
  assert.ok(!media.isTextureSlot('overlayBottom1080'));
});

// ---- text style and custom text (2026-10-05)

test('a text style is cleaned field by field and kept inside the entry', () => {
  const entry = sanitizeLayoutEntry({
    x: 4,
    tx: { t: 'Hi\u0007 there\r\nline', f: 'Oxanium"; x', z: 9999, w: 640, c: '#FFAA00', a: 'center', ls: 1.234, tt: 'upper', ow: 3, oc: 'red', sb: 8, sx: 2, sy: -2, sc: '#000000', bad: 1 }
  });
  assert.deepEqual(entry!.tx, {
    t: 'Hi there\nline', f: 'Oxanium x', z: 400, w: 600, c: '#ffaa00', a: 'center', ls: 1.2, tt: 'upper', ow: 3, sc: '#000000', sb: 8, sx: 2, sy: -2
  });
});

test('an entry with only a text style is stored, and an empty style is not', () => {
  assert.deepEqual(sanitizeLayoutEntry({ tx: { c: '#ffffff' } }), { x: 0, y: 0, s: 1, h: false, tx: { c: '#ffffff' } });
  assert.equal(sanitizeLayoutEntry({ tx: { a: 'justify', c: 'nope', z: 'x' } }), null);
  assert.equal(sanitizeLayoutEntry({ tx: [] }), null);
});

test('a custom text part survives at its starting spot', () => {
  assert.deepEqual(sanitizeLayoutEntry({ k: true, tx: { t: 'Hello' } }), { x: 0, y: 0, s: 1, h: false, tx: { t: 'Hello' }, k: true });
  assert.deepEqual(sanitizeLayoutEntry({ k: true }), { x: 0, y: 0, s: 1, h: false, k: true });
  assert.equal(sanitizeLayoutEntry({ k: 'yes' }), null);
});

test('text longer than the limit is cut', () => {
  const tx = sanitizeLayoutEntry({ k: true, tx: { t: 'a'.repeat(500) } })!.tx!;
  assert.equal(tx.t!.length, 200);
});

// Added text is built inside the page's 1080p stage; a page whose stage class is not in overlay-layout.js's
// STAGES list would quietly lose "+ Add text" (2026-10-05).
test('every page with a layout scene has a stage that added text can live in', () => {
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const script = fs.readFileSync(path.join(publicDir, 'js', 'overlay-layout.js'), 'utf8');
  const stages = /const STAGES = '([^']+)'/.exec(script)![1]!.split(',').map((s) => s.trim());
  const classes = stages.filter((s) => s.startsWith('.')).map((s) => s.slice(1));
  const pages = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));
  let checked = 0;
  for (const page of pages) {
    const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
    if (!/<body[^>]*data-layout-scene=/.test(html)) continue;
    checked++;
    const used = new Set<string>();
    for (const m of html.matchAll(/class="([^"]*)"/g)) m[1]!.split(' ').forEach((c) => used.add(c));
    const hasStage = html.includes('data-layout-host') || classes.some((c) => used.has(c));
    assert.ok(hasStage, `${page} has no stage element listed in STAGES`);
  }
  assert.ok(checked >= 13, 'expected every broadcast page to be checked');
});

test('effects: a gradient needs both colours, an entrance and a loop keep their timing, unknown names are dropped', () => {
  const full = sanitizeLayoutEntry({
    k: true, tx: { g1: '#FF0000', g2: '#0000ff', ga: 93, gc: '#00FF00', gs: 99, en: 'up', ed: 5, edl: 120, lp: 'pulse', lt: 0.04 }
  })!.tx!;
  assert.deepEqual(full, { g1: '#ff0000', g2: '#0000ff', ga: 95, gc: '#00ff00', gs: 60, en: 'up', ed: 100, edl: 100, lp: 'pulse', lt: 0.5 });
  // half a gradient is dropped, with its angle
  assert.equal(sanitizeLayoutEntry({ tx: { g1: '#ff0000', ga: 45 } }), null);
  // timing without an effect is dropped; unknown effects are ignored
  assert.equal(sanitizeLayoutEntry({ tx: { ed: 500, edl: 100, lt: 3 } }), null);
  assert.equal(sanitizeLayoutEntry({ tx: { en: 'explode', lp: 'spin' } }), null);
  assert.deepEqual(sanitizeLayoutEntry({ tx: { gs: 12 } })!.tx, { gs: 12 });
});
