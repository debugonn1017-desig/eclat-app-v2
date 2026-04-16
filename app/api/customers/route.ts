import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const allowedCustomerKeys = [
  'customer_name',
  'nickname',
  'cast_name',
  'cast_type',
  'age_group',
  'occupation',
  'region',
  'spouse_status',
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

/** Returns 401 response if the caller has no valid session. */
async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  return { supabase, user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS handles filtering: admin sees everything, cast sees only their own rows.
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('GET /api/customers database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error('GET /api/customers unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // RLS ensures cast can only insert rows matching their own cast_name.
    const { data, error } = await supabase
      .from('customers')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('POST /api/customers error:', error, { payload });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/customers unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
