import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, requireOwner, errorResponse } from "@/lib/auth-server";
import { addressToBytes, walletKey } from "@/lib/wallet-key";
import { hasRealWallet } from "@/lib/wallet-status";

/**
 * POST /api/company/wallet   (needs the Google login token)
 * Body: { walletAddress: string }
 *
 * Lets a company connect its Lace wallet when it has none on file yet
 * (companies submitted by a registrar start with a placeholder).
 *
 * Rules:
 *  - only the primary or secondary account can do this (not team members)
 *  - only while the stored wallet is still the placeholder. Changing a real
 *    wallet later is a job for Robin's team.
 *  - the address must be a normal Lace wallet address on the Preprod test network
 *  - the same address cannot belong to two companies
 *
 * The update is conditional on the old value, so two clicks at once cannot
 * overwrite each other.
 */

/** Returns a message when the address is not acceptable, or null when it is fine */
function checkAddress(address: string): string | null {
  const key = walletKey(address);
  const bytes = addressToBytes(address);
  if (!key || !bytes) {
    return "That does not look like a Cardano address.";
  }
  // Letters are matched by stake key, so we need a normal base address (the Lace default)
  if (!key.startsWith("stake:")) {
    return "Please use a normal Lace wallet address (one that has a stake key).";
  }
  // Lowest 4 bits of the first byte = network id. 0 = testnet, 1 = mainnet
  if ((bytes[0] & 0x0f) !== 0) {
    return "That is a mainnet address. Switch Lace to the Preprod test network and try again.";
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    requireOwner(ctx);

    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const walletAddress =
      typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    if (!walletAddress || walletAddress.length > 300) {
      return bad("A wallet address is required.");
    }

    const problem = checkAddress(walletAddress);
    if (problem) return bad(problem);

    if (ctx.status === "Rejected") {
      return bad("This company application was rejected, so a wallet cannot be connected.", 403);
    }

    if (hasRealWallet(ctx.walletAddress)) {
      return bad(
        "Your company already has a wallet on file. To change it, contact Robin's team.",
        409
      );
    }

    const supabase = getSupabaseAdmin();

    // The same wallet cannot be used by two companies
    const { data: taken, error: takenError } = await supabase
      .from("company_applications")
      .select("id")
      .eq("wallet_address", walletAddress)
      .neq("id", ctx.companyId)
      .limit(1);
    if (takenError) throw takenError;
    if ((taken ?? []).length > 0) {
      return bad("That wallet is already connected to another company.", 409);
    }

    // Only update if the wallet is still what we just read (no double-click races)
    const { data, error } = await supabase
      .from("company_applications")
      .update({ wallet_address: walletAddress })
      .eq("id", ctx.companyId)
      .eq("wallet_address", ctx.walletAddress)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return bad("The company's wallet changed while you were connecting. Refresh and try again.", 409);
    }

    return Response.json({ ok: true, walletAddress });
  } catch (err) {
    return errorResponse(err, "Could not connect the wallet.");
  }
}