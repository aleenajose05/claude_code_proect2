import { z } from "zod";

/** Structured output required from the explanation (Phase B) call. Unknown keys are rejected. */

const point = z.object({ text: z.string().trim().min(10).max(400), evidence: z.array(z.string()).min(1).max(5) }).strict();

export const stockExplanationSchema = z
  .object({
    ticker: z.string(),
    directionExplanation: z.string().trim().min(10).max(500),
    reasons: z.array(point).length(3),
    risks: z.array(point).length(2),
    newsSummary: z.string().trim().min(5).max(500),
  })
  .strict();

export const explanationSchema = z
  .object({
    stocks: z.array(stockExplanationSchema).min(1).max(2),
    comparison: z.string().trim().min(10).max(700).nullable(),
  })
  .strict();

export type Explanation = z.infer<typeof explanationSchema>;
export type StockExplanation = z.infer<typeof stockExplanationSchema>;

/** The same contract in the JSON Schema subset Gemini's responseJsonSchema accepts. */
const pointJson = {
  type: "object",
  properties: {
    text: { type: "string" },
    evidence: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
  },
  required: ["text", "evidence"],
  additionalProperties: false,
};

export const explanationJsonSchema = {
  type: "object",
  properties: {
    stocks: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          directionExplanation: { type: "string" },
          reasons: { type: "array", items: pointJson, minItems: 3, maxItems: 3 },
          risks: { type: "array", items: pointJson, minItems: 2, maxItems: 2 },
          newsSummary: { type: "string" },
        },
        required: ["ticker", "directionExplanation", "reasons", "risks", "newsSummary"],
        additionalProperties: false,
      },
    },
    comparison: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["stocks", "comparison"],
  additionalProperties: false,
} as const;
