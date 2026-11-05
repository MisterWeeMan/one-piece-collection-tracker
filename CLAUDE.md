# CLAUDE.md — One Piece collection tracker

Personal hobby project (not related to work or the ExSVN repo). Facts marked **TO VERIFY** are unconfirmed; ask the user instead of assuming.

## How to work here

- Reply to the user in Italian, in plain short sentences. Explain a technical term the first time it appears (the user is learning). Code, identifiers, commit messages and PR text: English. **UI strings and code comments in the existing files are Italian**: match the surrounding file, do not translate or mix within a block.
- Smallest correct change, reuse what is there, no new dependency or build step unasked (the app is deliberately a single static page). `ponytail:` comments in the code mark known shortcuts; keep that style.
- **Every feature must be designed for both PC and mobile** (user's rule, 2026-11-05): the user uses the app on both. Layout, touch targets and navigation must work at phone width and on desktop; the existing UI already has a responsive nav (bottom bar on phone), follow it.
- Never commit, push or open a PR unless asked. Discuss an idea before editing; say whether a change is in or out of scope.
- Never print or commit secrets or tokens. The Firebase web config in `index.html` is public by design (access is limited by Firestore rules), leave it as is.
- Keep each file's line endings: the index stores LF, the working copy is CRLF because `core.autocrlf=true`. Never bulk-convert line endings; check with `git ls-files --eol`.

## What it is

A static web app to track a One Piece TCG (trading card game) collection: checklist per set, wishlist, statistics, card detail dialog with images and variants (parallel, alternate art, promo). UI in Italian. Hosted on GitHub Pages from `main`: https://misterweeman.github.io/one-piece-collection-tracker/ — **pushing to `main` deploys**, so test before merging.

## Files

- `index.html` (~1800 lines): the whole app — CSS, markup and two scripts. No framework, no bundler, `var` and ES5-style functions in the main IIFE.
  - Main script: state, rendering, `localStorage` persistence (`op-collection-cards`, `op-collection-meta`), sync merge logic, filters, detail dialog.
  - `<script type="module">` at the end: Firebase (Google login + Firestore sync) loaded from the gstatic CDN, exposed to the main script through `window.fbInit`. One Firestore document per user (`users/<uid>/data/collection`) holding the whole snapshot as a JSON string; ~1 MiB limit.
  - Meta data for sync: `deleted` tombstones (without them a deletion is undone by merging with another device) and `history` per day.
  - `SET_RELEASE_ORDER`: manual list of set prefixes, newest first. **Add the new set code here when a set is released** (last commit did that for EB05).
- `card-catalog.json` (~570 KB, one line): generated, do not hand-edit. Per card code: structured data and the list of versions with the TCGplayer product id used for images. Loaded by the app with `fetch`; if missing the detail dialog still works without images.
- `scripts/build-catalog.mjs`: regenerates the catalog from https://tcgcsv.com (daily mirror of the TCGplayer API). Run with `node scripts/build-catalog.mjs` (Node 18+) when a new set comes out, then commit `card-catalog.json` together with `index.html`. It sets a descriptive User-Agent (the service rejects Node's default with 401) and waits between requests: keep both. Card effect text is deliberately not copied.
- `.gitignore` ignores `.claude/` (local Claude Code settings).

## Run and test

- No build. The user's current way of testing (keep it for now): insert sets through the app's own internal data management, then check the result in the UI. Do not set up a local server or scripts unasked. Note: the catalog `fetch` does not work from `file://`, so the detail dialog images need a web server; propose one only if a change touches that.
- No automated tests. After a UI change describe what to check by hand (desktop and phone width, checklist, wishlist, detail dialog). Google login and sync need a real browser session with the user's account: ask the user to test them.
- Data safety: `localStorage` and Firestore hold the user's real collection. Never change the stored format (`op-collection-cards` entries, meta) without discussing a migration first.

## Git workflow

- Remote `origin`: https://github.com/MisterWeeMan/one-piece-collection-tracker (private). Default branch `main`.
- **Only `main`; never create branches, and no PRs** (user's rule, 2026-11-05; the user is the only user of the app). Commit and push directly on `main`, only when asked. Short English commit subjects in the imperative ("Add EB05 to release-order table"). A push to `main` deploys the site, so say so before pushing. Old feature branches were deleted; do not recreate them.
- **Two GitHub accounts are logged in on this PC.** This repo must use the personal one: `gh auth status` must show `MisterWeeMan` as active before any push (`gh auth switch --user MisterWeeMan`). The work account `UMattiaBano` belongs to ExSVN; never push this repo with it. Local git identity is set in this repo only (`MisterWeeMan`, personal email); do not change global git config.
- The repo uses HTTPS with `gh` as credential helper (set in the local `.git/config`).

## Decks feature (design agreed 2026-11-05, not implemented yet)

New "Mazzi" view: the user imports decks and the app shows which cards are missing to complete each one. No in-app deck building.
- Import formats, auto-detected from one text field: (1) onepiecetopdecks JSON array `["Exported from ...","EB05-010",...]` (header, then one code per copy, leader first); (2) `NxCODE` lines (OPTCGSim); (3) oplaytcg share code (`d=` in `oplaytcg.com/deck-builder?d=...`), version "2": `"2"` + base64url-like chars (alphabet `A-Za-z0-9-_`, 6 bits each) + 1 checksum char; bit-packed leader and cards sorted by code. Format reverse-engineered from the site's public JS and verified on 3 decks (1 leader + 50 cards, all codes in the catalog); it is not an official API and may change. Version "1" exists but is untested, left out. Validate every code against `card-catalog.json`.
- Missing = max(0, copies needed − copies owned), per deck on its own (copies are not shared between decks). Computed live, never stored. A code whose set is not in the collection counts as not owned, with a note "set non nella collezione".
- Store per deck only: name (default = leader code, editable), leader, `code -> qty`, dates. UI: list sorted by completeness, import dialog with preview, detail showing missing cards first with their catalog images. No "add missing to wishlist" button for now. Must work on PC and mobile (new 5th nav item).
- Sync: separate Firestore document, e.g. `users/<uid>/data/decks` (not inside the collection document, to avoid an old page overwriting decks). Allowed by the current rules (see below).

## Mandatory Google login (agreed and live since 2026-11-05)

The app shows only a login screen until a valid Google sign-in exists. Only the user's own account (mattia21bano@gmail.com) may enter; this is enforced by the Firestore rules (a wrong account gets `permission-denied` on the first sync, then the page shows a generic "Accesso non riuscito" message and signs out), never by an email written in the page. After one successful sync a device remembers it (`localStorage` key `op-auth-ok`) so the app opens offline; logout or denial clears it. Logout still removes local data after a final sync. Tested only with a fake Firebase API in a local browser: the real Google popup (especially on mobile) and the rules change must be checked by the user.

## Firestore rules (as pasted by the user, 2026-11-05)

Rules live in the Firebase console, not in this repo. Current content: one rule, `match /users/{uid}/{document=**}` with `allow read, write: if request.auth != null && request.auth.uid == uid`. So any path under `users/<own uid>/` is allowed, with no validation of fields or size. If the console rules may have changed since, or a task needs more than this, ask the user; never assume.

## Open questions

1. Where exactly is the in-app data management used for test sets? **TO VERIFY** with the user. (Firestore sync has always been tried directly in production, never with test data; ignore for now.)
2. Is there a Firestore rules file or a Firebase project to keep in sync with the repo? Nothing is versioned here today.
