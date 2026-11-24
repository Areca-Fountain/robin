import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { errorResponse } from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const CLAIMS = ["employment", "tenure", "position"] as const;
type Claim = (typeof CLAIMS)[number];

const COLUMNS = "id, nonce, claim, min_days, position_hash, status, expires_at";

/**
 * POST /api/midnight/verify-requests   (public: a verifier needs no account)
 * Body: { claim: "employment" | "tenure" | "position", minDays?: number, positionHash?: string }
 * Creates a one-time request. The random nonce is what the employee's proof answers on-chain.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bad = (error: string) => Response.json({ error }, { status: 400 });

    const claim = body.claim as Claim;
    if (!CLAIMS.includes(claim)) return bad("Invalid claim.");

    let minDays: number | null = null;
    let positionHash: string | null = null;

    if (claim === "tenure") {
      minDays = Number(body.minDays);
      if (!Number.isInteger(minDays) || minDays < 1 || minDays > 20000) {
        return bad("minDays must be a whole number between 1 and 20000.");
      }
    }
    if (claim === "position") {
      positionHash = typeof body.positionHash === "string" ? body.positionHash.toLowerCase() : "";
      if (!HEX64.test(positionHash)) return bad("positionHash must be 64 hex characters.");
    }

    const nonce = randomBytes(32).toString("hex");
    const { data, error } = await getSupabaseAdmin()
      .from("mn_verify_requests")
      .insert({ nonce, claim, min_days: minDays, position_hash: positionHash })
      .select(COLUMNS)
      .single();
    if (error) throw error;

    return Response.json({ request: data });
  } catch (err) {
    return errorResponse(err, "Could not create the verification request.");
  }
}

/** GET /api/midnight/verify-requests?id=<uuid>  (public: the employee opens this from the link) */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!UUID_REGEX.test(id)) return Response.json({ error: "Invalid request id." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin()
      .from("mn_verify_requests")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Request not found." }, { status: 404 });
    if (new Date(data.expires_at).getTime() < Date.now()) {
      return Response.json({ error: "This request has expired. Ask the verifier for a new link." }, { status: 410 });
    }

    return Response.json({ request: data });
  } catch (err) {
    return errorResponse(err, "Could not load the verification request.");
  }
}