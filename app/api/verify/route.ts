import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getLetterOnChain } from "@/lib/cardano";
import { isValidHash } from "@/lib/hash";
import type { VerifyResponse } from "@/components/VerifyResult";


const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: VerifyResponse, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/verify
 * Body: { letterId?: string, hash?: string }
 *  - letterId: from the QR link (/verify/[letterID])
 *  - hash: SHA-256 of an uploaded PDF (computed in the browser)
 * You can send both: the API then also checks that the PDF matches the letter.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const letterId =
      typeof body.letterId === "string" ? body.letterId.trim() : undefined;
    const hash =
      typeof body.hash === "string" ? body.hash.trim().toLowerCase() : undefined;

    if (!letterId && !hash) {
      return NextResponse.json(
        { error: "Send a letterId or a hash." },
        { status: 400 }
      );
    }
    if (hash && !isValidHash(hash)) {
      return NextResponse.json(
        { error: "hash must be a 64-character SHA-256 hex string." },
        { status: 400 }
      );
    }

    const notFound = (message: string) =>
      reply({ status: "not_found", message });

    // 1. Find the letter record in Supabase
    if (letterId && !UUID_REGEX.test(letterId)) {
      return notFound("This verification link is not valid.");
    }

    const supabase = getSupabaseAdmin();
    const query = supabase.from("letters").select("*");
    const { data: row, error } = letterId
      ? await query.eq("id", letterId).maybeSingle()
      : await query.eq("letter_hash", hash!).maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Could not look up the letter." },
        { status: 500 }
      );
    }
    if (!row) {
      return notFound(
        "No record of this document. It was not issued through Robin, or it has been changed since it was issued."
      );
    }

    // Is the issuing company verified by Robin's team?
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
      position: row.position as string | null,
      issuedAt: row.issued_at as string,
      companyVerified,
    };
    const txHash = row.tx_hash as string;

    // 2. If a PDF was uploaded together with a letterId, it must match the record
    if (hash && hash !== row.letter_hash) {
      return reply({
        status: "tampered",
        message:
          "This file does not match the letter that was issued. It may have been edited.",
        letter,
        txHash,
      });
    }

    // 3. Read the transaction from Cardano
    const onChain = await getLetterOnChain(txHash);
    if (!onChain) {
      return reply({
        status: "not_found",
        message:
          "The record exists, but its Cardano transaction could not be found. If it was just issued, wait a minute and try again.",
        letter,
        txHash,
      });
    }

    // 4. The on-chain hash must equal the stored hash
    if (onChain.hash !== row.letter_hash) {
      return reply({
        status: "tampered",
        message:
          "The hash on the blockchain does not match this letter. Do not trust it.",
        letter,
        txHash,
      });
    }

    // 5. The transaction must come from the wallet registered for the issuing company
    if (
      onChain.issuerAddress &&
      row.issuer_address &&
      onChain.issuerAddress !== row.issuer_address
    ) {
      return reply({
        status: "tampered",
        message:
          "The blockchain record was signed by a different wallet than the issuing company's.",
        letter,
        txHash,
      });
    }

    // 6. Revoked?
    if (row.revoked) {
      return reply({
        status: "revoked",
        message: `${letter.companyName} has revoked this letter. It is no longer valid.`,
        letter,
        txHash,
      });
    }

    // 7. All checks passed
    return reply({
      status: "valid",
      message: companyVerified
        ? `This letter was issued by ${letter.companyName}, a verified company, and recorded on Cardano.`
        : `This letter was recorded on Cardano by ${letter.companyName}, but Robin has not verified this company yet. Treat it with care.`,
      letter,
      txHash,
    });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}