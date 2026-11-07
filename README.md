# Local Task Marketplace — prototype

A working first draft of a fair, local task marketplace for Vienna, Graz and Linz.
Clients post small tasks, taskers apply and build a portable reputation, and
businesses can discover taskers who **chose** to be visible for stable work.

"Local Tasks" is a working title. It lives in one place: `js/config.js`.

This folder is self-contained: every path is relative, and nothing outside it is used.

## Run it

No build step and no dependencies. Start the local server (works from any folder):

```bash
python3 ~/Claude/Projects/LOCALTASKS/serve.py
```

Then open:

- **Web app:** <http://localhost:4180/>
- **Mobile app view:** <http://localhost:4180/app.html>. On a computer it shows inside a phone frame; on a phone it fills the screen.

`serve.py` is Python's built-in server with browser caching switched off, so changes show up on
a normal reload. Opening `index.html` straight from disk will not work, because browsers block
ES modules over `file://`.

Tests (Node 20+; no packages to install), also from this folder:

```bash
npm test
```

26 tests: logic (matching, statuses, validation, masking, fees), the end-to-end service
flows, and smoke tests that render every web and mobile screen for every demo account and fail
on `undefined`, `NaN` or forbidden promises like "guaranteed income".

## Mobile app view

`app.html` is a phone-app version of the same product, with the same accounts and data, laid out
after common ride-hailing patterns (not their branding): a "Describe a task" search pill and
colourful service tiles, a map-first tasker home with an "available" switch, a step-by-step
post flow ending on a confirm screen, a "Choose your tasker" offer list, live job tracking, and
a big rating screen. The look: bold black type and outlines on cream, with eight colours (sun,
tomato, mint, sky, bubblegum, lavender, lime, cobalt), and one colour per task category.
Code: `js/mobile/` and `css/mobile.css`. Business and moderator tools stay in the web app.

## Fastest way to review

Open **Guided demo** (`#/guide`). Each of its 10 steps signs you in as a seeded account and
opens the right screen. You can also use **Switch demo account** in the dark strip at the
top. **Reset** in that strip restores the seed data.

Tip: open two tabs. Each tab can be a different person (session is per tab), and the
data stays in sync between them through `localStorage` events.

| Account | Role | What it shows |
|---|---|---|
| Katharina Huber | Client, Vienna | Two applicants to compare, a clean in progress, unread messages |
| Martin Steiner | Client, Graz | A newcomer finished his first task: confirm and review it |
| Eva Lindner | Client, Linz | Open tasks with and without applicants |
| Lukas Bauer | Tasker, student | Applications, a dispute that pauses his rating, not yet visible to businesses |
| Ferdinand Gruber | Tasker, gardener | 37 reviews, a pending request from a gardening firm |
| Mehmet Yılmaz | Tasker, mover | Shortlisted; visible for logistics jobs |
| Ana Petrović | Tasker, cleaner | Ratings that are good but not perfect; a clean in progress today |
| Jana Novak | Tasker, pet carer | Linz; applied to dog walks |
| Elif Demir | Tasker, economics graduate | MSc proof pending review; connected with a finance firm |
| Tobias Leitner | Tasker, **newcomer** | No reviews, strong profile, newcomer exposure boost |
| Sophie Wagner | Client **and** tasker | Role switching; opened a dispute as a client |
| GrünRaum Gartenbau | Business, gardening | Candidate search, saved candidates |
| ClearSpace Reinigung | Business, cleaning | Pending request to Ana |
| Donau Capital Partners | Business, financial services | Shows field-relevant ranking (economics proof beats moving history) |
| Mira Hofbauer | Moderator | Reports, proof review, restricted tasks, disputes, category policy |

## What is real, what is mocked

| Area | In this prototype | Needs a backend / provider |
|---|---|---|
| Data | One JSON document in `localStorage` (`js/store.js`), versioned and reseeded on schema change | Database (e.g. Postgres) with the same entities |
| Auth | No passwords; a session is a user id in `sessionStorage` | Real auth (passwordless email, OAuth), sessions, rate limits |
| Business rules | **Real**: status machines, validation, fee maths, matching, consent gates, masking | Same code server-side; never trust the client |
| Payments | Demo ledger only. Amounts are "reserved/released/on hold/refunded (demo)"; nothing is withdrawable | Licensed PSP (e.g. Stripe Connect / Adyen for Platforms), KYC, payouts, receipts, VAT |
| Proof uploads | Only the file name is kept | Object storage, virus scan, issuer checks, retention policy |
| Verification | Labels only: self-reported → pending review → "checked by moderator (demo)" | Identity provider, registry and licence checks, audit trail |
| Messaging | Local, with phone/email masking until a task or connection is accepted | Realtime delivery, abuse detection, retention |
| Notifications | In-app list and toasts | Email, push, preferences, digests |
| Moderation | Working console with logged decisions (`state.auditLog`) | Staff tooling, SLAs, appeals, legal holds |
| Simulation | Seeded people auto-reply to messages and answer invites, always labelled "Demo" | Remove (`APP.simulation = false`) |

## Structure

