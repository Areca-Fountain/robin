import {
  authenticate,
  resolveAccount,
  createRegistrarProfile,
  errorResponse,
  type AccountRole,
} from "@/lib/auth-server";

const HOME: Record<AccountRole, string> = {
  admin: "/manage-applications",
  company: "/dashboard",
  registrar: "/registrar",
  none: "/",
};

/**
 * POST /api/auth/session   (needs the Google login token)
 * Body: { intent?: "registrar" }
 * Tells the app what this Google account is: admin | company | registrar | none.
 * With intent "registrar", a brand-new account (role none) is registered as a
 * registrar. An account that already has another role is never changed.
 */
export async function POST(req: Request) {
  try {
    const user = await authenticate(req);
    const body = await req.json().catch(() => ({}));

    let account = await resolveAccount(user);
    if (body?.intent === "registrar" && account.role === "none" && !account.conflict) {
      await createRegistrarProfile(user);
      account = await resolveAccount(user);
    }

    return Response.json({
      email: user.email,
      role: account.role,
      home: HOME[account.role],
      conflict: account.conflict,
    });
  } catch (err) {
    return errorResponse(err, "Could not check your account.");
  }
}