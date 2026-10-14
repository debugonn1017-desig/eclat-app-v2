import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { evaluateRankSnapshot } from '@/lib/rankRecovery'
import { applyRankProofBatch, loadRankSnapshots, rankProof, verifyRankProof } from '@/lib/rankRecoveryServer'

const json = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
async function actor(write=false) {
  const profile = await getCurrentProfile()
  if (!profile) throw new Error('UNAUTHENTICATED')
  if (profile.role === 'cast' && !profile.cast_name?.trim()) throw new Error('FORBIDDEN')
  if (profile.role === 'admin' && !profile.is_owner && !await checkPermission(write ? '顧客.編集' : '顧客.閲覧')) throw new Error('FORBIDDEN')
  return profile
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message==='UNAUTHENTICATED') return json({error:'ログインしてください'},401)
  if (message==='FORBIDDEN') return json({error:'このお客様を操作する権限がありません'},403)
  if (message==='INVALID_RANK_PROOF') return json({error:'確認画面が古いか不正です。再読み込みしてください'},409)
  return json({error:'ランク確認機能を読み込めません。DB更新の適用状況を確認してください'},503)
}
export async function GET(request: Request) {
  try {
    const profile = await actor()
    const params = new URL(request.url).searchParams
    const review = params.get('mode')==='recovery'
    if (!review && params.get('mode')!=='auto') return json({error:'表示方法が不正です'},400)
    const page = Number(params.get('page') || 1)
    if (!Number.isSafeInteger(page) || page<1) return json({error:'ページが不正です'},400)
    const supabase = await createClient()
    let castName = params.get('castName') || null
    if (!review) {
      const castId = params.get('castId')
      if (!castId || (profile.role==='cast' && castId!==profile.id)) throw new Error('FORBIDDEN')
      const {data,error} = await supabase.from('profiles').select('cast_name').eq('id',castId).eq('role','cast').maybeSingle()
      if (error || !data?.cast_name) throw new Error('FORBIDDEN')
      castName = data.cast_name
    }
    if (profile.role==='cast') {
      if (castName && castName!==profile.cast_name) throw new Error('FORBIDDEN')
      castName=profile.cast_name
    }
    // RLSで見えるIDを確定してから、サーバー専用RPCを使う。
    const customers = await fetchAllPaginated<{id:number}>((from,to)=>{
      let q=supabase.from('customers').select('id').order('id')
      q=review ? q.eq('customer_rank','切れた') : q.eq('nomination_status','本指名')
      if (castName) q=q.eq('cast_name',castName)
      return q.range(from,to)
    })
    const snapshots = await loadRankSnapshots(customers.map(c=>Number(c.id)))
    const now = new Date()
    const items = snapshots.flatMap(snapshot=>{
      const row=evaluateRankSnapshot(snapshot,review,now,!review)
      if (!row) throw new Error('RANK_CRITERIA_UNAVAILABLE')
      if (!review && !row.autoEligible) return []
      return [{...row,
        token:(!review || row.canRestore) ? rankProof(snapshot,profile.id,review ? 'review_restore':'recalculate',now) : null,
        keepToken:review && row.origin==='unknown' ? rankProof(snapshot,profile.id,'review_keep',now) : null,
      }]
    }).sort((a,b)=>a.castName.localeCompare(b.castName,'ja') || (a.days ?? 9999)-(b.days ?? 9999) || a.name.localeCompare(b.name,'ja'))
    const casts = [...new Set(items.map(r=>r.castName))]
    const counts = {unknown:items.filter(r=>r.origin==='unknown').length,manual:items.filter(r=>r.origin==='manual').length,
      auto:items.filter(r=>r.origin==='auto').length,candidates:items.filter(r=>r.canRestore).length}
    const source = params.get('source') || 'candidates'
    if (review && !['candidates','unknown','manual','auto','all'].includes(source)) return json({error:'分類が不正です'},400)
    const filtered = review ? items.filter(r=>source==='all' || (source==='candidates' ? r.canRestore : r.origin===source)) : items
    return json({items:review ? filtered.slice((page-1)*50,page*50) : filtered,
      counts,casts,total:filtered.length,page,pageCount:Math.max(1,Math.ceil(filtered.length/50))})
  } catch(error) { return failure(error) }
}
export async function POST(request: Request) {
  try {
    const profile = await actor(true)
    const body = await request.json().catch(()=>null) as {tokens?:unknown;confirmLegacy?:unknown;confirmRecalculateCuts?:unknown}|null
    if (!body || !Array.isArray(body.tokens) || !body.tokens.length || body.tokens.length>50) return json({error:'一度に確認できるのは1〜50人です'},400)
    const proofs = body.tokens.map(t=>verifyRankProof(t,profile.id))
    if (new Set(proofs.map(p=>p.id)).size!==proofs.length) return json({error:'対象が重複しています'},400)
    const supabase = await createClient()
    const {data,error} = await supabase.from('customers').select('id').in('id',proofs.map(p=>p.id))
    if (error || data?.length!==proofs.length) throw new Error('FORBIDDEN')
    const snapshots = await loadRankSnapshots(proofs.map(p=>p.id))
    const byId = new Map(snapshots.map(s=>[s.customer.id,s]))
    if (proofs.some(p=>p.operation==='recalculate' && byId.get(p.id)?.customer.customer_rank==='切れた') && body.confirmRecalculateCuts!==true) {
      return json({error:'手動を含む切れたのお客様も再評価することを確認してください'},400)
    }
    if (proofs.some(p=>p.operation==='review_restore' && byId.get(p.id)?.customer.customer_rank_origin==='unknown') && body.confirmLegacy!==true) {
      return json({error:'履歴なしのお客様について、手動の切れたではないことを確認してください'},400)
    }
    const results=await applyRankProofBatch(proofs,snapshots,profile.id)
    return json({results,changed:results.filter(r=>r.ok).length})
  } catch(error) { return failure(error) }
}
