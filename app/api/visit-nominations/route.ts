import { NextResponse } from 'next/server'
import { starLogSession, StarLogError } from '@/lib/starLogServer'
import { isVisitNominationId, validateVisitNominationCorrection, type VisitNominationCorrectionInput } from '@/lib/visitNominationCorrection'
import { loadVisitNominations, saveVisitNominationCorrection, visitNominationFailure, visitNominationHeaders } from '@/lib/visitNominationServer'

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get('customerId')
    if (!isVisitNominationId(customerId)) throw new StarLogError('お客様IDが不正です', 400)
    return NextResponse.json(await loadVisitNominations(customerId), { headers: visitNominationHeaders })
  } catch (error) {
    const failure = visitNominationFailure(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: visitNominationHeaders })
  }
}
export async function PUT(request: Request) {
  try {
    let body: unknown
    try { body = await request.json() } catch { throw new StarLogError('訂正内容の形式が不正です', 400) }
    const invalid = validateVisitNominationCorrection(body)
    if (invalid) throw new StarLogError(invalid, 400)
    const input = body as VisitNominationCorrectionInput
    const customerId = new URL(request.url).searchParams.get('customerId')
    if (customerId !== null && customerId !== input.customerId) throw new StarLogError('お客様IDが一致しません', 400)
    const { profile } = await starLogSession(true)
    return NextResponse.json(await saveVisitNominationCorrection(input, profile.id), { headers: visitNominationHeaders })
  } catch (error) {
    const failure = visitNominationFailure(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: visitNominationHeaders })
  }
}
