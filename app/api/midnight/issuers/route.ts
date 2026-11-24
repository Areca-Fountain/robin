import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  AuthError,
  errorResponse,
  requireAdmin,
  requireCompany,
} from "@/lib/auth-server";

const HEX64 = /^[0-9a-f]{64}$/i;

const COLUMNS =
  "company_id, issuer_id, midnight_address, registered_tx, status, updated_at";

/**
 * GET /api/midnight/issuers?companyId=...
 * Admin: any company. Company account: only its own company.
 */
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId")?.trim();
    if (!companyId) return Response.json({ error: "Missing companyId" }, { status: 400 });

    let isAdmin = false;
    try {
      await requireAdmin(req);
      isAdmin = true;
    } catch (e) {
      if (!(e instanceof AuthError) || e.status === 401) throw e;
    }
    if (!isAdmin) {
      const company = await requireCompany(req);
      if (company.companyId !== companyId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data, error } = await getSupabaseAdmin()
      .from("mn_issuers")
      .select(COLUMNS)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;

    return Response.json({ issuer: data ?? null });
  } catch (err) {
    return errorResponse(err, "Could not load the issuer.");
  }
}

/**
 * POST /api/midnight/issuers
 *  - action "enroll"          (company): saves its issuerId as `pending`
 *  - action "confirm_onchain" (admin):   marks it `registered` after registerIssuer succeeded
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, companyId, issuerId, midnightAddress, registeredTx } = body as {
      action?: "enroll" | "confirm_onchain";
      companyId?: string;
      issuerId?: string;
      midnightAddress?: string;
      registeredTx?: string;
    };

    const supabase = getSupabaseAdmin();

    if (action === "enroll") {
      const company = await requireCompany(req);
      if (companyId && companyId !== company.companyId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!issuerId || !HEX64.test(issuerId)) {
        return Response.json({ error: "Invalid 64-hex issuerId" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("mn_issuers")
        .upsert(
          {
            company_id: company.companyId,
            issuer_id: issuerId.toLowerCase(),
            midnight_address: midnightAddress || null,
            status: "pending",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" }
        )
        .select(COLUMNS)
        .single();
      if (error) throw error;

      return Response.json({ issuer: data });
    }

    if (action === "confirm_onchain") {
      await requireAdmin(req);
      if (!companyId) {
        return Response.json({ error: "companyId is required" }, { status: 400 });
      }
      if (!registeredTx) {
        return Response.json({ error: "registeredTx is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("mn_issuers")
        .update({
          registered_tx: registeredTx,
          status: "registered",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return Response.json(
          { error: "No pending issuer found for that company. The company must enroll first." },
          { status: 404 }
        );
      }

      return Response.json({ issuer: data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "Could not save the issuer.");
  }
}