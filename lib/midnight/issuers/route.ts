import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUser, requireAdmin, requireCompany } from '@/lib/auth-server';

/**
 * GET /api/midnight/issuers?companyId=...
 * Returns the Midnight issuer status for a company.
 */
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId');
  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('mn_issuers')
    .select('company_id, issuer_id, midnight_address, registered_tx, status, updated_at')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ issuer: data || null });
}

/**
 * POST /api/midnight/issuers
 * - Company role: registers its generated `issuer_id` + `midnight_address` as `pending`
 * - Admin role: marks an issuer `registered` after signing `registerIssuer` on Midnight
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { action, companyId, issuerId, midnightAddress, registeredTx } = body as {
    action: 'enroll' | 'confirm_onchain';
    companyId: string;
    issuerId?: string;
    midnightAddress?: string;
    registeredTx?: string;
  };

  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
  }

  if (action === 'enroll') {
    const companyAuth = await requireCompany(req);
    if ('error' in companyAuth || companyAuth.company.id !== companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!issuerId || !/^[0-9a-f]{64}$/i.test(issuerId)) {
      return NextResponse.json({ error: 'Invalid 64-hex issuerId' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('mn_issuers')
      .upsert(
        {
          company_id: companyId,
          issuer_id: issuerId.toLowerCase(),
          midnight_address: midnightAddress || null,
          status: 'pending',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ issuer: data });
  }

  if (action === 'confirm_onchain') {
    const adminAuth = await requireAdmin(req);
    if ('error' in adminAuth) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    if (!registeredTx) {
      return NextResponse.json({ error: 'registeredTx is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('mn_issuers')
      .update({
        registered_tx: registeredTx,
        status: 'registered',
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ issuer: data });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}