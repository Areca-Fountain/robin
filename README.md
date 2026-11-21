# Robin

**Tamper-proof service letters, verified on Cardano.**

Robin lets companies issue employment and service letters whose fingerprint is locked on the Cardano blockchain. Anyone can check a letter in seconds by scanning its QR code or uploading the PDF. If the letter was edited, faked or revoked, Robin says so.

Built for **UniHack 2026** by Coin Ceylon.

> **Demo video:** _add link here_ &nbsp;|&nbsp; **Live demo:** _add link here_

---

## The problem

Fake experience letters are cheap to make and hard to catch. Many Sri Lankans applying for jobs and visas abroad are asked for service letters, and employers, agencies and embassies have no fast way to tell a real letter from a forged one. Today, checking means phoning or emailing the company and waiting days, if anyone answers at all.

## The solution

When a company issues a letter through Robin:

1. Robin generates the PDF and takes its **SHA-256 fingerprint**.
2. That fingerprint is **locked on Cardano** in a small transaction paid by the company's own wallet.
3. The letter carries a **QR code** that points to a public verification page.

Anyone can then verify the letter. Robin checks the blockchain, not just its own database, so a forged or edited letter cannot pass.

---

## Who it's for, and how it's sustained

**Users**

| User | What they get |
|------|---------------|
| **Companies** (HR teams) | Issue and revoke official letters, in bulk from Excel, with their own formats and team access |
| **Employees** | A letter that employers abroad can trust instantly |
| **Verifiers** (recruiters, agencies, embassies, universities) | Free, instant verification with no account needed |
| **Registrars** (HR consultancies, accountants, agents) | Register and manage many companies on their behalf |

**Sustainability.** Verification is free, so the network spreads. Registrars are the paying side: the Free plan allows up to 5 company submissions, and the Premium plan (planned at $10 per month) allows unlimited submissions. Registrars bring companies onto Robin in volume, which is the main adoption path. Robin's team verifies every company before it gets the "Verified" badge.

**Where blockchain adds value**

- **Nobody can quietly alter a letter**, including Robin. The fingerprint on Cardano is permanent.
- **Anyone can check it without trusting Robin's database**: the hash, the issuing wallet and the revocation state are all read from the chain.
- **Revocation is public and cannot be hidden.** Only the issuing company's key can revoke, and the contract enforces this.
- **Privacy by design.** The PDF is hashed in the user's browser. Only the hash is sent to the server; the file never leaves the device.

---

## How it works

1. **A company registers.** It submits its business registration (BR/ROC) and connects its Lace wallet. A registrar can also submit a company on its behalf.
2. **Robin's team reviews** the documents and marks the company **Verified**, **Rejected** or **Under Review**.
3. **The company issues a letter.** It fills in a format, Robin generates the PDF with a QR code, the browser hashes it, and the company signs one Cardano transaction in Lace.
4. **Anyone verifies.** They open the QR link (`/verify/<letterId>`) or upload the PDF at `/verify`.
5. **The company can revoke** a letter at any time from the dashboard.

### On-chain design

Each letter is registered by sending **2 ADA** (returned to the issuer on revocation) to the Robin validator, with an inline datum:

```
LetterDatum { letter_hash: ByteArray (SHA-256), issuer: VerificationKeyHash }
```

- **UTxO unspent** means the letter is active.
- **UTxO spent** means the letter was revoked.
- Only a transaction signed by the `issuer` key can spend it. This is enforced by the Aiken validator in [`contracts/validators/letter_registry.ak`](./contracts/validators/letter_registry.ak), with tests for the issuer, a stranger, an unsigned transaction and a missing datum.

The hash is also written to transaction metadata under label `7283`, so it can be read without decoding the datum:

```json
{ "7283": { "hash": "<64-char sha256 hex>", "v": 1 } }
```

Bulk issuing writes many letters in one transaction:

```json
{ "7283": { "hashes": ["<hash>", "<hash>"], "v": 2 } }
```

### What the verifier checks

`POST /api/verify` runs these checks in order and returns the first failure:

| Step | Check | If it fails |
|------|-------|-------------|
| 1 | A letter record exists (by ID or hash) | `not_found` |
| 2 | An uploaded PDF's hash matches the issued letter | `tampered` |
| 3 | The Cardano transaction exists | `not_found` |
| 4 | The hash on-chain equals the stored hash | `tampered` |
| 5 | The transaction was paid from the company's registered wallet | `tampered` |
| 6 | The letter is locked at the Robin contract | `tampered` |
| 7 | The contract UTxO has not been spent (not revoked) | `revoked` |
| 8 | All checks passed | `valid` |

A `valid` result also shows whether Robin has **verified the issuing company**. Letters from unverified companies can be valid on-chain but are shown with a warning.

---

## Features

### Public
- Verify by uploading a PDF or by scanning the letter's QR code
- Clear result: Valid, Revoked, Tampered or Not found, with the issuing company's verification status

