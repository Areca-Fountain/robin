import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  authenticate,
  resolveAccount,
  requireCompany,
  requireOwner,
  AuthError,
  errorResponse,
} from "@/lib/auth-server";

function md5Upper(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").toUpperCase();
}

/**
 * POST /api/payhere/checkout
 * Body: { accountType: "company" | "registrar", firstName?, lastName?, phone?, address?, city? }
 * Generates signed PayHere JS SDK payment parameters for the $10/month Premium Plan (USD).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const accountType = body.accountType === "registrar" ? "registrar" : "company";

    const merchantId = (process.env.PAYHERE_MERCHANT_ID ?? "").trim();
    const merchantSecret = (process.env.PAYHERE_MERCHANT_SECRET ?? "").trim();
    const mode = (process.env.PAYHERE_MODE ?? "sandbox").trim().toLowerCase();

    if (!merchantId || !merchantSecret) {
      return Response.json(
        {
          error:
            "PayHere is not configured yet. Add PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET in .env.local.",
        },
        { status: 500 }
      );
    }

    let targetId = "";
    let payerEmail = "";
    let defaultFirstName = "Robin";
    let defaultLastName = "User";
    let itemTitle = "Robin Premium Plan ($10/month)";

    if (accountType === "company") {
      const ctx = await requireCompany(req);
      requireOwner(ctx);
      targetId = ctx.companyId;
      payerEmail = ctx.email;
      defaultFirstName = ctx.companyName;
      defaultLastName = "Company";
      itemTitle = `Robin Company Premium Plan - ${ctx.companyName}`;
    } else {
      const authed = await authenticate(req);
      const account = await resolveAccount(authed);
      if (account.role === "company" || account.role === "admin") {
        throw new AuthError("Only registrar accounts can purchase a registrar subscription.", 403);
      }
      targetId = authed.id;
      payerEmail = authed.email;
      const fullName = (authed.fullName || "Registrar User").trim();
      const parts = fullName.split(/\s+/);
      defaultFirstName = parts[0] || "Registrar";
      defaultLastName = parts.slice(1).join(" ") || "User";
      itemTitle = "Robin Registrar Premium Plan ($10/month)";
    }

    const amount = "10.00";
    const currency = "USD";
    const orderId = `ROBIN_${accountType.toUpperCase()}_${Date.now()}_${crypto
      .randomBytes(3)
      .toString("hex")}`;

    // PayHere MD5 Hash Formula:
    // UPPERCASE(MD5(merchant_id + order_id + amount + currency + UPPERCASE(MD5(merchant_secret))))
    const secretHash = md5Upper(merchantSecret);
    const hash = md5Upper(`${merchantId}${orderId}${amount}${currency}${secretHash}`);

    const supabase = getSupabaseAdmin();
    const { error: insertError } = await supabase.from("subscription_payments").insert({
      order_id: orderId,
      account_type: accountType,
      target_id: targetId,
      payer_email: payerEmail,
      plan: "Premium",
      amount: 10.0,
      currency,
      status: "PENDING",
    });

    if (insertError) throw insertError;

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      new URL(req.url).origin
    ).replace(/\/+$/, "");

    return Response.json({
      sandbox: mode !== "live",
      payment: {
        sandbox: mode !== "live",
        merchant_id: merchantId,
        return_url:
          accountType === "company"
            ? `${baseUrl}/dashboard/subscription?payment=success&order_id=${orderId}`
            : `${baseUrl}/registrar?payment=success&order_id=${orderId}`,
        cancel_url:
          accountType === "company"
            ? `${baseUrl}/dashboard/subscription?payment=cancelled`
            : `${baseUrl}/registrar?payment=cancelled`,
        notify_url: `${baseUrl}/api/payhere/notify`,
        order_id: orderId,
        items: itemTitle,
        currency,
        amount,
        first_name: String(body.firstName || defaultFirstName).slice(0, 50),
        last_name: String(body.lastName || defaultLastName).slice(0, 50),
        email: payerEmail,
        phone: String(body.phone || "0770000000").slice(0, 20),
        address: String(body.address || "Colombo").slice(0, 100),
        city: String(body.city || "Colombo").slice(0, 50),
        country: "Sri Lanka",
        hash,
        custom_1: accountType,
        custom_2: targetId,
      },
    });
  } catch (err) {
    return errorResponse(err, "Could not initialize PayHere checkout.");
  }
}