# Tallybox

Online inventory and sales for small shops, pharmacies and restaurants. A website opened from a link: no app store, no installs. React + TypeScript in `web/`, hosted free on Cloudflare Pages. Supabase (database, sign-in, server functions) is connected in Phase 2.

- **The full brief:** [docs/Tallybox-Master-Build-Prompt.md](docs/Tallybox-Master-Build-Prompt.md)
- **Every screen and flow:** [docs/ux-map.md](docs/ux-map.md)
- **Working rules for Claude Code:** [CLAUDE.md](CLAUDE.md)
- **Free-plan limits and upgrade triggers:** [docs/free-plan-limits.md](docs/free-plan-limits.md)
- **Access periods and billing seams:** [docs/billing-plan.md](docs/billing-plan.md)

## Status and plan

| Phase                               | What                                                                                                                      | Status                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 0. Foundation                       | App shell, design system, PWA, tests, CI                                                                                  | Done                                                    |
| 1. Complete UI on a mock data layer | Every screen, clickable end to end, with demo data kept in the browser. No backend, no accounts, no keys. Steps 1A to 1D. | 1A built (sign-in, developer portal), awaiting approval |
| 2. Connect Supabase                 | Database, sign-in and server functions replace the mock, feature by feature                                               | Not started                                             |
| 3. Polish and release               | Branding, audit, backups or upgrade, domain, email, production deploy                                                     | Not started                                             |
| 4. Later                            | Thermal printing, billing, branches, barcode scanning and more                                                            | Not started                                             |

Backend code written early (database migrations, Edge Functions, 198 database tests) is parked on the `backend-draft` branch for Phase 2.

## Run it

You need Node.js 22.12 or newer (24 LTS recommended) and Git. Everything else installs with the project.

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

Nothing else is needed in Phase 1: no accounts, no keys, no database. The app runs on **demo data kept in your browser**, and a yellow banner says so on every screen.

**Try it:** the login pages list demo accounts (password `demo1234` for all). Tap one to fill the form.

- **Developer** (`dev@demo.tallybox.test`): businesses, activation codes, suspend, extend access, reset links.
- **Owner** of Sunrise Pharmacy (`owner@demo.tallybox.test`), whose access ends in 5 days.
- **Staff** at business code `sunrise-demo`: `ada` works, `chidi` is turned off.
- Owners of a **suspended** business and of one whose **access has ended**.

To try the whole activation flow: sign in as the developer, generate a code, sign out, register a business with that code and email, then sign in as its owner. Open a second tab to be two people at once (each tab has its own sign-in, and both share the demo data). **Reset demo data** on the welcome page puts everything back.

## Commands

Run all of these from the repo root.

| Command                | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Start the app with live reload                                   |
| `npm run check`        | Everything CI checks: format, lint, typecheck, unit tests, build |
| `npm run test`         | Unit and component tests                                         |
| `npm run test:e2e`     | End-to-end tests against the real production build               |
| `npm run build`        | Production build into `web/dist`                                 |
| `npm run preview`      | Serve the production build locally                               |
| `npm run format`       | Format every file                                                |
| `npm run icons -w web` | Regenerate PNG icons after changing `web/public/brand/icon.svg`  |

First time running end-to-end tests: `npx -w web playwright install chromium`.

## What is where

```
web/                 The React app
  src/app/           Router, route guards, layouts, providers
  src/api/           TallyboxApi: the one data interface (mock now, Supabase in Phase 2)
  src/domain/        Business rules as pure functions, shared by both implementations
  src/components/    Shared UI (buttons, fields, cards, dialogs...)
  src/features/      One folder per feature (auth, items, orders...)
  src/lib/           Money, dates, errors, logging
  src/styles/        Design tokens (tokens.css) and base styles
  public/brand/      Placeholder logo and icons
  public/_headers    Security headers for Cloudflare Pages
  e2e/               End-to-end tests
docs/                The brief, the UX map and supporting notes
.github/workflows/   CI
```

## Accounts

Phase 1 needs none. They are set up only when needed, one step at a time, and you never paste a password, token or key into a chat:

- **GitHub** (already set up) for the code and CI. Push, then check the two CI jobs go green in the repo's **Actions** tab.
- **Cloudflare Pages**, optional in Phase 1, to share a clearly labelled DEMO link (steps below).
- **Supabase and Cloudflare Turnstile**, only from Phase 2. Those steps are in the README on the `backend-draft` branch and will come back here in Phase 2.

### Cloudflare Pages (optional demo link)

1. Sign up at dash.cloudflare.com. Go to **Workers & Pages > Create > Pages > Connect to Git** and pick the `tallybox` repo.
2. Build settings:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `web/dist`
   - Root directory: leave empty
3. Deploy. The demo is then at `https://YOUR-PROJECT.pages.dev`. Every push to `main` updates it, and every pull request gets its own preview URL.

Demo data lives only in the browser it was created in, so a demo link is for showing the product, never for real clients. Production builds for real clients refuse to start in demo mode.

Deploys use Cloudflare's own GitHub connection, so no deploy secrets are stored in GitHub. The Node version comes from `.node-version`.

### VS Code

Open the folder and accept the "install recommended extensions" prompt (ESLint, Prettier, Tailwind CSS IntelliSense, Error Lens, GitLens). Files format on save.

## How updates reach people

Tallybox is an installable web app. Its service worker caches only the app shell (never business data), so a new deploy has to replace that cached copy:

- The app re-checks for a new version on start, when the tab regains focus, when the network returns, and every 30 minutes.
- **Normal update:** a "New version available" card appears. Tapping **Refresh** switches versions.
- **Forced update:** raise `tallybox.minSupportedVersion` in `web/package.json`. Any copy older than that updates by itself the next time it checks.

To release: bump `version` in `web/package.json` (and the root `package.json`), commit, and push to `main`.

**Test it after the first deploy:**

1. Open the live site in a phone browser and install it to the home screen. Leave it open.
2. Bump the version, push, and wait for Cloudflare to finish deploying.
3. Switch away from the app and back. Within a few seconds the "New version available" card should appear. Tap Refresh and check the version in the footer.

## Troubleshooting

**Pages have no styling, or the build stops with "Tailwind found no class names".**
Windows Smart App Control can block a freshly released copy of Tailwind's scanner (a small native program) until Windows has seen it enough to trust it. Tailwind then cannot read the source files. This happened with Tailwind 4.3.5 during Phase 0, which is why Tailwind is pinned to an exact version in `web/package.json`. If it happens after an upgrade, go back to the previous Tailwind version and try the new one again in a week or two. Do not turn Smart App Control off for this.

**Tests fail with "Invalid Chai property".**
Already handled in `web/src/test/setup.ts`. If it returns, the cause is two copies of Vitest being loaded, usually from a lower-case drive letter in the terminal path on Windows.

## Security notes

- Phase 1 has no server and holds no real data. Demo data stays in the browser.
- From Phase 2, the browser only ever gets the Supabase URL and **publishable** key. Data is protected by Row Level Security and server functions, not by hiding keys. `web/src/lib/env.ts` refuses to start the client if a secret key is put in its place.
- Security headers, including a Content Security Policy, are in `web/public/_headers`.
- Logs are structured and personal data is removed before writing (`web/src/lib/logger.ts`).
