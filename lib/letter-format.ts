/**
 * Service letter FORMATS (templates) and how they are filled in.
 * Pure functions, safe on the server and in the browser.
 */

export const PLACEHOLDERS = [
  { key: "company_name", label: "Company name" },
  { key: "employee_name", label: "Employee name" },
  { key: "nic", label: "NIC number" },
  { key: "position", label: "Position" },
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date (shows \"date\" if still employed)" },
  { key: "issue_date", label: "Issue date" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];
const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key));

/** One A4 page fits about this much text between the heading and the signature */
export const MAX_BODY_LENGTH = 900;

export const STARTER_BODY = `This is to certify that {{employee_name}} (NIC: {{nic}}) has been employed at {{company_name}} as {{position}} from {{start_date}} to {{end_date}}.

This letter is issued on {{issue_date}} at the request of the employee.`;

const TOKEN_SOURCE = "\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}";

/** Placeholders in the text that Robin does not know, e.g. {{salary}} */
export function findUnknownPlaceholders(body: string): string[] {
  const unknown = new Set<string>();
  for (const m of body.matchAll(new RegExp(TOKEN_SOURCE, "g"))) {
    if (!KNOWN.has(m[1].toLowerCase())) unknown.add(m[0]);
  }
  return [...unknown];
}

export interface FormatInput {
  name: string;
  body: string;
  signerName: string;
  signerTitle: string;
}

/** Returns an error message, or null if the format is fine */
export function validateFormat(input: FormatInput): string | null {
  const name = input.name.trim();
  const body = input.body.trim();

  if (!name || name.length > 80) return "Give the format a name (up to 80 characters).";
  if (body.length < 20) return "The letter text is too short.";
  if (body.length > MAX_BODY_LENGTH) {
    return `The letter text is too long for one page (max ${MAX_BODY_LENGTH} characters).`;
  }
  if (!input.signerName.trim() || input.signerName.length > 80) {
    return "Enter the name of the person who signs this letter.";
  }
  if (!input.signerTitle.trim() || input.signerTitle.length > 80) {
    return "Enter the title of the person who signs this letter.";
  }
  if (!/\{\{\s*employee_name\s*\}\}/i.test(body)) {
    return "The text must include {{employee_name}} so each letter names the employee.";
  }
  const unknown = findUnknownPlaceholders(body);
  if (unknown.length > 0) {
    return `Unknown placeholder: ${unknown.join(", ")}. Use only the ones in the list.`;
  }
  return null;
}

/** Fills the placeholders. If there is no NIC, the "(NIC: ...)" part is removed. */
export function renderTemplate(
  body: string,
  vars: Partial<Record<PlaceholderKey, string>>
): string {
  let text = body;
  if (!vars.nic?.trim()) {
    text = text.replace(/\s*\(\s*NIC\s*:?\s*\{\{\s*nic\s*\}\}\s*\)/gi, "");
  }
  text = text.replace(new RegExp(TOKEN_SOURCE, "g"), (_m, key: string) => {
    return vars[key.toLowerCase() as PlaceholderKey]?.trim() ?? "";
  });
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

export interface ExtraCustomField {
  key: string;   // e.g. "department"
  label: string; // e.g. "Department"
}

/**
 * Renders a service letter for Bulk Generation with optional extra custom fields.
 * If an extra field key appears as {{key}} in the body, it replaces it inline;
 * otherwise, non-empty extra fields are appended cleanly below the body.
 */
export function renderBulkTemplate(
  body: string,
  vars: Partial<Record<PlaceholderKey, string>>,
  extraDefs: ExtraCustomField[],
  extraValues: Record<string, string>
): string {
  let text = renderTemplate(body, vars);
  const appendedLines: string[] = [];

  for (const field of extraDefs) {
    const val = (extraValues[field.key] ?? "").trim();
    const tokenRegex = new RegExp(`\\{\\{\\s*${field.key}\\s*\\}\\}`, "gi");
    if (tokenRegex.test(text)) {
      text = text.replace(tokenRegex, val);
    } else if (val) {
      appendedLines.push(`${field.label}: ${val}`);
    }
  }

  if (appendedLines.length > 0) {
    text = `${text}\n\n${appendedLines.join("\n")}`;
  }

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** "2026-11-15" -> "15 November 2026" (no time zone surprises) */
export function formatDateOnly(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}