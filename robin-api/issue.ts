import "server-only";

import { createHash } from "crypto";
import { BlockfrostProvider, MeshTxBuilder } from "@meshsdk/core";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ApiError, type ApiContext } from "@/robin-api/auth";
import { buildLetterDatum, getLetterScriptAddress } from "@/lib/contract";
import { METADATA_LABEL } from "@/lib/cardano";
import { generateLetterPdf } from "@/lib/letter-pdf";
import { formatDateOnly, renderTemplate, todayIso } from "@/lib/letter-format";
import { signDocument } from "@/lib/documents-server";
import { walletKey } from "@/lib/wallet-key";

export const FREE_LETTER_LIMIT = 5;
/** Must match LETTER_LOCK_LOVELACE in lib/letter-tx.ts */
const LETTER_LOCK_LOVELACE = "2000000";
/** How long a company has to sign and submit a prepared transaction */
export const DRAFT_MINUTES = 30;

export const TX_HASH_REGEX = /^[a-f0-9]{64}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface IssueInput {
  formatId: string;
  employeeName: string;
  position: string;
  nic: string;
  startDate: string;
  endDate: string;
  stillEmployed: boolean;
  changeAddress: string;
  letterheadId: string;
}

/** Checks the request body of POST /api/v1/letters */
export function parseIssueInput(body: Record<string, unknown>, uuid: RegExp): IssueInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const bad = (m: string) => new ApiError("invalid_request", m, 400);

  const input: IssueInput = {
    formatId: str(body.formatId),
    employeeName: str(body.employeeName),
    position: str(body.position),
    nic: str(body.nic),
    startDate: str(body.startDate),
    endDate: str(body.endDate),
    stillEmployed: body.stillEmployed === true,
    changeAddress: str(body.changeAddress),
    letterheadId: str(body.letterheadId),
  };

  if (!uuid.test(input.formatId)) throw bad("formatId must be the UUID of one of your letter formats.");
  if (!input.employeeName || input.employeeName.length > 120) throw bad("employeeName is required (max 120 characters).");
  if (input.position.length > 120) throw bad("position is too long (max 120 characters).");
  if (input.nic.length > 40) throw bad("nic is too long (max 40 characters).");
  if (!DATE_REGEX.test(input.startDate)) throw bad("startDate is required, as yyyy-mm-dd.");
  if (!input.stillEmployed) {
    if (!DATE_REGEX.test(input.endDate)) throw bad("endDate (yyyy-mm-dd) is required unless stillEmployed is true.");
    if (input.endDate < input.startDate) throw bad("endDate cannot be before startDate.");
  }
  if (!input.changeAddress) throw bad("changeAddress is required: the address of your company's Cardano wallet (addr_test1...).");
  if (input.letterheadId.length > 80) throw bad("letterheadId is not valid.");
  return input;
}

/** Free plan: max 5 letters. Premium: unlimited. Same rule as /api/issue. */
export async function assertWithinPlan(companyId: string) {
  const supabase = getSupabaseAdmin();
  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from("company_applications").select("subscription_plan").eq("id", companyId).maybeSingle(),
    supabase.from("letters").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  const plan = sub?.subscription_plan === "Premium" ? "Premium" : "Free";
  if (plan === "Free" && (count ?? 0) >= FREE_LETTER_LIMIT) {
    throw new ApiError(
      "plan_limit_reached",
      "Free plan limit reached (5 service letters). Upgrade to Premium for unlimited letters.",
      403
    );
  }
}

