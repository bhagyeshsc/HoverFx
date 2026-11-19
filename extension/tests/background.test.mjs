import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function createBackground() {
  const storage = {};
  let listener;
  let calls = 0;
  const api = {
    storage: {
      local: {
        async get(key) { return { [key]:storage[key] }; },
        async set(data) { Object.assign(storage, data); },
      },
    },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
  };
  const mockFetch = async () => {
    calls++;
    return { ok: true, async json() { return { base: 'USD', quote: 'INR', rate: 85.23, date:'2026-11-17' }; } };
  };
  vm.runInNewContext(readFileSync(new URL('../dist-standalone/chrome/background.js', import.meta.url),'utf8'), {
    browser: api, fetch: mockFetch, AbortController, setTimeout, clearTimeout, console,
  });
  async function request(from,to) {
    return await new Promise((resolve,reject) => {
      const accepts = listener({ type:'HOVERFX_GET_RATE', from, to },{},resolve);
      if (!accepts) reject(new Error('Request not accepted'));
    });
  }
  return { request, getCalls: () => calls };
}

test('background fetches rate and caches repeated requests', async () => {
  const bg = createBackground();
  const first = await bg.request('USD','INR');
  assert.equal(first.ok, true);
  assert.equal(first.rate, 85.23);
  assert.equal(first.date, '2026-11-17');
  const second = await bg.request('USD','INR');
  assert.equal(second.ok, true);
  assert.equal(bg.getCalls(), 1);
});
test('background handles identity conversion without network', async () => {
  const bg = createBackground();
  const reply = await bg.request('USD','USD');
  assert.equal(reply.rate, 1);
  assert.equal(bg.getCalls(), 0);
});
