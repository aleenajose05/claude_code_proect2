import { describe, expect, it } from "vitest";

import { MAX_PREVIEW_LENGTH, redactPreview, sanitizeError } from "@/lib/store/redact";

describe("redactPreview", () => {
  it("keeps ordinary stock questions", () => {
    expect(redactPreview("Analyse NVIDIA stock.")).toBe("Analyse NVIDIA stock.");
  });

  it.each([
    ["my email is jane.doe@example.com, analyse AAPL"],
    ["my password is hunter2 analyse TSLA"],
    ["use token sk-abcdefghijklmnop1234 for MSFT"],
    ["call me on +1 (415) 555-0100 about Apple"],
  ])("removes sensitive values: %s", (question) => {
    const preview = redactPreview(question);
    expect(preview === null || !/jane|hunter2|sk-abc|555-0100/.test(preview)).toBe(true);
  });

  it("omits the preview entirely when redaction is uncertain", () => {
    expect(redactPreview("my password is hunter2")).toBeNull();
    expect(redactPreview("email me at x @ y")).toBeNull();
  });

  it("caps the preview at 100 characters", () => {
    const preview = redactPreview(`Analyse Apple ${"and more ".repeat(40)}`)!;
    expect(preview.length).toBeLessThanOrEqual(MAX_PREVIEW_LENGTH);
  });

  it("scrubs credential-bearing URLs and keys from error messages", () => {
    const message = sanitizeError("GET https://www.alphavantage.co/query?apikey=ABCD1234SECRET failed; key AIzaSyA1234567890abcdefghijk");
    expect(message).not.toContain("ABCD1234SECRET");
    expect(message).not.toContain("AIzaSy");
  });
});
