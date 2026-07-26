import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import {
  CORE_CUSTOMER_FIELDS,
  getMissingCoreCustomerFields,
  type CoreCustomerFieldKey,
} from '@/lib/coreCustomerFields'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type CustomerRow = {
  id: number | string
  customer_name: string | null
  nickname: string | null
  age_group: string | null
  region: string | null
  spouse_status: string | null
  occupation: string | null
  nomination_status: string | null
  customer_rank: string | null
  cast_name: string | null
  updated_at: string | null
}
export async function GET() {
  try {
    const profile = await requireUser()
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: '管理者のみ利用できます' }, { status: 403 })
    }
    if (!profile.is_owner && !(await checkPermission('顧客.閲覧'))) {
      return NextResponse.json({ error: '顧客.閲覧の権限がありません' }, { status: 403 })
    }

    const supabase = await createClient()
    const [customers, castRows] = await Promise.all([
      fetchAllPaginated<CustomerRow>((from, to) =>
        supabase
          .from('customers')
          .select('id, customer_name, nickname, age_group, region, spouse_status, occupation, nomination_status, customer_rank, cast_name, updated_at')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaginated<{ cast_name: string | null; display_name: string | null }>((from, to) =>
        supabase
          .from('profiles')
          .select('cast_name, display_name')
          .eq('role', 'cast')
          .eq('is_active', true)
          .order('cast_name', { ascending: true })
          .range(from, to)
      ),
    ])

    const missingCounts = Object.fromEntries(
      CORE_CUSTOMER_FIELDS.map(field => [field.key, 0]),
    ) as Record<CoreCustomerFieldKey, number>

    const items = customers.flatMap(customer => {
      const missing = getMissingCoreCustomerFields(customer)
      if (missing.length === 0) return []
      for (const field of missing) missingCounts[field.key] += 1
      return [{
        ...customer,
        id: String(customer.id),
        missing_fields: missing.map(field => field.key),
        missing_labels: missing.map(field => field.label),
      }]
    })

    return NextResponse.json({
      total_customers: customers.length,
      incomplete_customers: items.length,
      complete_customers: customers.length - items.length,
      missing_counts: missingCounts,
      fields: CORE_CUSTOMER_FIELDS,
      casts: castRows
        .filter(cast => cast.cast_name)
        .map(cast => ({
          cast_name: cast.cast_name,
          display_name: cast.display_name,
        })),
      items,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '取得に失敗しました'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/admin/data-quality error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
