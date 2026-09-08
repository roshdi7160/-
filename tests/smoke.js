const fs = require('fs');
const { JSDOM } = require('jsdom');
const PAGE = require('path').join(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };

// a localStorage/sessionStorage that persists across the two page loads
function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: i => [...m.keys()][i] };
}
const localS = makeStorage(), sessionS = makeStorage();
localS.setItem('hw.autotr', '0');   // these suites test manual bilingual editing

// these suites cover LOCAL mode (the fallback when Supabase is unreachable
// or unconfigured). Cloud mode is covered by cloud.js.
const localMode = h => h.replace(/SUPABASE_URL:\s*'[^']*'/, "SUPABASE_URL: ''")
                       .replace(/SUPABASE_ANON_KEY:\s*'[^']*'/, "SUPABASE_ANON_KEY: ''")
                       .replace(/LOCAL_PASS:\s*'[^']*'/, "LOCAL_PASS: 'holm2026'");

async function load() {
  const dom = new JSDOM(localMode(fs.readFileSync(PAGE, 'utf8')), {
    runScripts: 'dangerously', url: 'https://holmwahadaf.sa/', pretendToBeVisual: true,
    // must be installed before the page script parses, or boot() reads the wrong storage
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: localS, configurable: true });
      Object.defineProperty(w, 'sessionStorage', { value: sessionS, configurable: true });
      w.confirm = () => true;
      w.Element.prototype.scrollIntoView = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,TEST';
    }
  });
  const w = dom.window;
  await new Promise(r => { w.addEventListener('load', r); setTimeout(r, 700); });
  await new Promise(r => setTimeout(r, 120));
  return w;
}
const click = (w, sel) => w.document.querySelector(sel).dispatchEvent(new w.Event('click', { bubbles: true }));

