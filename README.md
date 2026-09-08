# حلم وهدف — landing page

One file: `index.html`. No build step, no dependencies, no framework. Open it in a browser and it works.

```
E:\Roshdi\
  index.html    ← the entire site. This is the only file you deploy.
  README.md     ← this file
  tests\        ← optional; not needed to run or host the site
```

---

## For the manager (الشخص المسؤول)

1. Scroll to the very bottom of the page.
2. Click the small **دخول المدير / Manager login** button in the footer bar.
3. Sign in. A dark toolbar appears at the top of the page.

Then:

| Action | How |
|---|---|
| Change any text | Click it and type. Press `Esc` to cancel the edit. |
| Change any image | Click the image, or drag a photo file onto it. |
| Size / crop an image | Click the `⤢` button on the picture. See **Getting a picture to sit right** below. |
| Reorder sections | Drag the `⠿` handle, or use the `↑` `↓` buttons. |
| Hide a section | Click `◌` on that section. It greys out for you, and disappears for visitors. |
| Undo | The `↺` button, or `Ctrl+Z`. |
| Save | The orange **حفظ / Save** button, or `Ctrl+S`. |
| Start over | **استرجاع الأصل / Reset** restores the original text and images. |
| Get a copy of the file | **تنزيل نسخة / Download** — see below. |

Everything visible is editable, including the logo lettering and the scrolling strip under the hero.

### Getting a picture to sit right

Every picture, the logo included, has an `⤢` button in its top corner while you are signed in. Click it and a small panel opens beside that picture:

| Control | What it does |
|---|---|
| **الملاءمة / Fit** | **ملء الإطار / Fill** stretches the picture to cover the whole frame and trims what overflows — right for photographs. **كاملة / Whole** shrinks it until all of it is visible, with space around it — right for logos, diagrams, anything with edges that must not be cut. |
| **الحجم / Size** | 30% to 300%. Under 100% pulls the picture back inside its frame; over 100% pushes in closer. |
| **الموضع / Position** | The small grid sets which part of the picture stays in view when it is cropped. You can also just **drag the picture itself** inside its frame. |
| **تغيير الصورة / Replace** | Pick a different file, keeping the framing you have set. |
| **إعادة الضبط / Reset** | Back to how the picture came in. |

`Esc` closes the panel. Nothing is committed until you press **حفظ / Save**, and `Ctrl+Z` steps back through size and position changes like any other edit.

The header logo only offers **Size** — it is always shown whole at its own proportions, so fit and position would do nothing. Until you upload one, the header keeps the حه lettering; upload a logo and it takes over, remove it and the lettering comes back.

### Languages translate themselves

**Auto-translate is on by default.** Type in Arabic, and the English version of that same field is filled in automatically — and the other way round. Switch language with `ع / EN` to check the result.

- Phone numbers, emails and web addresses are copied across exactly, never translated.
- **ترجم الباقي / Translate rest** fills in every field you have changed but not yet translated.
- **ترجمة تلقائية / Auto-translate** turns the whole thing off if you would rather write both languages by hand.

Translation runs only while editing, never when a visitor opens the page — so it can never slow the site down or break it. It uses your browser's own built-in translator when available (Chrome 138+, works offline, nothing leaves the device); otherwise it falls back to a free public service, MyMemory. That fallback means the text of the field being edited is sent to `api.mymemory.translated.net`. It is marketing copy headed for a public page, so there is nothing sensitive in it, but if you would rather it never left your machine, switch auto-translate off and type both languages.

**Always review the English before saving.** Machine translation of marketing copy is a starting point, not a finished text.

The orange dot next to "وضع التحرير" means there are unsaved changes. The browser will warn before closing with unsaved work.

---

## Supabase

**It is already wired in.** `index.html` carries your project URL and publishable key, so the page runs in cloud mode: the manager signs in with their Supabase email and password, presses Save, and the change is live for everyone immediately.

Two things still have to be done in the Supabase dashboard before that works:

1. **SQL Editor → New query →** paste `supabase-setup.sql` from this folder → **Run**. (Checked on 2026-09-09: the `site_content` table did not exist yet.)
2. **Authentication → Users → Add user →** create the manager's email and password. Then **Authentication → Providers →** turn off public sign-ups so nobody can register themselves.

