import { assertEmailFreeForCompany, errorResponse } from "@/lib/auth-server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/check-email   (public: the company form is filled in before sign-in)
 * Body: { email }
 * Says whether this email may be used as a company login. Emails that already
 * belong to a registrar or an admin can't be, because one account has one role.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_REGEX.test(email) || email.length > 200) {
      return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }
    await assertEmailFreeForCompany(email);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 409) {
      return Response.json({ ok: false, error: err.message }, { status: 409 });
    }
    return errorResponse(err, "Could not check that email.");
  }
}