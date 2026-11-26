// EXAMPLE for the company's developer. Run on the company's own server.
// npm i @meshsdk/core     (Node 18+)
//
// env: ROBIN_KEY (rbn_...), ROBIN_URL (e.g. http://localhost:3000),
//      BLOCKFROST_KEY (Preprod), WALLET_MNEMONIC (the company's registered wallet, 24 words)
import { writeFileSync } from "node:fs";
import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";

const { ROBIN_KEY, ROBIN_URL, BLOCKFROST_KEY, WALLET_MNEMONIC } = process.env;
const provider = new BlockfrostProvider(BLOCKFROST_KEY);
const wallet = new MeshWallet({
  networkId: 0, // Preprod
  fetcher: provider,
  submitter: provider,
  key: { type: "mnemonic", words: WALLET_MNEMONIC.split(" ") },
});
await wallet.init?.(); // needed in newer Mesh versions, ignored in older ones

const robin = (path, body) =>
  fetch(ROBIN_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ROBIN_KEY}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

// 1. Ask Robin to prepare the letter
const prepared = await robin("/api/v1/letters", {
  formatId: "YOUR_FORMAT_UUID",
  employeeName: "Test Employee",
  position: "Engineer",
  startDate: "2024-01-15",
  stillEmployed: true,
  changeAddress: await wallet.getChangeAddress(),
});
if (prepared.status !== 201) throw new Error(JSON.stringify(prepared.json));
const { letterId, pdfBase64, unsignedTx } = prepared.json;

// Keep the PDF. These exact bytes are what the blockchain proves.
writeFileSync(`letter-${letterId}.pdf`, Buffer.from(pdfBase64, "base64"));

// 2. Sign with the company's own key and submit to Cardano
const signed = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signed);
console.log("Submitted:", txHash);

// 3. Confirm with Robin (retry until Cardano has the transaction)
for (let i = 0; i < 36; i++) {
  const res = await robin(`/api/v1/letters/${letterId}/confirm`, { txHash });
  if (res.status === 200) { console.log(res.json); break; }
  if (res.status !== 202) throw new Error(JSON.stringify(res.json));
  await new Promise((r) => setTimeout(r, 5000));
}
