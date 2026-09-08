/* Auto-translation: editing one language mirrors into the other.
   Both translation engines are mocked — no network, no API keys. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
const store = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: i => [...m.keys()][i] }; };

// run in local mode so sign-in is the built-in latch, not Supabase
const localMode = h => h.replace(/SUPABASE_URL:\s*'[^']*'/, "SUPABASE_URL: ''")
                        .replace(/SUPABASE_ANON_KEY:\s*'[^']*'/, "SUPABASE_ANON_KEY: ''")
                       .replace(/LOCAL_PASS:\s*'[^']*'/, "LOCAL_PASS: 'holm2026'");

/* engine: 'builtin' | 'web' | 'none' */
async function load(engine, seed) {
  const calls = { builtin: 0, web: 0 };
  const dom = new JSDOM(localMode(HTML), {
    runScripts: 'dangerously', url: 'https://holmwahadaf.sa/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: store(seed || {}), configurable: true });
      Object.defineProperty(w, 'sessionStorage', { value: store(), configurable: true });
      w.confirm = () => true;
      w.Element.prototype.scrollIntoView = function () {};

      if (engine === 'builtin') {
        w.Translator = {
          availability: async () => 'available',
          create: async ({ targetLanguage }) => ({
            translate: async (s) => { calls.builtin++; return `<${targetLanguage}>` + s; }
          })
        };
      }
      w.fetch = async (url) => {
        if (String(url).includes('mymemory')) {
          calls.web++;
          if (engine === 'none') return { ok: false, status: 500, json: async () => ({}) };
          const q = decodeURIComponent(String(url).match(/[?&]q=([^&]*)/)[1]);
          const to = String(url).match(/langpair=\w+\|(\w+)/)[1];
          return { ok: true, status: 200, json: async () => ({ responseData: { translatedText: `{${to}}` + q } }) };
        }
        throw new w.Error('unexpected request: ' + url);
      };
    }
  });
  const w = dom.window;
  await new Promise(r => { w.addEventListener('load', r); setTimeout(r, 700); });
  await new Promise(r => setTimeout(r, 150));
  return { w, calls };
}

const signIn = async (w) => {
  w.document.querySelector('#l-user').value = 'admin';
  w.document.querySelector('#l-pass').value = 'holm2026';
  w.document.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 80));
};
const edit = async (w, key, val, wait = 250) => {
  const el = w.document.querySelector(`[data-edit="${key}"]`);
  el.dispatchEvent(new w.Event('focusin', { bubbles: true }));
  el.textContent = val;
  el.dispatchEvent(new w.Event('focusout', { bubbles: true }));
  await new Promise(r => setTimeout(r, wait));
};
const toEn = async (w) => { w.document.querySelector('#langToggle').dispatchEvent(new w.Event('click', { bubbles: true })); await new Promise(r => setTimeout(r, 60)); };
const txt = (w, key) => w.document.querySelector(`[data-edit="${key}"]`).textContent;

