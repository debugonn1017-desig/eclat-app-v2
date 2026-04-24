'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCustomers } from '@/hooks/useCustomers'
import CustomerForm from '@/components/CustomerForm'
import { Customer } from '@/types'
import Image from 'next/image'

// ─── カラーパレット ────────────────────────────────────────────────
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'

export default function EditCustomerPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { getCustomer, updateCustomer, isLoaded } = useCustomers()
  const { isPC, toggle: toggleView } = useViewMode()
  const [customer, setCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const data = await getCustomer(id)
      setCustomer(data)
    }
    if (id) fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!isLoaded || !customer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const handleSubmit = async (data: Partial<Customer>) => {
    const updated = await updateCustomer(id, data)
    if (updated) {
      router.push(`/customer/${id}`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '40px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => router.push(`/customer/${id}`)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              color: C.pinkMuted, fontSize: '9px', letterSpacing: '0.2em',
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
              margin: '2px 0 0 0',
            }}>
              EDIT CUSTOMER
            </p>
          </div>

          <button
            onClick={toggleView}
            style={{
              background: isPC
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : C.white,
              border: `1px solid ${C.pink}`,
              color: isPC ? C.white : C.pink,
              fontSize: '9px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              padding: '5px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
            }}
          >
            {isPC ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
                </svg>
                MOBILE
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                PC
              </>
            )}
          </button>
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
            EDIT &mdash; {customer.customer_name}
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
          顧客情報を編集 &mdash; 保存で診断を再生成
        </p>
      </div>

      {/* ─── フォーム本体 ─── */}
      <div style={{ padding: '20px 16px 0' }}>
        <CustomerForm
          initialData={customer}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  )
}
