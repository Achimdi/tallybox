# Tallybox

Online inventory and sales for small shops, pharmacies and restaurants. A website opened from a link: no app store, no installs, and it can be added to a phone's home screen.

- Staff take orders on their phones. An order is confirmed only after "Payment received" is ticked, and stock goes down automatically. Orders can be held while a transfer arrives.
- Owners see the day's sales, manage items, shared supplies (bottles, caps…), deliveries and stock counts, void orders, run reports over any range and export CSV.
- Receipts as a picture or PDF, shared or printed from the browser.
- Each business is separate. Businesses register with a single-use activation code, and a hidden developer area manages businesses and access periods.

React + TypeScript in `web/`, Supabase (Postgres, sign-in, Edge Functions) in `supabase/`, hosted on Cloudflare.

## Run it

You need Node.js 22.12 or newer (24 LTS recommended) and Git.

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

Without any settings the app runs on **demo data kept in your browser**, and a yellow banner says so on every screen. The login pages list demo accounts (password `demo1234` for all); tap one to fill the form:

- **Developer** (`dev@demo.tallybox.test`): businesses, activation codes, suspend, extend access, reset links.
- **Owner** of Sunrise Pharmacy (`owner@demo.tallybox.test`).
- **Staff** at business code `sunrise-demo`: `ada` works, `chidi` is turned off.
- Owners of a **suspended** business and of one whose **access has ended**.

Open a second tab to be two people at once (each tab has its own sign-in; both share the demo data). **Reset demo data** on the welcome page puts everything back.

To run against a Supabase project instead, copy `.env.example` to `.env.local` and fill it in (public values only; it explains each one).

## Commands

Run these from the repo root.

| Command                  | What it does                                                     |
| ------------------------ | ---------------------------------------------------------------- |
| `npm run dev`            | Start the app with live reload                                   |
| `npm run check`          | Everything CI checks: format, lint, typecheck, unit tests, build |
| `npm run test`           | Unit and component tests                                         |
| `npm run test:e2e`       | End-to-end tests against the production build (demo data)        |
| `npm run build`          | Production build into `web/dist`                                 |
| `npm run preview`        | Serve the production build locally                               |
| `npm run format`         | Format every file                                                |
| `npm run db:test:local`  | Database tests (pgTAP) in an in-memory Postgres, no Docker       |
| `npm run functions:test` | Edge Function tests (Deno)                                       |
| `npm run icons -w web`   | Regenerate PNG icons after changing `web/public/brand/icon.svg`  |

First time running end-to-end tests: `npx -w web playwright install chromium`.

## What is where

```
web/                 The React app
  src/app/           Router, route guards, layouts, providers
  src/api/           TallyboxApi: the one data interface (demo and Supabase versions)
  src/domain/        Business rules as pure functions, shared by both versions
  src/components/    Shared UI (buttons, fields, cards, dialogs...)
  src/features/      One folder per feature (auth, items, orders...)
  src/lib/           Money, dates, errors, logging
  src/styles/        Design tokens (tokens.css) and base styles
  public/_headers    Security and caching headers
  e2e/               End-to-end tests
supabase/            Migrations, Edge Functions, database and function tests
.github/workflows/   CI
```

## Deploying

Cloudflare Pages builds the repository on every push to `main` (build command `npm run build`, output folder `web/dist`) and serves the result as static files at https://tallybox.pages.dev. Any address that isn't a file gets `index.html`, and the app's router takes over. The app's settings are Production environment variables in the Pages project (`VITE_DATA_SOURCE`, `VITE_RELEASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`; all public). Changing them takes effect on the next build. A build with `VITE_RELEASE=client` refuses to start on demo data.

Database changes ship as versioned migrations in `supabase/migrations`, applied to a development project first and to production after a check.

## How updates reach people

Tallybox is an installable web app. Its service worker caches only the app shell (never business data), so a new deploy has to replace that cached copy:

- The app re-checks for a new version on start, when the tab regains focus, when the network returns, and every 30 minutes.
- **Normal update:** a "New version available" card appears. Tapping **Refresh** switches versions.
- **Forced update:** raise `tallybox.minSupportedVersion` in `web/package.json`. Any copy older than that updates by itself the next time it checks.

To release: bump `version` in `web/package.json` (and the root `package.json`), commit, and push to `main`.

## Troubleshooting

**Pages have no styling, or the build stops with "Tailwind found no class names".**
Windows Smart App Control can block a freshly released copy of Tailwind's scanner (a small native program) until Windows trusts it. Tailwind then cannot read the source files, which is why Tailwind is pinned to an exact version in `web/package.json`. If it happens after an upgrade, go back to the previous version and try the new one again in a week or two. Don't turn Smart App Control off for this.

**Tests fail with "Invalid Chai property".**
Already handled in `web/src/test/setup.ts`. If it returns, the cause is two copies of Vitest being loaded, usually from a lower-case drive letter in the terminal path on Windows.

## Security

- The browser only ever gets the Supabase URL and **publishable** key. Data is protected by Row Level Security and server functions, not by hiding keys. `web/src/lib/env.ts` refuses to start if a secret key is put in its place.
- The browser never writes to tables: every change goes through a database function or an Edge Function that checks who is asking.
- Sign-in and registration are protected by Cloudflare Turnstile, checked on the server.
- Security headers, including a Content Security Policy, are in `web/public/_headers`.
- Logs are structured and personal data is removed before writing (`web/src/lib/logger.ts`).
