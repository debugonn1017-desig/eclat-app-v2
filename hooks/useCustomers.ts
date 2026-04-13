import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Customer, CustomerVisit } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const normalizeCustomer = (data: any): Customer => {
  return {
    id: data.id || '',
    customer_name: data.customer_name || '',
    nickname: data.nickname || '',
    cast_name: data.cast_name || '',
    cast_type: data.cast_type || '清楚系',
    age_group: data.age_group || '20代',
    occupation: data.occupation || 'サラリーマン',
    region: data.region || '福岡県',
    spouse_status: data.spouse_status || '無',
    blood_type: data.blood_type || '',
    hobby: data.hobby || '',
    nomination_route: data.nomination_route || 'その他',
    relationship_type: data.relationship_type || '認知',
    phase: data.phase || '興味付け',
    customer_rank: data.customer_rank || 'C',
    sales_expectation: data.sales_expectation || '低',
    trend: data.trend || '停滞',
    favorite_type: data.favorite_type || data.preference_type || '可愛い系',
    ng_items: data.ng_items || data.ng_type || 'なし',
    score: data.score !== undefined ? data.score : (data.romance_level || 3),
    memo: data.memo || '',
    last_contact_date: data.last_contact_date || '',
    next_contact_date: data.next_contact_date || '',
    first_visit_date: data.first_visit_date || '',
    monthly_target_visits: data.monthly_target_visits || 0,
    monthly_target_sales: data.monthly_target_sales || 0,
    actual_visit_frequency: data.actual_visit_frequency || '',
    recommended_contact_frequency:
      data.recommended_contact_frequency || data.recommended_frequency || '',
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
    recommended_frequency:
      data.recommended_contact_frequency || data.recommended_frequency || '',
    recommended_line_thanks: data.recommended_line_thanks || '',
    recommended_line_sales: data.recommended_line_sales || '',
    recommended_line_visit: data.recommended_line_visit || '',
    final_recommended_note: data.final_recommended_note || '',
    created_at: data.created_at,
  }
}

export const useCustomers = () => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  const fetchCustomers = useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase credentials are not set.')
      setIsLoaded(true)
      return
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('id', { ascending: false })

    if (error) {
      console.error('fetchCustomers error:', error)
      setIsLoaded(true)
      return
    }

    const normalizedData = (data || []).map(normalizeCustomer)
    setCustomers(normalizedData)
    setIsLoaded(true)
  }, [])

  const getCustomer = async (id: string | number) => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('getCustomer error:', error)
      return null
    }

    return normalizeCustomer(data)
  }

  const addCustomer = async (customer: any) => {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase credentials are not set.')
      alert('Supabaseの設定が見つかりません。環境変数を確認してください。')
      return null
    }

    const payload = {
      customer_name: customer.customer_name || null,
      nickname: customer.nickname || null,
      cast_name: customer.cast_name || null,
      cast_type: customer.cast_type || null,
      age_group: customer.age_group || null,
      occupation: customer.occupation || null,
      region: customer.region || null,
      spouse_status: customer.spouse_status || null,
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
        customer.score === '' || customer.score === undefined || customer.score === null
          ? null
          : Number(customer.score),
      memo: customer.memo || null,
      last_contact_date: customer.last_contact_date || null,
      next_contact_date: customer.next_contact_date || null,
      first_visit_date: customer.first_visit_date || null,
      monthly_target_visits:
        customer.monthly_target_visits === '' ||
        customer.monthly_target_visits === undefined ||
        customer.monthly_target_visits === null
          ? 0
          : Number(customer.monthly_target_visits),
      monthly_target_sales:
        customer.monthly_target_sales === '' ||
        customer.monthly_target_sales === undefined ||
        customer.monthly_target_sales === null
          ? 0
          : Number(customer.monthly_target_sales),
      actual_visit_frequency: customer.actual_visit_frequency || null,
      recommended_contact_frequency:
        customer.recommended_contact_frequency ||
        customer.recommended_frequency ||
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

    const { data, error } = await supabase
      .from('customers')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('addCustomer FULL ERROR:', error)
      alert(error.message || '保存に失敗しました')
      return null
    }

    if (!data) {
      console.error('addCustomer: No data returned after insert')
      alert('保存は実行されましたが、保存結果を取得できませんでした。')
      return null
    }

    await fetchCustomers()
    return normalizeCustomer(data)
  }

  const updateCustomer = async (id: string | number, customer: Partial<Customer>) => {
    const payload = {
      customer_name: customer.customer_name ?? null,
      nickname: customer.nickname ?? null,
      cast_name: customer.cast_name ?? null,
      cast_type: customer.cast_type ?? null,
      age_group: customer.age_group ?? null,
      occupation: customer.occupation ?? null,
      region: customer.region ?? null,
      spouse_status: customer.spouse_status ?? null,
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
        customer.score === '' || customer.score === undefined || customer.score === null
          ? null
          : Number(customer.score),
      memo: customer.memo ?? null,
      last_contact_date: customer.last_contact_date ?? null,
      next_contact_date: customer.next_contact_date ?? null,
      first_visit_date: customer.first_visit_date ?? null,
      monthly_target_visits:
        customer.monthly_target_visits === '' ||
        customer.monthly_target_visits === undefined ||
        customer.monthly_target_visits === null
          ? 0
          : Number(customer.monthly_target_visits),
      monthly_target_sales:
        customer.monthly_target_sales === '' ||
        customer.monthly_target_sales === undefined ||
        customer.monthly_target_sales === null
          ? 0
          : Number(customer.monthly_target_sales),
      actual_visit_frequency: customer.actual_visit_frequency ?? null,
      recommended_contact_frequency:
        customer.recommended_contact_frequency ||
        customer.recommended_frequency ||
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

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('updateCustomer error:', error)
      alert(error.message || '更新に失敗しました')
      return null
    }

    await fetchCustomers()
    return normalizeCustomer(data)
  }

  const deleteCustomer = async (id: string | number) => {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('deleteCustomer error:', error)
      alert(error.message || '削除に失敗しました')
      return false
    }

    await fetchCustomers()
    return true
  }

  const getVisits = async (customerId: string) => {
    const { data, error } = await supabase
      .from('customer_visits')
      .select('*')
      .eq('customer_id', customerId)
      .order('visit_date', { ascending: false })

    if (error) {
      console.error('getVisits error:', error)
      return []
    }

    return data as CustomerVisit[]
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
  }
}