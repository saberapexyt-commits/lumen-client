import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { downloadFile } from '../main/net';

function server(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() });
    });
  });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-net-'));
const sha1 = (b: Buffer) => crypto.createHash('sha1').update(b).digest('hex');

test('download verifies checksum, renames atomically, and skips when already valid', async () => {
  const body = Buffer.from('hello mod');
  let hits = 0;
  const s = await server((_q, r) => (hits++, r.end(body)));
  const dest = path.join(tmp(), 'a.jar');
  assert.equal(await downloadFile({ url: s.url, dest, sha1: sha1(body) }), 'downloaded');
  assert.equal(fs.readFileSync(dest).toString(), 'hello mod');
  assert.equal(await downloadFile({ url: s.url, dest, sha1: sha1(body) }), 'skipped');
  assert.equal(hits, 1);
  assert.ok(!fs.existsSync(dest + '.part'));
  s.close();
});

test('a corrupted download is rejected and never replaces an existing good file', async () => {
  const s = await server((_q, r) => r.end('tampered'));
  const dir = tmp();
  const dest = path.join(dir, 'a.jar');
  fs.writeFileSync(dest, 'GOOD');
  await assert.rejects(downloadFile({ url: s.url, dest, sha1: sha1(Buffer.from('expected')) }, { retries: 1, force: true }), /Checksum mismatch/);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'GOOD');
  assert.ok(!fs.existsSync(dest + '.part'));
  s.close();
});

test('transient server errors are retried', async () => {
  let n = 0;
  const s = await server((_q, r) => {
    if (n++ < 2) {
      r.statusCode = 503;
      return r.end('busy');
    }
    r.end('ok');
  });
  const dest = path.join(tmp(), 'r.jar');
  await downloadFile({ url: s.url, dest }, { retries: 3 });
  assert.equal(fs.readFileSync(dest, 'utf8'), 'ok');
  assert.equal(n, 3);
  s.close();
});

test('cancelling aborts and leaves no partial file', async () => {
  const s = await server((_q, r) => {
    r.write('partial');
    /* never ends */
  });
  const ctl = new AbortController();
  const dest = path.join(tmp(), 'c.jar');
  const p = downloadFile({ url: s.url, dest }, { signal: ctl.signal });
  setTimeout(() => ctl.abort(), 150);
  await assert.rejects(p, /Cancelled/);
  assert.ok(!fs.existsSync(dest) && !fs.existsSync(dest + '.part'));
  s.close();
  (s as any).close();
});
