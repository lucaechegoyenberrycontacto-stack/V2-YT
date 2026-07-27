# Personal Dashboard

A set of small, self-contained HTML apps that share a top bar.

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2FYTdashh1)

One click → Vercel signs you in, copies the repo to your GitHub, and deploys it. ~30 seconds to a live URL.

## How to use

Open any `.html` file directly in your browser — no build step, no install.

| File | What it is |
|---|---|
| [index.html](index.html) | Home status page (Day Ring, Goal Ticker, To Do list) |
| [apps.html](apps.html) | App launcher — bento grid linking to every page below |
| [main.html](main.html) | Goals & daily plan |
| [health.html](health.html) | Supplement / daily stack tracker |
| [po-water.html](po-water.html) | Water intake tracker |
| [finance.html](finance.html) | Finances — accounts, spending, net worth |
| [gym.html](gym.html) | Progressive overload gym tracker |
| [nutrition.html](nutrition.html) | Macro & meal tracker |
| [habits.html](habits.html) | Streak tracking (NoFap) & screen time |
| [login.html](login.html) | Sign-in page for pages that require auth |
| [template.html](template.html) | Starter template matching the shared visual system |
| [topbar.js](topbar.js) | Shared top bar — auto-injected into pages that `<script src="topbar.js">` |

State is synced live to a shared Supabase (Postgres) backend, not `localStorage`. Two mechanisms currently coexist: the legacy `sync.js` + `app_state` table (older pages, being phased out), and the newer `dataLayer.js` + `records` table, which requires signing in via [login.html](login.html). Pages are migrated one at a time, so which mechanism a given page uses depends on when it was last touched.

## Building from scratch

[BUILD_DASHBOARD.md](BUILD_DASHBOARD.md) is the prompt I gave Claude to generate `main.html` (Goal Ticker, Day Ring, To Do List) — paste it into Claude if you want to rebuild that page yourself.
