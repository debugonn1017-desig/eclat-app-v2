// ─────────────────────────────────────────────────────────────────
//  /api/auto-push/check
//   ノルマ達成自動 Push のチェック + 配信エンドポイント
//
//  POST { castId: string, month: string }  // month は省略時は今月
//   → サーバー側で KPI + Target を集計
//   → 5 項目各々で「達成済み AND 未送信」を判定
//   → 該当があれば auto_push_log に登録（ユニーク違反でスキップ = 重複防止）
//   → 新規登録できたものだけ Web Push を該当キャストに送信
//
//  認証 (v0.3.32/v0.3.33):
//    - cast: 自分自身の castId のみ
//    - admin (owner以外): `通知.自動配信設定` 権限が必要
//    - owner: 制限なし
//
//  全体 OFF / タイプ別 OFF の場合は何もせず終了。
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser, requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUsers } from '@/lib/push'
import { resolveCastTargetFull } from '@/lib/targetResolver'
import type { CustomerRank } from '@/types'

type AchievementType = 'sales' | 'kokyaku' | 'kengai' | 'banai' | 'workdays'

type Detected = {
  type: AchievementType
  target: number
  actual: number
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

function pushTextFor(type: AchievementType): { title: string; body: string } {
  switch (type) {
    case 'sales':
      return { title: '🎉 ノルマ達成おめでとう！', body: '今月の売上目標を突破！この勢いでさらに上を目指そう✨' }
    case 'kokyaku':
      return { title: '🎊 顧客来店ノルマ達成！', body: '今月の顧客来店組数目標に到達。継続来店ありがとう！' }
    case 'kengai':
      return { title: '✨ 県外来店ノルマ達成！', body: '県外のお客様の来店組数目標に到達。遠くから本当にありがたい！' }
    case 'banai':
      return { title: '🌟 場内獲得ノルマ達成！', body: '今月の新規場内獲得目標に到達。新しいお客様との出会いを大切に！' }
    case 'workdays':
      return { title: '💯 出勤日数ノルマ達成！', body: '今月の出勤目標日数に到達。お疲れさま、続けていこう！' }
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireUser()  // ログイン必須

    const body = await request.json().catch(() => ({}))
    const castId = body.castId as string | undefined
    const month = (body.month as string | undefined) ?? getCurrentMonth()
    if (!castId) {
      return NextResponse.json({ error: 'castId が必要です' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month は YYYY-MM 形式' }, { status: 400 })
    }

    // v0.3.32/v0.3.33: 認可ガード
    //   cast: 自分自身の castId のみ
    //   admin (owner以外): 他キャストのために呼ぶには 通知.自動配信設定 必須
    //   owner: 制限なし
    if (profile.role === 'cast') {
      if (String(profile.id) !== String(castId)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    } else if (profile.role === 'admin' && !profile.is_owner) {
      try {
        await requirePermission('通知.自動配信設定')
      } catch {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }

    const admin = createAdminClient()

    // ─── 1) 全体オン/オフ + タイプ別オン/オフを確認 ─────
    const { data: settingsData } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'auto_push_enabled',
        'auto_push_type_sales', 'auto_push_type_kokyaku', 'auto_push_type_kengai',
        'auto_push_type_banai', 'auto_push_type_workdays',
      ])
    const settings = new Map<string, string>()
    for (const r of (settingsData ?? []) as { key: string; value: string }[]) {
      settings.set(r.key, r.value)
    }
    if (settings.get('auto_push_enabled') !== 'true') {
      return NextResponse.json({ skipped: 'auto_push_disabled', delivered: 0 })
    }
    const isTypeEnabled = (t: AchievementType): boolean =>
      settings.get(`auto_push_type_${t}`) === 'true'

    // ─── 2) キャストプロフィール取得 ────────────────────
    const { data: cast } = await admin
      .from('profiles')
      .select('id, cast_name, cast_tier, is_active')
      .eq('id', castId)
      .single()
    if (!cast || cast.is_active === false) {
      return NextResponse.json({ skipped: 'cast_not_found_or_inactive', delivered: 0 })
    }

    // ─── 3) ノルマを階層検索で resolve ─────────────────
    const [castTargetsRes, tierTargetsRes] = await Promise.all([
      admin.from('cast_targets').select('*').eq('cast_id', castId),
      admin.from('cast_tier_targets').select('*'),
    ])
    const resolved = resolveCastTargetFull(
      castTargetsRes.data ?? [],
      tierTargetsRes.data ?? [],
      castId,
      cast.cast_tier ?? null,
      month,
    )

    // ─── 4) KPI 集計（cast-rankings と同じロジックの軽量版） ──
    const startDate = `${month}-01`
    const endDate = getMonthEndDate(month)
    const castName = cast.cast_name as string | null
    if (!castName) {
      return NextResponse.json({ skipped: 'no_cast_name', delivered: 0 })
    }

    // 顧客（cast_name で紐付け）
    const { data: customers } = await admin
      .from('customers')
      .select('id, nomination_status, region, customer_rank')
      .eq('cast_name', castName)
    const customerList = (customers ?? []) as {
      id: string; nomination_status: string | null;
      region: string | null; customer_rank: CustomerRank | null;
    }[]
    const customerIds = customerList.map(c => c.id)

    // 来店（売上 + 来店組数）
    const visits: { customer_id: string; amount_spent: number | null }[] = []
    if (customerIds.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data } = await admin
          .from('customer_visits')
          .select('customer_id, amount_spent')
          .in('customer_id', customerIds)
          .gte('visit_date', startDate)
          .lte('visit_date', endDate)
          .range(from, from + PAGE - 1)
        const batch = data ?? []
        visits.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }
    const paidVisits = visits.filter(v => (Number(v.amount_spent) || 0) > 0)

    // 売上 = paid visits 合計 + 場内延長合計
    let sales = paidVisits.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
    const { data: extSales } = await admin
      .from('cast_extension_sales')
      .select('amount_spent')
      .eq('cast_id', castId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
    sales += (extSales ?? []).reduce(
      (s, e) => s + (Number((e as { amount_spent: number | null }).amount_spent) || 0),
      0,
    )

    // 顧客来店組数（本指名/福岡/S〜B）
    // 県外来店組数（本指名/県外）
    const metaMap = new Map<string, { nom: string | null; region: string | null; rank: CustomerRank | null }>()
    for (const c of customerList) {
      metaMap.set(c.id, { nom: c.nomination_status, region: c.region, rank: c.customer_rank })
    }
    let kokyakuVisits = 0
    let kengaiVisits = 0
    for (const v of paidVisits) {
      const m = metaMap.get(v.customer_id)
      if (!m || m.nom !== '本指名') continue
      if (m.region === '福岡県') {
        if (m.rank && ['S', 'A', 'B'].includes(m.rank)) kokyakuVisits++
      } else if (m.region) {
        kengaiVisits++
      }
    }

    // 場内獲得 = 当月 new_status='場内' の履歴件数
    const { data: history } = await admin
      .from('nomination_history')
      .select('id')
      .eq('cast_id', castId)
      .eq('new_status', '場内')
      .gte('changed_at', startDate)
      .lte('changed_at', endDate + 'T23:59:59')
    const banaiAcquired = (history ?? []).length

    // 出勤日数 = 当月 status='出勤' or '来客出勤' のシフト数
    const { data: shifts } = await admin
      .from('cast_shifts')
      .select('status')
      .eq('cast_id', castId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
    const workDays = (shifts ?? []).filter(s => {
      const st = (s as { status: string }).status
      return st === '出勤' || st === '来客出勤'
    }).length

    // ─── 5) 達成判定 ──────────────────────────────────
    const detected: Detected[] = []
    if (isTypeEnabled('sales') && resolved.target_sales > 0 && sales >= resolved.target_sales) {
      detected.push({ type: 'sales', target: resolved.target_sales, actual: sales })
    }
    if (isTypeEnabled('kokyaku') && resolved.target_local_customers > 0 && kokyakuVisits >= resolved.target_local_customers) {
      detected.push({ type: 'kokyaku', target: resolved.target_local_customers, actual: kokyakuVisits })
    }
    if (isTypeEnabled('kengai') && resolved.target_remote_customers > 0 && kengaiVisits >= resolved.target_remote_customers) {
      detected.push({ type: 'kengai', target: resolved.target_remote_customers, actual: kengaiVisits })
    }
    if (isTypeEnabled('banai') && resolved.target_banai > 0 && banaiAcquired >= resolved.target_banai) {
      detected.push({ type: 'banai', target: resolved.target_banai, actual: banaiAcquired })
    }
    if (isTypeEnabled('workdays') && resolved.target_work_days > 0 && workDays >= resolved.target_work_days) {
      detected.push({ type: 'workdays', target: resolved.target_work_days, actual: workDays })
    }

    if (detected.length === 0) {
      return NextResponse.json({ delivered: 0, skipped: 'no_achievement' })
    }

    // ─── 6) auto_push_log に挿入（ユニーク違反 = 既送信 = スキップ）
    const newlyAchieved: Detected[] = []
    for (const d of detected) {
      const { error } = await admin
        .from('auto_push_log')
        .insert({
          cast_id: castId,
          achievement_type: d.type,
          month,
          target_value: d.target,
          actual_value: d.actual,
        })
      if (!error) {
        newlyAchieved.push(d)
      }
      // ユニーク違反 (23505) は無視 = 既送信
    }

    if (newlyAchieved.length === 0) {
      return NextResponse.json({ delivered: 0, skipped: 'already_sent' })
    }

    // ─── 7) Push 送信（達成した各タイプ別に送る） ─────────
    let totalDelivered = 0
    let totalFailed = 0
    for (const d of newlyAchieved) {
      const payload = pushTextFor(d.type)
      const { delivered, failed } = await sendPushToUsers(
        admin,
        [castId],
        { ...payload, url: `/casts/${castId}`, tag: `auto-push-${d.type}-${month}` },
      )
      totalDelivered += delivered
      totalFailed += failed
    }

    return NextResponse.json({
      delivered: totalDelivered,
      failed: totalFailed,
      achieved: newlyAchieved.map(d => d.type),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('POST /api/auto-push/check error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
