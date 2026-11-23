import { authenticate, resolveAccount, requireCompany, errorResponse, AuthError } from "@/lib/auth-server";
import { registrarOwnsDocument, signDocument, parseDocRef, DOCUMENT_BUCKET } from "@/lib/documents-server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ref = typeof body.ref === "string" ? body.ref.trim() : "";
    if (!ref) return Response.json({ error: "Missing document." }, { status: 400 });

    const parsed = parseDocRef(ref);
    if (parsed && parsed.bucket === DOCUMENT_BUCKET && parsed.path.startsWith("company/")) {
      const ctx = await requireCompany(req);
      if (!parsed.path.startsWith(`company/${ctx.companyId}/letterheads/`)) {
        throw new AuthError("You can only open your own company's letterhead.", 403, "company");
      }
      const url = await signDocument(ref, 120);
      if (!url) return Response.json({ error: "That letterhead could not be found." }, { status: 404 });
      return Response.json({ url });
    }

    const account = await resolveAccount(await authenticate(req));

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