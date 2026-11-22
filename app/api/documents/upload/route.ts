import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { authenticate, resolveAccount, errorResponse, AuthError } from "@/lib/auth-server";
import { DOCUMENT_BUCKET } from "@/lib/documents-server";

/**
 * POST /api/documents/upload   (multipart form: file + purpose)
 *
 * The ONLY way a document gets into storage. The bucket is private, so the
 * browser cannot upload or read directly any more.
 *
 *  - Company self-registration has no login yet, so purposes "br-docs" and
 *    "letters" are open to anyone (size, type and rate limited).
 *  - Registrar purposes ("auth-letters", "br-documents", "registrar-kyc") need a
 *    signed-in registrar. Their files are stored under registrar/<userId>/ so
 *    ownership is clear later.
 *
 * Returns { path }. Save that path in the database (not a URL).
 */

// Vercel rejects request bodies above ~4.5 MB, so stay under that
const MAX_BYTES = 4 * 1024 * 1024;

const PUBLIC_PURPOSES = new Set(["br-docs", "letters"]);
const REGISTRAR_PURPOSES = new Set(["auth-letters", "br-documents", "registrar-kyc"]);

/** Decides the real file type from the first bytes, not from the file name */
function sniff(bytes: Uint8Array): { ext: string; mime: string } | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return { ext: "pdf", mime: "application/pdf" }; // %PDF
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return { ext: "png", mime: "image/png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  return null;
}

// Best-effort limit for anonymous uploads: 10 files per 10 minutes per IP.
// (In-memory, so on serverless hosting it resets now and then. It is a speed bump, not a wall.)
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 10) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function POST(req: Request) {
  try {
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return bad("Could not read the upload.");
    }

    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "");
    if (!(file instanceof File)) return bad("Choose a file to upload.");
    if (file.size === 0) return bad("That file is empty.");
    if (file.size > MAX_BYTES) return bad("The file is too large. The limit is 4 MB.", 413);

    let prefix: string;
    if (PUBLIC_PURPOSES.has(purpose)) {
      const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
      if (tooMany(ip)) return bad("Too many uploads. Please wait a few minutes and try again.", 429);
      prefix = `public-intake/${purpose}`;
    } else if (REGISTRAR_PURPOSES.has(purpose)) {
      const account = await resolveAccount(await authenticate(req));
      if (account.role !== "registrar") {
        throw new AuthError("Only registrar accounts can upload these documents.", 403, account.role);
      }
      prefix = `registrar/${account.user.id}/${purpose}`;
    } else {
      return bad("Unknown upload type.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes);
    if (!type) return bad("Only PDF, PNG or JPG files are allowed.", 415);

    const path = `${prefix}/${crypto.randomUUID()}.${type.ext}`;
    const { error } = await getSupabaseAdmin()
      .storage.from(DOCUMENT_BUCKET)
      .upload(path, bytes, { contentType: type.mime, upsert: false });
    if (error) {
      console.error("Storage upload error:", error);
      return bad("Could not store the file. Please try again.", 500);
    }

    return Response.json({ path });
  } catch (err) {
    return errorResponse(err, "Upload failed. Please try again.");
  }
}