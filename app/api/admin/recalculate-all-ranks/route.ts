import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { evaluateRankSnapshot } from '@/lib/rankRecovery'
import { loadRankSnapshots, rankProof, verifyRankProof, applyRankProofBatch } from '@/lib/rankRecoveryServer'
import type { RankRecalculationPreview, RankRecalculationApplied } from '@/lib/rankRecalculationResult'

export async function POST(request: Request) {
  try {
    const actor=await requirePermission('ランク基準.設定')
    const body=await request.json().catch(()=>null) as {dryRun?:unknown;targetRanks?:unknown;tokens?:unknown}|null
    if(!body || typeof body!=='object' || Array.isArray(body)) return NextResponse.json({error:'リクエストが不正です'},{status:400})
    const allowed=['S','A','B','C','未設定','切れた']
    const filter=body.targetRanks
    if(filter!=null && (!Array.isArray(filter) || !filter.length || filter.some(r=>typeof r!=='string'||!allowed.includes(r)))) return NextResponse.json({error:'対象ランクが不正です'},{status:400})
    const targetRanks=filter==null ? null : [...new Set(filter as string[])]
    if(body.dryRun!==true) {
      if(!Array.isArray(body.tokens)||!body.tokens.length||body.tokens.length>10000) return NextResponse.json({error:'先にプレビューしてください'},{status:400})
      const proofs=body.tokens.map(t=>verifyRankProof(t,actor.id))
      if(proofs.some(p=>p.operation!=='auto')||new Set(proofs.map(p=>p.id)).size!==proofs.length) return NextResponse.json({error:'確認対象が不正です'},{status:400})
      const snapshots=await loadRankSnapshots(proofs.map(p=>p.id)), byId=new Map(snapshots.map(s=>[s.customer.id,s]))
      const eligible=proofs.filter(p=>{const s=byId.get(p.id);return s&&(!targetRanks||targetRanks.includes(s.customer.customer_rank ?? '未設定'))})
      const results=await applyRankProofBatch(eligible,snapshots,actor.id)
      const changed=results.filter(r=>r.ok).length,failed=proofs.length-changed
      return NextResponse.json({ok:true,dryRun:false,targetRanks,changed,failed} satisfies RankRecalculationApplied,{headers:{'Cache-Control':'private, no-store'}})
    }
    const customers=await fetchAllPaginated<{id:number}>( (from,to)=>createAdminClient().from('customers')
      .select('id').eq('nomination_status','本指名').order('id').range(from,to))
    const snapshots=await loadRankSnapshots(customers.map(c=>Number(c.id)))
    const changes=[],bySrcRank:Record<string,number>={},byDstRank:Record<string,number>={}
    const now=new Date()
    let evaluated=0
    for(const snapshot of snapshots){
      if(targetRanks && !targetRanks.includes(snapshot.customer.customer_rank ?? '未設定'))continue
      const row=evaluateRankSnapshot(snapshot,false,now)
      if(!row)throw new Error('RANK_CRITERIA_UNAVAILABLE')
      if(!row.autoEligible)continue
      evaluated++
      if(row.currentRank===row.recommended)continue
      changes.push({customerId:row.id,customerName:row.name,castName:row.castName,from:row.currentRank,to:row.recommended,
        token:rankProof(snapshot,actor.id,'auto',now)})
      const key=(row.currentRank ?? '—')+'→'+row.recommended
      bySrcRank[key]=(bySrcRank[key]||0)+1;byDstRank[row.recommended]=(byDstRank[row.recommended]||0)+1
    }
    return NextResponse.json({ok:true,dryRun:true,targetRanks,totalCustomers:customers.length,filtered:evaluated,evaluated,
      v2Resolved:evaluated,changed:changes.length,bySrcRank,byDstRank,sampleChanges:changes.slice(0,20),tokens:changes.map(c=>c.token)} satisfies RankRecalculationPreview,
      {headers:{'Cache-Control':'private, no-store'}})
  }catch(error){
    const message=error instanceof Error ? error.message : ''
    const status=message==='UNAUTHENTICATED' ? 401 : message==='FORBIDDEN' ? 403 : message==='INVALID_RANK_PROOF' ? 409 : 503
    return NextResponse.json({error:status===409 ? 'プレビューが古いか不正です。再確認してください' : status===503 ? 'ランク確認機能のDB更新を確認してください' : '操作する権限がありません'},{status})
  }
}
