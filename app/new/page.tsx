'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { useRouter } from 'next/navigation'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'

export default function NewCustomerPage() {
  const { addCustomer } = useCustomers()
  const router = useRouter()

  const handleSubmit = async (data: Partial<Customer>) => {
    const newCustomer = await addCustomer(data)
    if (newCustomer) {
      router.push(`/customer/${newCustomer.id}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">新規顧客登録</h1>
      <CustomerForm 
        onSubmit={handleSubmit} 
        onCancel={() => router.push('/')}
      />
    </div>
  )
}