```
index.html            shell, noindex
css/app.css           design tokens + components, mobile first
js/config.js          name, locale, currency, fees, feature flags
js/data/              seed, categories + policies, business fields, Austrian areas
js/logic/             pure rules: matching, status machines, validation, fees, reputation, privacy
js/services/          the mock API: one function per future endpoint
js/store.js           persistence (replace with an API client)
js/select.js          read-only queries
js/ui/                html templating, components, dialogs, icons, UI state
js/views/             one module per screen, named by user intent
tests/                node:test suites
docs/                 product brief (.md, .docx) and the script that builds the .docx
.claude/launch.json   preview config for Claude Code (python3 http.server on 4180)
```

To rebuild the brief after editing `docs/product_brief.md`: `python3 docs/build_product_brief.py`
(needs `python-docx`).

Views never write to the store directly. They call `services/*`, which validate, apply status
transitions through `logic/status.js`, write via `store.update()`, and emit notifications. To
move to a backend, keep `logic/` and replace `services/` + `store.js` with API calls.

### Data model

`User`, `TaskerProfile`, `BusinessProfile`, `Task`, `Application`, `Assignment`, `Conversation`,
`Message`, `Review`, `ProofItem`, `WalletTransaction`, `BusinessConnection`, `Report`, plus
`Dispute`, `Block`, `SavedCandidate`, `Notification`, `DataRequest` and `AuditLog`. Field names
follow the brief; see `js/data/seed.js` for full examples of every record.

### Matching (`js/logic/matching.js`)

- `taskFit(task, tasker)` scores one tasker for **one task**: category fit, relevant skills,
  availability on that weekday and time of day, distance between areas, reviews **on similar work**,
  completion record (only once there are 5+ accepted tasks), relevant proof weighted by review
  status, budget against usual rate, and a newcomer boost below 3 completed tasks.
- `candidateFit(business, tasker)` scores one opted-in tasker for **one business field**, using only
  field-relevant proof, skills, task history and review quality, plus stated goals and location.
- `isRecruitable()` is the hard consent gate: role tasker, `discoverableToBusinesses`, and
  `employmentGoal.seeking`.
- Every result carries a plain-language `explanation` and the full factor list behind
  "How this was worked out". The level labels are "Strong fit", "Good fit", "Possible fit" and
  "Not a close fit". No screen shows a number or an overall score for a person.
- A different city caps the fit at "Not a close fit". A missing category caps it at "Possible".
  An unmatched time slot caps it at "Good".
- Never used: protected characteristics, photos, payments, or activity frequency. Low activity is
  never a negative signal.

### Regulated categories

You asked for the product not to be limited by regulation while the legal side is still open.
So every regulated category is fully built: babysitting, food, finance, tax, personal care,
construction and licensed services can be posted. Their tasks go to the moderator first and
open for applications once approved. Medical, electrical/gas and structural work start as
"Coming soon".

Each category's policy (`open` / `review` / `soon`) is a setting. Change it in
`js/data/categories.js`, or in the moderation console under **Categories** (stored in
`state.categoryPolicy`). Switching a category to "Available" is one click once it is cleared.

The honesty labels are a separate matter and stay on deliberately: demo money is never shown as
withdrawable, and proof is never shown as verified unless a moderator checked it. Removing those
labels would make the prototype misleading. Legal sign-off would not change that.

## Known limitations

- Single-browser data. Two tabs share it; two devices do not.
- No real authentication. Anyone can switch to any demo account by design.
- Distances are between district centres, not addresses. There is no map.
- Rendering re-draws the whole screen on each change. Typed values and focus are preserved,
  but very large lists would need virtualisation or a component framework.
- Copy is English. Shared labels and all money and date formatting go through `js/i18n.js`
  (`en-AT`, so `€ 1.234,50`). Most screen copy is still inline.
- No dark mode yet. All colours are tokens in `:root`, so it is a contained change.
- Simulated replies use canned text.

## Open decisions (TODO)

1. **Fees.** 5% client service fee plus 5% tasker platform fee are placeholders (`APP.fees`).
2. **Worker classification and tax handling** for frequent taskers, per market.
3. **Which regulated categories open first**, and what proof each needs before booking.
4. **Review publishing.** Reviews publish immediately. A double-blind window (publish when both
   sides have reviewed, or after 7 days) is fairer but needs the backend.
5. **Auto-confirmation.** How long a client has to confirm before completion is assumed.
6. **Business verification.** Which registry checks (Firmenbuch, UID) mark a business as verified.
7. **Name and brand.** "Local Tasks" is a placeholder.

## Recommended next steps

1. **Backend for the core loop:** auth, tasks, applications, assignments, messaging. Port
   `logic/` unchanged and keep the tests as server tests.
2. **Payments with a licensed provider:** escrow-style holds, payouts, receipts, and the dispute
   hold already modelled here.
3. **Moderation operations:** the console exists. Add staff accounts, SLAs, appeals and real
   proof checks.
4. **Pilot in one city** with the "open" categories only, and measure the brief's pilot metrics
   (time to first application, completion rate, newcomer visibility, reports per 100 tasks).

## Deploying

Any static host works, because routing uses the URL hash and needs no rewrite rules.
The quickest options:

- **Netlify Drop:** drag this folder onto app.netlify.com/drop.
- **Netlify from git:** publish directory = this folder, no build command.

`tests/` and `package.json` would be published too. They are harmless, but you can leave them
out. The page is marked `noindex`, so search engines skip it while it is a prototype.
