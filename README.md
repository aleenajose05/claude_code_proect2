# StockLens AI

_Understand US stocks through simple, data-backed AI analysis._

StockLens AI is a Next.js app where you ask plain-English questions about US-listed common stocks, such as "Analyse NVIDIA stock" or "Compare it with Apple".

- Prices, 90-day history and news come from market-data providers.
- Every indicator, direction, target range and confidence level is calculated by deterministic TypeScript code.
- The AI (Google Gemini) only explains those verified results, and its answer is checked before it is shown.

> Not financial advice. Stock market investments involve risk. Market data may be delayed. Forecast ranges are estimates based on historical information and do not guarantee future performance.

---

## 1. Status: what is built, tested and verified

| Phase | Status |
|---|---|
| 1. Research, architecture, formulas | ✅ Approved, see [`docs/phase-1-proposal.md`](docs/phase-1-proposal.md) (Gemini replaced Groq, §A) |
| 2. Project setup | ✅ Built |
| 3. Financial data tools | ✅ Built and tested with mock data · ⚠ **not yet run against the live APIs** |
| 4. Calculation engine | ✅ Built and unit-tested against the approved worked examples |
| 5. Gemini two-phase workflow | ✅ Built and tested with a scripted fake model · ⚠ not yet run against live Gemini |
| 6. Chat interface | ✅ Built; checked in a real browser at 375 px and 1280 px using test-only data |
| 7. Redis, rate limits, logging, auth, debug dashboard | ✅ Built; auth flows tested against a running production build |
| 8. Testing and security | ✅ See §8 for exact results |
| 9. Vercel deployment | 📋 Step-by-step guide below · ⚠ not deployed by me |

**Important:** no code has been run against the real Finnhub, Tiingo, Alpha Vantage, Gemini or Upstash services yet; you chose to add the keys in Vercel yourself. Every provider response is validated at runtime, so a format mismatch shows a clear error rather than wrong data. Use [`docs/phase-3-verification.md`](docs/phase-3-verification.md) to verify after deploying.

---

## 2. How it works

```
Browser ──(question ≤500 chars + ticker context only)──► POST /api/chat  (maxDuration 60 s, 45 s internal budget)
   ▲                                                       │ 1. demo session + input validation (Zod)
   │  NDJSON stream: real progress steps, then 1 result    │ 2. per-user / global rate limits (Upstash)
   │                                                       │ 3. Phase A: Gemini + 4 tools (≤5 rounds) identifies the stocks
   │                                                       │    · ≤2 tickers enforced before any market-data call
   │                                                       │    · data tools only accept verified tickers
   │                                                       │ 4. server fetches quote + 90-day history + news in parallel
   │                                                       │    (Redis cache → primary provider → fallback)
   │                                                       │ 5. lib/analysis computes every number
   │                                                       │ 6. Phase B: Gemini (no tools) writes JSON → validated
   │                                                       │    → 1 retry → deterministic fallback
   └───────────────────────────────────────────────────────┘ 7. redacted log → Redis (last 20)
```

| Data | Primary | Fallback | Cache |
|---|---|---|---|
| Ticker lookup | Finnhub search + profile | — | 24 h |
| Quote | Finnhub | Alpha Vantage (optional) | 60 s |
| 90-day daily prices | Tiingo (adjusted) | Alpha Vantage (unadjusted, flagged) | 12 h |
| News | Finnhub (last 7 days) | — | 15 min |
| Sentiment | VADER, computed by the app (−1 to +1) | — | — |

---

## 3. Project structure

