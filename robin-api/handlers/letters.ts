import { requireApiKey, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LETTER_COLUMNS, toApiLetter } from "@/robin-api/letters";

/**
 * GET /api/v1/letters?limit=20&page=1&status=active|revoked
 * Lists the letters issued by the company that owns the API key, newest first.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:read");
    const url = new URL(req.url);

    const limitRaw = url.searchParams.get("limit");
    const pageRaw = url.searchParams.get("page");
    const status = url.searchParams.get("status");

    const limit = limitRaw === null ? 20 : Number(limitRaw);
    const page = pageRaw === null ? 1 : Number(pageRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ApiError("invalid_request", "limit must be a whole number from 1 to 100.", 400);
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new ApiError("invalid_request", "page must be a whole number, 1 or higher.", 400);
    }
    if (status !== null && status !== "active" && status !== "revoked") {
      throw new ApiError("invalid_request", 'status must be "active" or "revoked".', 400);
    }

    const from = (page - 1) * limit;
    let query = getSupabaseAdmin()
      .from("letters")
      .select(LETTER_COLUMNS, { count: "exact" })
      .eq("company_id", ctx.companyId);
    if (status === "active") query = query.is("revoked_at", null);
    if (status === "revoked") query = query.not("revoked_at", "is", null);

    const { data, count, error } = await query
      .order("issued_at", { ascending: false })
      .range(from, from + limit - 1);
    if (error) throw error;

    const total = count ?? 0;
    return Response.json({
      data: (data ?? []).map((r) => toApiLetter(r as unknown as Record<string, unknown>, url.origin)),
      page,
      limit,
      total,
      hasMore: from + (data?.length ?? 0) < total,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
