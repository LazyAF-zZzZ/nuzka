// ฟอนต์ของกราฟิกออกอากาศ (ผู้ใช้ขอ 2026-09-29)
//
// สองเรื่องที่ต้องมีอะไรบังคับไว้:
//   1. ชื่อฟอนต์ถูกยัดลงใน CSS ของหน้าที่กำลังออกอากาศ จึงต้องกรองที่เซิร์ฟเวอร์
//   2. Kanit ต้องอยู่ท้ายสายฟอนต์เสมอ ไม่งั้นชื่อไทยตกไปที่ Arial กลางอากาศ

import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sanitizeState, defaultState } from '../server/domain/match';
import {
  carryOverSettings,
  emptyFonts,
  sanitizeFontFamily,
  sanitizeFonts,
  FONT_ROLES,
  FONT_SCENES
} from '../server/domain/settings';
import { PAGES } from '../server/http/pages';

const publicDir = path.join(__dirname, '..', '..', 'public');
const read = (rel: string) => fs.readFileSync(path.join(publicDir, rel), 'utf8');

test('a font name cannot carry CSS into the overlay', () => {
  // The name lands in a custom property on a live graphic, so anything that could close
  // the declaration and start another has to be gone before it is stored.
  assert.strictEqual(sanitizeFontFamily('Segoe UI'), 'Segoe UI');
  assert.strictEqual(sanitizeFontFamily('Noto Sans Thai'), 'Noto Sans Thai');
  assert.strictEqual(sanitizeFontFamily('Arial; } body { display: none'), 'Arial body display none');
  assert.strictEqual(sanitizeFontFamily('"><script>alert(1)</script>'), 'scriptalert1script');
  assert.strictEqual(sanitizeFontFamily('  spaced   out  '), 'spaced out');
  assert.strictEqual(sanitizeFontFamily(42), '');
  assert.strictEqual(sanitizeFontFamily(null), '');
  assert.strictEqual(sanitizeFontFamily('x'.repeat(200)).length, 64);
});

test('fonts default to empty, which means every page keeps Kanit', () => {
  const fonts = defaultState.fonts;
  FONT_ROLES.forEach((role) => assert.strictEqual(fonts.all[role], '', `${role} starts unset`));
  assert.deepStrictEqual(fonts.pages, {}, 'no page overrides to begin with');
  assert.deepStrictEqual(sanitizeState({}).fonts, emptyFonts());
});

test('only known roles and known pages survive a restore', () => {
  const fonts = sanitizeFonts({
    all: { heading: 'Impact', nonsense: 'Comic Sans' },
    pages: {
      teams: { name: 'Georgia', bogus: 'Wingdings' },
      'not-a-page': { name: 'Georgia' }
    }
  });
  assert.strictEqual(fonts.all.heading, 'Impact');
  assert.strictEqual((fonts.all as Record<string, string>).nonsense, undefined);
  assert.deepStrictEqual(fonts.pages.teams, { name: 'Georgia' });
  assert.strictEqual(fonts.pages['not-a-page'], undefined, 'a junk scene is dropped, not stored');
});

test('fonts carry across a match change like the rest of the tool settings', () => {
  const previous = sanitizeState({ fonts: { all: { name: 'Georgia' }, pages: { teams: { heading: 'Impact' } } } });
  const next = carryOverSettings(sanitizeState(defaultState), previous);
  assert.strictEqual(next.fonts.all.name, 'Georgia');
  assert.strictEqual(next.fonts.pages.teams?.heading, 'Impact');
});

test('every broadcast page loads the font script, and its scene is one the app can target', () => {
  const broadcast = Object.entries(PAGES)
    .filter(([route]) => route.startsWith('/overlay') || route === '/result');
  assert.ok(broadcast.length >= 10, 'all the broadcast graphics are checked');

  for (const [route, file] of broadcast) {
    const html = read(file);
    assert.ok(html.includes('js/overlay-fonts.js'), `${route} loads overlay-fonts.js`);
    const scene = html.match(/data-layout-scene="([a-z-]+)"/)?.[1];
    assert.ok(scene, `${route} declares a scene`);
    assert.ok(
      (FONT_SCENES as readonly string[]).includes(scene as string),
      `${route} is scene "${scene}", which the app offers no way to pick`
    );
  }
});

test('Kanit stays at the end of every font stack', () => {
  // A chosen font is nearly always Latin-only. Dropping Kanit from the chain would send
  // Thai team names to Arial mid-broadcast, which is what fonts.css warns about.
  const js = read('js/overlay-fonts.js');
  assert.match(js, /const BASE = "'Kanit', 'Segoe UI', Arial, sans-serif"/);
  assert.match(js, /'"' \+ family \+ '", ' \+ BASE/, 'the chosen font goes in front of the chain, not instead of it');
  assert.ok(!/replace\(BASE/.test(js), 'nothing replaces the fallback chain');
});

test('every broadcast stylesheet hands its base text to the body role', () => {
  // Without this a page would ignore the setting entirely and quietly stay on Kanit.
  const sheets = [
    'overlay.css', 'overlay-1440.css', 'result.css', 'overlay-analytics.css',
    'overlay-prev.css', 'overlay-teams.css', 'overlay-standings.css', 'overlay-matchup.css'
  ];
  for (const sheet of sheets) {
    const css = read('css/' + sheet);
    assert.match(css, /font-family: var\(--ov-font-body,/, `${sheet} never reads --ov-font-body`);
    assert.ok(
      css.includes("var(--ov-font-body, 'Kanit', 'Segoe UI', Arial, sans-serif)"),
      `${sheet} drops Kanit from its fallback`
    );
  }
});
