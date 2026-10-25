import type { Redis } from "@upstash/redis";

/** TEST-ONLY in-memory stand-in for the few Upstash commands the app uses. */
export function fakeRedis(options: { failing?: boolean } = {}) {
  const kv = new Map<string, unknown>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Record<string, number>>();
  const fail = () => {
    if (options.failing) throw new Error("fetch failed");
  };
  const api = {
    kv,
    lists,
    async get(key: string) {
      fail();
      return kv.get(key) ?? null;
    },
    async set(key: string, value: unknown) {
      fail();
      kv.set(key, structuredClone(value));
      return "OK";
    },
    async lrange(key: string, start: number, stop: number) {
      fail();
      return (lists.get(key) ?? []).slice(start, stop + 1);
    },
    async hgetall(key: string) {
      fail();
      return hashes.get(key) ?? null;
    },
    multi() {
      const ops: (() => void)[] = [];
      const tx = {
        lpush(key: string, value: string) {
          ops.push(() => lists.set(key, [value, ...(lists.get(key) ?? [])]));
          return tx;
        },
        ltrim(key: string, start: number, stop: number) {
          ops.push(() => lists.set(key, (lists.get(key) ?? []).slice(start, stop + 1)));
          return tx;
        },
        hincrby(key: string, field: string, by: number) {
          ops.push(() => {
            const h = hashes.get(key) ?? {};
            h[field] = (h[field] ?? 0) + by;
            hashes.set(key, h);
          });
          return tx;
        },
        async exec() {
          fail();
          ops.forEach((op) => op());
          return [];
        },
      };
      return tx;
    },
  };
  return api as typeof api & Redis;
}