### Built to survive the free plan

Free projects sleep after seven days without traffic, and can be briefly unreachable. The page is written so none of that is visible to a visitor:

| Situation | What happens |
|---|---|
| Project paused or unreachable | The last published content is served from the visitor's own cache. Never a blank page, never a fall back to factory placeholder text. |
| Network slow or hanging | The page renders immediately and catches up in the background. Requests give up after 8 seconds instead of hanging. |
| Sign-in older than an hour | The token is refreshed automatically and the save goes through. The manager sees nothing. |
| Save fails (offline, asleep) | The edit is kept in a local draft, the manager is told it did not reach the server, and it is offered back at the next sign-in. |
| First-ever visit while paused | Falls back to the copy built into the file. |

To stop it sleeping at all, point a free scheduler such as cron-job.org at this URL once a week — any request counts as activity:

```
https://vnhavxkktlnqbtqfyxtv.supabase.co/rest/v1/site_content?id=eq.1&select=id
```
with header `apikey: <your publishable key>`.

**Photos go to Supabase Storage, not into the database row.** Storing them as base64 in the row would make every single visitor download several megabytes of image data and burn the 5GB monthly bandwidth in roughly 2,500 visits. Instead the row stays around 10KB and photos are served from the CDN with normal browser caching.

## Local mode

If the Supabase settings in `CONFIG` are ever blanked out, the page falls back to local mode.

**Local mode does not need any account.** Out of the box the page is in **local mode**: edits are saved in the manager's own browser (`localStorage`). That is genuinely useful for drafting, but be clear about the limit:

> In local mode, edits live in **one browser on one device**. Visitors do not see them. Clearing browser data erases them.

To publish those edits from local mode, use **تنزيل نسخة / Download**. That produces a complete `.html` file with all text and images baked in — upload that file to your host and it *is* the live page. It still contains the login button, so the next round of editing works on the uploaded copy too. This is a real workflow, just a manual one: edit → download → upload.

Local mode stays as the fallback: if Supabase is ever unreachable *and* this device has no cached copy, the page still renders the content built into the file.

---

## Security, stated plainly

**Local mode has no real security.** `LOCAL_USER` / `LOCAL_PASS` sit in the page source — anyone who views source can read them. It is a "keep the manager out of trouble" latch, not a lock. What it *does* protect: nothing a visitor does can change what anyone else sees, because local edits never leave that browser.

If the page is public and edits must be genuinely restricted, use Supabase. That is real authentication with the password checked on a server.

Change `LOCAL_PASS` from the default `holm2026` either way.

---

## Hosting

Any static host — Netlify, Vercel, Cloudflare Pages, GitHub Pages, or plain shared hosting. Upload `index.html`. Nothing to configure.

Open it through a local server rather than double-clicking the file if you can (`npx serve .`), since some browsers restrict storage on `file://` URLs.

---

## Notes / limits

- **Images** are downscaled to 1600px wide and re-encoded as JPEG in the browser before saving, so uploads stay small. Local mode still shares one ~5MB `localStorage` budget across all images; the page shows "المساحة ممتلئة" if you exceed it. For a photo-heavy gallery on cloud mode, move images to Supabase Storage and keep URLs in `data` instead of base64.
- **The contact form does not send anywhere yet.** It validates and shows a confirmation. Point it at Formspree, Web3Forms, or a Supabase function — the handler is the last block in the script, marked with a comment.
- **Placeholder content to replace:** phone `+966 12 345 6789`, email `info@holmwahadaf.sa`, and the statistics in the hero (120+ stations, 15 years, etc.). The manager can edit all of these in the browser — no code needed.
- Section order, hidden sections, both languages, and all images are stored together, so one Save captures the whole page state.

---

## Tests (optional)

The `tests\` folder checks the page still works after edits. You never need this to run or host the site — it is there so changes can be verified.

```bash
cd tests
npm install
npm test
```

Three suites, 60 checks: `val.js` verifies structure and that every text key is wired to an element; `smoke.js` drives login, editing, reordering, hiding, undo, save and reload persistence in a real DOM; `smoke2.js` covers image upload and the Download/export file.

They caught four genuine bugs during the build, including a contact form that threw on every submit and an exported file that rendered blank — so it is worth re-running them after any change to `index.html`.
