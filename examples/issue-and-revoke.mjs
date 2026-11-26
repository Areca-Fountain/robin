// Tries the WHOLE flow on Cardano Preprod: issue a letter, verify it, revoke it, verify again.
// Run it from the folder that holds robin-client.mjs.
//
//   npm i @meshsdk/core
//   ROBIN_URL=http://localhost:3000 ROBIN_KEY=rbn_... BLOCKFROST_KEY=preprod... \
//   WALLET_MNEMONIC="word1 word2 ... word24" node issue-and-revoke.mjs
//
// The wallet must be the one your company registered with Robin, hold some test ADA,
// and have one ADA-only UTxO of 5+ ADA (needed as collateral to revoke).
import { writeFileSync } from "node:fs";
import { RobinClient, meshWallet } from "./robin-client.mjs";

const { ROBIN_URL, ROBIN_KEY, BLOCKFROST_KEY, WALLET_MNEMONIC } = process.env;
for (const [k, v] of Object.entries({ ROBIN_URL, ROBIN_KEY, BLOCKFROST_KEY, WALLET_MNEMONIC })) {
  if (!v) throw new Error(`Set ${k} first.`);
}

const robin = new RobinClient({ url: ROBIN_URL, key: ROBIN_KEY });
const wallet = await meshWallet({ blockfrostKey: BLOCKFROST_KEY, mnemonic: WALLET_MNEMONIC });

console.log("Company:", (await robin.me()).company.name);

const { formats } = await robin.formats();
if (!formats.length) throw new Error("Create a format in Dashboard > Manage Formats first.");
const formatId = process.env.FORMAT_ID || formats[0].id;
console.log("Using format:", formats.find((f) => f.id === formatId)?.name ?? formatId);

console.log("Issuing… (this takes about a minute while Cardano confirms)");
const { letter, pdf, txHash } = await robin.issueLetter(
  { formatId, employeeName: "API Test Employee", position: "Tester", startDate: "2024-01-15", stillEmployed: true },
  wallet
);
writeFileSync(`letter-${letter.id}.pdf`, pdf);
console.log("Issued:", letter.verifyUrl, "tx", txHash);
console.log("Verify says:", (await robin.verify({ letterId: letter.id })).status);

console.log("Revoking…");
const revoked = await robin.revokeLetter(letter.id, wallet);
console.log("Revoked in tx", revoked.revokeTxHash);
console.log("Verify now says:", (await robin.verify({ letterId: letter.id })).status);
