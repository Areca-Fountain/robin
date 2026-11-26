import { requireApiKey, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { UUID_REGEX } from "@/robin-api/letters";
import { verifyLetter } from "@/robin-api/verify";

const HASH_REGEX = /^[a-f0-9]{64}$/;

/**
 * POST /api/v1/verify
 * Body: { "letterId"?: string, "hash"?: string }
 *  - letterId: the id of a letter
 *  - hash: SHA-256 (64 hex characters) of a PDF
 * Send both to also check that the PDF matches the letter.
 * Always answers 200 with { status: "valid" | "revoked" | "tampered" | "not_found", ... }.
 */
export async function POST(req: Request) {
  try {
    await requireApiKey(req, "letters:read");

    const body = await req.json().catch(() => ({}));
    const letterId = typeof body.letterId === "string" ? body.letterId.trim() : undefined;
    const hash = typeof body.hash === "string" ? body.hash.trim().toLowerCase() : undefined;

    if (!letterId && !hash) {
      throw new ApiError("invalid_request", "Send a letterId or a hash.", 400);
    }
    if (hash && !HASH_REGEX.test(hash)) {
      throw new ApiError("invalid_request", "hash must be a 64-character SHA-256 hex string.", 400);
    }
    if (letterId && !UUID_REGEX.test(letterId)) {
      throw new ApiError("invalid_request", "letterId must be a UUID.", 400);
    }

    return Response.json(await verifyLetter({ letterId, hash }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
