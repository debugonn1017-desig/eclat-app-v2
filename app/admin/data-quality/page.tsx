'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import type { CoreCustomerFieldKey } from '@/lib/coreCustomerFields'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

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
  total_customers: number
  incomplete_customers: number
  complete_customers: number
  missing_counts: Record<CoreCustomerFieldKey, number>
  fields: FieldDefinition[]
  casts: Array<{ cast_name: string; display_name: string | null }>
  items: IncompleteCustomer[]
}

const NOMINATION_FILTERS = ['本指名', '場内', 'フリー', '未設定'] as const
const PAGE_SIZE = 50

export default function DataQualityPage() {
  useScrollTopOnMount()
  const [data, setData] = useState<DataQualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [castName, setCastName] = useState('')
  const [nomination, setNomination] = useState('')
  const [missingField, setMissingField] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/admin/data-quality', { cache: 'no-store' })
        const json = await response.json() as DataQualityResponse & { error?: string }
        if (!response.ok) throw new Error(json.error ?? '情報不足の取得に失敗しました')
        if (!cancelled) setData(json)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '情報不足の取得に失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return (data?.items ?? []).filter(item => {
      if (castName === '__unassigned__') {
        if (item.cast_name) return false
      } else if (castName && (item.cast_name ?? '') !== castName) {
        return false
      }
      if (nomination) {
        if (nomination === '未設定') {
          if (item.nomination_status) return false
        } else if (item.nomination_status !== nomination) {
          return false
        }
      }
      if (missingField && !item.missing_fields.includes(missingField as CoreCustomerFieldKey)) return false
      if (normalizedKeyword) {
        const searchText = `${item.customer_name ?? ''} ${item.nickname ?? ''}`.toLowerCase()
        if (!searchText.includes(normalizedKeyword)) return false
      }
      return true
    })
  }, [castName, data, keyword, missingField, nomination])

  useEffect(() => {
    setPage(1)
  }, [castName, keyword, missingField, nomination])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const visibleStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const visibleEnd = Math.min(currentPage * PAGE_SIZE, filtered.length)

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    }}>
      <PageHeader
        title="情報不足チェック"
        subtitle="お客様の基本情報"
        backFallback="/admin/casts"
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
                ['基本情報入力済み', data.complete_customers, C.success],
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
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 8,
                marginTop: 9,
              }}>
                <input
                  value={keyword}
                  onChange={event => setKeyword(event.target.value)}
                  placeholder="お客様名・ニックネーム"
                  style={filterStyle}
                />
                <select value={castName} onChange={event => setCastName(event.target.value)} style={filterStyle}>
                  <option value="">全キャスト</option>
                  <option value="__unassigned__">担当未設定</option>
                  {data.casts.map(cast => (
                    <option key={cast.cast_name} value={cast.cast_name}>
                      {cast.display_name || cast.cast_name}
                    </option>
                  ))}
                </select>
                <select value={nomination} onChange={event => setNomination(event.target.value)} style={filterStyle}>
                  <option value="">全指名状況</option>
                  {NOMINATION_FILTERS.map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <select value={missingField} onChange={event => setMissingField(event.target.value)} style={filterStyle}>
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
                  該当 {filtered.length.toLocaleString()}人
                  {filtered.length > 0 && `（${visibleStart.toLocaleString()}〜${visibleEnd.toLocaleString()}人目）`}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {pageCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPage(value => Math.max(1, value - 1))}
                        disabled={currentPage === 1}
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
                        disabled={currentPage === pageCount}
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
              {filtered.length === 0 ? (
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
                    <Link
                      href={`/customer/${item.id}`}
                      style={{
                        flexShrink: 0,
                        padding: '7px 11px',
                        borderRadius: 10,
                        background: '#FFF0F4',
                        border: `1px solid ${C.pink}`,
                        color: C.pinkDeep,
                        textDecoration: 'none',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      開いて編集
                    </Link>
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
                  disabled={currentPage === 1}
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
                  disabled={currentPage === pageCount}
                  style={paginationButtonStyle}
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @media (max-width: 700px) {
          .data-quality-filters {
            grid-template-columns: 1fr 1fr !important;
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
