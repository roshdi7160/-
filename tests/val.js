const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'index.html'), 'utf8');
const si = src.indexOf('<script>');
const html = src.slice(0, si), js = src.slice(si);

function objLiteral(name) {
  const st = js.indexOf('const ' + name + ' = {');
  if (st < 0) throw new Error('no ' + name);
  let i = js.indexOf('{', st), d = 0, e = i;
  for (; e < js.length; e++) { if (js[e] === '{') d++; else if (js[e] === '}') { d--; if (!d) break; } }
  return eval('(' + js.slice(i, e + 1) + ')');
}
const CONTENT = objLiteral('CONTENT'), UI = objLiteral('UI');

const attr = a => [...html.matchAll(new RegExp(a + '="([^"]+)"', 'g'))].map(m => m[1]);
const edits = attr('data-edit'), i18ns = attr('data-i18n'), phs = attr('data-ph'), slots = attr('data-slot');

let bad = 0;
const fail = m => { bad++; console.log('  ✗ ' + m); };

const miss = (list, dict, label) => {
  const m = [...new Set(list)].filter(k => !(k in dict));
  if (m.length) fail(label + ' missing: ' + m.join(', '));
};
miss(edits, CONTENT, 'CONTENT/data-edit');
miss(phs, CONTENT, 'CONTENT/data-ph');
miss(i18ns, UI, 'UI/data-i18n');

const dup = (l, n) => { const d = [...new Set(l.filter((k, i) => l.indexOf(k) !== i))]; if (d.length) fail('duplicate ' + n + ': ' + d.join(', ')); };
dup(edits, 'data-edit'); dup(slots, 'data-slot');

// every CONTENT entry must be a 2-item [ar, en] pair, both non-empty strings
for (const [k, v] of Object.entries(CONTENT)) {
  if (!Array.isArray(v) || v.length !== 2 || v.some(s => typeof s !== 'string' || !s.trim()))
    fail('CONTENT["' + k + '"] is not a valid [ar,en] pair');
}
for (const [k, v] of Object.entries(UI)) {
  if (k === 'ticker') { if (v[0].length !== v[1].length) fail('ticker ar/en length mismatch'); continue; }
  if (!Array.isArray(v) || v.length !== 2 || v.some(s => typeof s !== 'string' || !s.trim()))
    fail('UI["' + k + '"] is not a valid [ar,en] pair');
}

const unused = Object.keys(CONTENT).filter(k => !edits.includes(k) && !phs.includes(k));
if (unused.length) console.log('  · CONTENT keys with no element: ' + unused.join(', '));

// tag balance over the real markup: whole document minus script/style bodies
// (slicing at <script> would cut off </body> and </html> and report a false positive)
const markup = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
for (const tag of ['div', 'section', 'form', 'ul', 'li', 'figure', 'header', 'footer', 'main', 'svg', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'head', 'body', 'html']) {
  const o = (markup.match(new RegExp('<' + tag + '(?=[ >\\n])', 'g')) || []).length;
  const c = (markup.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (o !== c) fail(`<${tag}> unbalanced: ${o} open / ${c} close`);
}

// ids referenced by the script must exist in the markup
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const refd = [...new Set([...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map(m => m[1]))];
const noId = refd.filter(i => !ids.has(i));
if (noId.length) fail('script references missing ids: ' + noId.join(', '));

console.log('---');
console.log('data-edit elements :', edits.length, '| CONTENT keys:', Object.keys(CONTENT).length);
console.log('data-i18n elements :', i18ns.length, '| UI keys     :', Object.keys(UI).length);
console.log('image slots        :', slots.length, '(' + slots.join(', ') + ')');
console.log('script #ids used   :', refd.length, '- all present:', noId.length === 0);
console.log(bad ? 'FAIL: ' + bad + ' issue(s)' : 'PASS: structure, dictionary and bindings consistent');
process.exit(bad ? 1 : 0);
