import { requireApiKey, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { UUID_REGEX } from "@/robin-api/letters";
import { prepareRevoke } from "@/robin-api/revoke";

/**
 * POST /api/v1/letters/{id}/revoke      Body: { "changeAddress": "addr_test1..." }
 * Step 1 of revoking. Returns an UNSIGNED transaction. The company signs it with its own
 * wallet key (PARTIAL signing), submits it, then calls .../revoke/confirm.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:write");

    const parts = new URL(req.url).pathname.split("/").filter(Boolean); // api, v1, letters, {id}, revoke
    const letterId = decodeURIComponent(parts[parts.length - 2] ?? "");
    if (!UUID_REGEX.test(letterId)) {
      throw new ApiError("invalid_request", "The letter id must be a UUID.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const changeAddress = typeof body?.changeAddress === "string" ? body.changeAddress.trim() : "";
    if (!changeAddress) {
      throw new ApiError(
        "invalid_request",
        "changeAddress is required: the address of your company's Cardano wallet (addr_test1...).",
        400
      );
    }

    const { unsignedTx } = await prepareRevoke(ctx, letterId, changeAddress);
    return Response.json(
      {
        status: "awaiting_signature",
        letterId,
        unsignedTx,
        partialSign: true,
        message: `Sign unsignedTx with your company wallet using PARTIAL signing, submit it, then POST { "txHash": "..." } to /api/v1/letters/${letterId}/revoke/confirm.`,
      },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