async function loadLetterheadBytes(companyId: string, letterheadId: string): Promise<Uint8Array | null> {
  const { data } = await getSupabaseAdmin()
    .from("company_applications")
    .select("letterheads")
    .eq("id", companyId)
    .maybeSingle();
  const list = Array.isArray(data?.letterheads) ? (data.letterheads as { id?: string; path?: string }[]) : [];
  const chosen = letterheadId ? list.find((l) => l.id === letterheadId) : list[0];
  if (letterheadId && !chosen) {
    throw new ApiError("invalid_request", "That letterheadId does not belong to your company.", 400);
  }
  if (!chosen?.path) return null;
  try {
    const url = await signDocument(chosen.path);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface PreparedLetter {
  letterId: string;
  letterHash: string;
  verifyUrl: string;
  pdfBase64: string;
  unsignedTx: string;
  expiresAt: string;
}

/** Makes the PDF, hashes it, builds the UNSIGNED transaction, and saves a draft. */
export async function prepareLetter(
  ctx: ApiContext,
  input: IssueInput,
  origin: string
): Promise<PreparedLetter> {
  const supabase = getSupabaseAdmin();

  if (!ctx.walletAddress) {
    throw new ApiError("wallet_missing", "Your company has no wallet on file. Contact Robin support.", 400);
  }
  const given = walletKey(input.changeAddress);
  const registered = walletKey(ctx.walletAddress);
  if (!given) {
    throw new ApiError("invalid_request", "changeAddress is not a valid Cardano address.", 400);
  }
  if (!registered || given !== registered) {
    throw new ApiError(
      "wallet_mismatch",
      "changeAddress is not your company's registered wallet. Use the wallet you registered with.",
      403
    );
  }

  await assertWithinPlan(ctx.companyId);

  const { data: format, error: formatError } = await supabase
    .from("letter_formats")
    .select("id, body, signer_name, signer_title")
    .eq("id", input.formatId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (formatError) throw formatError;
  if (!format) {
    throw new ApiError("format_not_found", "That format does not belong to your company.", 404);
  }

  // 1. The PDF. Hash these exact bytes, and give the employee these exact bytes.
  const letterId = crypto.randomUUID();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, "");
  const verifyUrl = `${baseUrl}/verify/${letterId}`;
  const letterheadPdfBytes = await loadLetterheadBytes(ctx.companyId, input.letterheadId);

  const pdfBytes = await generateLetterPdf({
    letterId,
    companyName: ctx.companyName,
    employeeName: input.employeeName,
    body: renderTemplate(format.body as string, {
      company_name: ctx.companyName,
      employee_name: input.employeeName,
      nic: input.nic,
      position: input.position,
      start_date: formatDateOnly(input.startDate),
      end_date: input.stillEmployed ? "date" : formatDateOnly(input.endDate),
      issue_date: formatDateOnly(todayIso()),
    }),
    signerName: format.signer_name as string,
    signerTitle: format.signer_title as string,
    issueDate: todayIso(),
    verifyUrl,
    letterheadPdfBytes,
  });
  const letterHash = createHash("sha256").update(Buffer.from(pdfBytes)).digest("hex");

  // 2. The unsigned transaction (same shape as issueLetterOnChain in lib/letter-tx.ts)
  const blockfrostKey = process.env.BLOCKFROST_KEY;
  if (!blockfrostKey) throw new Error("Missing BLOCKFROST_KEY environment variable");
  const provider = new BlockfrostProvider(blockfrostKey);

  let utxos;
  try {
    utxos = await provider.fetchAddressUTxOs(input.changeAddress);
  } catch (err) {
    console.error("Blockfrost UTxO error:", err);
    throw new ApiError("chain_unavailable", "Could not read your wallet from the blockchain. Try again in a moment.", 502);
  }
  if (!utxos.length) {
    throw new ApiError("wallet_empty", "Your company wallet has no funds. Get test ADA from the Preprod faucet.", 400);
  }

  const txBuilder = new MeshTxBuilder({ fetcher: provider });
  txBuilder.setNetwork("preprod");
  const unsignedTx = await txBuilder
    .txOut(getLetterScriptAddress(), [{ unit: "lovelace", quantity: LETTER_LOCK_LOVELACE }])
    .txOutInlineDatumValue(buildLetterDatum(letterHash, input.changeAddress))
    .metadataValue(METADATA_LABEL, { hash: letterHash, v: 1 })
    .changeAddress(input.changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  // 3. Remember what was prepared, so confirmation never trusts the caller's data
  const expiresAt = new Date(Date.now() + DRAFT_MINUTES * 60_000).toISOString();
  const { error: draftError } = await supabase.from("letter_drafts").insert({
    id: letterId,
    company_id: ctx.companyId,
    key_id: ctx.keyId,
    letter_hash: letterHash,
    employee_name: input.employeeName,
    position: input.position || null,
    work_status: input.stillEmployed ? "active" : "resigned",
    format_id: format.id,
    issuer_address: input.changeAddress,
    verify_url: verifyUrl,
    expires_at: expiresAt,
  });
  if (draftError) throw draftError;

  return {
    letterId,
    letterHash,
    verifyUrl,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    unsignedTx,
    expiresAt,
  };
}
