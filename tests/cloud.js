/* Cloud mode: Supabase wired up, plus the free-plan failure modes.
   Nothing here touches the network — every Supabase endpoint is mocked. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PAGE = path.join(__dirname, '..', 'index.html');
const HTML = fs.readFileSync(PAGE, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const store = () => { const m = new Map([['hw.autotr', '0']]); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: i => [...m.keys()][i] }; };

const MANAGER = { email: 'manager@holmwahadaf.sa', password: 'Str0ngPass!' };

/* a fake Supabase. `server` controls how it misbehaves. */
function makeServer() {
  return {
    row: null,              // what site_content holds
    mode: 'ok',             // ok | paused | offline | slow
    tokenValid: true,       // flip to false to simulate a 1-hour expiry
    uploads: [], patches: 0, reads: 0, refreshes: 0
  };
}

function mockFetch(w, server) {
  return async (url, opts = {}) => {
    url = String(url);
    const body = opts.body ? (typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body) : null;
    const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });

    if (server.mode === 'offline') throw new w.Error('network down');
    if (server.mode === 'slow') {                       // never resolves — AbortController must win
      return new Promise((_, rej) => { if (opts.signal) opts.signal.addEventListener('abort', () => rej(new w.Error('aborted'))); });
    }
    if (server.mode === 'paused') return json(503, { message: 'project paused' });

    if (url.includes('grant_type=password')) {
      if (body.email === MANAGER.email && body.password === MANAGER.password)
        return json(200, { access_token: 'access-1', refresh_token: 'refresh-1' });
      return json(400, { error: 'invalid_grant' });
    }
    if (url.includes('grant_type=refresh_token')) {
      server.refreshes++;
      if (body.refresh_token !== 'refresh-1') return json(401, {});
      server.tokenValid = true;
      return json(200, { access_token: 'access-2', refresh_token: 'refresh-1' });
    }
    if (url.includes('/storage/v1/object/')) {
      if (!server.tokenValid) return json(401, {});
      server.uploads.push(url);
      return json(200, {});
    }
    if (url.includes('/rest/v1/site_content')) {
      if ((opts.method || 'GET') === 'GET') { server.reads++; return json(200, server.row ? [{ data: server.row }] : [{ data: {} }]); }
      if (!server.tokenValid) return json(401, {});
      server.patches++; server.row = body.data;
      return json(204, null);
    }
    return json(404, {});
  };
}

async function load(server, storages) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://holmwahadaf.sa/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: storages.local, configurable: true });
      Object.defineProperty(w, 'sessionStorage', { value: storages.session, configurable: true });
      w.confirm = () => true;
      w.Element.prototype.scrollIntoView = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,COMPRESSED';
      w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })); };
      w.Image = class { constructor() { this.width = 3200; this.height = 2000; } set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
      w.fetch = mockFetch(w, server);
    }
  });
  const w = dom.window;
  await new Promise(r => { w.addEventListener('load', r); setTimeout(r, 700); });
  await new Promise(r => setTimeout(r, 200));
  return w;
}
const signIn = async (w, pw) => {
  w.document.querySelector('#l-user').value = MANAGER.email;
  w.document.querySelector('#l-pass').value = pw === undefined ? MANAGER.password : pw;
  w.document.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 150));
};
const edit = (w, key, val) => {
  const el = w.document.querySelector(`[data-edit="${key}"]`);
  el.dispatchEvent(new w.Event('focusin', { bubbles: true })); el.textContent = val; el.dispatchEvent(new w.Event('focusout', { bubbles: true }));
};
const click = (w, sel) => w.document.querySelector(sel).dispatchEvent(new w.Event('click', { bubbles: true }));

