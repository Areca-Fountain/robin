import { requireApiKey, requireVerifiedCompany, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { UUID_REGEX } from "@/robin-api/letters";
import { parseIssueInput, prepareLetter, DRAFT_MINUTES } from "@/robin-api/issue";

/**
 * POST /api/v1/letters
 * Step 1 of issuing. Robin makes the PDF, hashes it and returns an UNSIGNED Cardano
 * transaction. The company signs it with its own wallet key, submits it, then calls
 * POST /api/v1/letters/{letterId}/confirm with the transaction hash.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:write");
    requireVerifiedCompany(ctx);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("invalid_request", "Send a JSON body.", 400);
    }

    const input = parseIssueInput(body as Record<string, unknown>, UUID_REGEX);
    const prepared = await prepareLetter(ctx, input, new URL(req.url).origin);

    return Response.json(
      {
        status: "awaiting_signature",
        ...prepared,
        message: `Sign unsignedTx with your company wallet, submit it, then POST { "txHash": "..." } to /api/v1/letters/${prepared.letterId}/confirm within ${DRAFT_MINUTES} minutes. Keep pdfBase64: it is the only copy of the exact file whose hash goes on the blockchain.`,
      },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
