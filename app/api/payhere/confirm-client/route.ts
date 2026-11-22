import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  authenticate,
  requireCompany,
  errorResponse,
} from "@/lib/auth-server";

/**
 * POST /api/payhere/confirm-client
 * Body: { orderId, accountType: "company" | "registrar" }
 * Confirms an order belonging to the currently signed-in company or registrar after PayHere return.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const accountType = body.accountType === "registrar" ? "registrar" : "company";

    if (!orderId) {
      return Response.json({ error: "orderId is required." }, { status: 400 });
    }

    let expectedTargetId = "";
    let userEmail = "";
    if (accountType === "company") {
      const ctx = await requireCompany(req);
      expectedTargetId = ctx.companyId;
      userEmail = ctx.email;
    } else {
      const user = await authenticate(req);
      expectedTargetId = user.id;
      userEmail = user.email;
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("order_id", orderId)
      .eq("account_type", accountType)
      .eq("target_id", expectedTargetId)
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return Response.json({ error: "Payment order not found." }, { status: 404 });
    }

    // Mark PAID if still PENDING (for localhost sandbox redirects where IPN cannot reach localhost)
    if (order.status === "PENDING") {
      await supabase
        .from("subscription_payments")
        .update({
          status: "PAID",
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId);
    }

    if (accountType === "company") {
      await supabase
        .from("company_applications")
        .update({
          subscription_plan: "Premium",
          subscription_status: "Active",
          subscription_updated_at: new Date().toISOString(),
        })
        .eq("id", expectedTargetId);
    } else {
      await supabase
        .from("registrar_profiles")
        .upsert(
          {
            user_id: expectedTargetId,
            email: userEmail,
            subscription_plan: "Premium",
            subscription_status: "Active",
            subscription_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    }

    return Response.json({ ok: true, plan: "Premium" });
  } catch (err) {
    return errorResponse(err, "Could not confirm subscription payment.");
  }
}