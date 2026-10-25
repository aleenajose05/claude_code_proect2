# StockLens AI — Phase 1 Proposal (Research, Architecture, Formulas)

Status: **APPROVED by the owner on 2026-10-25, with one change: Google Gemini replaces Groq as the AI provider (see §A).**
Research date: 2026-10-25

## A. Amendment — Gemini instead of Groq (owner decision)

The architecture, providers, licensing default (owner-only, §2a option 1) and formulas (§8) are unchanged. Only the LLM layer changes.

| Item | Groq plan (superseded) | Gemini plan |
|---|---|---|
| SDK | groq-sdk / AI SDK | `@google/genai` (official Google SDK) |
| Primary model | `openai/gpt-oss-120b` | `GEMINI_MODEL`, suggested `gemini-2.5-flash` (documented stable; supports function calling, structured outputs, thinking) |
| Fallback model | `openai/gpt-oss-20b` | `GEMINI_FALLBACK_MODEL`, suggested `gemini-2.5-flash-lite` (pricing page lists a free tier) |
| Env vars | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL` | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` |
| Phase B output | strict `json_schema` | `responseMimeType: application/json` + response JSON schema, then the same Zod validation |

**What changes for you ⚠**
1. **Free-tier quota is much lower than Groq's and unverified.** Limits are per project and per model. Developer-forum reports say Google cut the free tier in December 2025, with Flash and Flash-Lite at about **20 requests per day** each (earlier 250 and 1,000). At 2–3 Gemini calls per analysis that is **roughly 7–10 analyses per day per model**. Check the real numbers in Google AI Studio. The global daily cap (`GLOBAL_DAILY_CAP`) must be set at or below what your quota allows.
2. **Model naming is unsettled.** Google's pages also list newer IDs (Gemini 3.x previews and others) that I could not verify. The model is therefore configured only through env vars, and Phase 5 confirms the IDs with a real key.
3. **Privacy.** Under the Gemini API Additional Terms, prompts and responses on the **unpaid** tier may be used to improve Google products and may be read by human reviewers (outside the EEA, Switzerland and the UK). The app sends Gemini only the question and verified market data, never credentials. The privacy notice tells users not to type personal information.

