# Tallybox

Online inventory and sales for small shops, pharmacies and restaurants. A website opened from a link: no app store, no installs. React + TypeScript in `web/`, Supabase in `supabase/`, hosted free on Cloudflare Pages.

- **The full brief:** [docs/Tallybox-Master-Build-Prompt.md](docs/Tallybox-Master-Build-Prompt.md)
- **Working rules for Claude Code:** [CLAUDE.md](CLAUDE.md)
- **Free-plan limits and upgrade triggers:** [docs/free-plan-limits.md](docs/free-plan-limits.md)
- **Billing seams:** [docs/billing-plan.md](docs/billing-plan.md)

**Status:** Phase 1 (Auth and onboarding) built: registration with activation codes, owner and staff sign-in, staff creation, suspension, and a minimal super-admin area. Items, orders and reports come next.

## Run it

You need Node.js 22.12 or newer (24 LTS recommended) and Git. Everything else installs with the project.

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

Until `.env.local` points at a Supabase project, the welcome page shows a dashed "Development preview" box. Use it to look at each role's layout and to open the design gallery at `/dev/gallery`. It disappears once Supabase is configured, and it is never part of the live app.

## Commands

Run all of these from the repo root.

| Command                   | What it does                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Start the app with live reload                                   |
| `npm run check`           | Everything CI checks: format, lint, typecheck, unit tests, build |
| `npm run test`            | Unit and component tests                                         |
| `npm run test:e2e`        | End-to-end tests against the real production build               |
| `npm run build`           | Production build into `web/dist`                                 |
| `npm run preview`         | Serve the production build locally                               |
| `npm run format`          | Format every file                                                |
| `npm run icons -w web`    | Regenerate PNG icons after changing `web/public/brand/icon.svg`  |
| `npm run db:test:local`   | Database tests in an in-memory Postgres (no Docker needed)       |
| `npm run db:test`         | Database tests on a real Supabase stack (needs Docker, so CI)    |
| `npm run functions:test`  | Edge Function tests (Deno, no network)                           |
| `npm run functions:check` | Type-check the Edge Functions                                    |
| `npm run db:push`         | Apply new migrations to the linked Supabase project              |
| `npm run db:types`        | Regenerate TypeScript types from the database                    |

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
  functions/         Edge Functions. _shared/ holds the common frame and rules
  scripts/           Super-admin setup, and the local database test runner
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
3. Open the repo's **Actions** tab and check the four CI jobs go green. The database job is the first run of the database tests against a real Supabase stack.

### 2. Supabase

Do this for `tallybox-dev` first. Repeat for `tallybox-prod` only when you are ready to go live.

1. Sign up at supabase.com and create two projects: `tallybox-dev` and `tallybox-prod`. Save each database password in a password manager.
2. Copy `.env.example` to `.env.local` in the repo root. From the **dev** project's settings, fill in the project URL and the **publishable** key (`sb_publishable_...`). Never the secret key.
3. Link the CLI to the dev project, then apply the migrations and deploy the Edge Functions:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-DEV-PROJECT-REF
   npm run db:push
   npx supabase functions deploy
   ```
   The secret key that Edge Functions use is provided by Supabase automatically. You never copy it anywhere.
4. Auth settings (dashboard > Authentication):
   - **Sign In / Providers > Email:** turn off "Allow new users to sign up" (accounts are only ever created by the Edge Functions) and turn off "Confirm email" (v1 sends no email).
   - **URL Configuration:** set the Site URL to your app address (`http://localhost:5173` while developing).
5. Make yourself the super-admin: dashboard > Authentication > Users > **Add user** with your own email, ticking "Auto Confirm User". Then open SQL Editor, paste [supabase/scripts/make-super-admin.sql](supabase/scripts/make-super-admin.sql), put your email in it, and run it once. Sign in on the **Owner login** page.

### 2b. Cloudflare Turnstile (bot check on the login and registration forms)

1. Cloudflare dashboard > **Turnstile > Add widget**. Hostnames: `localhost` and your `*.pages.dev` address. Mode: Managed.
2. Put the **site key** (public) in `.env.local` as `VITE_TURNSTILE_SITE_KEY`, and in Cloudflare Pages' environment variables.
3. Put the **secret key** in two places, never in a file in the repo:
   - Edge Functions: `npx supabase secrets set TURNSTILE_SECRET_KEY=...` (checks registration).
   - Supabase dashboard > Authentication > **Attack Protection** > Enable CAPTCHA protection, provider Turnstile (checks sign-in).
4. Tell the Edge Functions where the app lives, so other websites cannot call them:
   `npx supabase secrets set APP_ORIGINS=http://localhost:5173,https://YOUR-PROJECT.pages.dev,https://*.YOUR-PROJECT.pages.dev`

For local testing without a real widget, Cloudflare's test keys always pass: site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`. Never use them in production.

### Test Phase 1 end to end (once, after steps 2 and 2b)

1. `npm run dev`, sign in as super-admin, open **Codes**, generate a code for a second email address you own.
2. Sign out, choose **Register your business**, and register with that email and code. You land on Owner login: sign in.
3. On the dashboard, **Create a staff account**. Sign out, then sign in on **Staff login** with the business code, username and password.
4. Sign in as super-admin in a second browser, suspend the business, then switch back to the staff tab: within a few seconds it shows the suspended screen. Reactivate, and staff can sign in again.
5. Try the activation code again: it is refused as already used.

### 3. Cloudflare Pages (the first deploy)

1. Sign up at dash.cloudflare.com. Go to **Workers & Pages > Create > Pages > Connect to Git** and pick the `tallybox` repo.
2. Build settings:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `web/dist`
   - Root directory: leave empty
3. Environment variables (Settings > Environment variables), for **Production** and **Preview**:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_TURNSTILE_SITE_KEY` (production uses the prod project, preview uses the dev project).
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
