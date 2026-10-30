// Scans the built browser bundle (.next/static) for secrets. Run after `npm run build`
// with the same environment variables the build used: `npm run check:secrets`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "GEMINI_API_KEY", "OPENROUTER_API_KEY", "FINNHUB_API_KEY", "TIINGO_API_KEY", "ALPHA_VANTAGE_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET", "DEBUG_PASSWORD", "DEMO_PASSWORD",
];
// Strings that only server code should contain.
const SERVER_ONLY_MARKERS = ["X-Finnhub-Token", "Authorization: `Token", "apikey", "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET"];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let bundle;
try {
  bundle = files(".next/static").filter((f) => /\.(js|css|html|json)$/.test(f));
} catch {
  console.error("No .next/static directory. Run `npm run build` first.");
  process.exit(2);
}

const problems = [];
for (const file of bundle) {
  const text = readFileSync(file, "utf8");
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 6 && text.includes(value)) problems.push(`${file}: contains the value of ${name}`);
  }
  for (const marker of SERVER_ONLY_MARKERS) {
    if (text.includes(marker)) problems.push(`${file}: contains server-only marker "${marker}"`);
  }
  if (/NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/.test(text)) problems.push(`${file}: references a NEXT_PUBLIC_ secret-like variable`);
}

const checkedValues = SECRET_VARS.filter((n) => process.env[n]).length;
if (problems.length) {
  console.error(`Secret exposure check FAILED:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Secret exposure check passed: ${bundle.length} client files scanned, ${checkedValues} secret values checked.`);
if (checkedValues === 0) console.warn("Warning: no secret env vars were set, so only marker checks ran.");
