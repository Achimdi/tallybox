# Tallybox

Online inventory and sales for small shops, pharmacies and restaurants. A website opened from a link: no app store, no installs. React + TypeScript in `web/`, Supabase in `supabase/`, hosted free on Cloudflare Pages.

- **The full brief:** [docs/Tallybox-Master-Build-Prompt.md](docs/Tallybox-Master-Build-Prompt.md)
- **Working rules for Claude Code:** [CLAUDE.md](CLAUDE.md)
- **Free-plan limits and upgrade triggers:** [docs/free-plan-limits.md](docs/free-plan-limits.md)
- **Billing seams:** [docs/billing-plan.md](docs/billing-plan.md)

**Status:** Phase 0 (Foundation) built. No business features yet.

## Run it

You need Node.js 22.12 or newer (24 LTS recommended) and Git. Everything else installs with the project.

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

In development the welcome page has a dashed "Development preview" box. Use it to look at each role's layout and to open the design gallery at `/dev/gallery`. It is not part of the live app.

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
| `npm run db:test`      | Database tests (needs Docker, so normally CI runs them)          |
| `npm run db:push`      | Apply new migrations to the linked Supabase project              |
| `npm run db:types`     | Regenerate TypeScript types from the database                    |

First time running end-to-end tests: `npx -w web playwright install chromium`.

## What is where

```
web/                 The React app
  src/app/           Router, route guards, layouts, providers
  src/components/    Shared UI (buttons, fields, cards, dialogs...)
  src/features/      One folder per feature (auth, items, orders...)
  src/lib/           Supabase client, money, dates, errors, logging
  src/styles/        Design tokens (tokens.css) and base styles
  public/brand/      Placeholder logo and icons
  public/_headers    Security headers for Cloudflare Pages
  e2e/               End-to-end tests
supabase/
  migrations/        Every database change, as versioned SQL
  tests/             Database tests (pgTAP)
  functions/         Edge Functions (from Phase 1)
  scripts/           One-time scripts (super-admin setup, Phase 1)
docs/                The brief and supporting notes
.github/workflows/   CI
```

## One-time setup (your accounts)

Do these when you are ready. **Never paste a password, token or key into a chat.** Keys go in `.env.local` (gitignored) or in the platform's own settings.

### 1. GitHub

1. Create a new **private** repo named `tallybox` at github.com/new. Do not add a README or .gitignore (the project has them).
2. Connect and push:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/tallybox.git
   git push -u origin main
   ```
3. Open the repo's **Actions** tab and check the three CI jobs go green. The database job is the first real run of the database tests.

### 2. Supabase (needed from Phase 1)

1. Sign up at supabase.com and create two projects: `tallybox-dev` and `tallybox-prod`. Save each database password in a password manager.
2. Copy `.env.example` to `.env.local` in the repo root. From the **dev** project's settings, fill in the project URL and the **publishable** key (`sb_publishable_...`). Never the secret key.
3. Link the CLI to the dev project and apply the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-DEV-PROJECT-REF
   npm run db:push
   ```

### 3. Cloudflare Pages (the first deploy)

1. Sign up at dash.cloudflare.com. Go to **Workers & Pages > Create > Pages > Connect to Git** and pick the `tallybox` repo.
2. Build settings:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `web/dist`
   - Root directory: leave empty
3. Environment variables (Settings > Environment variables), for **Production** and **Preview**:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (production uses the prod project, preview uses the dev project). These can wait until Phase 1.
4. Deploy. The app is then live at `https://YOUR-PROJECT.pages.dev`. Every push to `main` deploys to production, and every pull request gets its own preview URL.

Deploys use Cloudflare's own GitHub connection, so no deploy secrets are stored in GitHub. The Node version comes from `.node-version`.

### 4. VS Code

Open the folder and accept the "install recommended extensions" prompt (ESLint, Prettier, Tailwind CSS IntelliSense, Error Lens, GitLens). Files format on save.

## How updates reach people

Tallybox is an installable web app. Its service worker caches only the app shell (never business data), so a new deploy has to replace that cached copy:

- The app re-checks for a new version on start, when the tab regains focus, when the network returns, and every 30 minutes.
- **Normal update:** a "New version available" card appears. Tapping **Refresh** switches versions.
- **Forced update:** raise `tallybox.minSupportedVersion` in `web/package.json`. Any copy older than that updates by itself the next time it checks.

To release: bump `version` in `web/package.json` (and the root `package.json`), commit, and push to `main`.

**Test it after the first deploy** (do this once per release process change):

1. Open the live site in a phone browser and install it to the home screen. Leave it open.
2. Bump the version, push, and wait for Cloudflare to finish deploying.
3. Switch away from the app and back. Within a few seconds the "New version available" card should appear. Tap Refresh and check the version in the footer.

## Troubleshooting

**Pages have no styling, or the build stops with "Tailwind found no class names".**
Windows Smart App Control can block a freshly released copy of Tailwind's scanner (a small native program) until Windows has seen it enough to trust it. Tailwind then cannot read the source files. This happened with Tailwind 4.3.5 during Phase 0, which is why Tailwind is pinned to an exact version in `web/package.json`. If it happens after an upgrade, go back to the previous Tailwind version and try the new one again in a week or two. Do not turn Smart App Control off for this.

**`npm install` is slow or stalls on `supabase`.**
The Supabase CLI downloads its program during install. On a slow connection it can take several minutes. Let it finish.

**Tests fail with "Invalid Chai property".**
Already handled in `web/src/test/setup.ts`. If it returns, the cause is two copies of Vitest being loaded, usually from a lower-case drive letter in the terminal path on Windows.

## Security notes

- The browser only ever gets the Supabase URL and **publishable** key. Data is protected by Row Level Security and server functions, not by hiding keys. `web/src/lib/env.ts` refuses to start the client if a secret key is put in its place.
- The browser never writes to tables. Changes go through Postgres functions or Edge Functions.
- `supabase/migrations/20261111000000_baseline_hardening.sql` closes new tables and functions to the browser by default.
- Security headers, including a Content Security Policy, are in `web/public/_headers`.
- Logs are structured and personal data is removed before writing (`web/src/lib/logger.ts`).
