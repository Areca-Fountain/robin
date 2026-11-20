# Robin

**Tamper-proof service letters, verified on Cardano.**

Robin lets companies issue employment and service letters whose fingerprint is recorded on the Cardano blockchain. Anyone can later check a letter in seconds by scanning its QR code or uploading the PDF. Built for **UniHack 2026**.

> Fake experience letters are easy to produce and hard to catch. Robin makes them easy to catch: a letter is valid only if its hash is on-chain, signed by the issuing company's registered wallet, and not revoked.

---

## How it works

1. **A company registers.** It submits its business registration (BR/ROC) and connects its Lace wallet. Registrars can also submit companies on a company's behalf (see below).
2. **Admins review.** The Robin team checks the documents and approves the company.
3. **The company issues a letter.** The PDF is hashed with SHA-256 and the hash is written to a Cardano transaction under metadata label `7283`:
   ```json
   { "7283": { "hash": "<64-char sha256 hex>", "v": 1 } }
   ```
   The letter's details and transaction hash are also stored in Supabase.
4. **Anyone verifies.** They open the letter's QR link (`/verify/<letterId>`) or upload the PDF at `/verify`. The PDF is hashed **in the browser**, so the file never leaves the user's device. Only the hash is sent to the server.

### What the verifier checks

For each request, `POST /api/verify` runs these checks in order and returns the first failure:

| Step | Check | Result if it fails |
|------|-------|--------------------|
| 1 | A letter record exists in Supabase (by ID or hash) | `not_found` |
| 2 | An uploaded PDF's hash matches the issued letter | `tampered` |
| 3 | The Cardano transaction exists | `not_found` |
| 4 | The hash on-chain equals the stored hash | `tampered` |
| 5 | The transaction was paid from the company's registered wallet | `tampered` |
| 6 | The letter has not been revoked | `revoked` |
| 7 | All checks passed | `valid` |

---

## Pages

| Route | Who it's for | What it does |
|-------|--------------|--------------|
| `/` | Everyone | Landing page and portal entry points |
| `/verify` | Public | Upload a PDF to verify it |
| `/verify/[letterID]` | Public | QR-code landing page; verifies automatically, with an optional PDF check |
| `/register-company` | Businesses | Register a company: upload BR/ROC and connect a Lace wallet |
| `/registrar` | Registrars | Sign in with Google, submit companies for others, manage KYC and subscription |
| `/manage-applications` | Robin admins | Review company submissions and registrar KYC |
| `POST /api/verify` | Clients | Verification API (`{ letterId?, hash? }`) |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui |
| Database, auth, storage | Supabase |
| Blockchain | Cardano (Preprod testnet) |
| Wallet and transactions | Lace (CIP-30), MeshJS |
| Chain data | Blockfrost |

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- A [Supabase](https://supabase.com) project
- A [Blockfrost](https://blockfrost.io) project on the **Preprod** network
- The [Lace](https://www.lace.io) browser wallet, set to Preprod, with test ADA from the faucet

### Install and run

```bash
git clone https://github.com/CoinCeylon/Robin.git
cd Robin
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key, used in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Supabase service-role key, used by `/api/verify` |
| `BLOCKFROST_KEY` | **Server only** | Blockfrost project ID for Preprod |
| `BLOCKFROST_URL` | Server only | Optional. Defaults to `https://cardano-preprod.blockfrost.io/api/v0` |

Never commit `.env.local`, and never expose the service-role key or Blockfrost key to client code. `.env*` files are already git-ignored, except `.env.example`.

### Supabase setup

The app expects:

- **Tables:** `company_applications`, `registrar_profiles`, `letters`
- **Storage buckets:** `company-documents` and `company-docs` (both are currently used; see Known issues)
- **Auth:** the Google provider enabled, for registrar sign-in

The `letters` table needs at least these columns, which `/api/verify` reads: `id` (uuid), `company_name`, `employee_name`, `position`, `issued_at`, `letter_hash`, `tx_hash`, `issuer_address`, `revoked`.

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
  verify/                   Public verification (upload + QR landing)
  register-company/         Company registration with Lace wallet
  registrar/                Registrar dashboard
  manage-applications/      Admin dashboard
  api/verify/route.ts       Verification API
components/
  VerifyResult.tsx          Result card (valid / revoked / tampered / not found)
  providers/                MeshJS wallet provider
  ui/                       shadcn/ui components
lib/
  cardano.ts                Blockfrost reads, metadata label
  hash.ts                   Browser-side SHA-256
  supabase.ts               Browser Supabase client (anon key)
  supabase-admin.ts         Server-only Supabase client (service role)
```

---

## Known issues

- The landing page links to `/company` (Company Dashboard), but that page isn't in the repo yet.
- The letter **issuing** flow (hash, write to Cardano, save to `letters`) isn't in this repo yet. Verification is complete, and issuing must use metadata label `7283` to be recognized.
- Registrar uploads go to the `company-docs` bucket while company registration uses `company-documents`. Create both, or unify them.
- Cardano interactions run on the **Preprod testnet** only. Nothing here uses real funds.

---

## License

Apache License 2.0. See [LICENSE](./LICENSE).