(async () => {
  console.log('\n— Arabic edit mirrors into English (on-device engine) —');
  let { w, calls } = await load('builtin');
  await signIn(w);
  ok(w.document.querySelector('#btnTr').classList.contains('on'), 'auto-translate is on by default');

  await edit(w, 'about.h', 'شريك تشغيلي موثوق');
  ok(calls.builtin === 1, 'used the browser built-in translator');
  ok(calls.web === 0, 'did not touch the web service when built-in works');
  await toEn(w);
  ok(txt(w, 'about.h') === '<en>شريك تشغيلي موثوق', 'English now matches the new Arabic text');

  console.log('\n— English edit mirrors back into Arabic —');
  await edit(w, 'why.h', 'Promises we keep');
  w.document.querySelector('#langToggle').dispatchEvent(new w.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  ok(txt(w, 'why.h') === '<ar>Promises we keep', 'Arabic updated from the English edit');

  console.log('\n— things that must not be translated —');
  const before = calls.builtin;
  await edit(w, 'contact.v1', '+966 55 123 4567');
  ok(calls.builtin === before, 'phone number not sent to the translator');
  await edit(w, 'contact.v2', 'sales@holmwahadaf.sa');
  ok(calls.builtin === before, 'email address not sent to the translator');
  await toEn(w);
  ok(txt(w, 'contact.v1') === '+966 55 123 4567', 'phone copied across as-is');
  ok(txt(w, 'contact.v2') === 'sales@holmwahadaf.sa', 'email copied across as-is');

  console.log('\n— falls back to the web service —');
  ({ w, calls } = await load('web'));
  await signIn(w);
  await edit(w, 'hero.lead', 'نبني محطات وقود موثوقة');
  ok(calls.web === 1, 'used the free web service when no built-in engine exists');
  await toEn(w);
  ok(txt(w, 'hero.lead') === '{en}نبني محطات وقود موثوقة', 'English filled from the web service');

  console.log('\n— translation unavailable: editing still works —');
  ({ w, calls } = await load('none'));
  await signIn(w);
  await edit(w, 'about.h', 'نص عربي جديد');
  ok(txt(w, 'about.h') === 'نص عربي جديد', 'the Arabic edit itself is kept');
  ok(w.document.body.classList.contains('is-dirty'), 'still marked as changed');
  await toEn(w);
  ok(txt(w, 'about.h') === 'An operating partner, not just a contractor', 'English left untouched for the manager to write');

  console.log('\n— the toggle turns it off —');
  ({ w, calls } = await load('builtin'));
  await signIn(w);
  w.document.querySelector('#btnTr').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok(!w.document.querySelector('#btnTr').classList.contains('on'), 'toggle switched off');
  await edit(w, 'about.h', 'بدون ترجمة');
  ok(calls.builtin === 0, 'no translation attempted while off');
  await toEn(w);
  ok(txt(w, 'about.h') === 'An operating partner, not just a contractor', 'English untouched when off');

  console.log('\n— "Translate rest" backfills what is still original —');
  ({ w, calls } = await load('builtin', { 'hw.autotr': '0' }));
  await signIn(w);
  await edit(w, 'about.h', 'نص أول', 60);
  await edit(w, 'why.h', 'نص ثانٍ', 60);
  ok(calls.builtin === 0, 'nothing translated yet (auto is off)');
  w.document.querySelector('#btnTrAll').dispatchEvent(new w.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  ok(calls.builtin === 2, 'translated exactly the two edited fields');
  await toEn(w);
  ok(txt(w, 'about.h') === '<en>نص أول' && txt(w, 'why.h') === '<en>نص ثانٍ', 'both counterparts filled in');
  ok(txt(w, 'hero.lead').startsWith('From site study'), 'untouched fields keep their original English');

  console.log('\n— everything is editable —');
  ({ w } = await load('builtin'));
  await signIn(w);
  const d = w.document;
  ok(d.querySelector('[data-edit="brand.mark"]') && d.querySelector('[data-edit="brand.mark"]').getAttribute('contenteditable') === 'true', 'logo mark is editable');
  const tick = d.querySelector('#tickerTrack [data-edit="ticker.1"]');
  ok(!!tick && tick.getAttribute('contenteditable') === 'true', 'ticker items are editable');
  await edit(w, 'ticker.1', 'تشغيل وصيانة');
  ok(d.querySelectorAll('#tickerTrack span').length === 14, 'ticker still has its seamless-loop duplicate');
  const spans = [...d.querySelectorAll('#tickerTrack span')].map(s => s.textContent);
  ok(spans[0] === 'تشغيل وصيانة' && spans[7] === 'تشغيل وصيانة', 'the loop copy was updated to match');

  console.log('\n— a visitor never triggers translation —');
  const vis = await load('builtin');
  await edit(vis.w, 'about.h', 'محاولة', 150);   // not signed in
  ok(vis.calls.builtin === 0 && vis.calls.web === 0, 'no translation requests from a public visitor');

  console.log('\n' + (fail ? `FAIL — ${pass} passed, ${fail} failed` : `PASS — all ${pass} checks passed`));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
