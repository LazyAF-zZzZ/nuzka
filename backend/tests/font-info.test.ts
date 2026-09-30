import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

const { fontName, fontHasThai } = require('../server/domain/font-info') as typeof import('../server/domain/font-info');

// Real fonts from Windows, when this machine has them: the reader must agree with what the
// fonts are. Skipped elsewhere rather than faked, since a hand-made font would only test itself.
const WIN = 'C:/Windows/Fonts/';
const have = (f: string) => fs.existsSync(WIN + f);

test('reads the family and face name from a TrueType file', { skip: !have('tahomabd.ttf') }, () => {
  assert.strictEqual(fontName(fs.readFileSync(WIN + 'tahomabd.ttf')), 'Tahoma Bold');
  assert.strictEqual(fontName(fs.readFileSync(WIN + 'tahoma.ttf')), 'Tahoma');
});

test('knows which fonts carry Thai letters', { skip: !have('tahoma.ttf') || !have('impact.ttf') }, () => {
  assert.strictEqual(fontHasThai(fs.readFileSync(WIN + 'tahoma.ttf')), true);
  assert.strictEqual(fontHasThai(fs.readFileSync(WIN + 'impact.ttf')), false);
});

test('junk and truncated files give no answer instead of throwing', () => {
  assert.strictEqual(fontName(Buffer.from('OTTO' + 'x'.repeat(40))), null);
  assert.strictEqual(fontHasThai(Buffer.alloc(8)), null);
  const header = Buffer.alloc(28);
  header.writeUInt16BE(1, 4);                 // one table...
  header.write('name', 12, 'latin1');
  header.writeUInt32BE(9999, 20);             // ...pointing past the end of the file
  header.writeUInt32BE(50, 24);
  assert.strictEqual(fontName(header), null);
});
