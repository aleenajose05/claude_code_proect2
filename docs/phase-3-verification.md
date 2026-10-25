# Live verification checklist

StockLens AI was built from the providers' official documentation and tested **only with mock data**. The owner chose to add API keys directly in Vercel, so no code has been run against the live APIs yet. Every response format below is enforced by Zod at runtime: if a provider answers differently from what the code expects, the request fails with `INVALID_PROVIDER_RESPONSE` instead of showing wrong numbers.

## How to verify

Use either method once your keys are available:

1. **After deploying:** log in to `/debug` and click **Re-run checks**. Each service should show `HEALTHY`. Then ask the chat "Analyse Apple stock" and open that request in section B to see every step.
2. **On your computer:** put your keys in `.env.local`, then run `npm run test:live`. The script calls each provider once for AAPL and prints the response shape, never your keys. On Windows, use Git Bash or WSL; the `LIVE=1` prefix does not work in `cmd`.

## Assumptions to confirm

| # | Area | What the code assumes | Where |
|---|---|---|---|
| 1 | Finnhub auth | The key is accepted in the `X-Finnhub-Token` header | `lib/providers/finnhub.ts` |
| 2 | Finnhub `/quote` | Fields `c, d, dp, h, l, o, pc, t`; an unknown symbol returns zeros | same |
| 3 | Finnhub `/search` | `result[].type` is exactly `"Common Stock"` for common shares, with other values for ETFs and ADRs | `lib/tools/ticker.ts` |
| 4 | Finnhub `/stock/profile2` | `{}` for unknown symbols; `exchange` names a US exchange and contains "OTC" for over-the-counter listings | same |
| 5 | Finnhub `/company-news` | Available on the free plan; fields `datetime, headline, source, url, related, summary` | `lib/providers/finnhub.ts` |
| 6 | Finnhub quote freshness | Whether free-plan quotes are real-time or delayed is unknown, so the UI labels by timestamp and never says "live" | `lib/market/calendar.ts` |
| 7 | Tiingo EOD | `adjOpen/adjHigh/adjLow/adjClose/adjVolume` fields; HTTP 404 for unknown tickers; `Authorization: Token …` header | `lib/providers/tiingo.ts` |
| 8 | Tiingo metadata | `GET /tiingo/daily/AAPL` returns an object with `ticker` (used for the health check) | `lib/health.ts` |
| 9 | Alpha Vantage | `GLOBAL_QUOTE` and `TIME_SERIES_DAILY` formats; rate limits arrive as HTTP 200 with `Note` or `Information` | `lib/providers/alphavantage.ts` |
| 10 | Gemini model IDs | `gemini-3.8-flash` / `gemini-3.6-flash` are available to your key (2.5 models return 404 for new keys); check Google AI Studio | `.env.example` |
| 11 | Gemini structured output | `responseJsonSchema` accepts the schema in `lib/llm/schema.ts`, including `anyOf` with `null` | `lib/llm/schema.ts` |
| 12 | Gemini thinking | 2.5 models accept `thinkingBudget: 512`; 3.x models accept `thinkingLevel: LOW` | `lib/llm/gemini.ts` |
| 13 | Gemini free quota | Reported as about 20 requests per day per model. Each analysis uses 2–4 calls, so set `GLOBAL_DAILY_CAP` to match your real quota | AI Studio → Rate limits |
| 14 | NYSE calendar | Holidays and early closes for 2026–2027 are hard-coded; compare them with nyse.com | `lib/market/calendar.ts` |
| 15 | Client IP | Vercel overwrites `x-forwarded-for` (documented); the leftmost value is used | `lib/auth.ts` |

If a check fails, the error message names the provider and the step. Send me that message (never the key) and I'll adjust the parser.
