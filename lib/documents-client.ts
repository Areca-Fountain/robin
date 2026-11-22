// CLIENT-SIDE helpers for private documents.
// Uploading and opening documents both go through our API now, because the
// storage bucket is private.

import { supabase } from "@/lib/supabase";

/** Folder names the upload route accepts */
export type UploadPurpose =
  | "br-docs" // company self-registration: BR / ROC
  | "letters" // company self-registration: authorization letter
  | "auth-letters" // registrar: authorization letter
  | "br-documents" // registrar: company BR
  | "registrar-kyc"; // registrar: own NIC / BR

const MAX_BYTES = 4 * 1024 * 1024;
const NEEDS_LOGIN = new Set<UploadPurpose>(["auth-letters", "br-documents", "registrar-kyc"]);

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Uploads a file and returns the storage path to save in the database */
export async function uploadDocument(file: File, purpose: UploadPurpose): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("The file is too large. The limit is 4 MB.");

  const headers = await authHeader();
  if (NEEDS_LOGIN.has(purpose) && !headers.Authorization) throw new Error("Please sign in.");

  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);

  const res = await fetch("/api/documents/upload", { method: "POST", headers, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.path !== "string") {
    throw new Error(json.error ?? "Upload failed. Please try again.");
  }
  return json.path;
}

/** Asks the server for a short-lived link to a stored document */
export async function getDocumentUrl(ref: string): Promise<string> {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch("/api/documents/sign", {
    method: "POST",
    headers,
    body: JSON.stringify({ ref }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.url !== "string") {
    throw new Error(json.error ?? "Could not open the document.");
  }
  return json.url;
}

/**
 * Opens a document in a new tab. The tab is opened first (so the browser does not
 * block it as a pop-up) and pointed at the signed link when it arrives.
 */
export async function openDocument(ref: string, onError?: (message: string) => void) {
  const tab = window.open("", "_blank");
  try {
    const url = await getDocumentUrl(ref);
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.open(url, "_blank");
    }
  } catch (err) {
    tab?.close();
    const message = err instanceof Error ? err.message : "Could not open the document.";
    if (onError) onError(message);
    else alert(message);
  }
}