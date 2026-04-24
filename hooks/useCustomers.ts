import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Customer, CustomerVisit, CustomerContact, CustomerBottle, CustomerMemo } from '@/types'
import { getCache, setCache, fetchWithCache } from '@/lib/cache'

// SSR-aware browser client so auth cookies flow through and RLS policies
// apply for direct visits queries.
const supabase = createClient()

const normalizeCustomer = (data: any): Customer => {
  return {
    id: data.id !== undefined && data.id !== null ? String(data.id) : '',
    customer_name: data.customer_name || '',
    nickname: data.nickname || '',
    cast_name: data.cast_name || '',
    cast_type: data.cast_type || '',
    has_customer_staff: data.has_customer_staff ?? false,
    nomination_status: data.nomination_status || '',
    age_group: data.age_group || '',
    occupation: data.occupation || '',
    region: data.region || '',
    spouse_status: data.spouse_status || '',
    birthday: data.birthday || '',
    blood_type: data.blood_type || '',
    hobby: data.hobby || '',
    nomination_route: data.nomination_route || '',
    relationship_type: data.relationship_type || '',
    phase: data.phase || '',
    customer_rank: data.customer_rank || '',
    sales_expectation: data.sales_expectation || '',
    trend: data.trend || '',
    favorite_type: data.favorite_type || data.preference_type || '',
    ng_items: data.ng_items || '',
    score: data.score !== undefined && data.score !== null ? data.score : undefined,
    memo: data.memo || '',
    last_contact_date: data.last_contact_date || '',
    next_contact_date: data.next_contact_date || '',
    first_visit_date: data.first_visit_date || '',
    monthly_target_visits: data.monthly_target_visits || 0,
    monthly_target_sales: data.monthly_target_sales || 0,
    actual_visit_frequency: data.actual_visit_frequency || '',
    recommended_contact_frequency:
      data.recommended_contact_frequency || '',
    sales_priority: data.sales_priority || '低',
    sales_objective: data.sales_objective || '',
    recommended_tone: data.recommended_tone || '',
    recommended_distance: data.recommended_distance || '',
    recommended_direction: data.recommended_direction || '',
    best_time_to_contact: data.best_time_to_contact || '',
    ng_contact_time: data.ng_contact_time || '',
    ng_contact_day: data.ng_contact_day || '',
    warning_points: data.warning_points || '',
    important_points: data.important_points || '',
    recommended_line_thanks: data.recommended_line_thanks || '',
    recommended_line_sales: data.recommended_line_sales || '',
    recommended_line_visit: data.recommended_line_visit || '',
    final_recommended_note: data.final_recommended_note || '',
    created_at: data.created_at,
  }
}

const CUSTOMERS_CACHE_KEY = 'customers:all'

