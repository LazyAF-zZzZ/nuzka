import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  sanitizeLayout, sanitizeLayoutEntry, patchLayout, resetSceneLayout
} from '../server/domain/layout';
import { sanitizeState, defaultState } from '../server/domain/match';
import { carryOverSettings } from '../server/domain/settings';

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
