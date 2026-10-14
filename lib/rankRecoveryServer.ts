import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateRankSnapshot, type RankSnapshot } from './rankRecovery'
import { toJSTDateString } from './dateUtils'
import { isCustomerRankValue } from './customerRankChange'
import type { CustomerRank } from '../types'
import type { RankOrigin } from './rankRecovery'

type Operation = 'auto' | 'recalculate' | 'review_restore' | 'review_keep' | 'undo'
type Proof = { id: number; actor: string; operation: Operation; tag: string; day: string; expires: number; previousRank?:CustomerRank|null;previousOrigin?:RankOrigin }
const key = () => { const value = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!value) throw new Error('RANK_SERVICE_UNAVAILABLE'); return value }
const tag = (snapshot: RankSnapshot) => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
export function rankProof(snapshot: RankSnapshot, actor: string, operation: Operation, now = new Date(), previous?:{rank:CustomerRank|null;origin:RankOrigin}) {
  const proof: Proof = { id: snapshot.customer.id, actor, operation, tag: tag(snapshot), day: toJSTDateString(now), expires: now.getTime()+10*60*1000,
    ...(previous ? {previousRank:previous.rank,previousOrigin:previous.origin}: {}) }
  const payload = Buffer.from(JSON.stringify(proof)).toString('base64url')
  return payload+'.'+createHmac('sha256',key()).update('rank-preview:'+payload).digest('base64url')
}
export function verifyRankProof(token: unknown, actor: string, now = new Date()): Proof {
  if (typeof token !== 'string' || token.length > 2000) throw new Error('INVALID_RANK_PROOF')
  const [payload,signature,...extra] = token.split('.')
  const expected = createHmac('sha256',key()).update('rank-preview:'+payload).digest()
  const actual = Buffer.from(signature || '', 'base64url')
  if (extra.length || actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw new Error('INVALID_RANK_PROOF')
  let proof: Proof
  try { proof = JSON.parse(Buffer.from(payload,'base64url').toString()) as Proof }
  catch { throw new Error('INVALID_RANK_PROOF') }
  if (!proof || typeof proof !== 'object') throw new Error('INVALID_RANK_PROOF')
  if (proof.actor !== actor || !Number.isSafeInteger(proof.id) || proof.id <= 0 ||
    !['auto','recalculate','review_restore','review_keep','undo'].includes(proof.operation) || !Number.isFinite(proof.expires) ||
    proof.expires <= now.getTime() || proof.day !== toJSTDateString(now)) throw new Error('INVALID_RANK_PROOF')
  if(proof.operation==='undo' && (!isCustomerRankValue(proof.previousRank) || !['unknown','manual','auto'].includes(proof.previousOrigin || ''))) throw new Error('INVALID_RANK_PROOF')
  return proof
}
export async function loadRankSnapshots(ids: number[]): Promise<RankSnapshot[]> {
  const admin = createAdminClient(), result: RankSnapshot[] = []
  for (let i=0;i<ids.length;i+=200) {
    const { data,error } = await admin.rpc('customer_rank_snapshots',{p_ids:ids.slice(i,i+200)})
    if (error) throw new Error('RANK_SCHEMA_UNAVAILABLE')
    result.push(...(data ?? []).filter(Boolean) as RankSnapshot[])
  }
  if (result.length !== ids.length || new Set(result.map(s=>s.customer.id)).size !== ids.length ||
    result.some(s=>!ids.includes(s.customer.id))) throw new Error('RANK_SCHEMA_UNAVAILABLE')
  return result
}
function prepareRankProof(proof: Proof, snapshot: RankSnapshot, actor: string) {
  if (proof.id !== snapshot.customer.id || proof.tag !== tag(snapshot)) throw new Error('RANK_CONFLICT')
  const evaluation = evaluateRankSnapshot(snapshot, proof.operation === 'review_restore' || proof.operation === 'review_keep', new Date(), proof.operation === 'recalculate')
  if ((proof.operation !== 'undo' && !evaluation) || (['auto','recalculate'].includes(proof.operation) && !evaluation?.autoEligible) ||
    (proof.operation === 'review_restore' && !evaluation?.canRestore) ||
    (proof.operation === 'review_keep' && snapshot.customer.customer_rank !== '切れた')) throw new Error('RANK_PROTECTED')
  const next = proof.operation === 'undo' ? proof.previousRank : proof.operation === 'review_keep' ? '切れた' : evaluation!.recommended
  return {
    p_id:proof.id,p_expected:snapshot,p_next_rank:next,p_operation:proof.operation,p_actor:actor,
    ...(proof.operation==='undo' ? {p_origin:proof.previousOrigin} : {}),
  }
}
export async function applyRankProof(proof: Proof, snapshot: RankSnapshot, actor: string) {
  const {data,error} = await createAdminClient().rpc('apply_customer_rank',prepareRankProof(proof,snapshot,actor))
  if (error) throw new Error(error.message?.includes('RANK_CONFLICT') ? 'RANK_CONFLICT' : 'RANK_WRITE_FAILED')
  return data
}
export async function applyRankProofBatch(proofs:Proof[],snapshots:RankSnapshot[],actor:string) {
  const byId=new Map(snapshots.map(s=>[s.customer.id,s]))
  const results:Array<{id:string;ok:boolean;error?:string}>=[]
  const changes=[]
  for(const proof of proofs){
    try{const snapshot=byId.get(proof.id);if(!snapshot)throw new Error('RANK_CONFLICT');changes.push(prepareRankProof(proof,snapshot,actor))}
    catch{results.push({id:String(proof.id),ok:false,error:'データが変更されたか保護対象です。再確認してください'})}
  }
  for(let i=0;i<changes.length;i+=50){
    const {data,error}=await createAdminClient().rpc('apply_customer_rank_batch',{p_changes:changes.slice(i,i+50),p_actor:actor})
    if(error){results.push(...changes.slice(i,i+50).map(c=>({id:String(c.p_id),ok:false,error:'保存できませんでした'})));continue}
    results.push(...data as Array<{id:string;ok:boolean;error?:string}>)
  }
  return results
}
