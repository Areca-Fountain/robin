// Checks the Robin API without touching the blockchain. Safe to run any time.
//
//   ROBIN_URL=http://localhost:3000 ROBIN_KEY=rbn_... node scripts/api-smoke-test.mjs
//
// Optional:  RATE_TEST=1  also fires a burst of calls to prove the 429 rate limit works
//            (it uses up this key's calls for about a minute).
const URL_ = (process.env.ROBIN_URL || "http://localhost:3000").replace(/\/+$/, "");
const KEY = process.env.ROBIN_KEY || "";
if (!KEY.startsWith("rbn_")) {
  console.error("Set ROBIN_KEY to an API key (rbn_...). Create one in Dashboard > API.");
  process.exit(2);
}

const RANDOM_ID = "00000000-0000-4000-8000-000000000000";
let failed = 0;

async function call(method, path, { key = KEY, body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `   -> ${detail}`}`);
  if (!ok) failed++;
}

const j = (x) => JSON.stringify(x).slice(0, 160);

// 1. Keys
let r = await call("GET", "/api/v1/me", { key: "" });
check("no key -> 401 missing_api_key", r.status === 401 && r.json?.error?.code === "missing_api_key", j(r));

r = await call("GET", "/api/v1/me", { key: "rbn_" + "x".repeat(40) });
check("wrong key -> 401 invalid_api_key", r.status === 401 && r.json?.error?.code === "invalid_api_key", j(r));

r = await call("GET", "/api/v1/me");
check("valid key -> 200 with company", r.status === 200 && !!r.json?.company?.name, j(r));
check("answers carry X-RateLimit headers", !!r.headers.get("x-ratelimit-limit") && !!r.headers.get("x-ratelimit-remaining"),
  "headers missing (is supabase/005 run?)");
const limitHeader = Number(r.headers.get("x-ratelimit-limit")) || 60;
const verified = r.json?.company?.verified === true;
const scopes = r.json?.key?.scopes ?? [];
console.log(`      company: ${r.json?.company?.name} | verified: ${verified} | scopes: ${scopes.join(", ")}`);

// 2. Reading
r = await call("GET", "/api/v1/formats");
check("GET /formats -> 200 with formats[] and letterheads[]", r.status === 200 && Array.isArray(r.json?.formats) && Array.isArray(r.json?.letterheads), j(r));

r = await call("GET", "/api/v1/letters?limit=2");
check("GET /letters -> 200 with data[]", r.status === 200 && Array.isArray(r.json?.data) && typeof r.json?.total === "number", j(r));
const first = r.json?.data?.[0];

r = await call("GET", "/api/v1/letters?limit=0");
check("GET /letters?limit=0 -> 400 invalid_request", r.status === 400 && r.json?.error?.code === "invalid_request", j(r));

r = await call("GET", "/api/v1/letters?status=banana");
check("GET /letters?status=banana -> 400", r.status === 400, j(r));

if (first) {
  r = await call("GET", `/api/v1/letters/${first.id}`);
  check("GET /letters/{id} (your own) -> 200", r.status === 200 && r.json?.id === first.id, j(r));
}

r = await call("GET", `/api/v1/letters/${RANDOM_ID}`);
check("GET /letters/{unknown id} -> 404 letter_not_found", r.status === 404 && r.json?.error?.code === "letter_not_found", j(r));

r = await call("GET", "/api/v1/letters/not-a-uuid");
check("GET /letters/not-a-uuid -> 400", r.status === 400, j(r));

// 3. Verify
r = await call("POST", "/api/v1/verify", { body: {} });
check("POST /verify {} -> 400", r.status === 400, j(r));

r = await call("POST", "/api/v1/verify", { body: { letterId: RANDOM_ID } });
check("POST /verify unknown letter -> 200 not_found", r.status === 200 && r.json?.status === "not_found", j(r));

if (first) {
  r = await call("POST", "/api/v1/verify", { body: { letterId: first.id } });
  check("POST /verify real letter -> valid or revoked", r.status === 200 && ["valid", "revoked"].includes(r.json?.status), j(r));
  r = await call("POST", "/api/v1/verify", { body: { letterId: first.id, hash: "0".repeat(64) } });
  check("POST /verify wrong file hash -> tampered", r.status === 200 && r.json?.status === "tampered", j(r));
}

// 4. Writing (validation only: nothing reaches the blockchain)
r = await call("POST", "/api/v1/letters", { body: {} });
check("POST /letters {} -> 400 (verified) or 403 (not verified)",
  verified ? r.status === 400 : (r.status === 403 && r.json?.error?.code === "company_not_verified"), j(r));

r = await call("POST", `/api/v1/letters/${RANDOM_ID}/confirm`, { body: { txHash: "abc" } });
check("POST /confirm with bad txHash -> 400 or 403", [400, 403].includes(r.status), j(r));

r = await call("POST", `/api/v1/letters/${RANDOM_ID}/revoke`, { body: {} });
check("POST /revoke without changeAddress -> 400", r.status === 400, j(r));

r = await call("POST", `/api/v1/letters/${RANDOM_ID}/revoke/confirm`, { body: { txHash: "abc" } });
check("POST /revoke/confirm with bad txHash -> 400", r.status === 400, j(r));

// 5. Docs
r = await call("GET", "/api/v1/openapi.json", { key: "" });
check("GET /openapi.json -> 200 (public)", r.status === 200 && !!r.json?.paths?.["/api/v1/letters"], j(r));

const page = await fetch(URL_ + "/developers");
check("GET /developers page -> 200", page.status === 200, String(page.status));

// 6. Rate limit (only when asked)
if (process.env.RATE_TEST) {
  const limit = limitHeader;
  console.log(`      firing ${limit + 10} calls to hit the limit…`);
  let got429 = false;
  let retryAfter = null;
  for (let i = 0; i < limit + 10; i++) {
    const x = await call("GET", "/api/v1/me");
    if (x.status === 429) {
      got429 = true;
      retryAfter = x.headers.get("retry-after");
      check("429 body has code rate_limited", x.json?.error?.code === "rate_limited", j(x));
      break;
    }
  }
  check("rate limit kicks in with 429 + Retry-After", got429 && !!retryAfter, "never got 429");
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
