import test from 'node:test';
import assert from 'node:assert/strict';
import { setPackEntry } from '../main/theme';

const E = 'file/Lumen Theme.zip';

test('adds the theme after existing packs and keeps other options', () => {
  const out = setPackEntry('fov:0.5\nresourcePacks:["vanilla","file/Faithful.zip"]\nmaxFps:120\n', E, true);
  assert.match(out, /resourcePacks:\["vanilla","file\/Faithful.zip","file\/Lumen Theme.zip"\]/);
  assert.match(out, /fov:0.5/);
  assert.match(out, /maxFps:120/);
});

test('creates the line when options.txt is empty, and never duplicates', () => {
  const once = setPackEntry('', E, true);
  assert.equal(once, 'resourcePacks:["vanilla","file/Lumen Theme.zip"]\n');
  assert.equal(setPackEntry(once, E, true), once);
});

test('disabling removes only the Lumen entry', () => {
  const out = setPackEntry('resourcePacks:["vanilla","file/A.zip","file/Lumen Theme.zip"]\n', E, false);
  assert.match(out, /resourcePacks:\["vanilla","file\/A.zip"\]/);
});

test('a corrupt resourcePacks line falls back to vanilla', () => {
  assert.match(setPackEntry('resourcePacks:oops\n', E, true), /\["vanilla","file\/Lumen Theme.zip"\]/);
});