```text
app/
  page.tsx                      chat page (protected)
  demo/login/page.tsx           demo password page (also the public landing page)
  debug/page.tsx, debug/login/  protected debug dashboard and its login
  api/chat/route.ts             the chat endpoint (streaming)
  api/health, api/logs          debug data (debug login required)
  api/auth/{demo,debug}/{login,logout}
proxy.ts                        Next.js 16 "proxy" (formerly middleware): route protection
components/
  chat/  Chat, MessageBubble, AnswerCard
  stock/ StockSummary, PriceChart, NewsSentiment, DirectionBadge
  debug/ DebugDashboard, HealthCard, LogTable, SystemOverview
  auth/  LoginForm
  ui/    shadcn/ui components
lib/
  analysis/   indicators, sentiment, confidence, build (all calculations)
  tools/      resolve_ticker, get_quote, get_price_history, get_news_sentiment + schemas
  providers/  Finnhub, Tiingo, Alpha Vantage clients
  llm/        Gemini client, system prompt, explanation schema
  guard/      output validation and deterministic fallback
  chat/       orchestrator, trace, types, browser-session context
  market/     NYSE calendar, market status, quote freshness
  store/      Redis client, cache, request log, redaction
  auth.ts, ratelimit.ts, health.ts, env.ts, errors.ts, format.ts
tests/        Vitest tests (mock data only), tests/live (opt-in real API check)
scripts/      check-client-bundle.mjs (secret scan)
docs/         Phase 1 proposal, live verification checklist
```

---

## 4. Environment variables

**Public vs private:** with no passwords set, the chat is public and the debug dashboard is off. To go private later, add `SESSION_SECRET` and `DEMO_PASSWORD` (and `DEBUG_PASSWORD` for `/debug`) in Vercel and redeploy; no code change is needed.

All of these are **server-side only**. Never add the `NEXT_PUBLIC_` prefix. `lib/env.ts` validates them and names any missing ones without showing their values.

| Variable | Required | What it is |
|---|---|---|
| `GEMINI_API_KEY` | yes | From https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | yes | e.g. `gemini-2.5-flash`; check the models available in AI Studio |
| `GEMINI_FALLBACK_MODEL` | no | e.g. `gemini-2.5-flash-lite`; used if the primary model fails with 404, 429 or 5xx |
| `FINNHUB_API_KEY` | yes | https://finnhub.io/register |
| `TIINGO_API_KEY` | yes | https://www.tiingo.com/account/api/token |
| `ALPHA_VANTAGE_API_KEY` | no | Fallback only: https://www.alphavantage.co/support/#api-key |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash console → your database → REST API → URL (`https://…`) |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Same page → token |
| `SESSION_SECRET` | only with a password | ≥32 random characters (`openssl rand -base64 48`). Required when `DEMO_PASSWORD` or `DEBUG_PASSWORD` is set |
| `DEMO_PASSWORD` | no | ≥12 characters. **Set it to make the chat private**; leave it unset for a public chat |
| `DEBUG_PASSWORD` | no | ≥12 characters, different from `DEMO_PASSWORD`. **Without it, `/debug`, `/api/health` and `/api/logs` are switched off (404)**, never left open |
| `DEMO_MODE` | no | Normally leave unset. `public` forces a public chat even if `DEMO_PASSWORD` is set |
| `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` / `GLOBAL_DAILY_CAP` | no | Defaults 10 / 50 / 40. **Set `GLOBAL_DAILY_CAP` to fit your Gemini free quota** (each analysis uses 2–4 Gemini calls) |

---

## 5. Run it on your computer (beginner guide)

1. Install **Node.js 22+** from https://nodejs.org. Check it with `node -v`.
2. Get the code and install the dependencies:
   ```bash
   git clone https://github.com/aleenajose05/claude_code_proect2.git
   cd claude_code_proect2
   npm install
   ```
3. Create your secrets file and fill in real values:
   ```bash
   cp .env.example .env.local
   ```
   `.env.local` is in `.gitignore`, so git never uploads it.
4. Start the app with `npm run dev` and open http://localhost:3000. You'll see the login page; use your `DEMO_PASSWORD`.
5. Optional: check the real APIs once with `npm run test:live` (uses a few requests of your quota).

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm run build` / `npm run start` | Production build / run it |
| `npm test` | All automated tests (mock data only) |
| `npm run test:live` | Opt-in real API check using `.env.local` |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run check:secrets` | Scan the built browser bundle for secret values (run after `npm run build`) |

---

## 6. Deploy to Vercel (step by step)

