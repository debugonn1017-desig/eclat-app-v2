'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'

export default function EditCustomerPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { getCustomer, updateCustomer, isLoaded } = useCustomers()
  const [customer, setCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const data = await getCustomer(id)
      setCustomer(data)
    }
    if (id) fetch()
  }, [id, getCustomer])

  if (!isLoaded || !customer) {
    return <div className="p-8 text-center">読み込み中...</div>
  }

  const handleSubmit = async (data: Partial<Customer>) => {
    const updated = await updateCustomer(id, data)
    if (updated) {
      router.push(`/customer/${id}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">顧客編集: {customer.customer_name}</h1>
      <CustomerForm 
        initialData={customer}
        onSubmit={handleSubmit} 
        onCancel={() => router.back()} 
      />
    </div>
  )
}
