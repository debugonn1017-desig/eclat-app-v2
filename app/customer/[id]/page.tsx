'use client'

import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { isPC, toggle: toggleView } = useViewMode()

  if (!id) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{ color: C.pinkMuted }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: isPC ? '720px' : '420px', margin: '0 auto',
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => router.push('/')}
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
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, marginTop: '2px', margin: '2px 0 0 0' }}>
              CUSTOMER DETAIL
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

      {/* ─── パネル ─── */}
      <CustomerDetailPanel customerId={id} isPC={isPC} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:active { opacity: 0.8; }
        a { text-decoration: none; }
        .eclat-input:focus {
          border-color: ${C.pink} !important;
          box-shadow: 0 0 0 2px rgba(232,135,155,0.18);
        }
      `}</style>
    </div>
  )
}
