import { authenticate, resolveAccount, errorResponse, AuthError } from "@/lib/auth-server";
import { registrarOwnsDocument, signDocument } from "@/lib/documents-server";

/**
 * POST /api/documents/sign   (needs the Google login token)
 * Body: { ref: string }   (the value stored in the database: a path, or an old public URL)
 * Returns { url } valid for 2 minutes.
 *
 *  - Robin admins can open any document.
 *  - Registrars can only open documents they uploaded or submitted.
 *  - Everyone else is refused.
 */
export async function POST(req: Request) {
  try {
    const account = await resolveAccount(await authenticate(req));
    const body = await req.json().catch(() => ({}));
    const ref = typeof body.ref === "string" ? body.ref.trim() : "";
    if (!ref) return Response.json({ error: "Missing document." }, { status: 400 });

    if (account.role === "registrar") {
      if (!(await registrarOwnsDocument(account.user.id, ref))) {
        throw new AuthError("You can only open your own documents.", 403, "registrar");
      }
    } else if (account.role !== "admin") {
      throw new AuthError("You are not allowed to open documents.", 403, account.role);
    }

    const url = await signDocument(ref, 120);
    if (!url) {
      return Response.json({ error: "That document could not be found." }, { status: 404 });
    }
    return Response.json({ url });
  } catch (err) {
    return errorResponse(err, "Could not open the document.");
  }
}