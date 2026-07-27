'use client'

// 管理者とキャストが共用する「基本情報の不足」専用一覧。
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import type { CoreCustomerFieldKey } from '@/lib/coreCustomerFields'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
import { useViewMode } from '@/hooks/useViewMode'

const CustomerDetailPanel = dynamic(
  () => import('@/components/CustomerDetailPanel'),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 48 }}>
        <Spinner size="md" label="編集画面を読み込み中…" />
      </div>
    ),
  },
)

type FieldDefinition = {
  key: CoreCustomerFieldKey
  label: string
}

type IncompleteCustomer = {
  id: string
  customer_name: string | null
  nickname: string | null
  nomination_status: string | null
  customer_rank: string | null
  cast_name: string | null
  missing_fields: CoreCustomerFieldKey[]
  missing_labels: string[]
}

type DataQualityResponse = {
  is_admin: boolean
  can_filter_casts: boolean
  total_customers: number
  incomplete_customers: number
  complete_customers: number
  missing_counts: Record<CoreCustomerFieldKey, number>
  fields: FieldDefinition[]
  casts: Array<{ cast_name: string; display_name: string | null }>
  filtered_total: number
  page: number
  page_size: number
  page_count: number
  items: IncompleteCustomer[]
}

const NOMINATION_FILTERS = ['本指名', '場内', '未設定'] as const
const PAGE_SIZE = 50

