const fs = require('fs');
const { JSDOM } = require('jsdom');
const PAGE = require('path').join(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.log('  ✗ ' + m)); };
function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), get length() { return m.size; }, key: i => [...m.keys()][i] };
}

let captured = null;
// these suites cover LOCAL mode (the fallback when Supabase is unreachable
// or unconfigured). Cloud mode is covered by cloud.js.
const localMode = h => h.replace(/SUPABASE_URL:\s*'[^']*'/, "SUPABASE_URL: ''")
                       .replace(/SUPABASE_ANON_KEY:\s*'[^']*'/, "SUPABASE_ANON_KEY: ''")
                       .replace(/LOCAL_PASS:\s*'[^']*'/, "LOCAL_PASS: 'holm2026'");

async function load(seedHtml) {
  const localS = makeStorage(), sessionS = makeStorage();
  localS.setItem('hw.autotr', '0');
  const dom = new JSDOM(localMode(seedHtml || fs.readFileSync(PAGE, 'utf8')), {
    runScripts: 'dangerously', url: 'https://holmwahadaf.sa/', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { value: localS, configurable: true });
      Object.defineProperty(w, 'sessionStorage', { value: sessionS, configurable: true });
      w.confirm = () => true;
      w.Element.prototype.scrollIntoView = function () {};
      w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,COMPRESSED';
      w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })); };
      // decode-free Image stub so compress() can resolve
      w.Image = class { constructor() { this.width = 3200; this.height = 2000; } set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
      // capture the blob's text at construction - Blob.text() is not in every jsdom build
      const RealBlob = w.Blob;
      w.Blob = class extends RealBlob {
        constructor(parts, opts) { super(parts, opts); this.__text = (parts || []).join(''); }
      };
      w.URL.createObjectURL = b => { captured = b; return 'blob:stub'; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
    }
  });
  const w = dom.window;
  await new Promise(r => { w.addEventListener('load', r); setTimeout(r, 700); });
  await new Promise(r => setTimeout(r, 120));
  return w;
}
const signIn = async (w) => {
  w.document.querySelector('#l-user').value = 'admin';
  w.document.querySelector('#l-pass').value = 'holm2026';
  w.document.querySelector('#loginForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 60));
};

(async () => {
  console.log('\n— image upload by drop —');
  const w = await load();
  const d = w.document;
  await signIn(w);

  const slot = d.querySelector('[data-slot="hero"]');
  ok(!!slot.querySelector('.ph'), 'placeholder drawing shown before upload');
  ok(slot.dataset.uploadLabel === 'انقر أو أفلت صورة هنا', 'Arabic upload hint on the slot');

  const file = new w.File([new Uint8Array([1, 2, 3])], 'station.jpg', { type: 'image/jpeg' });
  const dt = { files: [file] };
  const drop = new w.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: dt });
  slot.dispatchEvent(drop);
  await new Promise(r => setTimeout(r, 250));

  const img = slot.querySelector('img');
  ok(!!img, 'image element inserted into the slot');
  ok(img && img.src === 'data:image/jpeg;base64,COMPRESSED', 'image was downscaled/compressed before storing');
  ok(slot.querySelector('.ph').style.display === 'none', 'placeholder hidden once an image exists');
  ok(d.body.classList.contains('is-dirty'), 'upload marks the page unsaved');

  console.log('\n— non-image drop is ignored —');
  const bad = new w.File(['x'], 'notes.pdf', { type: 'application/pdf' });
  const drop2 = new w.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop2, 'dataTransfer', { value: { files: [bad] } });
  d.querySelector('[data-slot="about"]').dispatchEvent(drop2);
  await new Promise(r => setTimeout(r, 150));
  ok(!d.querySelector('[data-slot="about"] img'), 'PDF drop rejected, no image inserted');

  console.log('\n— undo removes the image —');
  d.querySelector('#btnUndo').dispatchEvent(new w.Event('click', { bubbles: true }));
  ok(!d.querySelector('[data-slot="hero"] img'), 'undo removed the uploaded image');

  console.log('\n— export a standalone copy —');
  // put an edit + image back in, then export
  const drop3 = new w.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop3, 'dataTransfer', { value: dt });
  d.querySelector('[data-slot="hero"]').dispatchEvent(drop3);
  await new Promise(r => setTimeout(r, 250));
  const h = d.querySelector('[data-edit="hero.title.a"]');
  h.dispatchEvent(new w.Event('focusin', { bubbles: true }));
  h.textContent = 'محطات وقود جاهزة';
  h.dispatchEvent(new w.Event('focusout', { bubbles: true }));

  d.querySelector('#btnExport').dispatchEvent(new w.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  ok(!!captured, 'export produced a file blob');
  const out = captured.__text;
  ok(out.startsWith('<!DOCTYPE html>'), 'exported file is a complete document');
  ok(out.includes('window.__SEED__='), 'edits baked into the exported file');
  ok(out.includes('id="adminbar"'), 'admin bar kept so the export stays manageable');
  ok(!/contenteditable="/.test(out), 'contenteditable attributes stripped from the export');
  ok((out.match(/id="seed"/g) || []).length === 1, 'exactly one seed script');
  ok(!out.includes('class="overlay open"'), 'no modal left open in the export');

  console.log('\n— the exported file opens standalone with content intact —');
  captured = null;
  const w2 = await load(out);
  const d2 = w2.document;
  ok(d2.querySelector('[data-edit="hero.title.a"]').textContent === 'محطات وقود جاهزة', 'exported copy shows the edited headline');
  ok(!!d2.querySelector('[data-slot="hero"] img'), 'exported copy keeps the uploaded image');
  ok(!d2.body.classList.contains('admin-on'), 'exported copy opens as a public page');
  // and English is still intact in the exported copy
  d2.querySelector('#langToggle').dispatchEvent(new w2.Event('click', { bubbles: true }));
  ok(d2.querySelector('[data-edit="hero.title.b"]').textContent === 'that never stop running', 'exported copy still bilingual');

  console.log('\n' + (fail ? `FAIL — ${pass} passed, ${fail} failed` : `PASS — all ${pass} checks passed`));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