Sources: [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) · [Release notes](https://ai.google.dev/gemini-api/docs/changelog) · [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Additional terms](https://ai.google.dev/gemini-api/terms) · [Forum: free-tier reduction](https://discuss.ai.google.dev/t/do-they-really-think-we-wouldnt-notice-a-92-free-tier-quota/111262)

## 0. How this research was done (read first)

The build sandbox's network policy blocks direct connections to `console.groq.com`, `finnhub.io` and the other provider sites (proxy returned `403 connect_rejected`). I couldn't open the official pages directly. I used a web-search tool limited to the official domains instead (groq.com, finnhub.io, massive.com, alphavantage.co, tiingo.com, twelvedata.com, vercel.com, upstash.com). It returns excerpts from those pages. Where the only evidence was community or third-party, I say so.

**Every item marked ⚠ UNVERIFIED must be checked with a real API key in Phase 3, before any code relies on it.** You can also check the provider pages yourself; links are in §14.

---

## 1. Groq model options

| Role | Model ID | Evidence |
|---|---|---|
| Primary (`GROQ_MODEL`) | `openai/gpt-oss-120b` | Groq docs list it as a **production** model, 131K context. Supports local tool use, JSON mode and strict `json_schema` structured outputs. It does **not** support parallel tool calls. Groq's deprecation page names it as the replacement for Llama 3.3 70B (shut down 2026-08-16), Qwen3 32B and Llama 4 Scout (2026-07-17), and Kimi K2 (2026-04-15). |
| Fallback (`GROQ_FALLBACK_MODEL`) | `openai/gpt-oss-20b` | Production model with strict structured-output support. Named as the replacement for Llama 3.1 8B. |

Models that are **not** used because Groq retired them: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `qwen/qwen3-32b`, Llama 4 Scout, Kimi K2, Compound Mini (decommissioned 2026-09-21).

**Free-tier limits ⚠ UNVERIFIED.** Groq's rate-limits page shows gpt-oss-120b at about **30 RPM, 1,000 RPD, 8K TPM and 200K TPD**. Another Groq page shows much higher numbers, and Groq says your console's Limits page is the authoritative source. The **8K tokens/minute** figure is the binding constraint (see §6).

Both models are reasoning models, so reasoning tokens count against TPM. The plan is to set `reasoning_effort: "low"`.

## 2. Financial-data providers evaluated

| Provider | Free quota | Quote | 90-day daily history | News | Sentiment | Licence of free plan |
|---|---|---|---|---|---|---|
| **Finnhub** | ~60 calls/min | `/quote` free | `/stock/candle` **premium** (community 403 reports) | `/company-news` free | `/news-sentiment` **premium** | Pricing page: "Personal Use – Terms apply". Full ToS text not retrievable ⚠ |
| **Alpha Vantage** | 25 req/day, 5/min | `GLOBAL_QUOTE` free | `TIME_SERIES_DAILY` free (unadjusted; `_ADJUSTED` premium) | `NEWS_SENTIMENT` **premium** | premium | ToS excerpt grants a revocable non-sublicensable licence. Display terms not confirmed. Offers **unlimited free access to verified open-source/educational projects** |
| **Massive (Polygon)** | 5 calls/min, EOD only, 2 yrs | No snapshots/quotes on Basic | Aggregates (EOD; previous day available after midnight ET) | Yes | — | **Personal, non-commercial; showing data to any other person, "including testers", needs a Business plan** |
| **Tiingo** | 50 req/hr, 1,000/day, 500 symbols/mo | IEX (limited) | EOD with adjusted fields | News API (free-tier history unclear ⚠) | No | **Internal/personal only. "Not displaying or sharing it with another person"; website/app use needs written permission** |
| **Twelve Data** | 8/min, 800/day | Yes | Yes | No | No | "Internal display" is listed only on **paid** tiers. Basic display rights unclear ⚠ |

### 2a. Key finding: licensing conflict ⚠

**No evaluated provider's free plan clearly permits showing its data to other people.** Massive and Tiingo say so explicitly. Finnhub labels its plans "Personal Use". Twelve Data only grants display rights on paid tiers. Alpha Vantage's terms on this point couldn't be confirmed.

- **Public demo (Plan A): not permitted** on the evidence found.
- **Password-protected demo (Plan B) for recruiters or other viewers:** this is **still** "showing data to another person". Massive's help centre explicitly covers testers, and Tiingo's wording ("another person") covers it too. **Plan B does not solve the problem for Massive or Tiingo.** For Finnhub and Alpha Vantage it is unresolved.

Compliant options within $0 (you need to choose):

1. **Owner-only deployment (recommended default).** Deploy on Vercel with `DEMO_PASSWORD` gating the entire app and every data API route. Only you hold the password, so it is personal use. A public landing page with **no market data** explains the project and links to the GitHub repo plus screenshots or a screen recording you make yourself.
2. **Ask for written permission.** Email Finnhub, Tiingo (sales@tiingo.com) and Alpha Vantage (support/premium) describing a non-commercial, password-protected portfolio demo. Alpha Vantage's open-source/educational programme is the most promising route. If permission is granted, enable Plan B for the people you invite. Until then, use option 1.
3. **Bring-your-own-key mode.** Each visitor pastes their own free Finnhub/Tiingo keys, so every viewer is their own licensee. It adds complexity and means handling user-supplied secrets (kept in memory only and never logged). **Not recommended for the MVP.**

The architecture is identical for options 1 and 2. Plan B authentication (`DEMO_PASSWORD`, separate from `DEBUG_PASSWORD`) is built either way, so switching later is a configuration change.

## 3. Selected provider combination

| Need | Primary | Fallback | Why |
|---|---|---|---|
| Ticker resolution | Finnhub `/search` + `/stock/profile2` | Static curated alias table (Apple→AAPL, Google→GOOGL, …), verified against Finnhub | Free; `/search` returns a `type` field (e.g. "Common Stock") used to exclude ETFs/ADRs ⚠ field values verified in Phase 3 |
| Quote | Finnhub `/quote` | Alpha Vantage `GLOBAL_QUOTE` | 60/min vs 25/day |
| 90-day history | Tiingo EOD (split/dividend-**adjusted** closes) | Alpha Vantage `TIME_SERIES_DAILY` compact (≈100 trading days, **unadjusted**, so a split inside the window is flagged and lowers confidence) | Finnhub candles are premium. Massive's licence is stricter |
| News | Finnhub `/company-news` (last 7 days) | Tiingo News ⚠ | Free |
| Sentiment | **Deterministic VADER** (compound score, −1…+1) on headline + summary | — | Provider sentiment endpoints are premium. VADER is deterministic and testable and costs no Groq tokens. npm package to be verified in Phase 2 ⚠ |

Excluded: unofficial Yahoo Finance scraping, and anything paid.

### Price-freshness labels (never "live")
Finnhub's free `/quote` returns a timestamp `t`. The real-time vs delayed status of US quotes on the free plan is **⚠ unverified**, so the label is derived from the timestamp and the market clock:
- `INTRADAY` — market open and quote age ≤ 20 min (shown as "Latest trade as of HH:MM ET, may be delayed")
- `DELAYED` — market open and age > 20 min
- `PREVIOUS_CLOSE` — market closed (weekend, holiday, overnight)
- Pre-market and after-hours prices: the free `/quote` does not appear to provide them, so the UI says "Extended-hours prices not available" ⚠

Market status comes from a deterministic NYSE calendar in code: 09:30–16:00 ET, with a hard-coded holiday and early-close table for 2026–2027. The table has to be updated each year, which is a documented limitation.

## 4. Architecture

```
Browser (sessionStorage: { activeTicker, secondaryTicker } only — no prices, no keys)
   │  POST /api/chat { question ≤500 chars, context refs }
   ▼
Next.js App Router on Vercel (Node runtime, maxDuration = 60s)
   proxy/middleware: demo-session cookie for app + /api/chat; debug-session cookie for /debug, /api/health, /api/logs
   │
   ├─ 1 Validate (Zod) → requestId → rate limits (user min/day, global day) ── Upstash
   ├─ 2 Phase A (Groq, tools enabled, ≤5 iterations, 45s total budget)
   │     LLM's job: understand intent and call resolve_ticker (and other tools if it wants).
   │     Server validates every argument, enforces ≤2 tickers BEFORE any data call,
   │     then GUARANTEES required data: quote + history + news for each ticker,
   │     in parallel, via cache → primary → fallback (per-call timeout 6s).
   ├─ 3 Deterministic engine: indicators.ts, sentiment.ts, confidence.ts
   ├─ 4 Phase B (Groq, no tools, temp 0.2, strict json_schema): explain only, citing evidence IDs
   ├─ 5 Guard: Zod (exactly 3 reasons / 2 risks, no extra keys), evidence-ID check,
   │     no-new-numbers check → retry once → deterministic template fallback
   ├─ 6 Render server-owned values + fixed disclaimer; stream progress events (NDJSON)
   └─ 7 Redacted log → LPUSH + LTRIM 0 19 (MULTI)
```

**Why the server forces the data tools.** gpt-oss-120b has no parallel tool calls. Letting it call quote, history and news one by one would take 4–5 sequential LLM turns per stock, and 8–10 for a comparison. That would exceed the 8K TPM budget and risk timeouts. Every full analysis needs all three datasets anyway, so the LLM identifies *what* is being asked and the server fetches the data. All four tools are still exposed with validated schemas, so follow-ups like "just the price" can call one tool alone.

## 5. Follow-up context
The browser keeps `{ activeTicker, secondaryTicker }` plus the last resolution status. The server re-validates the tickers and always re-fetches through the cache, so old prices are never reused as memory. "Compare it with Apple" means active ticker + AAPL. Three or more tickers return a "please pick two" message before any API call. "Google" resolves to **GOOGL** with a visible notice. "GOOG" is respected when asked for explicitly.

## 6. Estimated usage per full single-stock analysis (cold cache)

| Service | Calls | Free limit | Practical ceiling |
|---|---|---|---|
| Finnhub | search 1 + profile 1 + quote 1 + news 1 = 4 | 60/min | ~15 analyses/min |
| Tiingo | 1 | 50/hr, 1,000/day | 50 cold analyses/hr; caching history for 12h removes repeats |
| Alpha Vantage | 0 (fallback only) | 25/day | fallback budget capped at 20/day in code |
| Groq | 2 (Phase A) + 1 (Phase B) ≈ **4–6K tokens** | 8K TPM / 200K TPD ⚠ | **~1–2 analyses per minute, ~35–45 per day** |
| Upstash | ~25–35 commands | 500K/month, 250MB | well within |

A comparison roughly doubles the data calls and adds about 1.5K tokens.

**Limitation:** Groq's tokens-per-minute limit, not the market data, caps throughput. Proposed caps: **per user 10/min and 50/day** (configurable), **global 40 analyses/day**, and per-provider counters (Finnhub 50/min, Tiingo 45/hr and 900/day, Alpha Vantage 20/day). A 429 from any of these returns a clear "daily demo limit reached" message.

## 7. Vercel and Upstash compatibility
- **Vercel Hobby** (free) is for personal, non-commercial use, which suits a portfolio project. With Fluid compute, function duration defaults to **300s** and can be configured up to 300s. A timeout returns 504. Plan: `maxDuration = 60` on `/api/chat`, a 45s internal budget, and 6s per external call, so the app returns a typed timeout error well before Vercel kills the function.
- **Upstash free tier:** 500K commands/month, 250MB, 1 database, no card. Health checks are cached for 60s so an open dashboard doesn't burn the free quota.

---

## 8. Financial formulas (FOR APPROVAL)

**Inputs**
- `P`: latest quote price.
- `C₁…C_N`: daily **adjusted** closes for trading days within the last **90 calendar days**. That is ≈ 61–63 sessions, since weekends and holidays have no bar.
- Missing trading days are not filled in. A return across a gap is computed as one return, and a gap of more than 3 sessions is flagged.

| Metric | Formula | Minimum data |
|---|---|---|
| SMA(n) | (C_{N−n+1} + … + C_N) / n | n closes (SMA20 → 20, SMA50 → 50) |
| 90-day return | R90 = (C_N / C₁ − 1) × 100 | 2 closes spanning ≥ 60 calendar days |
| Daily log return | rₜ = ln(Cₜ / Cₜ₋₁) | — |
| Daily volatility | σ_d = sample std-dev of rₜ, divisor (M − 1), M = number of returns | M ≥ 40 |
| Annualised volatility (display only) | σ_a = σ_d × √252 | as above |
| 90-day high / low | max / min of daily **High / Low** in the window | ≥ 1 bar |
| Article sentiment | VADER compound of "headline. summary" ∈ [−1, 1]. Label: ≥ +0.05 Positive, ≤ −0.05 Negative, otherwise Neutral | — |
| Average sentiment | mean of compound scores for the ≤ 10 most recent relevant articles in the last 7 days | ≥ 3 articles, otherwise "insufficient" |

### 8a. Direction classification
Signals are scored +1, 0 or −1:

| Signal | +1 if | −1 if | Weight |
|---|---|---|---|
| S1 Price vs SMA20 | P > 1.01·SMA20 | P < 0.99·SMA20 | 1 |
| S2 Price vs SMA50 | P > 1.02·SMA50 | P < 0.98·SMA50 | 1 |
| S3 MA alignment | SMA20 > 1.005·SMA50 | SMA20 < 0.995·SMA50 | 1 |
| S4 90-day return | R90 > +5% | R90 < −5% | 1 |
| S5 News sentiment | avg ≥ +0.15 | avg ≤ −0.15 | 0.5 (0 if insufficient) |

Score T = Σ weight·signal, range [−4.5, +4.5].
**UP if T ≥ +2.5; DOWN if T ≤ −2.5; otherwise SIDEWAYS.**
If SMA50 is unavailable, S2 and S3 drop out and the thresholds become ±1.5. If SMA20 or R90 is unavailable, the result is **DIRECTION UNAVAILABLE** (partial analysis). Sentiment alone can never decide the direction.

### 8b. Target range
- **Horizon:** 20 trading days (≈ 1 calendar month).
- **Centre:** P. No drift is assumed, which avoids extrapolating past returns.
- **Width:** σ_h = σ_d·√20, range = [P·e^(−σ_h), P·e^(+σ_h)]. Under a log-normal, zero-drift assumption this is roughly a 68% (1σ) band.
- **90-day high/low:** not used to clip the range, because clipping would make the statistics wrong. They are shown alongside, and the UI notes when the range goes outside them.
- **TARGET UNAVAILABLE** if there is no valid quote, fewer than 40 returns, a quote older than 5 trading days, or an unadjusted fallback history containing a split-like jump (|rₜ| > 25%).
- The UI label reads: "Statistical range (≈68%, next ~20 trading days), not a prediction."

### 8c. Confidence (0–100 points)

| Component | Points |
|---|---|
| Data completeness | quote 10; history ≥ 50 closes 10 (40–49: 5); news ≥ 3 articles 10 (1–2: 5) |
| Quote freshness | INTRADAY or PREVIOUS_CLOSE of the latest session: 15. One session stale: 5. Older: 0 |
| Trend consistency | ≥ 3 non-zero price signals all with the same sign: 25. \|S1+S2+S3+S4\| ≥ 2: 15. Otherwise: 5 |
| Sentiment agreement | Sign matches the direction (or both neutral): 10. Insufficient: 5. Contradicts: 0 |
| Volatility | σ_a < 30%: 10. 30–50%: 5. > 50%: 0 |
| Provider reliability | All primary providers: 10. Any fallback used: 5. Partial data: 0 |

**HIGH ≥ 75, MEDIUM 50–74, LOW < 50.** Caps: no quote or no history means LOW at most. TARGET UNAVAILABLE or DIRECTION UNAVAILABLE means MEDIUM at most. A two-stock comparison scores each stock independently.

### 8d. Worked examples — ILLUSTRATIVE DATA, NOT REAL STOCKS
**Example 1, "Stock X"**: P = 105, SMA20 = 102, SMA50 = 98, C₁ = 95, C_N = 104, 6 articles averaging +0.22, σ_d = 0.018, 62 closes, all primary providers, quote 5 minutes old during the session.
- S1: 105 > 103.02 → +1. S2: 105 > 99.96 → +1. S3: 102 > 98.49 → +1. S4: R90 = (104/95 − 1)×100 = 9.47% → +1. S5: 0.22 ≥ 0.15 → +0.5. **T = 4.5, so UP.**
- σ_a = 0.018×√252 = 28.6%.
- Target: σ_h = 0.018×√20 = 0.0805, giving [105·e^−0.0805, 105·e^0.0805] = **[96.88, 113.80]**.
- Confidence: 30 + 15 + 25 + 10 + 10 + 10 = **100, HIGH**.

**Example 2, "Stock Y"**: P = 100, SMA20 = 100.5, SMA50 = 97, C₁ = 98, C_N = 100, sentiment −0.05 (4 articles), σ_d = 0.02.
- S1: 99.5 ≤ 100 ≤ 101.505 → 0. S2: 100 > 98.94 → +1. S3: 100.5 > 97.485 → +1. S4: R90 = 2.04% → 0. S5: 0. **T = 2, so SIDEWAYS.**
- Target: σ_h = 0.02×√20 = 0.0894, giving **[91.44, 109.36]**.
- Confidence: 30 + 15 + 15 (only 2 non-zero signals) + 10 (both neutral) + 5 (σ_a = 31.7%) + 10 = **85, HIGH**.
  This shows that confidence measures data quality and consistency, not bullishness.

**Example 3, "Stock Z"**: P = 250, quote from the previous session's close, Alpha Vantage fallback history, 2 articles, σ_d = 0.028 (σ_a = 44.4%), signals −1, −1, −1, 0, sentiment insufficient.
- **T = −3, so DOWN.**
- Target: σ_h = 0.028×√20 = 0.1252, giving **[220.58, 283.35]**.
- Confidence: (10 + 10 + 5) + 15 + 25 + 5 + 5 + 5 = **80, HIGH**.
  If the quote were one session stale, freshness would drop to 5 and the total to **70, MEDIUM**.

## 9. Anti-hallucination summary
Every number shown in the UI comes from server data. The Phase B JSON may contain text only: a strict Zod `.strict()` object with exactly 3 reasons, 2 risks, a news summary, and evidence IDs such as `M:SMA20`, `M:R90`, `N:3`. The validator:
- rejects unknown evidence IDs;
- rejects any numeric token in the text that doesn't match a supplied value (within rounding);
- rejects other tickers or company names;
- rejects any direction or confidence wording that contradicts the server values.

On failure it retries once, then falls back to a deterministic templated explanation. The disclaimer is appended by code. News headlines are sent inside clearly delimited "untrusted data" blocks.

## 10. Security, auth and logging (summary)
- Two separate HMAC-signed HttpOnly, Secure, SameSite=Lax cookies (`sl_demo` and `sl_debug`), signed with `SESSION_SECRET`.
- Passwords are compared server-side in constant time. A demo session never grants debug access.
- `lib/env.ts` validates everything with Zod and requires `DEMO_PASSWORD` only when `DEMO_MODE=password`.
- Logs keep the request ID, ticker, a redacted preview of ≤ 100 characters (emails, phone numbers, long digit runs and key-like strings removed; the preview is dropped entirely if redaction is uncertain), model, tokens, step timings, cache hits and status. Only the last 20 entries are kept.

## 11. Unresolved limitations
1. **Licensing (§2a): the main blocker for any viewer other than you.**
2. Free-tier Groq TPM gives low throughput (about 1–2 analyses per minute).
3. Whether Finnhub free-plan quotes are real-time or delayed is unverified; the UI never claims "live".
4. No extended-hours prices.
5. Instrument classification relies on Finnhub's `type` field. Edge cases such as SPACs and preferred shares may need manual rules.
6. The holiday calendar needs a manual annual update.
7. The Alpha Vantage fallback is unadjusted, so splits are flagged instead of corrected.
8. VADER is tuned for social-media text, so financial headline nuance ("beats estimates" vs "cuts guidance") is only approximated.
9. The research was done through search excerpts because the sandbox blocks direct fetches. Phase 3 confirms each endpoint with real keys.

## 12. Environment variables
`GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b`, `GROQ_FALLBACK_MODEL=openai/gpt-oss-20b`, `FINNHUB_API_KEY`, `TIINGO_API_KEY` (new, provider-specific), `ALPHA_VANTAGE_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DEBUG_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`), `DEMO_MODE` (`password` by default), `DEMO_PASSWORD`. `POLYGON_API_KEY` is not used.