(async () => {
  console.log('\n— cloud mode is active —');
  const server = makeServer();
  const st = { local: store(), session: store() };
  let w = await load(server, st);
  ok(/Connected to the database|متصل بقاعدة/.test(w.document.querySelector('#modeNote').textContent), 'login dialog reports cloud mode');
  ok(server.reads > 0, 'page fetched content from Supabase');

  console.log('\n— sign in with the Supabase account —');
  await signIn(w, 'wrong-password');
  ok(!w.document.body.classList.contains('admin-on'), 'wrong Supabase password rejected');
  await signIn(w);
  ok(w.document.body.classList.contains('admin-on'), 'correct Supabase password opens edit mode');

  console.log('\n— publish —');
  edit(w, 'hero.title.a', 'نبني محطات حديثة');
  click(w, '#btnSave');
  await new Promise(r => setTimeout(r, 200));
  ok(server.patches === 1, 'Save wrote to Supabase');
  ok(server.row && server.row.text['hero.title.a'][0] === 'نبني محطات حديثة', 'the edit reached the database');
  ok(!w.document.body.classList.contains('is-dirty'), 'marked clean after publishing');

  console.log('\n— a visitor on another device sees it —');
  const visitor = { local: store(), session: store() };
  const v = await load(server, visitor);
  ok(v.document.querySelector('[data-edit="hero.title.a"]').textContent === 'نبني محطات حديثة', 'published edit is live for everyone');

  console.log('\n— images go to Storage, not into the row —');
  const file = new w.File([new Uint8Array([1, 2, 3])], 'station.jpg', { type: 'image/jpeg' });
  const drop = new w.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
  w.document.querySelector('[data-slot="hero"]').dispatchEvent(drop);
  await new Promise(r => setTimeout(r, 300));
  ok(server.uploads.length === 1, 'photo uploaded to Storage');
  click(w, '#btnSave');
  await new Promise(r => setTimeout(r, 200));
  const stored = server.row.images.hero;
  ok(/\/storage\/v1\/object\/public\/site-images\//.test(stored), 'row stores a Storage URL');
  ok(!/^data:/.test(stored), 'row does NOT carry base64 image data');
  ok(JSON.stringify(server.row).length < 40000, 'payload every visitor downloads stays small (' + JSON.stringify(server.row).length + ' bytes)');

  console.log('\n— the 1-hour token expiry —');
  server.tokenValid = false;                       // as if an hour passed
  edit(w, 'about.h', 'شريك تشغيلي');
  click(w, '#btnSave');
  await new Promise(r => setTimeout(r, 300));
  ok(server.refreshes === 1, 'expired token was refreshed automatically');
  ok(server.row.text['about.h'][0] === 'شريك تشغيلي', 'the save went through after refresh');
  ok(!w.document.body.classList.contains('is-dirty'), 'manager never sees a failure');

  console.log('\n— the project is paused (7 days idle on the free plan) —');
  const asleep = { local: store(), session: store() };
  // prime this device's cache with a good read, then put the server to sleep
  const warm = await load(server, asleep);
  ok(warm.document.querySelector('[data-edit="hero.title.a"]').textContent === 'نبني محطات حديثة', 'cached a good copy while awake');
  server.mode = 'paused';
  const w2 = await load(server, asleep);
  ok(w2.document.querySelector('[data-edit="hero.title.a"]').textContent === 'نبني محطات حديثة', 'paused project still shows the PUBLISHED content, not factory defaults');
  ok(w2.document.querySelector('[data-edit="contact.v1"]').textContent.length > 0, 'contact details still render');
  ok(w2.document.querySelectorAll('#tickerTrack span').length === 14, 'page is fully alive (ticker built, scripts bound)');
  w2.document.querySelector('#langToggle').dispatchEvent(new w2.Event('click', { bubbles: true }));
  ok(w2.document.documentElement.lang === 'en', 'language switch still works while Supabase is down');

  console.log('\n— a first-time visitor while the project is paused —');
  const cold = await load(server, { local: store(), session: store() });
  ok(cold.document.querySelector('[data-edit="svc.1.t"]').textContent === 'تصميم وإنشاء المحطات', 'falls back to the built-in copy rather than a blank page');
  ok(cold.document.querySelectorAll('.svc-row').length === 6, 'full page still renders');

  console.log('\n— the network hangs —');
  server.mode = 'slow';
  asleep.local.setItem('hw.lang', 'ar');   // the paused test above left this device on English
  const t0 = Date.now();
  const slow = await load(server, asleep);
  ok(Date.now() - t0 < 3000, 'render did not wait for the network (' + (Date.now() - t0) + 'ms)');
  ok(slow.document.querySelector('[data-edit="hero.title.a"]').textContent === 'نبني محطات حديثة', 'showed cached content immediately');
  ok(slow.document.querySelectorAll('#tickerTrack span').length === 14, 'page fully interactive during a hanging request');

  console.log('\n— saving while offline does not lose work —');
  const off = { local: store(), session: store() };
  server.mode = 'ok';
  let w3 = await load(server, off);
  await signIn(w3);
  edit(w3, 'why.h', 'وعود نلتزم بها');
  server.mode = 'offline';
  click(w3, '#btnSave');
  await new Promise(r => setTimeout(r, 300));
  ok(w3.document.body.classList.contains('is-dirty'), 'still marked unsaved after a failed save');
  ok(!w3.document.querySelector('#btnSave').disabled, 'Save stays clickable to retry');
  ok(/No connection|لا يوجد اتصال/.test(w3.document.querySelector('#toastMsg').textContent), 'manager is told the save did not reach the server');
  ok(!!JSON.parse(off.local.getItem('hw.draft.v1')), 'the work was kept in a local draft');

  console.log('\n— the draft comes back after a refresh —');
  server.mode = 'ok';
  const w4 = await load(server, off);
  await new Promise(r => setTimeout(r, 200));
  ok(w4.document.querySelector('[data-edit="why.h"]').textContent === 'وعود نلتزم بها', 'unsaved edit recovered on next sign-in');
  ok(w4.document.body.classList.contains('is-dirty'), 'flagged as still needing a save');
  w4.document.querySelector('#btnSave').dispatchEvent(new w4.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  ok(server.row.text['why.h'][0] === 'وعود نلتزم بها', 'retry published it');
  ok(!off.local.getItem('hw.draft.v1'), 'draft cleared once it is safely stored');

  console.log('\n' + (fail ? `FAIL — ${pass} passed, ${fail} failed` : `PASS — all ${pass} checks passed`));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
