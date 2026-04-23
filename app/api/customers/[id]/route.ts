import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const allowedCustomerKeys = [
  'customer_name',
  'nickname',
  'cast_name',
  'cast_type',
  'has_customer_staff',
  'nomination_status',
  'age_group',
  'occupation',
  'region',
  'spouse_status',
  'birthday',
  'blood_type',
  'hobby',
  'nomination_route',
  'relationship_type',
  'phase',
  'customer_rank',
  'sales_expectation',
  'trend',
  'favorite_type',
  'ng_items',
  'score',
  'memo',
  'last_contact_date',
  'next_contact_date',
  'first_visit_date',
  'monthly_target_visits',
  'monthly_target_sales',
  'actual_visit_frequency',
  'recommended_contact_frequency',
  'sales_priority',
  'sales_objective',
  'recommended_tone',
  'recommended_distance',
  'recommended_direction',
  'best_time_to_contact',
  'ng_contact_time',
  'ng_contact_day',
  'warning_points',
  'important_points',
  'recommended_line_thanks',
  'recommended_line_sales',
  'recommended_line_visit',
  'final_recommended_note',
] as const;

async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  return { supabase, user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // RLS: admin sees any row; cast only sees their own.
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (error) {
      console.error('GET /api/customers/[id] error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/customers/[id] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const customer = await request.json();

    if (!customer || typeof customer !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const payload = allowedCustomerKeys.reduce((acc, key) => {
      if (key in customer) {
        acc[key] = (customer as Record<string, unknown>)[key];
      }
      return acc;
    }, {} as Record<string, unknown>);

    // nomination_status が変更される場合、変更前の値を取得
    let oldNominationStatus: string | null = null;
    if ('nomination_status' in payload) {
      const { data: existing } = await supabase
        .from('customers')
        .select('nomination_status')
        .eq('id', Number(id))
        .single();
      oldNominationStatus = existing?.nomination_status ?? null;
    }

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', Number(id))
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/customers/[id] error:', error, { id, payload });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 指名ステータスが実際に変わった場合、履歴を記録
    if (
      'nomination_status' in payload &&
      oldNominationStatus !== null &&
      oldNominationStatus !== payload.nomination_status
    ) {
      await supabase.from('nomination_history').insert({
        customer_id: Number(id),
        cast_id: user.id,
        old_status: oldNominationStatus,
        new_status: payload.nomination_status,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/customers/[id] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const idStr = resolvedParams.id;
    const id = Number(idStr);

    if (!idStr || isNaN(id)) {
      return NextResponse.json({ error: 'Valid ID is required' }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('DELETE /api/customers/[id] fetch error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: '削除対象の顧客が見つかりませんでした' }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('DELETE /api/customers/[id] delete error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/customers/[id] unexpected error:', err);
    return NextResponse.json({ error: '予期せぬサーバーエラーが発生しました' }, { status: 500 });
  }
}
