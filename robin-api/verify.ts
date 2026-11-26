import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getLetterOnChain } from "@/lib/cardano";
import { getLetterScriptState } from "@/lib/letter-chain";

export type VerifyStatus = "valid" | "revoked" | "tampered" | "not_found";

export interface VerifyResult {
  status: VerifyStatus;
  message: string;
  letter?: {
    companyName: string;
    employeeName: string;
    position: string | null;
    issuedAt: string;
    companyVerified: boolean;
  };
  txHash?: string;
}

/**
 * Same checks as the public /api/verify route, as a plain function.
 * Pass the letter id, the SHA-256 hash of a PDF, or both.
 */
export async function verifyLetter(input: {
  letterId?: string;
  hash?: string;
}): Promise<VerifyResult> {
  const { letterId, hash } = input;
  const supabase = getSupabaseAdmin();

  const query = supabase.from("letters").select("*");
  const { data: row, error } = letterId
    ? await query.eq("id", letterId).maybeSingle()
    : await query.eq("letter_hash", hash!).maybeSingle();
  if (error) throw error;

  if (!row) {
    return {
      status: "not_found",
      message:
        "No record of this document. It was not issued through Robin, or it has been changed since it was issued.",
    };
  }

  let companyVerified = false;
  if (row.company_id) {
    const { data: company } = await supabase
      .from("company_applications")
      .select("status")
      .eq("id", row.company_id)
      .maybeSingle();
    companyVerified = company?.status === "Verified";
  }

  const letter = {
    companyName: row.company_name as string,
    employeeName: row.employee_name as string,
    position: (row.position as string | null) ?? null,
    issuedAt: row.issued_at as string,
    companyVerified,
  };
  const txHash = row.tx_hash as string;

  // If a hash was sent together with a letterId, the file must match the record
  if (hash && hash !== row.letter_hash) {
    return {
      status: "tampered",
      message: "This file does not match the letter that was issued. It may have been edited.",
      letter,
      txHash,
    };
  }

  const onChain = await getLetterOnChain(txHash);
  if (!onChain) {
    return {
      status: "not_found",
      message:
        "The record exists, but its Cardano transaction could not be found. If it was just issued, wait a minute and try again.",
      letter,
      txHash,
    };
  }

  // Batch (bulk) transactions hold several hashes, so check all of them
  if (!onChain.hashes.includes(row.letter_hash as string)) {
    return {
      status: "tampered",
      message: "The hash on the blockchain does not match this letter. Do not trust it.",
      letter,
      txHash,
    };
  }

  if (
    !onChain.issuerAddress ||
    !row.issuer_address ||
    onChain.issuerAddress !== row.issuer_address
  ) {
    return {
      status: "tampered",
      message: "The blockchain record was signed by a different wallet than the issuing company's.",
      letter,
      txHash,
    };
  }

  const scriptState = await getLetterScriptState(txHash);
  if (!scriptState) {
    return {
      status: "tampered",
      message:
        "This letter was not registered in the Robin contract, so it cannot be trusted.",
      letter,
      txHash,
    };
  }
  if (scriptState.spentBy || row.revoked_at || row.revoked) {
    return {
      status: "revoked",
      message: `${letter.companyName} has revoked this letter. It is no longer valid.`,
      letter,
      txHash,
    };
  }

  return {
    status: "valid",
    message: companyVerified
      ? `This letter was issued by ${letter.companyName}, a verified company, and recorded on Cardano.`
      : `This letter was recorded on Cardano by ${letter.companyName}, but Robin has not verified this company yet. Treat it with care.`,
    letter,
    txHash,
  };
}