1. **Put the code on GitHub.** It's already in `aleenajose05/claude_code_proect2`. To deploy the latest work, merge branch `claude/jolly-dijkstra-0mt5td` into `main` (GitHub → Pull requests → New → base `main`, compare `claude/jolly-dijkstra-0mt5td` → Create → Merge).
2. **Create the Redis database (free).** Sign in at https://console.upstash.com → **Create Database** → Redis → pick a region near your Vercel region (e.g. `us-east-1`) → Free plan. Open the database and copy the **REST URL** and **REST token**.
   - If you use Vercel's Marketplace "Upstash for Redis" integration instead, it adds its own variables. Check their names in Vercel → Settings → Environment Variables and copy the values into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. **Import the project.** At https://vercel.com/new → **Import Git Repository** → choose the repo. Vercel detects Next.js automatically; leave the build settings at their defaults.
4. **Add the environment variables.** Before clicking Deploy, open **Environment Variables** and add every variable from §4 (Settings → Environment Variables later).
   - Tick **Production**.
   - For **Preview** deployments, add *different* `SESSION_SECRET`, `DEBUG_PASSWORD` and `DEMO_PASSWORD` values, so a preview link can't open production sessions.
   - Generate `SESSION_SECRET` with `openssl rand -base64 48` (or any password manager's 48-character generator).
5. **Function duration.** Nothing to configure: `app/api/chat/route.ts` sets `maxDuration = 60`, and the app stops its own work at 45 s. Vercel Hobby allows up to 300 s with Fluid compute (on by default for new projects).
6. **Deploy.** Click **Deploy** and wait for "Ready".
7. **Test the live app.**
   - Open your `https://<project>.vercel.app` URL. You should land on the login page.
   - Log in with `DEMO_PASSWORD` and click "Analyse NVIDIA stock."
   - You should see progress steps, then the analysis card.
8. **Open the debug dashboard.**
   - Go to `/debug` and log in with `DEBUG_PASSWORD`. Your demo login does **not** grant access; that's intentional.
   - Click **Re-run checks**. All five services should be `HEALTHY`.
   - Section B shows your request with each step's timing.
9. **Check the production logs.** In Vercel, go to the project → **Logs** for server output, or use `/debug` section B. The app never logs keys, passwords, full questions or IP addresses.
10. **Password protection.** Keep `DEMO_MODE=password` (the default). The free data plans are licensed for personal use, so don't share `DEMO_PASSWORD` unless the providers give written permission (see §10).
11. **Keep the two passwords separate.** `DEMO_PASSWORD` opens the chat; `DEBUG_PASSWORD` opens `/debug`. They must be different, and each login sets only its own cookie.
12. **After changing any variable,** redeploy (Deployments → ⋯ → Redeploy). Vercel only applies variable changes to new deployments.

---

## 7. Security model

- **Secrets stay on the server.**
  - All keys are read only in server code (`import "server-only"`).
  - Finnhub and Tiingo keys go in request headers; Alpha Vantage requires the key in the URL, so URLs are never logged.
  - `npm run check:secrets` confirms that no secret value is in the browser bundle.
- **Two separate logins.**
  - Separate HMAC-signed, HttpOnly cookies (`sl_demo`, `sl_debug`), each signed with its own key derived from `SESSION_SECRET`.
  - Passwords are compared in constant time on the server.
  - `proxy.ts` blocks unauthenticated pages, **and** every protected route and the debug page verify the session again on the server.
- **Abuse limits.**
  - 500-character questions and a 4 KB request body.
  - Per-user (hashed IP) and global daily caps, a budget per provider, and 5 login attempts per 15 minutes.
  - Rate limits fail open if Redis is down, so the app keeps working; providers still enforce their own limits.
- **AI safeguards.**
  - The mandatory system prompt is included.
  - News headlines are passed only as quoted data.
  - The validator rejects invented numbers, unknown evidence IDs, other tickers, buy/sell advice, guarantees and contradictions of the server's direction.
  - It retries once, then uses a rule-based fallback.
  - The disclaimer is added by code.

---

## 8. Test results (actually run, 2026-10-25)

| Check | Result |
|---|---|
| `npm test` | **96 passed**, 2 skipped (the opt-in live tests), 15 files |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm run build` | passed (Next.js 16.4.3) |
| `npm run check:secrets` | passed: 16 client files scanned, 7 secret test values not found |
| Auth flows against a running production build (22 curl checks) | all as expected; e.g. demo session → `/debug` redirects, demo token in the debug cookie → 401, tampered token rejected, logout clears the cookie |
| Chat stream with placeholder keys | streamed real steps, then a clean `PROVIDER_ERROR` result (Gemini rejected the fake key); no secret values in the server log |
| Browser layout, 375 px and 1280 px | no horizontal scroll; analysis, chart, data table, news, sources and disclaimer render (test-only data) |

What the tests cover:
- the approved formula worked examples;
- the two-ticker limit (no market-data calls made);
- follow-up context;
- unverified-ticker blocking;
- prompt-injection and invented-number rejection;
- retry and fallback;
- timeouts;
- provider failures and fallbacks;
- Redis outages;
- 20-record log retention;
- redaction;
- session scoping and expiry.

**Not verified:** live provider and Gemini responses (see `docs/phase-3-verification.md`), and the actual Vercel deployment.

---

## 9. Known limitations

1. **Gemini free quota is small** (reported as about 20 requests per day per model; check AI Studio). Each analysis uses 2–4 calls, so expect roughly 5–10 analyses a day. Set `GLOBAL_DAILY_CAP` accordingly.
2. **Quote freshness:** whether Finnhub's free quotes are real-time is unverified, so the UI labels quotes by their timestamp and never says "live". Pre-market and after-hours prices are not available.
3. **The NYSE holiday calendar** covers 2026–2027 only. Market status shows "unknown" outside those years. Update `lib/market/calendar.ts` each year.
4. **VADER** is a general-purpose sentiment lexicon, so it only approximates financial nuance.
5. **Ticker resolution** depends on Finnhub's instrument `type`. Some edge cases (SPACs, preferred shares) may be misclassified.
6. **The Alpha Vantage fallback** has 25 requests a day and unadjusted prices. A split-like jump disables the target range.
7. **The 90-day target range** is a ±1σ statistical band, not a prediction. Confidence measures data quality and consistency, not the probability of a gain.
8. **Conversation memory** is the last one or two tickers in the browser tab (`sessionStorage`). Closing the tab clears it.

---

## 10. Data licensing and attribution

The free plans used here are licensed for **personal use**:
- Finnhub's pricing page says "Personal Use".
- Tiingo forbids sharing data with other people without written permission.

This is why the app is designed to run **behind a password that only you know**. Before showing the app to anyone else (for example recruiters), ask Finnhub, Tiingo and Alpha Vantage for written permission. Attribution is shown in every answer under "Financial data sources". Questions are sent to Google Gemini, and on the free tier Google may use them to improve its products.

---

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Page says "StockLens AI is not configured yet: …" | A variable is missing or invalid; the message names it. Fix it in Vercel and redeploy. |
| Login always says "Incorrect password" | Check for spaces when you pasted `DEMO_PASSWORD`/`DEBUG_PASSWORD`, and redeploy after changing it. |
| "Too many login attempts" | 5 failures in 15 minutes; wait. |
| "The AI service is unavailable: Gemini quota or rate limit reached" | The free Gemini quota is used up; it resets daily (Pacific time). Lower `GLOBAL_DAILY_CAP`. |
| "Gemini returned HTTP 404" | `GEMINI_MODEL` isn't available to your key. Pick an ID listed in AI Studio. |
| "Finnhub rejected the request (invalid key or plan does not include this data)" | Wrong key, or the endpoint isn't on the free plan. |
| "… response did not match the expected format" | A provider changed its format. Note the provider and step from `/debug` and update the parser. |
| Debug dashboard shows Redis `UNAVAILABLE` | Check `UPSTASH_REDIS_REST_URL`/`TOKEN`. The chat keeps working without a cache. |
| Analysis says "TARGET UNAVAILABLE" | Fewer than 40 daily returns, a stale quote or unadjusted split data; the reason is shown. |
