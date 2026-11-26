import { requireApiKey, apiErrorResponse } from "@/robin-api/auth";

/**
 * GET /api/v1/me
 * Header: Authorization: Bearer <api key>
 * Shows which company the key belongs to. Use it to test that your key works.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireApiKey(req);
    return Response.json({
      company: {
        id: ctx.companyId,
        name: ctx.companyName,
        status: ctx.status,
        verified: ctx.verified,
      },
      key: {
        id: ctx.keyId,
        name: ctx.keyName,
        scopes: ctx.scopes,
      },
      rateLimit: { perMinute: ctx.rateLimitPerMinute },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
