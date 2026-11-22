/**
 * Shared (browser + server) helpers for Robin AI.
 * No secrets here, so it is safe to import from client components.
 */

/** The AI sentence is cut to this many characters so the letter stays on one A4 page */
export const AI_MAX_LINE_CHARS = 330;

/** Performance levels the company can state for an employee */
export const PERFORMANCE_LEVELS = ["Excellent", "Very Good", "Good", "Satisfactory"] as const;

/** "very good" -> "Very Good". Returns "" if it is not one of the levels. */
export function normalizePerformance(value: unknown): string {
  const v = String(value ?? "").trim().toLowerCase();
  return PERFORMANCE_LEVELS.find((p) => p.toLowerCase() === v) ?? "";
}

/** Robin AI writes a sentence for every designation that is filled in. */
export function isAiDesignation(position: string): boolean {
  return position.trim().length > 0;
}

function parseDay(value: string): Date | null {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-01-15" + "2026-11-20" -> "10 months". endIso null = until today. */
export function durationText(startIso: string, endIso: string | null): string {
  const start = parseDay(startIso);
  const end = endIso ? parseDay(endIso) : new Date();
  if (!start || !end || end < start) return "";

  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 1) return "less than a month";

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (rest) parts.push(`${rest} month${rest > 1 ? "s" : ""}`);
  return parts.join(" and ");
}