export const useCustomers = () => {
  // キャッシュがあれば初期値に使用（ページ遷移時に即表示）
  const cached = getCache<Customer[]>(CUSTOMERS_CACHE_KEY)
  const [customers, setCustomers] = useState<Customer[]>(cached ?? [])
  const [isLoaded, setIsLoaded] = useState(cached !== null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch('/api/customers')
      const result = await response.json()

      if (!response.ok) {
        console.error('fetchCustomers API error:', result)
        setIsLoaded(true)
        return
      }

      const normalizedData = (result || []).map(normalizeCustomer)
      setCache(CUSTOMERS_CACHE_KEY, normalizedData)
      if (mountedRef.current) {
        setCustomers(normalizedData)
        setIsLoaded(true)
      }
    } catch (error) {
      console.error('fetchCustomers unexpected error:', error)
      if (mountedRef.current) setIsLoaded(true)
    }
  }, [])

  const getCustomer = async (id: string | number) => {
    if (!id) return null
    try {
      const response = await fetch(`/api/customers/${id}`)
      if (!response.ok) {
        if (response.status === 404) return null
        console.error('getCustomer API error:', response.status)
        return null
      }

      const result = await response.json()
      if (!result || result.error) return null

      return normalizeCustomer(result)
    } catch (error) {
      console.error('getCustomer fetch failed:', error)
      return null
    }
  }

  const addCustomer = async (customer: any) => {
    const payload = {
      customer_name: customer.customer_name || null,
      nickname: customer.nickname || null,
      cast_name: customer.cast_name || null,
      cast_type: customer.cast_type || null,
      has_customer_staff: customer.has_customer_staff ?? false,
      nomination_status: customer.nomination_status || null,
      age_group: customer.age_group || null,
      occupation: customer.occupation || null,
      region: customer.region || null,
      spouse_status: customer.spouse_status || null,
      birthday: customer.birthday || null,
      blood_type: customer.blood_type || null,
      hobby: customer.hobby || null,
      nomination_route: customer.nomination_route || null,
      relationship_type: customer.relationship_type || null,
      phase: customer.phase || null,
      customer_rank: customer.customer_rank || null,
      sales_expectation: customer.sales_expectation || null,
      trend: customer.trend || null,
      favorite_type: customer.favorite_type || null,
      ng_items: customer.ng_items || null,
      score:
        customer.score === undefined || customer.score === null
          ? null
          : String(customer.score),
      memo: customer.memo || null,
      last_contact_date: customer.last_contact_date || null,
      next_contact_date: customer.next_contact_date || null,
      first_visit_date: customer.first_visit_date || null,
      monthly_target_visits:
        customer.monthly_target_visits === undefined ||
        customer.monthly_target_visits === null
          ? 0
          : Number(customer.monthly_target_visits),
      monthly_target_sales:
        customer.monthly_target_sales === undefined ||
        customer.monthly_target_sales === null
          ? 0
          : Number(customer.monthly_target_sales),
      actual_visit_frequency: customer.actual_visit_frequency || null,
      recommended_contact_frequency:
        customer.recommended_contact_frequency ||
        null,
      sales_priority: customer.sales_priority || null,
      sales_objective: customer.sales_objective || null,
      recommended_tone: customer.recommended_tone || null,
      recommended_distance: customer.recommended_distance || null,
      recommended_direction: customer.recommended_direction || null,
      best_time_to_contact: customer.best_time_to_contact || null,
      ng_contact_time: customer.ng_contact_time || null,
      ng_contact_day: customer.ng_contact_day || null,
      warning_points: customer.warning_points || null,
      important_points: customer.important_points || null,
      recommended_line_thanks: customer.recommended_line_thanks || null,
      recommended_line_sales: customer.recommended_line_sales || null,
      recommended_line_visit: customer.recommended_line_visit || null,
      final_recommended_note: customer.final_recommended_note || null,
    }

    console.log('addCustomer payload:', payload)

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('addCustomer API error:', result, { payload })
        alert(result?.error || '保存に失敗しました')
        return null
      }

      if (!result) {
        console.error('addCustomer: empty response from API', { payload, result })
        alert('保存に失敗しました')
        return null
      }

      const normalized = normalizeCustomer(result)
      await fetchCustomers()
      return normalized
    } catch (error) {
      console.error('addCustomer unexpected error:', error, { payload })
      alert('保存に失敗しました')
      return null
    }
  }

  const updateCustomer = async (id: string | number, customer: Partial<Customer>) => {
    const payload = {
      customer_name: customer.customer_name ?? null,
      nickname: customer.nickname ?? null,
      cast_name: customer.cast_name ?? null,
      cast_type: customer.cast_type ?? null,
      has_customer_staff: customer.has_customer_staff ?? false,
      nomination_status: customer.nomination_status || null,
      age_group: customer.age_group ?? null,
      occupation: customer.occupation ?? null,
      region: customer.region ?? null,
      spouse_status: customer.spouse_status ?? null,
      birthday: customer.birthday ?? null,
      blood_type: customer.blood_type ?? null,
      hobby: customer.hobby ?? null,
      nomination_route: customer.nomination_route ?? null,
      relationship_type: customer.relationship_type ?? null,
      phase: customer.phase ?? null,
      customer_rank: customer.customer_rank ?? null,
      sales_expectation: customer.sales_expectation ?? null,
      trend: customer.trend ?? null,
      favorite_type: customer.favorite_type ?? null,
      ng_items: customer.ng_items ?? null,
      score:
        customer.score === undefined || customer.score === null
          ? null
          : String(customer.score),
      memo: customer.memo ?? null,
      last_contact_date: customer.last_contact_date ?? null,
      next_contact_date: customer.next_contact_date ?? null,
      first_visit_date: customer.first_visit_date ?? null,
      monthly_target_visits:
        customer.monthly_target_visits === undefined ||
        customer.monthly_target_visits === null
          ? 0
          : Number(customer.monthly_target_visits),
      monthly_target_sales:
        customer.monthly_target_sales === undefined ||
        customer.monthly_target_sales === null
          ? 0
          : Number(customer.monthly_target_sales),
      actual_visit_frequency: customer.actual_visit_frequency ?? null,
      recommended_contact_frequency:
        customer.recommended_contact_frequency ||
        null,
      sales_priority: customer.sales_priority ?? null,
      sales_objective: customer.sales_objective ?? null,
      recommended_tone: customer.recommended_tone ?? null,
      recommended_distance: customer.recommended_distance ?? null,
      recommended_direction: customer.recommended_direction ?? null,
      best_time_to_contact: customer.best_time_to_contact ?? null,
      ng_contact_time: customer.ng_contact_time ?? null,
      ng_contact_day: customer.ng_contact_day ?? null,
      warning_points: customer.warning_points ?? null,
      important_points: customer.important_points ?? null,
      recommended_line_thanks: customer.recommended_line_thanks ?? null,
      recommended_line_sales: customer.recommended_line_sales ?? null,
      recommended_line_visit: customer.recommended_line_visit ?? null,
      final_recommended_note: customer.final_recommended_note ?? null,
    }

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('updateCustomer API error:', result)
        alert(result?.error || '更新に失敗しました')
        return null
      }

      await fetchCustomers()
      return normalizeCustomer(result)
    } catch (error) {
      console.error('updateCustomer unexpected error:', error)
      alert('更新に失敗しました')
      return null
    }
  }

  const deleteCustomer = async (id: string | number) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        console.error('deleteCustomer API error:', result)
        alert(result?.error || '削除に失敗しました')
        return false
      }

      await fetchCustomers()
      return true
    } catch (error) {
      console.error('deleteCustomer unexpected error:', error)
      alert('削除に失敗しました')
      return false
    }
  }

  const getVisits = async (customerId: string) => {
    try {
      const cid = Number(customerId)
      if (isNaN(cid)) return []

      const { data, error } = await supabase
        .from('customer_visits')
        .select('*')
        .eq('customer_id', cid)
        .order('visit_date', { ascending: false })

      if (error) {
        console.error('getVisits error:', error)
        return []
      }

      return Array.isArray(data) ? (data as CustomerVisit[]) : []
    } catch (err) {
      console.error('getVisits unexpected error:', err)
      return []
    }
  }

  const addVisit = async (visit: Omit<CustomerVisit, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('customer_visits')
      .insert([visit])
      .select()
      .single()

    if (error) {
      console.error('addVisit error:', error)
      alert(error.message || '来店記録の保存に失敗しました')
      return null
    }

    return data as CustomerVisit
  }

  const updateVisit = async (
    visitId: string,
    updates: Partial<Pick<CustomerVisit, 'visit_date' | 'amount_spent' | 'party_size' | 'has_douhan' | 'has_after' | 'is_planned' | 'companion_honshimei' | 'companion_banai' | 'memo'>>
  ) => {
    const { data, error } = await supabase
      .from('customer_visits')
      .update(updates)
      .eq('id', visitId)
      .select()
      .single()

    if (error) {
      console.error('updateVisit error:', error)
      alert(error.message || '来店記録の更新に失敗しました')
      return null
    }

    return data as CustomerVisit
  }

  const deleteVisit = async (visitId: string) => {
    const { error } = await supabase
      .from('customer_visits')
      .delete()
      .eq('id', visitId)

    if (error) {
      console.error('deleteVisit error:', error)
      alert(error.message || '来店記録の削除に失敗しました')
      return false
    }

    return true
  }

  // ─── 連絡記録（Contacts） ──────────────────────────────────────
  const getContacts = async (customerId: string) => {
    try {
      const cid = Number(customerId)
      if (isNaN(cid)) return []

      const { data, error } = await supabase
        .from('customer_contacts')
        .select('*')
        .eq('customer_id', cid)
        .order('contact_date', { ascending: false })

      if (error) {
        console.error('getContacts error:', error)
        return []
      }

      return Array.isArray(data) ? (data as CustomerContact[]) : []
    } catch (err) {
      console.error('getContacts unexpected error:', err)
      return []
    }
  }

  const addContact = async (contact: Omit<CustomerContact, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('customer_contacts')
      .insert([contact])
      .select()
      .single()

    if (error) {
      console.error('addContact error:', error)
      alert(error.message || '連絡記録の保存に失敗しました')
      return null
    }

    return data as CustomerContact
  }

  const deleteContact = async (contactId: string) => {
    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', contactId)

    if (error) {
      console.error('deleteContact error:', error)
      alert(error.message || '連絡記録の削除に失敗しました')
      return false
    }

    return true
  }

  // ─── キープボトル（Bottles） ──────────────────────────────────
  const getBottles = async (customerId: string) => {
    try {
      const cid = Number(customerId)
      if (isNaN(cid)) return []

      const { data, error } = await supabase
        .from('customer_bottles')
        .select('*')
        .eq('customer_id', cid)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('getBottles error:', error)
        return []
      }

      return Array.isArray(data) ? (data as CustomerBottle[]) : []
    } catch (err) {
      console.error('getBottles unexpected error:', err)
      return []
    }
  }

  const addBottle = async (bottle: Omit<CustomerBottle, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('customer_bottles')
      .insert([bottle])
      .select()
      .single()

    if (error) {
      console.error('addBottle error:', error)
      alert(error.message || 'ボトル情報の保存に失敗しました')
      return null
    }

    return data as CustomerBottle
  }

  const updateBottle = async (
    bottleId: string,
    updates: Partial<Pick<CustomerBottle, 'bottle_name' | 'remaining_amount' | 'notes'>>
  ) => {
    const { data, error } = await supabase
      .from('customer_bottles')
      .update(updates)
      .eq('id', bottleId)
      .select()
      .single()

    if (error) {
      console.error('updateBottle error:', error)
      alert(error.message || 'ボトル情報の更新に失敗しました')
      return null
    }

    return data as CustomerBottle
  }

  const deleteBottle = async (bottleId: string) => {
    const { error } = await supabase
      .from('customer_bottles')
      .delete()
      .eq('id', bottleId)

    if (error) {
      console.error('deleteBottle error:', error)
      alert(error.message || 'ボトル情報の削除に失敗しました')
      return false
    }

    return true
  }

  // ─── メモタイムライン（Memos） ──────────────────────────────────
  const getMemos = async (customerId: string) => {
    try {
      const cid = Number(customerId)
      if (isNaN(cid)) return []

      const { data, error } = await supabase
        .from('customer_memos')
        .select('*')
        .eq('customer_id', cid)
        .order('memo_date', { ascending: false })

      if (error) {
        console.error('getMemos error:', error)
        return []
      }

      return Array.isArray(data) ? (data as CustomerMemo[]) : []
    } catch (err) {
      console.error('getMemos unexpected error:', err)
      return []
    }
  }

  const addMemo = async (memo: Omit<CustomerMemo, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('customer_memos')
      .insert([memo])
      .select()
      .single()

    if (error) {
      console.error('addMemo error:', error)
      alert(error.message || 'メモの保存に失敗しました')
      return null
    }

    return data as CustomerMemo
  }

  const deleteMemo = async (memoId: string) => {
    const { error } = await supabase
      .from('customer_memos')
      .delete()
      .eq('id', memoId)

    if (error) {
      console.error('deleteMemo error:', error)
      alert(error.message || 'メモの削除に失敗しました')
      return false
    }

    return true
  }

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  return {
    customers,
    isLoaded,
    fetchCustomers,
    getCustomer,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getVisits,
    addVisit,
    updateVisit,
    deleteVisit,
    getContacts,
    addContact,
    deleteContact,
    getBottles,
    addBottle,
    updateBottle,
    deleteBottle,
    getMemos,
    addMemo,
    deleteMemo,
  }
}