export default function DataQualityPage() {
  useScrollTopOnMount()
  const { isPC } = useViewMode()
  const [data, setData] = useState<DataQualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [castName, setCastName] = useState('')
  const [nomination, setNomination] = useState('')
  const [missingField, setMissingField] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const hasLoadedRef = useRef(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const load = async () => {
      if (hasLoadedRef.current) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        })
        if (castName) params.set('castName', castName)
        if (nomination) params.set('nomination', nomination)
        if (missingField) params.set('missingField', missingField)
        if (keyword.trim()) params.set('keyword', keyword.trim())

        const response = await fetch(`/api/data-quality?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const json = await response.json() as DataQualityResponse & { error?: string }
        if (!response.ok) throw new Error(json.error ?? '情報不足の取得に失敗しました')
        if (requestId !== requestIdRef.current) return
        if (json.page > json.page_count) {
          setPage(json.page_count)
          return
        }
        setData(json)
        hasLoadedRef.current = true
      } catch (loadError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setError(loadError instanceof Error ? loadError.message : '情報不足の取得に失敗しました')
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    const timer = window.setTimeout(load, keyword.trim() ? 300 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [castName, keyword, missingField, nomination, page, refreshKey])

  useEffect(() => {
    if (!editingCustomerId) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [editingCustomerId])

  const handleCustomerUpdated = () => {
    setEditingCustomerId(null)
    setRefreshKey(value => value + 1)
  }

  const filteredTotal = data?.filtered_total ?? 0
  const pageCount = data?.page_count ?? 1
  const currentPage = data?.page ?? page
  const pageItems = data?.items ?? []
  const visibleStart = filteredTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const visibleEnd = Math.min(currentPage * PAGE_SIZE, filteredTotal)

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    }}>
      <PageHeader
        title="情報不足チェック"
        subtitle="お客様の基本情報"
        backFallback={data?.is_admin ? '/admin/casts' : '/home'}
      />

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '18px 14px 40px' }}>
        {loading ? (
          <div style={{ padding: 56 }}>
            <Spinner size="md" label="情報不足を確認中…" />
          </div>
        ) : error ? (
          <div style={{
            padding: 18,
            borderRadius: 14,
            color: C.danger,
            background: C.dangerBg,
            fontSize: 12,
          }}>
            {error}
          </div>
        ) : data && (
          <>
            <section style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}>
              {[
                ['全顧客', data.total_customers, C.dark],
                ['情報不足', data.incomplete_customers, C.danger],
                ['不足なし・対象外', data.complete_customers, C.success],
              ].map(([label, value, color]) => (
                <div key={String(label)} style={{
                  padding: '13px 10px',
                  borderRadius: 14,
                  background: '#FFF',
                  border: `1px solid ${C.border}`,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: C.pinkMuted }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: String(color) }}>
                    {Number(value).toLocaleString()}人
                  </div>
                </div>
              ))}
            </section>
            <p style={{
              margin: '8px 2px 0',
              fontSize: 9.5,
              color: C.pinkMuted,
              lineHeight: 1.55,
            }}>
              フリーと切れたお客様は判定対象外です。本指名・場内・指名状況未設定のお客様を基本7項目で確認します。
            </p>

            <section style={{
              marginTop: 14,
              padding: 13,
              borderRadius: 16,
              background: '#FFF',
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 10, color: C.pink, fontWeight: 700 }}>
                絞り込み
              </div>
              <div className="data-quality-filters" style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${data.can_filter_casts ? 4 : 3}, minmax(0, 1fr))`,
                gap: 8,
                marginTop: 9,
              }}>
                <input
                  value={keyword}
                  onChange={event => {
                    setKeyword(event.target.value)
                    setPage(1)
                  }}
                  placeholder="お客様名・ニックネーム"
                  style={filterStyle}
                />
                {data.can_filter_casts && (
                  <select
                    value={castName}
                    onChange={event => {
                      setCastName(event.target.value)
                      setPage(1)
                    }}
                    style={filterStyle}
                  >
                    <option value="">全キャスト</option>
                    <option value="__unassigned__">担当未設定</option>
                    {data.casts.map(cast => (
                      <option key={cast.cast_name} value={cast.cast_name}>
                        {cast.display_name || cast.cast_name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={nomination}
                  onChange={event => {
                    setNomination(event.target.value)
                    setPage(1)
                  }}
                  style={filterStyle}
                >
                  <option value="">全指名状況</option>
                  {NOMINATION_FILTERS.map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <select
                  value={missingField}
                  onChange={event => {
                    setMissingField(event.target.value)
                    setPage(1)
                  }}
                  style={filterStyle}
                >
                  <option value="">すべての不足項目</option>
                  {data.fields.map(field => (
                    <option key={field.key} value={field.key}>
                      {field.label}未登録（{data.missing_counts[field.key]}人）
                    </option>
                  ))}
                </select>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 10,
              }}>
                <span style={{ fontSize: 10, color: C.pinkMuted }}>
                  該当 {filteredTotal.toLocaleString()}人
                  {filteredTotal > 0 && `（${visibleStart.toLocaleString()}〜${visibleEnd.toLocaleString()}人目）`}
                  {refreshing && '　更新中…'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {pageCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPage(value => Math.max(1, value - 1))}
                        disabled={refreshing || currentPage === 1}
                        style={paginationButtonStyle}
                      >
                        前へ
                      </button>
                      <span style={{ minWidth: 48, textAlign: 'center', fontSize: 9.5, color: C.pinkMuted }}>
                        {currentPage} / {pageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(value => Math.min(pageCount, value + 1))}
                        disabled={refreshing || currentPage === pageCount}
                        style={paginationButtonStyle}
                      >
                        次へ
                      </button>
                    </>
                  )}
                  {(castName || nomination || missingField || keyword) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCastName('')
                        setNomination('')
                        setMissingField('')
                        setKeyword('')
                        setPage(1)
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: C.pink,
                        fontFamily: 'inherit',
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      条件をクリア
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 9, marginTop: 14 }}>
              {filteredTotal === 0 ? (
                <div style={{
                  padding: 44,
                  textAlign: 'center',
                  color: C.pinkMuted,
                  border: `1px dashed ${C.border}`,
                  borderRadius: 14,
                  background: '#FFF',
                  fontSize: 11,
                }}>
                  この条件に該当するお客様はいません
                </div>
              ) : pageItems.map(item => (
                <article key={item.id} style={{
                  padding: 14,
                  borderRadius: 15,
                  background: '#FFF',
                  border: `1px solid ${C.border}`,
                  boxShadow: '0 5px 14px rgba(96,52,68,0.04)',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.dark, fontWeight: 700 }}>
                        {item.customer_name?.trim() || item.nickname?.trim() || 'お名前未登録'}
                        {item.nickname && item.nickname !== item.customer_name && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: C.pinkMuted }}>
                            ({item.nickname})
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        <span style={tagStyle}>担当：{item.cast_name || '未設定'}</span>
                        <span style={tagStyle}>{item.nomination_status || '指名状況未設定'}</span>
                        <span style={tagStyle}>{item.customer_rank ? `${item.customer_rank}ランク` : 'ランク未設定'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCustomerId(item.id)}
                      style={{
                        flexShrink: 0,
                        padding: '7px 11px',
                        borderRadius: 10,
                        background: '#FFF0F4',
                        border: `1px solid ${C.pink}`,
                        color: C.pinkDeep,
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      開いて編集
                    </button>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 9.5, color: C.danger, fontWeight: 700 }}>
                    未登録：{item.missing_labels.join('・')}
                  </div>
                </article>
              ))}
            </section>

            {pageCount > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
              }}>
                <button
                  type="button"
                  onClick={() => setPage(value => Math.max(1, value - 1))}
                  disabled={refreshing || currentPage === 1}
                  style={paginationButtonStyle}
                >
                  前へ
                </button>
                <span style={{ minWidth: 62, textAlign: 'center', fontSize: 10, color: C.pinkMuted }}>
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(value => Math.min(pageCount, value + 1))}
                  disabled={refreshing || currentPage === pageCount}
                  style={paginationButtonStyle}
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {editingCustomerId && (
        <>
          <div
            className="data-quality-overlay-bg"
            aria-hidden
          />
          <section
            className="data-quality-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-label="お客様情報を編集"
          >
            <header className="data-quality-overlay-header">
              <button
                type="button"
                onClick={() => setEditingCustomerId(null)}
                aria-label="編集画面を閉じる"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 40,
                  padding: '7px 10px',
                  border: 'none',
                  borderRadius: 10,
                  background: 'transparent',
                  color: C.pink,
                  fontFamily: 'inherit',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                絞り込み結果に戻る
              </button>
              <span style={{ fontSize: 10, color: C.pinkMuted }}>
                保存すると一覧へ戻ります
              </span>
            </header>
            <CustomerDetailPanel
              key={editingCustomerId}
              customerId={editingCustomerId}
              isPC={isPC}
              isAdmin={data?.is_admin === true}
              initialEditing
              onEditCancelled={() => setEditingCustomerId(null)}
              onCustomerUpdated={handleCustomerUpdated}
            />
          </section>
        </>
      )}

      <style>{`
        .data-quality-overlay-bg {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(43, 26, 33, 0.38);
        }
        .data-quality-overlay-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 201;
          width: min(900px, calc(100vw - 72px));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          background: ${C.bg};
          box-shadow: -8px 0 32px rgba(43, 26, 33, 0.18);
          animation: dataQualityPanelIn 0.2s ease-out;
        }
        .data-quality-overlay-header {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: calc(8px + env(safe-area-inset-top, 0px)) 14px 8px;
          border-bottom: 1px solid ${C.border};
          background: ${C.headerBg};
        }
        @keyframes dataQualityPanelIn {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @media (max-width: 700px) {
          .data-quality-filters {
            grid-template-columns: 1fr 1fr !important;
          }
          .data-quality-overlay-panel {
            left: 0;
            width: 100%;
            box-shadow: none;
          }
        }
        @media (max-width: 430px) {
          .data-quality-filters {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <BottomNav />
    </div>
  )
}

const filterStyle: React.CSSProperties = {
  width: '100%',
  height: 42,
  border: `1px solid ${C.border}`,
  borderRadius: 11,
  background: '#FFFAFC',
  color: C.dark,
  padding: '0 10px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontSize: 10,
}

const tagStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 9,
  border: `1px solid ${C.border}`,
  color: C.pinkMuted,
  background: '#FFFAFC',
  fontSize: 9,
}

const paginationButtonStyle: React.CSSProperties = {
  minWidth: 52,
  height: 32,
  padding: '0 10px',
  border: `1px solid ${C.border}`,
  borderRadius: 9,
  background: '#FFF',
  color: C.pinkDeep,
  fontFamily: 'inherit',
  fontSize: 10,
  fontWeight: 700,
  cursor: 'pointer',
}
