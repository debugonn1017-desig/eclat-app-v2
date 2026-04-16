'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { useRouter } from 'next/navigation'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'
import Link from 'next/link'
import Image from 'next/image'

export default function NewCustomerPage() {
  const { addCustomer } = useCustomers()
  const router = useRouter()

  const handleSubmit = async (data: Partial<Customer>) => {
    const newCustomer = await addCustomer(data)
    if (newCustomer && newCustomer.id) {
      router.push(`/customer/${newCustomer.id}`)
    } else if (newCustomer) {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* ヘッダー（一覧と統一） */}
      <div className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-20 px-6 py-2 md:py-3">
        <div className="max-w-[420px] mx-auto flex justify-between items-center">
          <Link href="/" className="text-primary flex items-center text-sm font-black tracking-tight">
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
          New Customer — 新規顧客登録
        </p>
        <CustomerForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/')}
        />
      </div>
    </div>
  )
}
