import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_RATE_LIMIT_PER_MIN, ENDPOINTS, ERROR_CODES, type EndpointDoc } from "@/robin-api/spec";

export const metadata: Metadata = {
  title: "Robin API – Developer docs",
  description: "Issue, list, verify and revoke blockchain-verified service letters from your own software.",
};

const BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://YOUR-ROBIN-DOMAIN").replace(/\/+$/, "");

function curlFor(e: EndpointDoc): string {
  const path = e.path.replace("{id}", "LETTER_ID") + (e.id === "list-letters" ? "?limit=10&status=active" : "");
  const head = `curl ${e.method === "POST" ? "-X POST " : ""}${BASE}${path}`;
  const lines = [head, `  -H "Authorization: Bearer rbn_YOUR_KEY"`];
  if (e.method === "POST" && e.exampleBody) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(e.exampleBody)}'`);
  }
  return lines.join(" \\\n");
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{children}</pre>;
}

const NODE_SAMPLE = `// Node 18+. Read-only calls need no extra packages.
const res = await fetch("${BASE}/api/v1/letters?limit=5", {
  headers: { Authorization: "Bearer " + process.env.ROBIN_KEY },
});
if (!res.ok) throw new Error(JSON.stringify(await res.json()));
const { data } = await res.json();
console.log(data.map((l) => l.employeeName));`;

const PYTHON_SAMPLE = `# pip install requests
import os, requests

r = requests.post(
    "${BASE}/api/v1/verify",
    headers={"Authorization": "Bearer " + os.environ["ROBIN_KEY"]},
    json={"letterId": "LETTER_ID"},
    timeout=30,
)
print(r.json()["status"])  # valid | revoked | tampered | not_found`;

export default function DevelopersPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-6 py-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Developers</p>
        <h1 className="text-3xl font-bold text-robin-navy">Robin API</h1>
        <p className="text-slate-600">
          Connect your HR system or website to Robin. Issue service letters that anyone can verify on Cardano, list them,
          verify files and revoke letters, all from your own code.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/dashboard/api" className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700">
            Get an API key
          </Link>
          <a
            href="/api/v1/openapi.json"
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            OpenAPI file (Postman, Swagger)
          </a>
        </div>
      </header>

      <section className="space-y-3" id="start">
        <h2 className="text-xl font-semibold text-slate-900">Start in two minutes</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-slate-700">
          <li>
            Sign in as a company, open <strong>Dashboard &gt; API Keys</strong> and create a key. It looks like{" "}
            <code>rbn_…</code> and is shown once.
          </li>
          <li>Send it in the Authorization header of every call.</li>
        </ol>
        <Code>{`curl ${BASE}/api/v1/me \\\n  -H "Authorization: Bearer rbn_YOUR_KEY"`}</Code>
        <p className="text-sm text-slate-600">
          You can also send it as <code>X-API-Key: rbn_…</code>. Keep keys on your server. Never put one in a web page or a
          mobile app.
        </p>
      </section>

      <section className="space-y-3" id="issuing">
        <h2 className="text-xl font-semibold text-slate-900">How issuing works</h2>
        <p className="text-slate-700">
          Robin never holds your wallet key. So issuing is three steps, and step 2 happens on your side:
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-slate-700">
          <li>
            <strong>Prepare.</strong> <code>POST /api/v1/letters</code>. Robin makes the PDF, hashes it and returns an
            unsigned transaction.
          </li>
          <li>
            <strong>Sign and submit.</strong> Your server signs the transaction with the company wallet and sends it to
            Cardano. A ready-made Node.js helper is in <code>examples/robin-client.mjs</code>.
          </li>
          <li>
            <strong>Confirm.</strong> <code>POST /api/v1/letters/&#123;id&#125;/confirm</code> with the transaction hash. When it
            answers 200, the letter can be verified by anyone.
          </li>
        </ol>
        <p className="text-sm text-slate-600">
          Keep the <code>pdfBase64</code> from step 1 and give it to the employee. Those exact bytes are what the blockchain
          proves. Revoking works the same way (prepare, sign with <em>partial</em> signing, confirm).
        </p>
      </section>

      <section className="space-y-6" id="endpoints">
        <h2 className="text-xl font-semibold text-slate-900">Endpoints</h2>
        {ENDPOINTS.map((e) => (
          <article key={e.id} id={e.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold text-white ${e.method === "GET" ? "bg-emerald-600" : "bg-indigo-600"}`}
              >
                {e.method}
              </span>
              <code className="text-sm font-semibold text-slate-900">{e.path}</code>
            </div>
            <h3 className="font-semibold text-slate-900">{e.summary}</h3>
            <p className="text-sm text-slate-700">{e.description}</p>
            <p className="text-xs text-slate-500">
              Permission: {e.scope ?? "any valid key"}
              {e.needsVerified ? " · Company must be verified by Robin" : ""}
            </p>

            {(e.query || e.body) && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-1 pr-3">{e.query ? "Query" : "Body field"}</th>
                      <th className="py-1 pr-3">Type</th>
                      <th className="py-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(e.query ?? e.body ?? []).map((f) => (
                      <tr key={f.name} className="border-b last:border-0 align-top">
                        <td className="py-1 pr-3 font-mono text-slate-900">
                          {f.name}
                          {f.required ? <span className="text-red-600"> *</span> : null}
                        </td>
                        <td className="py-1 pr-3 text-slate-600">{f.type}</td>
                        <td className="py-1 text-slate-700">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Code>{curlFor(e)}</Code>
            <p className="text-xs font-medium text-slate-500">Example response</p>
            <Code>{JSON.stringify(e.exampleResponse, null, 2)}</Code>
            <ul className="space-y-0.5 text-xs text-slate-600">
              {e.statuses.map((s) => (
                <li key={s.code}>
                  <span className="font-mono font-semibold text-slate-800">{s.code}</span> {s.meaning}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="space-y-3" id="errors">
        <h2 className="text-xl font-semibold text-slate-900">Errors</h2>
        <p className="text-sm text-slate-700">
          Every error has the same shape: <code>{`{ "error": { "code": "…", "message": "…" } }`}</code>. Use{" "}
          <code>code</code> in your software and show <code>message</code> to people.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500">
                <th className="px-3 py-2">code</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CODES.map((c) => (
                <tr key={c.code} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-slate-900">{c.code}</td>
                  <td className="px-3 py-1.5">{c.status}</td>
                  <td className="px-3 py-1.5 text-slate-700">{c.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" id="limits">
        <h2 className="text-xl font-semibold text-slate-900">Rate limits</h2>
        <p className="text-sm text-slate-700">
          Each key may make {DEFAULT_RATE_LIMIT_PER_MIN} calls per minute. Every answer carries{" "}
          <code>X-RateLimit-Limit</code> and <code>X-RateLimit-Remaining</code>. When you go over, you get 429 with a{" "}
          <code>Retry-After</code> header (in seconds). Wait, then try again.
        </p>
      </section>

      <section className="space-y-3" id="samples">
        <h2 className="text-xl font-semibold text-slate-900">Code samples</h2>
        <p className="text-sm text-slate-700">List your letters (Node.js):</p>
        <Code>{NODE_SAMPLE}</Code>
        <p className="text-sm text-slate-700">Verify a letter (Python):</p>
        <Code>{PYTHON_SAMPLE}</Code>
        <p className="text-sm text-slate-600">
          Issuing and revoking need a Cardano signature, so use the Node.js helper in the Robin repository:{" "}
          <code>examples/robin-client.mjs</code>.
        </p>
      </section>
    </main>
  );
}
