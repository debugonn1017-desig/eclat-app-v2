import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkPermission, getCurrentProfile } from '@/lib/auth';
import { fetchAllPaginated } from '@/lib/supabaseHelpers';

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

/** Returns 401 response if the caller has no valid session. */
async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  return { supabase, user };
}

// ⚡ パフォーマンス対策: 顧客リスト用のスリムカラムセット
//   ホーム画面・バナー・モーダルが必要なフィールドのみを返す。
//   重いテキストフィールド（recommended_line_*, warning_points, important_points,
//   final_recommended_note, sales_objective, recommended_tone 等）は除外。
//   これらは CustomerDetailPanel / CustomerForm が /api/customers/[id] で
//   個別取得するときに含まれるので、リスト画面では取らない。
//   1000+ 顧客で 119kB → 推定 25-40kB に圧縮。
const SUMMARY_COLUMNS = [
  'id',
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
  'score',
  'memo',
  'last_contact_date',
  'next_contact_date',
  'first_visit_date',
  'monthly_target_visits',
  'monthly_target_sales',
  'actual_visit_frequency',
  'sales_priority',
  'created_at',
].join(',');

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getAuthedClient();
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ⚠ サーバー側権限チェック: staff (admin role かつ owner でない) は「顧客.閲覧」が必要。
    //    RLS は admin ロール全員に通してしまうので、ここで明示的に絞る。
    //    cast ロールは RLS が自動で「自分の顧客のみ」に絞るのでチェック不要。
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.閲覧');
      if (!allowed) {
        return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 });
      }
    }

    // ?summary=1 で軽量モード（ホーム画面のリスト用）
    // 何も指定しなければ従来通り全カラム
    const url = new URL(request.url);
    const summaryMode = url.searchParams.get('summary') === '1';
    const selectClause = summaryMode ? SUMMARY_COLUMNS : '*';

    // RLS handles filtering: admin sees everything, cast sees only their own rows.
    // ⚠ 1000件制限対策: Supabase は明示しないと最大 1000 行までしか返さない。
    //    現状 1000+ 顧客いるので fetchAllPaginated で分割取得。
    //    selectClause は動的文字列なので型推論が effiveness 効かず any で受ける。
    const data = await fetchAllPaginated<Record<string, unknown>>((from, to) =>
      supabase
        .from('customers')
        .select(selectClause)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>
    ).catch((e) => {
      console.error('GET /api/customers paginated fetch error:', e);
      return null;
    });

    if (data === null) {
      return NextResponse.json({ error: '顧客の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json(data, {
      headers: {
        // ⚡ 顧客リストは更新されてもリアルタイム性は不要 (登録/編集後はキャッシュを invalidate する)
        // 30秒の private キャッシュ + 60秒 stale-while-revalidate
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        // v0.3.44-A2: Cookie が変わったらキャッシュ再利用しない（同一ブラウザ内のユーザー切替対策）
        'Vary': 'Cookie',
      },
    });
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

    // Admin (staff) users need 顧客.編集 permission; cast users always allowed (RLS handles scope)
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.編集');
      if (!allowed) {
        return NextResponse.json({ error: '顧客.編集 の権限がありません' }, { status: 403 });
      }
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

    // v0.3.22: 新規登録時に phase='初指名' なら phase_shoshimei_at に NOW() を記録
    if (payload.phase === '初指名') {
      payload.phase_shoshimei_at = new Date().toISOString();
    }

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

    // 新規登録時の指名ステータスを履歴に記録
    //   cast_id は「操作したユーザー」ではなく「担当キャスト」を保存する。
    //   これがズレると useCasts.getCastKPI の転換カウントから漏れるため重要。
    //   cast_name から profiles を逆引き。見つからなければ操作者 ID をフォールバック。
    if (data && data.nomination_status) {
      let assignedCastId: string = user.id;
      if (data.cast_name) {
        const { data: castProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'cast')
          .eq('cast_name', data.cast_name)
          .maybeSingle();
        if (castProfile?.id) assignedCastId = castProfile.id;
      }
      await supabase.from('nomination_history').insert({
        customer_id: data.id,
        cast_id: assignedCastId,
        old_status: null,
        new_status: data.nomination_status,
      });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/customers unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