(async () => {
  console.log('\n— boot & bilingual render —');
  let w = await load();
  let d = w.document;

  ok(d.documentElement.lang === 'ar' && d.documentElement.dir === 'rtl', 'boots in Arabic / RTL');
  const arH1 = d.querySelector('[data-edit="hero.title.a"]').textContent;
  ok(arH1 === 'نبني محطات وقود', 'Arabic hero headline rendered');
  ok(d.querySelector('[data-edit="svc.6.d"]').textContent.includes('طوارئ'), 'deep service copy rendered');
  ok(d.querySelector('#f-name').placeholder === 'الاسم الكامل', 'Arabic placeholder applied');
  ok(d.querySelectorAll('#tickerTrack span').length === 14, 'ticker doubled for seamless loop (14 = 7×2)');
  ok(d.querySelector('#yr').textContent === String(new Date().getFullYear()), 'copyright year filled');
  ok(!d.body.classList.contains('admin-on'), 'admin chrome hidden for public visitors');
  ok(d.querySelectorAll('.rv').length > 20, 'scroll-reveal applied to content blocks');

  console.log('\n— language switch —');
  click(w, '#langToggle');
  ok(d.documentElement.lang === 'en' && d.documentElement.dir === 'ltr', 'switches to English / LTR');
  ok(d.querySelector('[data-edit="hero.title.a"]').textContent === 'We build fuel stations', 'English headline');
  ok(d.querySelector('#f-name').placeholder === 'Full name', 'English placeholder');
  ok(d.querySelector('[data-edit="svc.3.t"]').textContent === 'Dispensers & calibration', 'English service title');
  ok(localS.getItem('hw.lang') === 'en', 'language choice remembered');
  click(w, '#langToggle');
  ok(d.querySelector('[data-edit="hero.title.a"]').textContent === 'نبني محطات وقود', 'switches back to Arabic');

  console.log('\n— login —');
  d.querySelector('#l-user').value = 'admin';
  d.querySelector('#l-pass').value = 'wrong';
  d.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 60));
  ok(d.querySelector('#loginErr').classList.contains('show'), 'wrong password rejected');
  ok(!d.body.classList.contains('admin-on'), 'no admin access after failed login');

  d.querySelector('#l-user').value = 'admin';
  d.querySelector('#l-pass').value = 'holm2026';
  d.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 60));
  ok(d.body.classList.contains('admin-on'), 'correct password opens edit mode');
  ok(d.querySelector('[data-edit="about.h"]').getAttribute('contenteditable') === 'true', 'text became editable');
  ok(d.querySelectorAll('.blk-tools .grab').length === 8, 'drag handles on all 8 sections');
  ok(d.querySelector('#btnSave').disabled, 'Save disabled until something changes');

  console.log('\n— editing text —');
  const h = d.querySelector('[data-edit="about.h"]');
  h.dispatchEvent(new w.Event('focusin', { bubbles: true }));
  h.textContent = 'شريك تشغيلي موثوق';
  h.dispatchEvent(new w.Event('focusout', { bubbles: true }));
  ok(!d.querySelector('#btnSave').disabled, 'Save enabled after an edit');
  ok(d.body.classList.contains('is-dirty'), 'unsaved-changes dot shown');

  console.log('\n— reorder & hide —');
  const before = [...d.querySelectorAll('main .blk')].map(b => b.dataset.blk);
  const work = d.querySelector('[data-blk="work"]');
  work.querySelector('[data-mv="-1"]').dispatchEvent(new w.Event('click', { bubbles: true }));
  const after = [...d.querySelectorAll('main .blk')].map(b => b.dataset.blk);
  ok(before.indexOf('work') - after.indexOf('work') === 1, 'move-up reorders the section');
  d.querySelector('[data-blk="why"] [data-hide]').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok(d.querySelector('[data-blk="why"]').classList.contains('is-hidden'), 'section hidden');

  console.log('\n— English edit stays separate —');
  click(w, '#langToggle');
  ok(d.querySelector('[data-edit="about.h"]').textContent === 'An operating partner, not just a contractor', 'Arabic edit did not overwrite English');
  const he = d.querySelector('[data-edit="about.h"]');
  he.dispatchEvent(new w.Event('focusin', { bubbles: true }));
  he.textContent = 'A trusted operating partner';
  he.dispatchEvent(new w.Event('focusout', { bubbles: true }));
  click(w, '#langToggle');
  ok(d.querySelector('[data-edit="about.h"]').textContent === 'شريك تشغيلي موثوق', 'both languages held independently');

  console.log('\n— undo —');
  click(w, '#btnUndo');
  ok(d.querySelector('[data-edit="about.h"]').textContent === 'شريك تشغيلي موثوق', 'undo reverted the English edit only');

  console.log('\n— save —');
  click(w, '#btnSave');
  await new Promise(r => setTimeout(r, 120));
  ok(!d.body.classList.contains('is-dirty'), 'dirty flag cleared after save');
  const saved = JSON.parse(localS.getItem('hw.site.v1'));
  ok(saved.text['about.h'][0] === 'شريك تشغيلي موثوق', 'Arabic edit persisted');
  ok(saved.hidden.includes('why'), 'hidden section persisted');
  ok(saved.order.indexOf('work') < saved.order.indexOf('process'), 'section order persisted (work moved above process)');

  console.log('\n— reload: does it come back? —');
  w.close();
  w = await load(); d = w.document;
  ok(d.querySelector('[data-edit="about.h"]').textContent === 'شريك تشغيلي موثوق', 'edited text survives reload');
  ok(d.querySelector('[data-blk="why"]').classList.contains('is-hidden'), 'hidden section survives reload');
  const order = [...d.querySelectorAll('main .blk')].map(b => b.dataset.blk);
  ok(order.indexOf('work') < order.indexOf('process'), 'section order survives reload');
  ok(d.body.classList.contains('admin-on'), 'session kept the manager signed in');

  console.log('\n— reset & logout —');
  click(w, '#btnReset');
  ok(d.querySelector('[data-edit="about.h"]').textContent === 'شريك تشغيلي، لا مجرد مقاول', 'reset restores original copy');
  ok(!d.querySelector('[data-blk="why"]').classList.contains('is-hidden'), 'reset unhides sections');
  click(w, '#btnLogout');
  ok(!d.body.classList.contains('admin-on'), 'logout removes edit mode');
  ok(d.querySelector('[data-edit="about.h"]').getAttribute('contenteditable') === null, 'text no longer editable after logout');

  console.log('\n— public contact form —');
  const f = d.querySelector('#leadForm');
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(d.querySelector('#toast').classList.contains('bad'), 'empty form shows validation error');
  f.querySelector('#f-name').value = 'أحمد';
  f.querySelector('#f-phone').value = '0500000000';
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(!d.querySelector('#toast').classList.contains('bad'), 'valid form accepted');

  console.log('\n' + (fail ? `FAIL — ${pass} passed, ${fail} failed` : `PASS — all ${pass} checks passed`));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
