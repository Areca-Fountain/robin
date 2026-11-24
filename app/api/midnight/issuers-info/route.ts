import { NextRequest, connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { errorResponse } from "@/lib/auth-server";

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * GET /api/midnight/issuer-info?issuerId=<64 hex>   (public)
 * Turns the issuer id found in an on-chain proof into the company's name and
 * its Robin verification status (Verified / Not verified), for the verifier's screen.
 */
export async function GET(req: NextRequest) {
  await connection(); // read per request, never prerendered at build time
  try {
    const issuerId = (req.nextUrl.searchParams.get("issuerId") ?? "").trim().toLowerCase();
    if (!HEX64.test(issuerId)) {
      return Response.json({ error: "issuerId must be 64 hex characters." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: issuer, error } = await supabase
      .from("mn_issuers")
      .select("company_id, status")
      .eq("issuer_id", issuerId)
      .maybeSingle();
    if (error) throw error;
    if (!issuer) return Response.json({ found: false });

    const { data: company, error: companyError } = await supabase
      .from("company_applications")
      .select("company_name, status")
      .eq("id", issuer.company_id)
      .maybeSingle();
    if (companyError) throw companyError;

    return Response.json({
      found: true,
      companyName: company?.company_name ?? null,
      verified: company?.status === "Verified",
    });
  } catch (err) {
    return errorResponse(err, "Could not look up the issuer.");
  }
}