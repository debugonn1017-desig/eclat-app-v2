'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'
import Link from 'next/link'
import Image from 'next/image'

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
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    )
  }

  const handleSubmit = async (data: Partial<Customer>) => {
    // CustomerForm の handleSubmit 内で diagnoseCustomer が実行済みなので
    // そのまま updateCustomer に渡すだけでOK（診断結果も含まれている）
    const updated = await updateCustomer(id, data)
    if (updated) {
      router.push(`/customer/${id}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* ヘッダー */}
      <div className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-20 px-6 py-2 md:py-3">
        <div className="max-w-[420px] mx-auto flex justify-between items-center">
          <Link href={`/customer/${id}`} className="text-primary flex items-center text-sm font-black tracking-tight">
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
            </svg>
            BACK
          </Link>
          <Image
            src="/logo.png"
            alt="Éclat"
            width={140}
            height={40}
            priority
            className="object-contain"
          />
          <div className="w-16" /> {/* バランス用スペーサー */}
        </div>
      </div>

      <div className="max-w-[420px] mx-auto px-4 pt-6">
        <p className="text-[10px] font-black text-primary-light tracking-widest uppercase ml-1 mb-6 opacity-70">
          Edit — {customer.customer_name}
        </p>
        <CustomerForm
          initialData={customer}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  )
}
