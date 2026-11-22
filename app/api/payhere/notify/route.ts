import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function md5Upper(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex").toUpperCase();
}

/**
 * POST /api/payhere/notify
 * Server-to-server IPN webhook called by PayHere when a payment succeeds (status_code === "2").
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const merchantId = String(formData.get("merchant_id") ?? "");
    const orderId = String(formData.get("order_id") ?? "");
    const paymentId = String(formData.get("payment_id") ?? "");
    const payhereAmount = String(formData.get("payhere_amount") ?? "");
    const payhereCurrency = String(formData.get("payhere_currency") ?? "");
    const statusCode = String(formData.get("status_code") ?? "");
    const md5sig = String(formData.get("md5sig") ?? "").toUpperCase();

    const merchantSecret = (process.env.PAYHERE_MERCHANT_SECRET ?? "").trim();
    if (!merchantSecret || !orderId) {
      return new Response("Invalid request", { status: 400 });
    }

    const localMd5Sig = md5Upper(
      `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${md5Upper(
        merchantSecret
      )}`
    );

    if (localMd5Sig !== md5sig) {
      return new Response("Invalid signature", { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: paymentRow } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!paymentRow) {
      return new Response("Order not found", { status: 404 });
    }

    const rawObj: Record<string, string> = {};
    formData.forEach((val, key) => {
      rawObj[key] = String(val);
    });

    if (statusCode === "2") {
      // Payment Success -> Activate Premium Plan
      await supabase
        .from("subscription_payments")
        .update({
          status: "PAID",
          payhere_payment_id: paymentId,
          raw_payload: rawObj,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId);

      if (paymentRow.account_type === "company") {
        await supabase
          .from("company_applications")
          .update({
            subscription_plan: "Premium",
            subscription_status: "Active",
            subscription_updated_at: new Date().toISOString(),
          })
          .eq("id", paymentRow.target_id);
      } else if (paymentRow.account_type === "registrar") {
        await supabase
          .from("registrar_profiles")
          .upsert(
            {
              user_id: paymentRow.target_id,
              subscription_plan: "Premium",
              subscription_status: "Active",
              subscription_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
    } else {
      await supabase
        .from("subscription_payments")
        .update({
          status: `FAILED_${statusCode}`,
          payhere_payment_id: paymentId,
          raw_payload: rawObj,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("PayHere notify error:", err);
    return new Response("Server error", { status: 500 });
  }
}