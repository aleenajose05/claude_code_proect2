import { AppError } from "@/lib/errors";
import type { LlmClient, LlmRequest, LlmResponse } from "./gemini";

/**
 * Tries each AI provider in order (Gemini first, then OpenRouter). Moves on when a provider
 * is busy, out of quota, timing out or failing; stops when the whole request has run out of
 * time. The error from the last provider is the one reported.
 */
export class LlmChain implements LlmClient {
  constructor(private readonly clients: readonly LlmClient[]) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    let lastError: unknown = new AppError("PROVIDER_ERROR", "No AI provider is configured");
    for (const client of this.clients) {
      if (request.signal.aborted) break;
      try {
        return await client.generate(request);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
