'use client'

import { useCustomers } from '@/hooks/useCustomers'
import { useRouter } from 'next/navigation'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'
import Image from 'next/image'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'

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
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '40px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}>
        <div style={{
          maxWidth: '420px',
          margin: '0 auto',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: C.pinkMuted,
              fontSize: '9px',
              letterSpacing: '0.2em',
              padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            BACK
          </button>

          <div style={{ textAlign: 'center' }}>
            <Image
              src="/logo.png"
              alt="Éclat"
              width={100}
              height={30}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p style={{
              fontSize: '7px',
              letterSpacing: '0.35em',
              color: C.pinkMuted,
              marginTop: '2px',
              margin: '2px 0 0 0',
            }}>
              NEW CUSTOMER
            </p>
          </div>

          {/* バランス用スペーサー（BACKボタンと同幅） */}
          <div style={{ width: '48px' }} />
        </div>
      </div>

      {/* ─── タイトルセクション ─── */}
      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '28px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            height: '1px',
            width: '32px',
            background: `linear-gradient(90deg, ${C.pink}, transparent)`,
          }} />
          <p style={{
            fontSize: '9px',
            letterSpacing: '0.35em',
            color: C.pink,
            margin: 0,
          }}>
            REGISTER NEW CUSTOMER
          </p>
        </div>
        <p style={{
          fontSize: '11px',
          color: C.pinkMuted,
          letterSpacing: '0.1em',
          marginTop: '6px',
          paddingLeft: '42px',
          margin: '6px 0 0 0',
        }}>
          新規顧客登録 — 必須項目は <span style={{ color: C.pink }}>*</span> マーク
        </p>
      </div>

      {/* ─── フォーム本体 ─── */}
      <div style={{ padding: '20px 16px 0' }}>
        <CustomerForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/')}
        />
      </div>
    </div>
  )
}
