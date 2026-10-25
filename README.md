# StockLens AI

_Understand US stocks through simple, data-backed AI analysis._

A Next.js app where you ask plain-English questions about US-listed common stocks. The answers are built only from verified market data. Prices come from the data providers, all indicators are calculated by deterministic TypeScript code, and the AI (Google Gemini) only explains those results in simple words.

> Not financial advice. Stock market investments involve risk. Market data may be delayed. Forecast ranges are estimates based on historical information and do not guarantee future performance.

## Project status

| Phase | Status |
|---|---|
| 1. Research, architecture, formulas | ✅ Approved, see [`docs/phase-1-proposal.md`](docs/phase-1-proposal.md) |
| 2. Project setup | ✅ Done: Next.js, TypeScript, Tailwind, shadcn/ui, env validation, test runner |
| 3. Financial API integration | ⏳ Not started (needs your API keys to verify real responses) |
| 4. Calculation engine | ✅ Done: `lib/analysis/` (indicators, direction, target range, sentiment, confidence) with unit tests |
| 5. Gemini integration | ⏳ Not started |
| 6. Chat interface | ⏳ Not started |
| 7. Redis, rate limits, debug dashboard, auth | ⏳ Not started |
| 8. Testing and security | ⏳ Not started |
| 9–10. Vercel deployment and handover | ⏳ Not started |

The home page is currently a placeholder with no controls.

## Tech stack

| Part | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | Tailwind CSS v4 and shadcn/ui components (in `components/ui/`) |
| AI | Google Gemini via the official `@google/genai` SDK |
| Market data | Finnhub (quotes, ticker search, news), Tiingo (price history), Alpha Vantage (optional fallback) |
| Validation | Zod |
| Cache, logs, rate limits | Upstash Redis and `@upstash/ratelimit` |
| Charts | Recharts |
| News sentiment | `vader-sentiment` (deterministic scoring) |
| Tests | Vitest |

## Running it on your computer (beginner guide)

1. **Install Node.js 22 or newer** from https://nodejs.org. Check it worked by running `node -v` in a terminal.
2. **Get the code and install dependencies:**
   ```bash
   git clone https://github.com/aleenajose05/claude_code_proect2.git
   cd claude_code_proect2
   npm install
   ```
3. **Create your local secrets file.** Copy the template, then open `.env.local` in an editor and fill in real values:
   ```bash
   cp .env.example .env.local
   ```
   - `.env.local` is listed in `.gitignore`, so git will never upload it.
   - Generate `SESSION_SECRET` with `openssl rand -base64 48`.
   - `DEMO_PASSWORD` and `DEBUG_PASSWORD` must be **different**. The app refuses to start otherwise.
   - Where to get each key is written next to it in `.env.example`.
4. **Start the development server:** run `npm run dev`, then open http://localhost:3000.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the local dev server with live reload |
| `npm run build` | Creates a production build (the same step Vercel runs) |
| `npm run start` | Runs the production build locally |
| `npm run lint` | Checks code style and common mistakes |
| `npm run typecheck` | Checks TypeScript types |
| `npm test` | Runs the automated tests once |

## Folder layout (so far)

```text
app/              pages and (later) API routes
components/ui/    shadcn/ui building blocks (Button, Card, Input, Badge, Label)
lib/env.ts        validates every environment variable on the server
lib/utils.ts      `cn()` helper for combining Tailwind classes
lib/analysis/     deterministic calculations: indicators, direction, target range, sentiment, confidence
tests/            Vitest tests
docs/             Phase 1 proposal (architecture, providers, formulas)
```

More folders (`lib/tools`, `lib/providers`, `lib/llm`, …) are added in the phases that implement them. Empty placeholder files aren't committed ahead of time.

## Data licensing

The free market-data plans used here are licensed for **personal use**. For that reason the app is designed to be deployed **behind `DEMO_PASSWORD`, known only to you**. Don't share the password or make the deployment public unless the data providers have given written permission. See §2a of the Phase 1 proposal.
