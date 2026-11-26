// ONE place that describes the public API. The /developers page, the OpenAPI file
// (/api/v1/openapi.json) and the dashboard Playground all read from here.
// When you add or change an endpoint, update this list too.
// No server-only imports here: the browser uses this file as well.

export type Scope = "letters:read" | "letters:write";

export interface Field {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface EndpointDoc {
  id: string;
  method: "GET" | "POST";
  /** Path with {id} style parameters */
  path: string;
  summary: string;
  description: string;
  scope: Scope | null;
  /** Company must be Verified by Robin */
  needsVerified: boolean;
  query?: Field[];
  body?: Field[];
  /** Example request body (POST) */
  exampleBody?: Record<string, unknown>;
  exampleResponse: unknown;
  statuses: { code: number; meaning: string }[];
}

export const DEFAULT_RATE_LIMIT_PER_MIN = 60;

const LETTER = {
  id: "6f1c2c1e-8a3d-4f4b-9d0e-3a5b7c9d1e2f",
  employeeName: "Test Employee",
  position: "Engineer",
  workStatus: "active",
  issuedAt: "2026-11-27T08:30:00.000Z",
  status: "active",
  revokedAt: null,
  txHash: "b3f1…64 hex characters…9a2c",
  letterHash: "9d7a…64 hex characters…41ef",
  issuedBy: "api:HR system",
  verifyUrl: "https://YOUR-ROBIN-DOMAIN/verify/6f1c2c1e-8a3d-4f4b-9d0e-3a5b7c9d1e2f",
};

export const ENDPOINTS: EndpointDoc[] = [
  {
    id: "me",
    method: "GET",
    path: "/api/v1/me",
    summary: "Check your key",
    description:
      "Shows which company the key belongs to, its permissions and your rate limit. Use it to test that a key works.",
    scope: null,
    needsVerified: false,
    exampleResponse: {
      company: { id: "…", name: "Acme Lanka (Pvt) Ltd", status: "Verified", verified: true },
      key: { id: "…", name: "HR system", scopes: ["letters:read", "letters:write"] },
      rateLimit: { perMinute: DEFAULT_RATE_LIMIT_PER_MIN },
    },
    statuses: [
      { code: 200, meaning: "The key is valid." },
      { code: 401, meaning: "Missing, wrong, expired or revoked key." },
    ],
  },
  {
    id: "formats",
    method: "GET",
    path: "/api/v1/formats",
    summary: "List your letter formats and letterheads",
    description:
      "Returns the formats you created in Manage Formats and your uploaded letterheads. You need a format id (and optionally a letterhead id) to issue a letter.",
    scope: "letters:read",
    needsVerified: false,
    exampleResponse: {
      formats: [
        {
          id: "0b2f…",
          name: "Standard service letter",
          status: "Generated",
          signerName: "A. Perera",
          signerTitle: "HR Manager",
          placeholders: ["company_name", "employee_name", "nic", "position", "start_date", "end_date", "issue_date"],
          updatedAt: "2026-11-20T10:00:00.000Z",
        },
      ],
      letterheads: [{ id: "c91d…", name: "Main letterhead" }],
    },
    statuses: [
      { code: 200, meaning: "OK." },
      { code: 403, meaning: "The key has no letters:read permission." },
    ],
  },
  {
    id: "list-letters",
    method: "GET",
    path: "/api/v1/letters",
    summary: "List issued letters",
    description: "Your company's letters, newest first.",
    scope: "letters:read",
    needsVerified: false,
    query: [
      { name: "limit", type: "integer", description: "1 to 100. Default 20." },
      { name: "page", type: "integer", description: "1 or higher. Default 1." },
      { name: "status", type: "string", description: "active or revoked. Leave out for both." },
    ],
    exampleResponse: { data: [LETTER], page: 1, limit: 20, total: 1, hasMore: false },
    statuses: [
      { code: 200, meaning: "OK." },
      { code: 400, meaning: "A query value is invalid." },
    ],
  },
  {
    id: "get-letter",
    method: "GET",
    path: "/api/v1/letters/{id}",
    summary: "Get one letter",
    description: "Only letters of your own company can be read.",
    scope: "letters:read",
    needsVerified: false,
    exampleResponse: LETTER,
    statuses: [
      { code: 200, meaning: "OK." },
      { code: 404, meaning: "No such letter for your company." },
    ],
  },
  {
    id: "verify",
    method: "POST",
    path: "/api/v1/verify",
    summary: "Verify a letter or a PDF",
    description:
      "Runs the same checks as the public verify page. Send the letter id, the SHA-256 of a PDF, or both (to also check that the file matches). Always answers 200: read the status field.",
    scope: "letters:read",
    needsVerified: false,
    body: [
      { name: "letterId", type: "string (uuid)", description: "Id of a letter." },
      { name: "hash", type: "string", description: "SHA-256 of a PDF, 64 hex characters." },
    ],
    exampleBody: { letterId: LETTER.id },
    exampleResponse: {
      status: "valid",
      message: "This letter was issued by Acme Lanka (Pvt) Ltd, a verified company, and recorded on Cardano.",
      letter: {
        companyName: "Acme Lanka (Pvt) Ltd",
        employeeName: "Test Employee",
        position: "Engineer",
        issuedAt: LETTER.issuedAt,
        companyVerified: true,
      },
      txHash: LETTER.txHash,
    },
    statuses: [
      { code: 200, meaning: "status is valid, revoked, tampered or not_found." },
      { code: 400, meaning: "Send a letterId or a hash." },
    ],
  },
  {
    id: "issue-prepare",
    method: "POST",
    path: "/api/v1/letters",
    summary: "Issue a letter, step 1: prepare",
    description:
      "Robin makes the PDF, hashes it and returns an UNSIGNED Cardano transaction. Nothing is on the blockchain yet. Sign the transaction with your own wallet key and submit it (step 2), then confirm (step 3). Robin never holds your wallet key. The draft expires after 30 minutes.",
    scope: "letters:write",
    needsVerified: true,
    body: [
      { name: "formatId", type: "string (uuid)", required: true, description: "From GET /api/v1/formats." },
      { name: "employeeName", type: "string", required: true, description: "Max 120 characters." },
      { name: "position", type: "string", description: "Max 120 characters." },
      { name: "nic", type: "string", description: "Employee NIC. Printed in the PDF only." },
      { name: "startDate", type: "string", required: true, description: "yyyy-mm-dd" },
      { name: "endDate", type: "string", description: "yyyy-mm-dd. Required unless stillEmployed is true." },
      { name: "stillEmployed", type: "boolean", description: "true if the employee still works there." },
      {
        name: "changeAddress",
        type: "string",
        required: true,
        description: "Address of your company's registered Cardano wallet (addr_test1…).",
      },
      { name: "letterheadId", type: "string", description: "From GET /api/v1/formats. Default: your first letterhead." },
    ],
    exampleBody: {
      formatId: "YOUR_FORMAT_UUID",
      employeeName: "Test Employee",
      position: "Engineer",
      startDate: "2024-01-15",
      stillEmployed: true,
      changeAddress: "addr_test1…",
    },
    exampleResponse: {
      status: "awaiting_signature",
      letterId: LETTER.id,
      letterHash: LETTER.letterHash,
      verifyUrl: LETTER.verifyUrl,
      pdfBase64: "JVBERi0xLjc…",
      unsignedTx: "84a500…",
      expiresAt: "2026-11-27T09:00:00.000Z",
      message: "Sign unsignedTx with your company wallet, submit it, then confirm.",
    },
    statuses: [
      { code: 201, meaning: "Prepared. Sign and submit unsignedTx." },
      { code: 400, meaning: "Invalid input, or the wallet has no funds." },
      { code: 403, meaning: "Company not verified, wrong wallet, or Free plan limit (5 letters) reached." },
      { code: 404, meaning: "That format does not belong to your company." },
    ],
  },
  {
    id: "issue-confirm",
    method: "POST",
    path: "/api/v1/letters/{id}/confirm",
    summary: "Issue a letter, step 3: confirm",
    description:
      "Send the hash of the transaction you submitted. Robin checks it on Cardano and saves the letter. Answers 202 while Cardano has not seen the transaction yet: call again every ~10 seconds. Safe to repeat.",
    scope: "letters:write",
    needsVerified: true,
    body: [{ name: "txHash", type: "string", required: true, description: "64 hex characters." }],
    exampleBody: { txHash: "b3f1…" },
    exampleResponse: { status: "issued", letter: LETTER },
    statuses: [
      { code: 200, meaning: "Issued. The letter is now verifiable." },
      { code: 202, meaning: "Waiting for Cardano. Call again in ~10 seconds." },
      { code: 404, meaning: "No prepared letter with this id." },
      { code: 410, meaning: "The draft expired. Start again with step 1." },
    ],
  },
  {
    id: "revoke-prepare",
    method: "POST",
    path: "/api/v1/letters/{id}/revoke",
    summary: "Revoke a letter, step 1: prepare",
    description:
      "Returns an UNSIGNED revoke transaction. Sign it with your wallet using PARTIAL signing (the script input has no key), submit it, then call the revoke confirm endpoint. Revoking is public and cannot be undone. Your wallet needs a UTxO of at least 5 ADA that holds only ADA (used as collateral).",
    scope: "letters:write",
    needsVerified: false,
    body: [
      {
        name: "changeAddress",
        type: "string",
        required: true,
        description: "The same wallet address you issued the letter with.",
      },
    ],
    exampleBody: { changeAddress: "addr_test1…" },
    exampleResponse: {
      status: "awaiting_signature",
      letterId: LETTER.id,
      unsignedTx: "84a600…",
      partialSign: true,
      message: "Sign unsignedTx with partial signing, submit it, then confirm.",
    },
    statuses: [
      { code: 201, meaning: "Prepared. Sign (partial) and submit." },
      { code: 404, meaning: "No such letter for your company." },
      { code: 409, meaning: "The letter is already revoked." },
    ],
  },
  {
    id: "revoke-confirm",
    method: "POST",
    path: "/api/v1/letters/{id}/revoke/confirm",
    summary: "Revoke a letter, step 3: confirm",
    description:
      "Checks on Cardano that the letter's record was spent, then marks the letter revoked. Answers 202 until Cardano has the transaction.",
    scope: "letters:write",
    needsVerified: false,
    body: [{ name: "txHash", type: "string", required: true, description: "Hash of the submitted revoke transaction." }],
    exampleBody: { txHash: "c7d2…" },
    exampleResponse: {
      status: "revoked",
      revokeTxHash: "c7d2…",
      letter: { ...LETTER, status: "revoked", revokedAt: "2026-11-27T10:00:00.000Z" },
    },
    statuses: [
      { code: 200, meaning: "Revoked." },
      { code: 202, meaning: "Waiting for Cardano. Call again in ~10 seconds." },
    ],
  },
];

export const ERROR_CODES: { code: string; status: number; meaning: string }[] = [
  { code: "missing_api_key", status: 401, meaning: "No key sent. Use Authorization: Bearer rbn_…" },
  { code: "invalid_api_key", status: 401, meaning: "Key is wrong or revoked." },
  { code: "expired_api_key", status: 401, meaning: "Key has expired." },
  { code: "insufficient_scope", status: 403, meaning: "The key lacks the needed permission." },
  { code: "company_not_verified", status: 403, meaning: "Robin has not verified your company yet." },
  { code: "rate_limited", status: 429, meaning: "Too many requests. Wait for Retry-After seconds." },
  { code: "invalid_request", status: 400, meaning: "A field is missing or wrong. The message says which." },
  { code: "wallet_mismatch", status: 403, meaning: "changeAddress is not your registered wallet." },
  { code: "plan_limit_reached", status: 403, meaning: "Free plan allows 5 letters. Upgrade to Premium." },
  { code: "format_not_found", status: 404, meaning: "That format is not yours." },
  { code: "letter_not_found", status: 404, meaning: "No such letter for your company." },
  { code: "draft_expired", status: 410, meaning: "Prepared letter expired (30 minutes). Start again." },
  { code: "already_revoked", status: 409, meaning: "The letter is already revoked." },
  { code: "chain_unavailable", status: 502, meaning: "Could not read Cardano. Try again shortly." },
  { code: "internal_error", status: 500, meaning: "Our side. Try again." },
];
