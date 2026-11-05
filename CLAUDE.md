# CLAUDE.md — One Piece collection tracker

Personal hobby project.

## How to work here

- Reply to the user in Italian, in plain short sentences. Explain a technical term the first time it appears (the user is learning). Code, identifiers, **code comments** (JS, CSS, HTML, tests, scripts), **test names** (the title string of each `test('...')`), commit messages and PR text: English (user's rule, 2026-11-05: all code is English, new and old). Only the **UI strings** shown to the user stay Italian; a comment that quotes a UI string keeps the Italian label in quotes.
- Smallest correct change, reuse what is there, no new dependency or build step unasked (the app is deliberately a single static page). `ponytail:` comments in the code mark known shortcuts; keep that style.
- **Every feature must be designed for both PC and mobile** (user's rule, 2026-11-05): the user uses the app on both. Layout, touch targets and navigation must work at phone width and on desktop; the existing UI already has a responsive nav (bottom bar on phone), follow it.
- Never commit, push or open a PR unless asked. Discuss an idea before editing; say whether a change is in or out of scope.
- Never print or commit secrets or tokens. The Firebase web config in `index.html` is public by design (access is limited by Firestore rules), leave it as is.
- Keep each file's line endings: `index.html`, `.gitignore` and `scripts/build-catalog.mjs` are LF in the index and CRLF in the working copy (`core.autocrlf=true`); newer files (`logic.js`, `tests/`, `CLAUDE.md`) are LF in both, and a new file is written as LF. Never bulk-convert line endings; check with `git ls-files --eol`.

## What it is

A static web app to track a One Piece TCG (trading card game) collection: checklist per set, wishlist, statistics, card detail dialog with images and variants (parallel, alternate art, promo). UI in Italian. Hosted on GitHub Pages from `main`: https://misterweeman.github.io/one-piece-collection-tracker/ — **pushing to `main` deploys**, so test before pushing.

## Files

- `index.html` (~1900 lines): the app — CSS, markup and two scripts (plus the `logic.js` tag). No framework, no bundler, `var` and ES5-style functions in the main IIFE.
  - Main script: state, rendering, `localStorage` persistence (`op-collection-cards`, `op-collection-meta`), filters, detail dialog. For the pure logic it only keeps thin wrappers (`var L = window.OPLogic`) that pass `state`/`meta`/`Date.now()` to `logic.js`.
  - `<script type="module">` at the end: Firebase (Google login + Firestore sync) loaded from the gstatic CDN, exposed to the main script through `window.fbInit`. One Firestore document per user (`users/<uid>/data/collection`) holding the whole snapshot as a JSON string; ~1 MiB limit.
  - Meta data for sync: `deleted` tombstones (without them a deletion is undone by merging with another device) and `history` per day.
  - `SET_RELEASE_ORDER`: manual list of set prefixes, newest first. **Add the new set code here when a set is released** (last commit did that for EB05).
- `logic.js`: pure logic, no DOM/`localStorage`/Firestore, ES5 with `var`, English comments. Loaded by `index.html` with a classic `<script src="logic.js">` (exposes `window.OPLogic`) and by the tests with `require('../logic.js')` (CommonJS: no `package.json` needed). Functions take data and `now` as parameters. New pure logic goes here, not inline in `index.html`. Not in it: filters, sorting, rendering, `SET_RELEASE_ORDER`. Caching risk: GitHub Pages caches files ~10 minutes, so right after a deploy that changes `logic.js` a browser may briefly mix a new `index.html` with an old `logic.js` (app broken until it refreshes); no `?v=` on the tag on purpose.
- `tests/*.test.js`: `node --test` suites (`cards`, `merge`, `decks`) using Node's built-in runner, no dependency. The old `scripts/check-deck-parser.mjs` was replaced by `tests/decks.test.js`.
- `card-catalog.json` (~570 KB, one line): generated, do not hand-edit. Per card code: structured data and the list of versions with the TCGplayer product id used for images. Loaded by the app with `fetch`; if missing the detail dialog still works without images.
- `scripts/build-catalog.mjs`: regenerates the catalog from https://tcgcsv.com (daily mirror of the TCGplayer API). Run with `node scripts/build-catalog.mjs` (Node 18+) when a new set comes out, then commit `card-catalog.json` together with `index.html`. It sets a descriptive User-Agent (the service rejects Node's default with 401) and waits between requests: keep both. Card effect text is deliberately not copied.
- `.gitignore` ignores `.claude/` (local Claude Code settings).

## Run and test

- No build. The catalog `fetch` does not work from `file://`, so the detail dialog images need a web server; propose one only if a change touches that. Do not set up a local server unasked.
- **Test strategy (user's decision, 2026-11-05; implemented):** automated tests on the pure logic with Node's built-in runner (`node --test`), no dependency, no npm package. Pure logic = code that decides what is stored or computed without touching the screen: sync merge with `deleted` tombstones, deck import parsing, missing-cards calculation.
  - That logic lives in `logic.js`, loaded by `index.html` with a `<script>` tag (still no build); tests live in `tests/`. This is the one accepted exception to "the whole app is `index.html`".
  - New or changed logic of that kind ships with a test in the same change. Run `node --test` before saying a change is done and before any push (a push deploys).
  - **Tests never touch real data:** in-memory objects and made-up cards only, no `localStorage`, no Firestore, never the user's collection.
  - The UI is not covered by tests. After a UI change describe what to check by hand (desktop and phone width, checklist, wishlist, detail dialog). Google login and sync need a real browser session with the user's account: ask the user to test them.
  - Not chosen: browser automation (Playwright), because it adds dependencies and maintenance. Reconsider only when the UI is stable, and discuss it first.
- Data safety: `localStorage` and Firestore hold the user's real collection and decks. Never change the stored format without discussing a migration first: `op-collection-cards` entries, `op-collection-meta` and `op-collection-decks` in `localStorage`; the `collection` and `decks` documents in Firestore.

## Git workflow

- Remote `origin`: https://github.com/MisterWeeMan/one-piece-collection-tracker (private). Default branch `main`.
- **Only `main`; never create branches, and no PRs** (user's rule, 2026-11-05; the user is the only user of the app). Commit and push directly on `main`, only when asked. Short English commit subjects in the imperative ("Add EB05 to release-order table"). A push to `main` deploys the site, so say so before pushing. Old feature branches were deleted; do not recreate them.
- **Two GitHub accounts are logged in on this PC.** This repo must use the personal one: `gh auth status` must show `MisterWeeMan` as active before any push (`gh auth switch --user MisterWeeMan`). The work account `UMattiaBano` belongs to ExSVN; never push this repo with it. Local git identity is set in this repo only (`MisterWeeMan`, personal email); do not change global git config.
- The repo uses HTTPS with `gh` as credential helper (set in the local `.git/config`).

## Google login and Firestore rules

- The app shows only a login screen until a valid Google sign-in exists. Only the user's own account may enter, and that is enforced by the Firestore rules, never by code: do not write an email or an allow-list in the page.
- A device remembers one successful sync in the `localStorage` key `op-auth-ok` so the app opens offline; logout or a denied login clears it.
- Login and sync have only been tested with a fake Firebase API. Ask the user to test the real Google popup (especially on mobile) and any change to the rules.
- The rules live only in the Firebase console, not in the repo (confirmed by the user, 2026-11-05). Last version the user pasted: one rule, `match /users/{uid}/{document=**}` with `allow read, write: if request.auth != null && request.auth.uid == uid`, so no validation of fields or size. If a task needs other rules, or they may have changed, ask the user; never assume.
