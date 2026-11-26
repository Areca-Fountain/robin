import { requireApiKey, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { LETTER_COLUMNS, toApiLetter, UUID_REGEX } from "@/robin-api/letters";

/**
 * GET /api/v1/letters/{id}
 * Returns one letter, only if it belongs to the company that owns the API key.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:read");
    const url = new URL(req.url);
    const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");

    if (!UUID_REGEX.test(id)) {
      throw new ApiError("invalid_request", "The letter id must be a UUID.", 400);
    }

    const { data, error } = await getSupabaseAdmin()
      .from("letters")
      .select(LETTER_COLUMNS)
      .eq("id", id)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ApiError("letter_not_found", "No letter with this id was found for your company.", 404);
    }

    return Response.json(toApiLetter(data as unknown as Record<string, unknown>, url.origin));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