## 13. Decisions needed from you
1. Approve the providers (Finnhub + Tiingo + Alpha Vantage fallback; Massive not used).
2. Choose the licensing path: **Option 1, owner-only** (recommended), Option 2 (request permission, owner-only until granted), or Option 3 (BYO keys).
3. Approve or adjust the formulas and thresholds in §8, including the 20-trading-day horizon and the ≈68% band.
4. Approve the global cap of 40 analyses per day.

## 14. Sources
- Groq: https://console.groq.com/docs/models · https://console.groq.com/docs/deprecations · https://console.groq.com/docs/tool-use/overview · https://console.groq.com/docs/structured-outputs · https://console.groq.com/docs/rate-limits
- Finnhub: https://finnhub.io/pricing · https://finnhub.io/faq · https://github.com/finnhubio/Finnhub-API/issues/546 (community)
- Alpha Vantage: https://www.alphavantage.co/documentation/ · https://www.alphavantage.co/support/ · https://www.alphavantage.co/terms_of_service/
- Massive: https://massive.com/legal/individuals-terms-of-service · https://massive.com/knowledge-base/article/which-plan-do-i-need-to-show-massive-data-in-my-app · https://massive.com/knowledge-base/article/on-the-free-basic-plan-when-can-i-pull-the-previous-trading-days-data
- Tiingo: https://app.tiingo.com/tos/ · https://www.tiingo.com/account/billing/pricing · https://www.tiingo.com/products/end-of-day-stock-price-data · https://www.tiingo.com/products/news-api
- Twelve Data: https://twelvedata.com/pricing
- Vercel: https://vercel.com/docs/fluid-compute · https://vercel.com/docs/functions/limitations · https://vercel.com/docs/plans/hobby
- Upstash: https://upstash.com/docs/redis/overall/billing · https://upstash.com/pricing/redis
