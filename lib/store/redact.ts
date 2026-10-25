/**
 * Redaction for the debug log. The preview is best-effort: if anything that looks
 * sensitive survives the replacements, the preview is dropped entirely.
 */

export const MAX_PREVIEW_LENGTH = 100;

const REPLACEMENTS: [RegExp, string][] = [
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, "[email]"],
  [/\bhttps?:\/\/\S+/gi, "[url]"],
  [/\b(bearer|token|api[_ -]?key|password|passwd|secret|pwd)\b\s*[:=]?\s*\S+/gi, "[credential]"],
  [/\b(sk|pk|gsk|ghp|xox[abp])[-_][A-Za-z0-9_-]{8,}\b/g, "[credential]"],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[credential]"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, "[credential]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[number]"],
  [/\b\d{6,}\b/g, "[number]"],
];

const SUSPICIOUS = /@|\b(password|token|secret|ssn|social security|iban|credit card|account number)\b/i;

export function redactPreview(question: string): string | null {
  let text = question.replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  if (!text || SUSPICIOUS.test(text)) return null;
  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH - 1)}…` : text;
}

/** Removes anything credential-like from an error message before it is stored. */
export function sanitizeError(message: string): string {
  let text = message;
  for (const [pattern, replacement] of REPLACEMENTS.slice(0, 6)) text = text.replace(pattern, replacement);
  return text.slice(0, 300);
}
