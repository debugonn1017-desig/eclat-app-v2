import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkPermission, getCurrentProfile } from '@/lib/auth';

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

    // ⚠ サーバー側権限チェック: staff は「顧客.閲覧」が必要。
    //    RLS は admin ロール全員に通すので、ここで明示的に絞る。
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.閲覧');
      if (!allowed) {
        return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 });
      }
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

    // Admin (staff) users need 顧客.編集 permission; cast users always allowed (RLS handles scope)
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.編集');
      if (!allowed) {
        return NextResponse.json({ error: '顧客.編集 の権限がありません' }, { status: 403 });
      }
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

    // v0.3.22: phase='初指名' で保存される場合、phase_shoshimei_at に NOW() を記録
    //   90日 NEW バッジ判定で使用。phase が後で変わっても、この日時から90日は NEW のまま。
    if ('phase' in payload && payload.phase === '初指名') {
      payload.phase_shoshimei_at = new Date().toISOString();
    }

    // v0.3.51-hotfix2: cast_name の正規化 (Codex 指摘2)。
    //   string 以外 (null は担当なしとして許可) は 400、string は trim、空白のみは '' に統一。
    if ('cast_name' in payload) {
      const raw = payload.cast_name;
      if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json({ error: '担当キャスト名の形式が不正です' }, { status: 400 });
      }
      if (typeof raw === 'string') payload.cast_name = raw.trim();
    }

    // v0.3.51-hotfix / hotfix2: 担当キャスト名の書き戻し対策。
    //   - 現在値と同じなら payload から削除して書き込み自体を行わない (Codex 提案。
    //     リネーム前に開いた古いフォームが「変更なし」のつもりで旧名を送っても DB に触れない)
    //   - 値が変わる場合のみ実在を事前チェック (分かりやすい日本語エラー用)。
    //     競合の完全な防衛は DB トリガー customers_cast_name_guard (書き込みと同一トランザクション)
    //   - 空文字 (担当を外す) は従来どおり許可
    if (typeof payload.cast_name === 'string') {
      const { data: currentRow } = await supabase
        .from('customers')
        .select('cast_name')
        .eq('id', Number(id))
        .maybeSingle();
      if (currentRow && (currentRow.cast_name ?? '') === payload.cast_name) {
        delete payload.cast_name;
      } else if (payload.cast_name !== '') {
        const { data: castExists } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'cast')
          .eq('cast_name', payload.cast_name)
          .maybeSingle();
        if (!castExists) {
          return NextResponse.json(
            {
              error: `担当キャスト「${payload.cast_name}」が見つかりません。名前が変更された可能性があります。画面を再読み込みしてからもう一度お試しください`,
            },
            { status: 400 }
          );
        }
      }
    }

    // cast_name を落とした結果、更新項目が無くなった場合は現在の行を返して終了
    //   (update({}) は Supabase がエラーを返すため)
    if (Object.keys(payload).length === 0) {
      const { data: unchanged, error: fetchErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', Number(id))
        .maybeSingle();
      if (fetchErr) {
        console.error('PATCH /api/customers/[id] noop fetch error:', fetchErr, { id });
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!unchanged) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      return NextResponse.json(unchanged);
    }

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
      // v0.3.51-hotfix2: DB トリガー customers_cast_name_guard の拒否 (競合時の最終防衛線)
      if (error.message?.includes('CAST_NAME_NOT_FOUND')) {
        return NextResponse.json(
          { error: '担当キャストが見つかりません。名前が変更された可能性があります。画面を再読み込みしてからもう一度お試しください' },
          { status: 400 }
        );
      }
      console.error('PATCH /api/customers/[id] error:', error, { id, payload });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 指名ステータスが実際に変わった場合、履歴を記録
    //   cast_id は「操作したユーザー」ではなく「担当キャスト」を保存する。
    //   これがズレると useCasts.getCastKPI の転換カウントから漏れるため重要。
    if (
      'nomination_status' in payload &&
      oldNominationStatus !== null &&
      oldNominationStatus !== payload.nomination_status
    ) {
      let assignedCastId: string = user.id;
      const castName = (data as { cast_name?: string } | null)?.cast_name;
      if (castName) {
        const { data: castProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'cast')
          .eq('cast_name', castName)
          .maybeSingle();
        if (castProfile?.id) assignedCastId = castProfile.id;
      }
      await supabase.from('nomination_history').insert({
        customer_id: Number(id),
        cast_id: assignedCastId,
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

    // Admin (staff) users need 顧客.編集 permission
    const profile = await getCurrentProfile();
    if (profile?.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.編集');
      if (!allowed) {
        return NextResponse.json({ error: '顧客.編集 の権限がありません' }, { status: 403 });
      }
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
