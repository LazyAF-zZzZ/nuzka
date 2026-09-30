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
  assert.deepEqual(sanitizeLayoutEntry({ x: -0.3, y: 2, s: 1.234 }), { x: 0, y: 2, s: 1.23, h: false });
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