### Companies (dashboard)
- **Issue Service Letter**: single letters, or **bulk issue** from an Excel template that generates all the PDFs, downloads them as a ZIP and records them in one transaction
- **Manage Formats**: create letter templates with placeholders such as `{{employee_name}}`, `{{nic}}`, `{{position}}`, `{{start_date}}`
- **Revoke Service Letter**: revoke on-chain using the letter ID or the full verification link
- **Assign Team**: add team members by Gmail; they can issue letters but cannot open Settings
- **Account Verification**: see Robin's verification status for the company
- **Account Settings**: primary account only; manage the secondary Gmail account and the connected wallet
- **Analytics**: employee history and letter overview

### Registrars
- Google sign-in
- Submit companies with an authorization letter, the company's Gmail and its BR
- Profile verification with NIC (individuals) or BR (businesses)
- Free plan limit of 5 submissions; Premium for unlimited

### Robin admins
- Review company applications and registrar verification
- Admin access is limited to emails listed in `ADMIN_EMAILS`
- Status changes are enforced on the server, so two admins cannot overwrite each other

### Accounts
One Google account has exactly one role: admin, company, or registrar. Each role has its own portal.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui |
| Database, auth, storage | Supabase (Google sign-in) |
| Blockchain | Cardano (Preprod testnet) |
| Smart contract | Aiken (Plutus v3) |
| Wallet and transactions | Lace (CIP-30), MeshJS |
| Chain data | Blockfrost |
| PDFs and QR codes | pdf-lib, qrcode |
| Bulk import | xlsx, jszip |

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- A [Supabase](https://supabase.com) project with the Google auth provider enabled
- A [Blockfrost](https://blockfrost.io) project on the **Preprod** network
- The [Lace](https://www.lace.io) browser wallet, set to Preprod, with test ADA from the [faucet](https://docs.cardano.org/cardano-testnets/tools/faucet)
- [Aiken](https://aiken-lang.org) v1.1.24 (only if you change the contract)

### Install and run

```bash
git clone https://github.com/Areca-Fountain/robin.git
cd robin
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key (browser) |
| `NEXT_PUBLIC_BLOCKFROST_KEY` | Public | Blockfrost Preprod key, used by the browser to build transactions |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Supabase service-role key |
| `BLOCKFROST_KEY` | **Server only** | Blockfrost Preprod key for server-side chain reads |
| `BLOCKFROST_URL` | Server only | Optional. Defaults to `https://cardano-preprod.blockfrost.io/api/v0` |
| `ADMIN_EMAILS` | **Server only** | Comma-separated emails of Robin admins |

Never commit `.env.local`, and never expose the service-role key to client code. The public Blockfrost key is visible in the browser, so use a Preprod project only.

### Supabase setup

- **Tables:** `company_applications`, `company_members`, `registrar_profiles`, `letters`, `letter_formats`
- **Storage buckets:** `company-documents` and `company-docs` (both are currently used, see Known issues)
- **Auth:** Google provider enabled; add your app URL to the allowed redirect URLs

The `letters` table needs at least: `id` (uuid), `company_id`, `company_name`, `employee_name`, `position`, `issued_at`, `letter_hash`, `tx_hash`, `issuer_address`, `revoked`.

### Smart contract

The compiled contract (`contracts/plutus.json`) is committed, so you only need Aiken if you change the validator.

```bash
cd contracts
aiken check    # run the validator tests
aiken build    # regenerates plutus.json
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | Lint with ESLint |

---

## Project structure

```
app/
  page.tsx                  Landing page
  login/                    Company login
  verify/                   Public verification (upload + QR landing)
  register-company/         Company registration with Lace wallet
  registrar/                Registrar portal
  manage-applications/      Admin portal
  dashboard/                Company dashboard
    issue/  formats/  revoke/  team/  settings/  verification/
  api/                      Server routes
    verify/  issue/  formats/  team/  letters/utxo/
    company/wallet/  dashboard/me/  auth/  admin/
components/
  auth/                     Role gate and account hook
  dashboard/                Bulk issue, wallet setup, company provider
  providers/                MeshJS wallet provider
  ui/                       shadcn/ui components
  VerifyResult.tsx          Result card
lib/
  letter-tx.ts              Build, sign and send issue/revoke transactions (browser)
  letter-pdf.ts             Generate the letter PDF and QR code (browser)
  letter-format.ts          Letter formats and placeholders
  hash.ts                   Browser-side SHA-256
  contract.ts               Loads the Aiken validator, builds the datum
  cardano.ts                Blockfrost reads (server)
  letter-chain.ts           Registry UTxO state (server)
  auth-server.ts            Roles and access checks (server)
  wallet-key.ts             Matches wallet addresses by stake key
  supabase.ts               Browser Supabase client
  supabase-admin.ts         Server-only Supabase client
contracts/
  validators/letter_registry.ak   On-chain registry and revocation
  plutus.json                     Compiled contract
```

---

## Roadmap

- **Privacy with Midnight:** let a verifier confirm facts such as "worked here between these dates" without seeing the whole letter (NIC, salary and so on). This is a direction we want to explore, not part of the current build.
- Real payment handling for the Registrar Premium plan
- Verification API keys for agencies and embassies
- Mainnet deployment after audit

---

## Known issues

- Registrar uploads go to the `company-docs` bucket while company registration uses `company-documents`. Create both, or unify them.
- Everything runs on the **Cardano Preprod testnet** only. No real funds are involved.

---

## License

Apache License 2.0. See [LICENSE](./LICENSE).