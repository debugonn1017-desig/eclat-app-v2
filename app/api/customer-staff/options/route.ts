import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getEligibleCustomerStaffOptions } from '@/lib/customerStaffServer'

export async function GET() {
  try {
    await requireUser()
    const staff = await getEligibleCustomerStaffOptions()
    return NextResponse.json({ staff }, {
      headers: { 'Cache-Control': 'private, max-age=30', 'Vary': 'Cookie' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: 'お客様担当一覧を取得できませんでした' }, { status: 500 })
  }
}
