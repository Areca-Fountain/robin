"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{children}</pre>
  );
}

export default function QuickStartPanel() {
  // Shows this site's real address in the examples (and a placeholder while the page loads)
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://YOUR-ROBIN-DOMAIN"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quick start</h1>
        <p className="mt-1 text-slate-600">
          Connect your own software to Robin in four steps. The full reference is on the{" "}
          <Link href="/developers" className="font-medium text-indigo-700 underline">
            developer docs
          </Link>{" "}
          page, and an OpenAPI file for Postman is at{" "}
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline">
            /api/v1/openapi.json
          </a>
          .
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">1. Create a key</CardTitle>
          <CardDescription>
            Open the <strong>API Keys</strong> tab, name a key (for example &quot;HR system&quot;) and copy it. It is shown
            only once.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">2. Test the key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Code>{`curl ${origin}/api/v1/me \\
  -H "Authorization: Bearer rbn_YOUR_KEY"`}</Code>
          <p className="text-xs text-slate-500">
            You should see your company name. Or paste the key into the Playground tab and press Send.
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3. Find your format id</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Code>{`curl ${origin}/api/v1/formats \\
  -H "Authorization: Bearer rbn_YOUR_KEY"`}</Code>
          <p className="text-xs text-slate-500">
            Formats are created in <strong>Manage Formats</strong>. Copy the <code>id</code> of one.
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">4. Issue a letter (three calls)</CardTitle>
          <CardDescription>
            Robin never holds your wallet key, so issuing has a step where your own server signs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <code>POST /api/v1/letters</code>: Robin makes the PDF and returns an unsigned transaction.
            </li>
            <li>Your server signs it with the company wallet and submits it to Cardano.</li>
            <li>
              <code>POST /api/v1/letters/&#123;id&#125;/confirm</code> with the transaction hash. Done: the letter is
              verifiable.
            </li>
          </ol>
          <p>
            The signing step is already written for you in <code>examples/robin-client.mjs</code> (Node.js). Run{" "}
            <code>examples/issue-and-revoke.mjs</code> to try the whole flow on Preprod.
          </p>
          <Code>{`import { RobinClient } from "./robin-client.mjs";
const robin = new RobinClient({ url: "${origin}", key: process.env.ROBIN_KEY });
const { letter, pdf } = await robin.issueLetter({ formatId, employeeName: "A. Silva",
  position: "Engineer", startDate: "2024-01-15", stillEmployed: true }, wallet);`}</Code>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Good to know</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-slate-700">
          <p>Each key may make 60 calls per minute. Answers include X-RateLimit-Remaining.</p>
          <p>Issuing needs a verified company. Free plan: 5 letters. Premium: unlimited.</p>
          <p>Keep the PDF Robin returns. Those exact bytes are what the blockchain proves.</p>
          <p>Never put a key in website code that visitors can read. Call Robin from your server.</p>
        </CardContent>
      </Card>
    </div>
  );
}
