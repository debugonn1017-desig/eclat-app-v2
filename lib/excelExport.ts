// ─── Excel 出力ユーティリティ ──────────────────────────────────────
// 顧客来店履歴 / 営業リストを ExcelJS で生成しダウンロードする。
// すべてブラウザ側で完結。サーバ往復なし。
//
// ⚡ パフォーマンス対策（2026-05-09）:
//   ExcelJS は ~500KB ある巨大ライブラリ。static import すると、
//   このファイルを import している5箇所すべてのバンドルが膨らみ
//   ページ初期表示が遅くなる原因に。
//   → loadExcel() で動的 import に切替。ボタン押下時に初めて読み込まれる。

import type {
  Customer, CustomerVisit, CastProfile,
  CustomerContact, CustomerBottle, CustomerMemo,
  CastKPI,
} from '@/types'

// 型のみ import（実行時のバンドルには含まれない、サイズへの影響なし）
import type ExcelJS from 'exceljs'

type ExcelJSModule = typeof import('exceljs')
let _excelJSPromise: Promise<ExcelJSModule> | null = null

/** ExcelJS を動的 import（最初の1回だけネットワーク取得、以降はキャッシュ） */
async function loadExcel(): Promise<ExcelJSModule> {
  if (!_excelJSPromise) {
    _excelJSPromise = import('exceljs')
  }
  return _excelJSPromise
}

// ─── カラーパレット (ARGB) ──────────────────────────────────────
const COLOR = {
  pinkLight: 'FFFBEAF0',
  pinkAccent: 'FFE8789A',
  pinkText: 'FF993556',
  yellow: 'FFFAEEDA',
  yellowText: 'FF633806',
  green: 'FFE1F5EE',
  greenText: 'FF085041',
  red: 'FFFCEBEB',
  redText: 'FF791F1F',
  amber: 'FFFFF4E0',
  gray: 'FFF9F6F7',
  borderGray: 'FFD8D2D5',
  white: 'FFFFFFFF',
}

// ─── ユーティリティ ─────────────────────────────────────────────
const yen = '"¥"#,##0;[Red]"¥"-#,##0'

const todayStr = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const sanitizeFileName = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80)

// シート名は 31 文字まで、特定の文字 NG
const sanitizeSheetName = (s: string): string =>
  s.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet'

const dayOfWeekJa = (dateStr: string): string => {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
}

const daysSince = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

const sumVisits = (visits: CustomerVisit[]) => {
  let total = 0
  let douhan = 0
  let after = 0
  for (const v of visits) {
    total += Number(v.amount_spent || 0)
    if (v.has_douhan) douhan += 1
    if (v.has_after) after += 1
  }
  return {
    count: visits.length,
    total,
    douhan,
    after,
    avg: visits.length > 0 ? Math.round(total / visits.length) : 0,
  }
}

const lastVisitDate = (visits: CustomerVisit[]): string => {
  if (visits.length === 0) return ''
  const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))
  return sorted[0].visit_date
}

const firstVisitDate = (visits: CustomerVisit[]): string => {
  if (visits.length === 0) return ''
  const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1))
  return sorted[0].visit_date
}

const avgIntervalDays = (visits: CustomerVisit[]): number | null => {
  if (visits.length < 2) return null
  const sorted = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1))
  let totalGap = 0
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1].visit_date).getTime()
    const b = new Date(sorted[i].visit_date).getTime()
    totalGap += (b - a) / (1000 * 60 * 60 * 24)
  }
  return Math.round(totalGap / (sorted.length - 1))
}

// ─── スタイルヘルパー ───────────────────────────────────────────
const setHeaderStyle = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    cell.font = { bold: true, color: { argb: COLOR.pinkText }, size: 11 }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: COLOR.borderGray } },
      bottom: { style: 'thin', color: { argb: COLOR.borderGray } },
      left: { style: 'thin', color: { argb: COLOR.borderGray } },
      right: { style: 'thin', color: { argb: COLOR.borderGray } },
    }
  })
  row.height = 22
}

const setSubtotalStyle = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.yellow } }
    cell.font = { bold: true, color: { argb: COLOR.yellowText }, size: 11 }
  })
}

const setGrandTotalStyle = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.green } }
    cell.font = { bold: true, color: { argb: COLOR.greenText }, size: 11 }
  })
}

const setBordersOnRow = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'hair', color: { argb: COLOR.borderGray } },
      bottom: { style: 'hair', color: { argb: COLOR.borderGray } },
      left: { style: 'hair', color: { argb: COLOR.borderGray } },
      right: { style: 'hair', color: { argb: COLOR.borderGray } },
    }
  })
}

// ─── 顧客サマリー シート生成 ────────────────────────────────────
type CustomerSummaryRow = {
  customer: Customer
  visits: CustomerVisit[]
}

const addCustomerSummarySheet = (
  wb: ExcelJS.Workbook,
  rows: CustomerSummaryRow[],
  sheetName = '顧客サマリー'
): ExcelJS.Worksheet => {
  const ws = wb.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  })
  ws.columns = [
    { header: '顧客名', key: 'name', width: 18 },
    { header: 'ニックネーム', key: 'nick', width: 14 },
    { header: '担当', key: 'cast', width: 12 },
    { header: 'ランク', key: 'rank', width: 8 },
    { header: '指名状況', key: 'nom', width: 10 },
    { header: 'フェーズ', key: 'phase', width: 12 },
    { header: '地域', key: 'region', width: 10 },
    { header: '誕生日', key: 'birthday', width: 12 },
    { header: '来店回数', key: 'count', width: 10 },
    { header: '累計売上', key: 'total', width: 14 },
    { header: '平均単価', key: 'avg', width: 14 },
    { header: '初回来店', key: 'first', width: 12 },
    { header: '最終来店', key: 'last', width: 12 },
    { header: '最終来店から', key: 'sinceLast', width: 14 },
    { header: '平均来店間隔', key: 'interval', width: 12 },
    { header: '同伴回数', key: 'douhan', width: 10 },
    { header: 'アフター回数', key: 'after', width: 12 },
    { header: '関係値', key: 'score', width: 8 },
    { header: 'メモ', key: 'memo', width: 28 },
  ]
  setHeaderStyle(ws.getRow(1))

  for (const r of rows) {
    const c = r.customer
    const stat = sumVisits(r.visits)
    const last = lastVisitDate(r.visits)
    const since = last ? daysSince(last) : null
    const interval = avgIntervalDays(r.visits)
    const row = ws.addRow({
      name: c.customer_name || '',
      nick: c.nickname || '',
      cast: c.cast_name || '',
      rank: c.customer_rank || '',
      nom: c.nomination_status || '',
      phase: c.phase || '',
      region: c.region || '',
      birthday: c.birthday || '',
      count: stat.count,
      total: stat.total,
      avg: stat.avg,
      first: firstVisitDate(r.visits) || c.first_visit_date || '',
      last,
      sinceLast: since !== null ? `${since}日前` : '—',
      interval: interval !== null ? `${interval}日` : '—',
      douhan: stat.douhan,
      after: stat.after,
      score: c.score ?? '',
      memo: (c.memo || '').slice(0, 200),
    })
    row.getCell('total').numFmt = yen
    row.getCell('avg').numFmt = yen

    // 最終来店からの日数で背景色を塗り分け
    const sinceCell = row.getCell('sinceLast')
    if (since === null) {
      // データなし: グレー
      sinceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gray } }
    } else if (since >= 90) {
      sinceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.red } }
      sinceCell.font = { color: { argb: COLOR.redText }, bold: true }
    } else if (since >= 60) {
      sinceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.amber } }
      sinceCell.font = { color: { argb: COLOR.yellowText }, bold: true }
    } else if (since >= 30) {
      sinceCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.yellow } }
      sinceCell.font = { color: { argb: COLOR.yellowText } }
    }

    // ランクバッジ
    const rankCell = row.getCell('rank')
    rankCell.alignment = { horizontal: 'center' }
    if (c.customer_rank === 'S') {
      rankCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
      rankCell.font = { color: { argb: COLOR.pinkText }, bold: true }
    }

    setBordersOnRow(row)
  }

  // 最下行: 全体合計
  const grand = rows.reduce(
    (acc, r) => {
      const s = sumVisits(r.visits)
      acc.count += s.count
      acc.total += s.total
      acc.douhan += s.douhan
      acc.after += s.after
      return acc
    },
    { count: 0, total: 0, douhan: 0, after: 0 }
  )
  const grandRow = ws.addRow({
    name: `合計（${rows.length} 名）`,
    count: grand.count,
    total: grand.total,
    avg: grand.count > 0 ? Math.round(grand.total / grand.count) : 0,
    douhan: grand.douhan,
    after: grand.after,
  })
  grandRow.getCell('total').numFmt = yen
  grandRow.getCell('avg').numFmt = yen
  setGrandTotalStyle(grandRow)

  // オートフィルタ
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  }
  return ws
}

// ─── 来店履歴詳細 シート生成（顧客切れ目で小計） ──────────────
// レイアウト:
//   | 顧客名 | 来店日 | 曜日 | 金額 | 同伴 | アフター | 卓番 | メモ |
//   顧客名はピンク背景、小計行は黄色、最下行の総合計は緑。
//   メモ列に「人数」「初回」「同伴連れ名」など補助情報を集約して表示。
const addVisitDetailSheet = (
  wb: ExcelJS.Workbook,
  rows: CustomerSummaryRow[],
  sheetName = '来店履歴'
): ExcelJS.Worksheet => {
  const ws = wb.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  })
  ws.columns = [
    { header: '顧客名', key: 'name', width: 18 },
    { header: '来店日', key: 'date', width: 13 },
    { header: '曜日', key: 'dow', width: 6 },
    { header: '金額', key: 'amount', width: 14 },
    { header: '同伴', key: 'douhan', width: 10 },
    { header: 'アフター', key: 'after', width: 10 },
    { header: '卓番', key: 'table', width: 8 },
    { header: 'メモ', key: 'memo', width: 36 },
  ]
  setHeaderStyle(ws.getRow(1))

  let grandTotal = 0
  let grandCount = 0
  let grandDouhan = 0
  let grandAfter = 0

  // メモ列に補助情報を畳み込む
  const buildMemo = (v: CustomerVisit): string => {
    const parts: string[] = []
    if (v.is_first_visit) parts.push('初回')
    if (v.party_size && Number(v.party_size) > 1) parts.push(`${v.party_size} 名`)
    if (v.companion_honshimei) parts.push(`本指名: ${v.companion_honshimei}`)
    if (v.companion_banai) parts.push(`場内: ${v.companion_banai}`)
    const tag = parts.length > 0 ? `[${parts.join(' / ')}] ` : ''
    return tag + (v.memo || '').slice(0, 180)
  }

  for (const r of rows) {
    const c = r.customer
    if (r.visits.length === 0) {
      // 来店履歴なしの顧客はスキップ（最後にまとめて表示）
      continue
    }

    // 来店履歴行（日付降順）
    const sortedVisits = [...r.visits].sort((a, b) =>
      a.visit_date < b.visit_date ? 1 : -1
    )
    for (const v of sortedVisits) {
      const row = ws.addRow({
        name: c.customer_name || '',
        date: v.visit_date || '',
        dow: dayOfWeekJa(v.visit_date),
        amount: Number(v.amount_spent || 0),
        douhan: v.has_douhan ? '○' : '',
        after: v.has_after ? '○' : '',
        table: v.table_number || '',
        memo: buildMemo(v),
      })
      row.getCell('amount').numFmt = yen
      row.getCell('name').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR.pinkLight },
      }
      row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
      row.getCell('date').alignment = { horizontal: 'center' }
      row.getCell('dow').alignment = { horizontal: 'center' }
      row.getCell('douhan').alignment = { horizontal: 'center' }
      row.getCell('after').alignment = { horizontal: 'center' }
      row.getCell('table').alignment = { horizontal: 'center' }
      row.height = 20
      setBordersOnRow(row)
    }

    // 顧客小計
    const stat = sumVisits(r.visits)
    grandTotal += stat.total
    grandCount += stat.count
    grandDouhan += stat.douhan
    grandAfter += stat.after

    const subRow = ws.addRow({
      name: `${c.customer_name} 小計`,
      date: `${stat.count} 回`,
      amount: stat.total,
      douhan: stat.douhan > 0 ? `同伴 ${stat.douhan}` : '',
      after: stat.after > 0 ? `アフ ${stat.after}` : '',
      memo: stat.count > 0 ? `平均 ${stat.avg.toLocaleString()} 円` : '',
    })
    subRow.getCell('amount').numFmt = yen
    subRow.getCell('date').alignment = { horizontal: 'center' }
    subRow.getCell('douhan').alignment = { horizontal: 'center' }
    subRow.getCell('after').alignment = { horizontal: 'center' }
    subRow.height = 22
    setSubtotalStyle(subRow)
  }

  // 来店履歴なしの顧客（参考情報、まとめて末尾の手前に）
  const noVisitCustomers = rows.filter((r) => r.visits.length === 0)
  if (noVisitCustomers.length > 0) {
    // 区切り見出し行
    const headerRow = ws.addRow({
      name: '— 来店履歴なし —',
      memo: `${noVisitCustomers.length} 名（参考）`,
    })
    headerRow.getCell('name').font = { color: { argb: 'FF7A6065' }, italic: true }
    headerRow.getCell('memo').font = { color: { argb: 'FF7A6065' }, italic: true }
    headerRow.height = 18

    for (const r of noVisitCustomers) {
      const c = r.customer
      const row = ws.addRow({
        name: c.customer_name || '',
        memo: '（来店履歴なし）',
      })
      row.getCell('name').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR.pinkLight },
      }
      row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
      row.getCell('memo').font = { color: { argb: 'FF7A6065' }, italic: true }
      row.height = 18
    }
  }

  // 全体総合計
  const grandRow = ws.addRow({
    name: `総合計（${rows.length} 名 / 来店 ${grandCount} 回）`,
    date: '',
    amount: grandTotal,
    douhan: grandDouhan > 0 ? `同伴 ${grandDouhan}` : '',
    after: grandAfter > 0 ? `アフ ${grandAfter}` : '',
    memo: grandCount > 0 ? `全体平均 ${Math.round(grandTotal / grandCount).toLocaleString()} 円` : '',
  })
  grandRow.getCell('amount').numFmt = yen
  grandRow.getCell('douhan').alignment = { horizontal: 'center' }
  grandRow.getCell('after').alignment = { horizontal: 'center' }
  grandRow.height = 24
  setGrandTotalStyle(grandRow)

  return ws
}

// ─── 単独顧客 シート生成 ────────────────────────────────────────
const addSingleCustomerSheet = (
  wb: ExcelJS.Workbook,
  customer: Customer,
  visits: CustomerVisit[]
): ExcelJS.Worksheet => {
  const ws = wb.addWorksheet(sanitizeSheetName(customer.customer_name || '顧客'))
  ws.columns = [
    { header: '', key: 'a', width: 14 },
    { header: '', key: 'b', width: 14 },
    { header: '', key: 'c', width: 14 },
    { header: '', key: 'd', width: 14 },
    { header: '', key: 'e', width: 14 },
    { header: '', key: 'f', width: 14 },
    { header: '', key: 'g', width: 14 },
    { header: '', key: 'h', width: 14 },
  ]

  // タイトル行
  const titleRow = ws.addRow({
    a: customer.customer_name || '',
    b: customer.customer_rank ? `${customer.customer_rank} ランク` : '',
    c: customer.cast_name ? `担当: ${customer.cast_name}` : '',
  })
  titleRow.getCell('a').font = { size: 18, bold: true, color: { argb: COLOR.pinkText } }
  titleRow.getCell('b').font = { size: 11, color: { argb: COLOR.pinkText } }
  titleRow.getCell('c').font = { size: 11, color: { argb: COLOR.pinkText } }
  titleRow.height = 30

  ws.addRow([]) // 空行

  // サマリーセクション
  const stat = sumVisits(visits)
  const last = lastVisitDate(visits)
  const since = last ? daysSince(last) : null
  const interval = avgIntervalDays(visits)
  const summaryItems: { label: string; value: string | number }[] = [
    { label: '来店回数', value: `${stat.count} 回` },
    { label: '累計売上', value: stat.total.toLocaleString() + ' 円' },
    { label: '平均単価', value: stat.avg.toLocaleString() + ' 円' },
    { label: '同伴回数', value: `${stat.douhan} 回` },
    { label: 'アフター回数', value: `${stat.after} 回` },
    { label: '初回来店', value: firstVisitDate(visits) || customer.first_visit_date || '—' },
    { label: '最終来店', value: last || '—' },
    { label: '最終来店から', value: since !== null ? `${since} 日前` : '—' },
    { label: '平均来店間隔', value: interval !== null ? `${interval} 日` : '—' },
    { label: '誕生日', value: customer.birthday || '—' },
    { label: '指名状況', value: customer.nomination_status || '—' },
    { label: 'フェーズ', value: customer.phase || '—' },
    { label: '地域', value: customer.region || '—' },
    { label: '関係値', value: customer.score ?? '—' },
  ]

  // 2 列レイアウトで配置 (label, value, label, value, label, value, label, value)
  for (let i = 0; i < summaryItems.length; i += 4) {
    const items = summaryItems.slice(i, i + 4)
    const rowData: Record<string, string | number> = {}
    items.forEach((it, idx) => {
      const labelKey = String.fromCharCode('a'.charCodeAt(0) + idx * 2)
      const valueKey = String.fromCharCode('a'.charCodeAt(0) + idx * 2 + 1)
      rowData[labelKey] = it.label
      rowData[valueKey] = it.value
    })
    const row = ws.addRow(rowData)
    items.forEach((_, idx) => {
      const labelKey = String.fromCharCode('a'.charCodeAt(0) + idx * 2)
      const valueKey = String.fromCharCode('a'.charCodeAt(0) + idx * 2 + 1)
      const lc = row.getCell(labelKey)
      lc.font = { size: 9, color: { argb: 'FF7A6065' } }
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gray } }
      const vc = row.getCell(valueKey)
      vc.font = { size: 12, bold: true, color: { argb: COLOR.pinkText } }
    })
    row.height = 22
  }

  ws.addRow([]) // 空行
  ws.addRow([]) // 空行

  // 来店履歴ヘッダー
  const headerRow = ws.addRow({
    a: '来店日',
    b: '曜日',
    c: '金額',
    d: '同伴',
    e: 'アフター',
    f: '卓番',
    g: '人数',
    h: 'メモ',
  })
  setHeaderStyle(headerRow)

  // 来店履歴本体
  const sortedVisits = [...visits].sort((a, b) => (a.visit_date < b.visit_date ? 1 : -1))
  for (const v of sortedVisits) {
    const row = ws.addRow({
      a: v.visit_date || '',
      b: dayOfWeekJa(v.visit_date),
      c: Number(v.amount_spent || 0),
      d: v.has_douhan ? '○' : '',
      e: v.has_after ? '○' : '',
      f: v.table_number || '',
      g: v.party_size || '',
      h: (v.memo || '').slice(0, 200),
    })
    row.getCell('c').numFmt = yen
    row.getCell('a').alignment = { horizontal: 'center' }
    row.getCell('b').alignment = { horizontal: 'center' }
    setBordersOnRow(row)
  }

  // 小計行
  const subRow = ws.addRow({
    a: '合計',
    b: `${stat.count} 回`,
    c: stat.total,
    d: stat.douhan,
    e: stat.after,
    h: stat.count > 0 ? `平均 ${stat.avg.toLocaleString()} 円` : '',
  })
  subRow.getCell('c').numFmt = yen
  setSubtotalStyle(subRow)

  return ws
}

// ─── ダウンロード処理 ───────────────────────────────────────────
const downloadWorkbook = async (wb: ExcelJS.Workbook, filename: string): Promise<void> => {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const safeName = sanitizeFileName(filename)
  const finalName = safeName.endsWith('.xlsx') ? safeName : `${safeName}.xlsx`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = finalName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── 公開 API ────────────────────────────────────────────────────

// 機能 A-1: キャストの全顧客履歴を出力（最大 6 シート）
//   既存: 顧客サマリー / 来店履歴
//   D-② 拡張: 連絡履歴 / ボトル / メモ / 月別累計
export async function exportCastAllCustomers(params: {
  cast: CastProfile
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
  /** 任意: 各顧客の連絡履歴（拡張） */
  contactsByCustomer?: Record<string, CustomerContact[]>
  /** 任意: 各顧客のボトル一覧（拡張） */
  bottlesByCustomer?: Record<string, CustomerBottle[]>
  /** 任意: 各顧客のメモ一覧（拡張） */
  memosByCustomer?: Record<string, CustomerMemo[]>
}): Promise<void> {
  const {
    cast, customers, visitsByCustomer,
    contactsByCustomer = {},
    bottlesByCustomer = {},
    memosByCustomer = {},
  } = params
  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  const rows: CustomerSummaryRow[] = customers.map((c) => ({
    customer: c,
    visits: visitsByCustomer[c.id] ?? [],
  }))

  // 累計売上で降順ソート
  rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)

  // 既存2シート
  addCustomerSummarySheet(wb, rows, '顧客サマリー')
  addVisitDetailSheet(wb, rows, '来店履歴')

  // 連絡履歴シート
  if (Object.keys(contactsByCustomer).length > 0) {
    const ws = wb.addWorksheet('連絡履歴')
    ws.columns = [
      { header: '顧客名', key: 'name', width: 18 },
      { header: '連絡日', key: 'date', width: 12 },
      { header: '送受信', key: 'dir', width: 10 },
      { header: '手段', key: 'channel', width: 10 },
      { header: 'メモ', key: 'memo', width: 50 },
    ]
    setHeaderStyle(ws.getRow(1))
    for (const r of rows) {
      const list = contactsByCustomer[r.customer.id] ?? []
      const sorted = [...list].sort((a, b) => (a.contact_date < b.contact_date ? 1 : -1))
      for (const ct of sorted) {
        const row = ws.addRow({
          name: r.customer.customer_name || '',
          date: ct.contact_date,
          dir: ct.direction === 'sent' ? '送信' : '受信',
          channel: ct.channel || '',
          memo: (ct.memo || '').slice(0, 200),
        })
        row.getCell('name').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
        row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
        if (ct.direction === 'sent') {
          row.getCell('dir').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.yellow } }
          row.getCell('dir').font = { color: { argb: COLOR.yellowText } }
        } else {
          row.getCell('dir').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.green } }
          row.getCell('dir').font = { color: { argb: COLOR.greenText } }
        }
        setBordersOnRow(row)
      }
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } }
  }

  // ボトル一覧シート
  if (Object.keys(bottlesByCustomer).length > 0) {
    const ws = wb.addWorksheet('ボトル')
    ws.columns = [
      { header: '顧客名', key: 'name', width: 18 },
      { header: 'ランク', key: 'rank', width: 8 },
      { header: 'ボトル名', key: 'bottle', width: 24 },
      { header: '残量', key: 'remain', width: 12 },
      { header: '備考', key: 'notes', width: 36 },
      { header: '登録日', key: 'created', width: 12 },
    ]
    setHeaderStyle(ws.getRow(1))
    for (const r of rows) {
      const list = bottlesByCustomer[r.customer.id] ?? []
      for (const b of list) {
        const row = ws.addRow({
          name: r.customer.customer_name || '',
          rank: r.customer.customer_rank || '',
          bottle: b.bottle_name || '',
          remain: b.remaining_amount || '',
          notes: (b.notes || '').slice(0, 180),
          created: (b.created_at || '').slice(0, 10),
        })
        row.getCell('name').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
        row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
        setBordersOnRow(row)
      }
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } }
  }

  // メモ履歴シート
  if (Object.keys(memosByCustomer).length > 0) {
    const ws = wb.addWorksheet('メモ履歴')
    ws.columns = [
      { header: '顧客名', key: 'name', width: 18 },
      { header: '日付', key: 'date', width: 12 },
      { header: '区分', key: 'cat', width: 10 },
      { header: '内容', key: 'content', width: 60 },
    ]
    setHeaderStyle(ws.getRow(1))
    for (const r of rows) {
      const list = memosByCustomer[r.customer.id] ?? []
      const sorted = [...list].sort((a, b) => (a.memo_date < b.memo_date ? 1 : -1))
      for (const m of sorted) {
        const row = ws.addRow({
          name: r.customer.customer_name || '',
          date: m.memo_date,
          cat: m.category || '',
          content: (m.content || '').slice(0, 400),
        })
        row.getCell('name').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
        row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
        if (m.category === '重要') {
          row.getCell('cat').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.red } }
          row.getCell('cat').font = { color: { argb: COLOR.redText }, bold: true }
        }
        setBordersOnRow(row)
      }
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } }
  }

  // 月別累計ピボット（過去12ヶ月）
  {
    const ws = wb.addWorksheet('月別累計')
    // 列ヘッダー: 顧客名 / 過去12ヶ月の YYYY-MM / 累計
    const todayD = new Date()
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(todayD.getFullYear(), todayD.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const cols: Array<{ header: string; key: string; width: number }> = [
      { header: '顧客名', key: 'name', width: 18 },
      { header: 'ランク', key: 'rank', width: 8 },
    ]
    for (const m of months) cols.push({ header: m.slice(2), key: m, width: 11 })
    cols.push({ header: '累計', key: 'total', width: 14 })
    ws.columns = cols
    setHeaderStyle(ws.getRow(1))

    for (const r of rows) {
      const monthMap = new Map<string, number>()
      for (const v of r.visits) {
        const a = Number(v.amount_spent) || 0
        if (a <= 0) continue
        const ym = (v.visit_date || '').slice(0, 7)
        monthMap.set(ym, (monthMap.get(ym) ?? 0) + a)
      }
      let total = 0
      const data: Record<string, number | string> = {
        name: r.customer.customer_name || '',
        rank: r.customer.customer_rank || '',
      }
      for (const m of months) {
        const v = monthMap.get(m) ?? 0
        data[m] = v
        total += v
      }
      data.total = total
      if (total === 0) continue // 全月ゼロは除外
      const row = ws.addRow(data)
      row.getCell('name').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
      row.getCell('name').font = { color: { argb: COLOR.pinkText }, bold: true }
      for (const m of months) {
        const cell = row.getCell(m)
        cell.numFmt = yen
        if (typeof data[m] === 'number' && (data[m] as number) > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gray } }
        }
      }
      const totalCell = row.getCell('total')
      totalCell.numFmt = yen
      totalCell.font = { bold: true, color: { argb: COLOR.greenText } }
      setBordersOnRow(row)
    }
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  }

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_顧客履歴_${todayStr()}.xlsx`)
}

// ─── 本指名のみエクセル出力（スクショと同じレイアウト） ────────────
//   レイアウト:
//   | 顧客名 | 地域 | 最終来店日 | 来店日 | 曜日 | 金額 | メモ | 自由記入欄 | ランク |
//   - 顧客名・地域・最終来店日は **縦方向にセル結合** して
//     その顧客の来店行全体にまたがる（垂直中央表示）
//   - 来店履歴を日付降順で全件展開
//   - 顧客切れ目に「{顧客名} 小計」行 + 平均 N 円
//   - 自由記入欄 / ランクは空白（後でユーザーが手書きで埋める用）
//   - 顧客ブロックを **太い罫線** で囲む
const addHonshimeiVisitListSheet = (
  wb: ExcelJS.Workbook,
  rows: CustomerSummaryRow[],
  sheetName = '本指名顧客'
): ExcelJS.Worksheet => {
  const ws = wb.addWorksheet(sanitizeSheetName(sheetName), {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  })
  ws.columns = [
    { header: '顧客名', key: 'name', width: 18 },
    { header: '地域', key: 'region', width: 10 },
    { header: '最終来店日', key: 'lastVisit', width: 12 },
    { header: '来店日', key: 'date', width: 12 },
    { header: '曜日', key: 'dow', width: 6 },
    { header: '金額', key: 'amount', width: 14 },
    { header: 'メモ', key: 'memo', width: 18 },
    { header: '自由記入欄', key: 'free', width: 40 },
    { header: 'ランク', key: 'rank', width: 8 },
  ]
  setHeaderStyle(ws.getRow(1))

  let grandTotal = 0
  let grandCount = 0

  // メモ列の補助情報（人数・初回・同伴連れ）
  const buildMemo = (v: CustomerVisit): string => {
    const parts: string[] = []
    if (v.is_first_visit) parts.push('初回')
    if (v.party_size && Number(v.party_size) > 1) parts.push(`${v.party_size} 名`)
    if (v.companion_honshimei) parts.push(`本指名: ${v.companion_honshimei}`)
    if (v.companion_banai) parts.push(`場内: ${v.companion_banai}`)
    return parts.length > 0 ? `[${parts.join(' / ')}]` : (v.memo || '')
  }

  for (const r of rows) {
    const c = r.customer
    if (r.visits.length === 0) continue // 来店履歴 0 のお客様はスキップ

    const sortedVisits = [...r.visits].sort((a, b) =>
      a.visit_date < b.visit_date ? 1 : -1
    )
    const last = sortedVisits[0]?.visit_date || ''

    // この顧客の visit ブロックの開始行を記録（後で merge するため）
    const blockStartRow = ws.lastRow ? ws.lastRow.number + 1 : 2

    for (let i = 0; i < sortedVisits.length; i++) {
      const v = sortedVisits[i]
      const row = ws.addRow({
        // 顧客情報は先頭行に書く（merge 後は中央に1度だけ表示される）
        name: i === 0 ? (c.customer_name || '') : '',
        region: i === 0 ? (c.region || '') : '',
        lastVisit: i === 0 ? last : '',
        date: v.visit_date || '',
        dow: dayOfWeekJa(v.visit_date),
        amount: Number(v.amount_spent || 0),
        memo: buildMemo(v),
        free: '',
        rank: '',
      })
      row.getCell('amount').numFmt = yen
      row.getCell('date').alignment = { horizontal: 'center' }
      row.getCell('dow').alignment = { horizontal: 'center' }
      row.getCell('rank').alignment = { horizontal: 'center' }
      setBordersOnRow(row)
    }

    const blockEndRow = ws.lastRow ? ws.lastRow.number : blockStartRow

    // ⚠ 顧客名(A) / 地域(B) / 最終来店日(C) を縦方向に結合（visit 行が複数あるとき）
    if (sortedVisits.length > 1) {
      ws.mergeCells(blockStartRow, 1, blockEndRow, 1) // 顧客名
      ws.mergeCells(blockStartRow, 2, blockEndRow, 2) // 地域
      ws.mergeCells(blockStartRow, 3, blockEndRow, 3) // 最終来店日
    }

    // マージ後のセルにスタイル付与（垂直中央 + ピンク背景）
    const nameCell = ws.getCell(blockStartRow, 1)
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    nameCell.font = { color: { argb: COLOR.pinkText }, bold: true }
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

    const regionCell = ws.getCell(blockStartRow, 2)
    regionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    regionCell.alignment = { vertical: 'middle', horizontal: 'center' }

    const lastCell = ws.getCell(blockStartRow, 3)
    lastCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    lastCell.alignment = { vertical: 'middle', horizontal: 'center' }

    // ⚠ 自由記入欄(H) / ランク(I) も縦結合（visits + 小計行 1つ分まで含めて1つに）
    //   ※ 小計行はこの直後に追加されるので、blockEndRow+1 まで含める
    //   これで「お客様1人につき自由記入欄を1つ、ランクを1つ」だけ書ける状態に

    // 顧客ブロック全体を **黒い太線** で囲む（上下左右の外周）
    //   ⚠ 元のグレー medium だと弱すぎて視覚的にブロック感が出なかった
    //     → 黒に近い色 + thick スタイルで顧客ごとの境目をはっきり見せる
    const BLOCK_BORDER = { style: 'thick' as const, color: { argb: 'FF1A1A1A' } }
    for (let col = 1; col <= 9; col++) {
      const top = ws.getCell(blockStartRow, col)
      const bottom = ws.getCell(blockEndRow, col)
      top.border = { ...top.border, top: BLOCK_BORDER }
      bottom.border = { ...bottom.border, bottom: BLOCK_BORDER }
    }
    // 左端 (A) と右端 (I) の縦線
    for (let row = blockStartRow; row <= blockEndRow; row++) {
      const left = ws.getCell(row, 1)
      const right = ws.getCell(row, 9)
      left.border = { ...left.border, left: BLOCK_BORDER }
      right.border = { ...right.border, right: BLOCK_BORDER }
    }
    // 「顧客情報(A-C)」と「来店データ(D-I)」の境目（C列右側）も太線
    for (let row = blockStartRow; row <= blockEndRow; row++) {
      const c = ws.getCell(row, 3)
      c.border = { ...c.border, right: BLOCK_BORDER }
      const d = ws.getCell(row, 4)
      d.border = { ...d.border, left: BLOCK_BORDER }
    }

    // 顧客小計
    const stat = sumVisits(r.visits)
    grandTotal += stat.total
    grandCount += stat.count

    const subRow = ws.addRow({
      name: `${c.customer_name} 小計`,
      date: `${stat.count} 回`,
      amount: stat.total,
      memo: stat.count > 0 ? `平均 ${stat.avg.toLocaleString()} 円` : '',
    })
    subRow.getCell('amount').numFmt = yen
    subRow.getCell('date').alignment = { horizontal: 'center' }
    setSubtotalStyle(subRow)

    // ⚠ 自由記入欄(H) と ランク(I) を「visits 全行 + 小計行」まで一気にマージ
    //    （拓馬さんが手動でやってた変更を取り込み: 1顧客につき1メモ・1ランクだけ書ければ十分）
    const subtotalRow = subRow.number
    if (subtotalRow > blockStartRow) {
      // すでに先のループで visits の H/I に値を書いてしまっていると merge できないので
      // 念のため再度値クリアしてから merge する
      for (let row = blockStartRow; row <= subtotalRow; row++) {
        ws.getCell(row, 8).value = null
        ws.getCell(row, 9).value = null
      }
      ws.mergeCells(blockStartRow, 8, subtotalRow, 8) // 自由記入欄
      ws.mergeCells(blockStartRow, 9, subtotalRow, 9) // ランク
      // マージ後の中央セルに垂直中央寄せ
      const freeCell = ws.getCell(blockStartRow, 8)
      freeCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      const rankCell = ws.getCell(blockStartRow, 9)
      rankCell.alignment = { vertical: 'middle', horizontal: 'center' }
    }

    // ブロック太枠を小計行も含めて再適用（visit-only で適用済みなので、subtotal 行に追加）
    for (let col = 1; col <= 9; col++) {
      const sub = ws.getCell(subtotalRow, col)
      sub.border = {
        ...sub.border,
        bottom: BLOCK_BORDER, // 顧客ブロックの下境界は小計行の下に
        left: col === 1 ? BLOCK_BORDER : sub.border?.left,
        right: col === 9 ? BLOCK_BORDER : sub.border?.right,
      }
    }
    // C/D の境界の太線も小計行に拡張
    const subC = ws.getCell(subtotalRow, 3)
    subC.border = { ...subC.border, right: BLOCK_BORDER }
    const subD = ws.getCell(subtotalRow, 4)
    subD.border = { ...subD.border, left: BLOCK_BORDER }
    // visits の最終行の下線は外す（小計行と一体化するため）
    for (let col = 1; col <= 9; col++) {
      const lastVisit = ws.getCell(blockEndRow, col)
      lastVisit.border = { ...lastVisit.border, bottom: undefined }
    }
  }

  // 全体総合計
  const grandRow = ws.addRow({
    name: `総合計（${rows.length} 名 / 来店 ${grandCount} 回）`,
    amount: grandTotal,
    memo: grandCount > 0 ? `全体平均 ${Math.round(grandTotal / grandCount).toLocaleString()} 円` : '',
  })
  grandRow.getCell('amount').numFmt = yen
  setGrandTotalStyle(grandRow)

  return ws
}

// 機能 A-1b: 本指名のお客様だけを「画像と同じレイアウト」で出力
//   nomination_status = '本指名' のお客様だけにフィルター。
//   1顧客の中で複数来店があれば日付降順で全部展開し、顧客切れ目で小計。
export async function exportCastHonshimeiList(params: {
  cast: CastProfile
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
}): Promise<void> {
  const { cast, customers, visitsByCustomer } = params

  // 本指名のみフィルター
  const honshimeiCustomers = customers.filter(c => c.nomination_status === '本指名')
  if (honshimeiCustomers.length === 0) {
    // v0.3.49-E: lib では hook (toast) が使えないため throw し、呼び出し側 catch で表示する
    throw new Error('本指名のお客様がいません')
  }

  const ExcelJS_runtime = await loadExcel()
  const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  const rows: CustomerSummaryRow[] = honshimeiCustomers.map((c) => ({
    customer: c,
    visits: visitsByCustomer[c.id] ?? [],
  }))

  // 累計売上で降順ソート（売上多い人から上に並ぶ）
  rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)

  addHonshimeiVisitListSheet(wb, rows, '本指名顧客')

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_本指名顧客_${todayStr()}.xlsx`)
}

// 機能 A-2: 単独顧客の履歴を出力
export async function exportSingleCustomer(params: {
  customer: Customer
  visits: CustomerVisit[]
}): Promise<void> {
  const { customer, visits } = params
  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  addSingleCustomerSheet(wb, customer, visits)

  const customerName = customer.customer_name || 'customer'
  await downloadWorkbook(wb, `${customerName}_来店履歴_${todayStr()}.xlsx`)
}

// 機能 B: 営業リスト出力（フィルター結果から）
export async function exportSalesList(params: {
  title: string // 例: "今月誕生日"、"90日以上未来店"
  filterDescription: string // モーダルから渡す詳細条件
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
  castName?: string
}): Promise<void> {
  const { title, filterDescription, customers, visitsByCustomer, castName } = params
  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  const rows: CustomerSummaryRow[] = customers.map((c) => ({
    customer: c,
    visits: visitsByCustomer[c.id] ?? [],
  }))
  rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)

  // 1 シート目に営業リスト概要
  const summaryWs = addCustomerSummarySheet(wb, rows, '営業リスト')
  // フィルター条件を上に追記したいが、列構造を崩したくないのでセル A 列の上に挿入
  summaryWs.spliceRows(1, 0, [`【${title}】 ${filterDescription}`])
  const titleRow = summaryWs.getRow(1)
  titleRow.height = 24
  titleRow.getCell(1).font = { size: 13, bold: true, color: { argb: COLOR.pinkText } }
  titleRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR.pinkLight },
  }
  // タイトルセルを列範囲でマージ
  const lastCol = summaryWs.columnCount
  if (lastCol > 1) {
    summaryWs.mergeCells(1, 1, 1, lastCol)
  }
  // ヘッダー行が 2 行目になったので autoFilter を再設定
  summaryWs.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: lastCol },
  }
  summaryWs.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]

  // 2 シート目に対象顧客の来店履歴詳細
  addVisitDetailSheet(wb, rows, '来店履歴')

  const prefix = castName ? `${castName}_` : ''
  await downloadWorkbook(
    wb,
    `${prefix}${title}_営業リスト_${todayStr()}.xlsx`
  )
}

// ───────────────────────────────────────────────────────
//  B-1: 全キャスト本指名 Excel (C 案 — ハイブリッド)
//   シート 1 = 全店サマリー（全キャスト × 本指名顧客のフラット表）
//   シート 2 以降 = 各キャストの本指名顧客 (既存 addHonshimeiVisitListSheet を再利用)
//
//   キャスト分析ページの出力タブ + 「レポート.全店ビュー」権限ゲート
// ───────────────────────────────────────────────────────
export async function exportAllCastsHonshimeiList(params: {
  casts: CastProfile[]
  /** cast_id → customers[] のマップ */
  customersByCast: Record<string, Customer[]>
  /** customer_id → visits[] のマップ（全キャスト分混ざっていて良い） */
  visitsByCustomer: Record<string, CustomerVisit[]>
}): Promise<void> {
  const { casts, customersByCast, visitsByCustomer } = params

  // 本指名顧客が 1 人以上いるキャストのみ対象
  const targetCasts: { cast: CastProfile; rows: CustomerSummaryRow[] }[] = []
  for (const cast of casts) {
    const list = (customersByCast[cast.id] ?? [])
      .filter(c => c.nomination_status === '本指名')
    if (list.length === 0) continue
    const rows: CustomerSummaryRow[] = list.map(c => ({
      customer: c,
      visits: visitsByCustomer[c.id] ?? [],
    }))
    rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)
    targetCasts.push({ cast, rows })
  }

  if (targetCasts.length === 0) {
    // v0.3.49-E: lib では hook (toast) が使えないため throw し、呼び出し側 catch で表示する
    throw new Error('本指名のお客様がいるキャストが見つかりません')
  }

  const ExcelJS_runtime = await loadExcel()
  const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  // ─── シート 1: 全店サマリー（フラット表）──────────────────
  const sumWs = wb.addWorksheet('全店サマリー')
  sumWs.columns = [
    { header: 'キャスト名', key: 'castName', width: 14 },
    { header: '層', key: 'tier', width: 8 },
    { header: '顧客名', key: 'customerName', width: 16 },
    { header: 'ニックネーム', key: 'nickname', width: 14 },
    { header: '誕生日', key: 'birthday', width: 12 },
    { header: '地域', key: 'region', width: 10 },
    { header: 'ランク', key: 'rank', width: 7 },
    { header: '指名経路', key: 'route', width: 12 },
    { header: '初来店日', key: 'firstVisit', width: 12 },
    { header: '最終来店日', key: 'lastVisit', width: 12 },
    { header: '経過日数', key: 'daysSince', width: 9 },
    { header: '来店回数', key: 'visitCount', width: 9 },
    { header: '累計売上', key: 'totalSales', width: 13 },
    { header: '平均単価', key: 'avgSpend', width: 13 },
    { header: '自由記入欄', key: 'memo', width: 30 },
  ]

  // ヘッダー行スタイル
  const headerRow = sumWs.getRow(1)
  headerRow.font = { bold: true, color: { argb: COLOR.white } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkText } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 24

  const today = new Date()
  for (const { cast, rows } of targetCasts) {
    for (const { customer, visits } of rows) {
      const { total } = sumVisits(visits)
      const sortedVisits = [...visits].sort((a, b) =>
        a.visit_date < b.visit_date ? -1 : a.visit_date > b.visit_date ? 1 : 0,
      )
      const first = sortedVisits[0]?.visit_date ?? customer.first_visit_date ?? ''
      const last = sortedVisits[sortedVisits.length - 1]?.visit_date ?? first
      const daysSince = last
        ? Math.floor((today.getTime() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
        : ''
      // 平均単価（売上のある来店だけで計算）
      const paidVisits = visits.filter(v => Number(v.amount_spent || 0) > 0)
      const avgSpend = paidVisits.length > 0
        ? Math.round(paidVisits.reduce((a, v) => a + Number(v.amount_spent || 0), 0) / paidVisits.length)
        : 0
      sumWs.addRow({
        castName: cast.display_name || cast.cast_name || '',
        tier: cast.cast_tier ?? '',
        customerName: customer.customer_name ?? '',
        nickname: customer.nickname ?? '',
        birthday: customer.birthday ?? '',
        region: customer.region ?? '',
        rank: customer.customer_rank ?? '',
        route: customer.nomination_route ?? '',
        firstVisit: first,
        lastVisit: last,
        daysSince,
        visitCount: visits.length,
        totalSales: total,
        avgSpend,
        memo: customer.memo ?? customer.final_recommended_note ?? '',
      })
    }
  }

  // 累計売上・平均単価に通貨フォーマット
  sumWs.getColumn('totalSales').numFmt = '¥#,##0'
  sumWs.getColumn('avgSpend').numFmt = '¥#,##0'
  // フィルター + 1 行目フリーズ
  if (sumWs.rowCount > 1) {
    sumWs.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sumWs.columnCount },
    }
  }
  sumWs.views = [{ state: 'frozen', ySplit: 1 }]

  // ─── シート 2 以降: 各キャストの詳細シート ────────────────
  for (const { cast, rows } of targetCasts) {
    const castName = cast.display_name || cast.cast_name || '無名'
    // シート名の安全化: Excel は 31 文字制限 + 一部記号禁止
    const safeName = castName.replace(/[\\\/\*\?\[\]:]/g, '_').slice(0, 28)
    addHonshimeiVisitListSheet(wb, rows, safeName)
  }

  await downloadWorkbook(wb, `全キャスト本指名顧客_${todayStr()}.xlsx`)
}

// ───────────────────────────────────────────────────────
//  D-① 営業アクションリスト Excel
//  検知タブの全リストを1ファイル8-9シートに集約。
//  しきい値は UI と同じデフォルト（30/60/90/1.5/30%/14/180）を使用。
// ───────────────────────────────────────────────────────
export async function exportSalesActionList(params: {
  cast: CastProfile
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
  /** 場内獲得日特定用（省略時は first_visit_date を使う） */
  nominationHistoryByCustomer?: Record<string, Array<{ new_status: string; changed_at: string }>>
  thresholds?: {
    noContactDays?: number
    douhanInactiveDays?: number
    dropoutDays?: number
    anomalyRatio?: number
    salesDeclinePct?: number
    birthdayDays?: number
    banaiCutoffDays?: number
  }
}): Promise<void> {
  const {
    cast, customers, visitsByCustomer,
    nominationHistoryByCustomer = {},
    thresholds = {},
  } = params
  const noContactDays    = thresholds.noContactDays    ?? 30
  const douhanInactiveDays = thresholds.douhanInactiveDays ?? 60
  const dropoutDays      = thresholds.dropoutDays      ?? 90
  const anomalyRatio     = thresholds.anomalyRatio     ?? 1.5
  const salesDeclinePct  = thresholds.salesDeclinePct  ?? 30
  const birthdayDays     = thresholds.birthdayDays     ?? 14
  const banaiCutoffDays  = thresholds.banaiCutoffDays  ?? 180

  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  const today = Date.now()

  // ─── 共通ヘルパー ───
  const sortedVisits = (id: string): CustomerVisit[] => {
    const vs = (visitsByCustomer[id] ?? []).filter(v => Number(v.amount_spent) > 0)
    return [...vs].sort((a, b) => (a.visit_date < b.visit_date ? -1 : 1))
  }
  const lastVisit = (id: string): string | null => {
    const vs = sortedVisits(id)
    return vs.length > 0 ? vs[vs.length - 1].visit_date : null
  }
  const customerLastVisitDays = (id: string): number | null => {
    const lv = lastVisit(id)
    return lv ? Math.floor((today - new Date(lv).getTime()) / 86400000) : null
  }
  const customerLastContactDays = (c: Customer): number | null => {
    if (!c.last_contact_date) return null
    return Math.floor((today - new Date(c.last_contact_date).getTime()) / 86400000)
  }

  // 共通の汎用テーブル：エクセルシート1枚＋ヘッダ＋色分け行
  type ActionRow = {
    name: string
    rank: string
    region: string
    nomination: string
    metric: string  // 表示用主指標（例: "32日連絡なし"）
    metricValue?: number  // 色分けの基準
    note?: string
  }
  const buildActionSheet = (
    sheetName: string,
    headerLine: string,
    rows: ActionRow[],
    options: { redThreshold?: number; yellowThreshold?: number } = {},
  ) => {
    const ws = wb.addWorksheet(sanitizeSheetName(sheetName))
    // タイトル行
    ws.addRow([`【${sheetName}】 ${headerLine}（${rows.length}名 / ${todayStr()} 時点）`])
    ws.mergeCells(1, 1, 1, 6)
    const t = ws.getRow(1)
    t.height = 24
    t.getCell(1).font = { size: 12, bold: true, color: { argb: COLOR.pinkText } }
    t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    t.getCell(1).alignment = { vertical: 'middle' }
    // ヘッダ行
    ws.columns = [
      { key: 'name', width: 20 },
      { key: 'rank', width: 8 },
      { key: 'region', width: 12 },
      { key: 'nomination', width: 10 },
      { key: 'metric', width: 22 },
      { key: 'note', width: 30 },
    ]
    const hr = ws.addRow({ name: '顧客名', rank: 'ランク', region: '地域', nomination: '指名', metric: '主指標', note: '補足' })
    setHeaderStyle(hr)
    // データ行
    for (const r of rows) {
      const row = ws.addRow({
        name: r.name, rank: r.rank, region: r.region, nomination: r.nomination,
        metric: r.metric, note: r.note ?? '',
      })
      setBordersOnRow(row)
      // 色分け
      if (options.redThreshold != null && r.metricValue != null && r.metricValue >= options.redThreshold) {
        row.getCell('metric').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.red } }
        row.getCell('metric').font = { color: { argb: COLOR.redText }, bold: true }
      } else if (options.yellowThreshold != null && r.metricValue != null && r.metricValue >= options.yellowThreshold) {
        row.getCell('metric').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.yellow } }
        row.getCell('metric').font = { color: { argb: COLOR.yellowText }, bold: true }
      }
    }
    if (rows.length === 0) {
      const empty = ws.addRow({ name: '— 該当なし —' })
      empty.getCell('name').font = { italic: true, color: { argb: 'FF7A6065' } }
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
    return ws
  }

  // ─── ① S/A × 連絡なし ───
  const sheet1: ActionRow[] = customers
    .filter(c => ['S', 'A'].includes(c.customer_rank ?? ''))
    .map(c => ({ c, days: customerLastContactDays(c) }))
    .filter(x => x.days === null || x.days >= noContactDays)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .map(({ c, days }) => ({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: c.nomination_status ?? '',
      metric: days != null ? `${days}日連絡なし` : '連絡履歴なし',
      metricValue: days ?? 9999,
      note: c.last_contact_date ? `最終連絡: ${c.last_contact_date}` : '',
    }))
  buildActionSheet('S A連絡なし', `${noContactDays}日以上 連絡なしの S/Aランク`, sheet1,
    { redThreshold: 60, yellowThreshold: 30 })

  // ─── ② 同伴経験 × 未来店 ───
  const sheet2: ActionRow[] = customers
    .filter(c => {
      const vs = sortedVisits(c.id)
      return vs.some(v => v.has_douhan)
    })
    .map(c => ({ c, days: customerLastVisitDays(c.id) }))
    .filter(x => x.days != null && x.days >= douhanInactiveDays)
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
    .map(({ c, days }) => ({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: c.nomination_status ?? '',
      metric: `${days}日未来店`,
      metricValue: days ?? 0,
      note: '同伴経験あり',
    }))
  buildActionSheet('同伴未来店', `同伴経験 × ${douhanInactiveDays}日未来店`, sheet2,
    { redThreshold: 90, yellowThreshold: 60 })

  // ─── ③ 離脱リスク（本指名 × 未来店） ───
  const sheet3: ActionRow[] = customers
    .filter(c => c.nomination_status === '本指名')
    .map(c => ({ c, days: customerLastVisitDays(c.id) }))
    .filter(x => x.days != null && x.days >= dropoutDays)
    .sort((a, b) => {
      const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 }
      return (order[a.c.customer_rank ?? 'C'] ?? 4) - (order[b.c.customer_rank ?? 'C'] ?? 4)
    })
    .map(({ c, days }) => ({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: '本指名',
      metric: `${days}日未来店`,
      metricValue: days ?? 0,
      note: 'Sランク優先',
    }))
  buildActionSheet('離脱リスク', `本指名 × ${dropoutDays}日未来店`, sheet3,
    { redThreshold: 120, yellowThreshold: 90 })

  // ─── ④ 個別周期 × N 倍超過 ───
  const sheet4: ActionRow[] = []
  for (const c of customers) {
    const dates = sortedVisits(c.id).map(v => v.visit_date)
    if (dates.length < 2) continue
    let totalGap = 0
    for (let i = 1; i < dates.length; i++) {
      totalGap += (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000
    }
    const avgInterval = totalGap / (dates.length - 1)
    if (avgInterval < 7) continue
    const lastDate = new Date(dates[dates.length - 1])
    const since = (today - lastDate.getTime()) / 86400000
    const ratio = since / avgInterval
    if (ratio < anomalyRatio) continue
    sheet4.push({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: c.nomination_status ?? '',
      metric: `${Math.round(since)}日 (×${ratio.toFixed(1)})`,
      metricValue: ratio,
      note: `平均間隔: ${Math.round(avgInterval)}日`,
    })
  }
  sheet4.sort((a, b) => (b.metricValue ?? 0) - (a.metricValue ?? 0))
  buildActionSheet('周期超過', `個別来店周期の ×${anomalyRatio} 倍を超過`, sheet4,
    { redThreshold: anomalyRatio + 0.5, yellowThreshold: anomalyRatio })

  // ─── ⑤ 場内経過（福岡県） ───
  const computeBanaiAcquisition = (c: Customer): { acquiredAt: string; daysSince: number } | null => {
    const hist = nominationHistoryByCustomer[c.id] ?? []
    let acquiredAt = c.first_visit_date
    for (const h of hist) {
      if (h.new_status === '場内') { acquiredAt = h.changed_at; break }
    }
    if (!acquiredAt) return null
    const daysSince = Math.floor((today - new Date(acquiredAt).getTime()) / 86400000)
    if (daysSince < 0 || daysSince > banaiCutoffDays) return null
    return { acquiredAt, daysSince }
  }
  const banaiAll = customers
    .filter(c => c.nomination_status === '場内')
    .map(c => ({ c, info: computeBanaiAcquisition(c) }))
    .filter((x): x is { c: Customer; info: { acquiredAt: string; daysSince: number } } => !!x.info)

  const sheet5fukuoka: ActionRow[] = banaiAll
    .filter(x => x.c.region === '福岡県')
    .sort((a, b) => b.info.daysSince - a.info.daysSince)
    .map(({ c, info }) => ({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: '場内',
      metric: `場内${info.daysSince}日経過`,
      metricValue: info.daysSince,
      note: `獲得日: ${info.acquiredAt.slice(0, 10)}`,
    }))
  buildActionSheet('場内経過 福岡', `場内獲得から${banaiCutoffDays}日以内（福岡県）`, sheet5fukuoka,
    { redThreshold: 90, yellowThreshold: 60 })

  // ─── ⑥ 場内経過（県外） ───
  const sheet6kengai: ActionRow[] = banaiAll
    .filter(x => x.c.region !== '福岡県')
    .sort((a, b) => b.info.daysSince - a.info.daysSince)
    .map(({ c, info }) => ({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: '場内',
      metric: `場内${info.daysSince}日経過`,
      metricValue: info.daysSince,
      note: `獲得日: ${info.acquiredAt.slice(0, 10)}`,
    }))
  buildActionSheet('場内経過 県外', `場内獲得から${banaiCutoffDays}日以内（県外）`, sheet6kengai,
    { redThreshold: 90, yellowThreshold: 60 })

  // ─── ⑦ 売上下降 ───
  const cutoff90 = today - 90 * 86400000
  const cutoff180 = today - 180 * 86400000
  const sheet7: ActionRow[] = []
  for (const c of customers) {
    let recent = 0, prev = 0
    for (const v of (visitsByCustomer[c.id] ?? [])) {
      const a = Number(v.amount_spent) || 0
      if (a <= 0) continue
      const t = new Date(v.visit_date).getTime()
      if (t >= cutoff90) recent += a
      else if (t >= cutoff180) prev += a
    }
    if (prev <= 0) continue
    const declinePct = Math.round(((prev - recent) / prev) * 100)
    if (declinePct < salesDeclinePct) continue
    sheet7.push({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: c.nomination_status ?? '',
      metric: `-${declinePct}%`,
      metricValue: declinePct,
      note: `¥${(prev / 10000).toFixed(0)}万 → ¥${(recent / 10000).toFixed(0)}万`,
    })
  }
  sheet7.sort((a, b) => (b.metricValue ?? 0) - (a.metricValue ?? 0))
  buildActionSheet('売上下降', `直近90日が前期比 -${salesDeclinePct}% 以上`, sheet7,
    { redThreshold: 50, yellowThreshold: 30 })

  // ─── ⑧ 誕生日近接 × 未連絡 ───
  const todayD = new Date()
  todayD.setHours(0, 0, 0, 0)
  const sheet8: ActionRow[] = []
  for (const c of customers) {
    if (!c.birthday) continue
    const parts = c.birthday.split('-')
    if (parts.length < 3) continue
    const bMonth = parseInt(parts[1], 10)
    const bDay = parseInt(parts[2], 10)
    if (isNaN(bMonth) || isNaN(bDay)) continue
    let next = new Date(todayD.getFullYear(), bMonth - 1, bDay)
    if (next < todayD) next = new Date(todayD.getFullYear() + 1, bMonth - 1, bDay)
    const daysToBirthday = Math.floor((next.getTime() - todayD.getTime()) / 86400000)
    if (daysToBirthday > birthdayDays) continue
    const dsc = customerLastContactDays(c)
    if (dsc != null && dsc < 30) continue
    sheet8.push({
      name: c.customer_name, rank: c.customer_rank ?? '',
      region: c.region ?? '', nomination: c.nomination_status ?? '',
      metric: `誕生日まで${daysToBirthday}日`,
      metricValue: daysToBirthday,
      note: dsc != null ? `${dsc}日連絡なし` : '連絡履歴なし',
    })
  }
  sheet8.sort((a, b) => (a.metricValue ?? 0) - (b.metricValue ?? 0))
  buildActionSheet('誕生日近接', `誕生日まで${birthdayDays}日以内 × 連絡途切れ`, sheet8,
    { redThreshold: 0, yellowThreshold: 0 }) // 全て高優先度

  // ─── ⑨ LTV Top 10 ───
  const ltvSorted = customers
    .map(c => ({
      c,
      total: (visitsByCustomer[c.id] ?? []).reduce((s, v) => s + (Number(v.amount_spent) || 0), 0),
      vc: (visitsByCustomer[c.id] ?? []).filter(v => Number(v.amount_spent) > 0).length,
    }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
  const sheet9: ActionRow[] = ltvSorted.map((x, i) => ({
    name: x.c.customer_name, rank: x.c.customer_rank ?? '',
    region: x.c.region ?? '', nomination: x.c.nomination_status ?? '',
    metric: `${i + 1}位 ¥${x.total.toLocaleString()}`,
    metricValue: i,
    note: `${x.vc}回 / 平均¥${x.vc > 0 ? Math.round(x.total / x.vc).toLocaleString() : 0}`,
  }))
  buildActionSheet('LTV Top10', '累計売上 上位10名（VIP優先連絡対象）', sheet9)

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_営業アクションリスト_${todayStr()}.xlsx`)
}

// ───────────────────────────────────────────────────────
//  D-③ 月次総合レポート Excel
//  過去12ヶ月のKPI/達成率/客単価/出勤日数を月別ピボット表で
// ───────────────────────────────────────────────────────
export async function exportMonthlyReportXlsx(params: {
  cast: CastProfile
  months: string[]
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
}): Promise<void> {
  const { cast, months, multiKPI, multiTarget, customers, visitsByCustomer } = params
  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  // ─── シート1: 月次推移 ───
  const ws = wb.addWorksheet('月次推移')
  ws.addRow([`${cast.display_name || cast.cast_name} — 月次総合レポート（${todayStr()} 時点 / 過去${months.length}ヶ月）`])
  ws.mergeCells(1, 1, 1, 13)
  const t = ws.getRow(1)
  t.height = 24
  t.getCell(1).font = { size: 13, bold: true, color: { argb: COLOR.pinkText } }
  t.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
  ws.columns = [
    { key: 'month', width: 10 },
    { key: 'sales', width: 14 },
    { key: 'target', width: 14 },
    { key: 'achievement', width: 10 },
    { key: 'avg', width: 12 },
    { key: 'workdays', width: 8 },
    { key: 'perWorkday', width: 14 },
    { key: 'visits', width: 8 },
    { key: 'honshimei', width: 8 },
    { key: 'banai', width: 8 },
    { key: 'free', width: 8 },
    { key: 'douhan', width: 8 },
    { key: 'after', width: 8 },
  ]
  const hr = ws.addRow({
    month: '月', sales: '売上', target: '目標', achievement: '達成率',
    avg: '客単価', workdays: '出勤', perWorkday: '日均',
    visits: '来店', honshimei: '本指名', banai: '場内', free: 'フリー',
    douhan: '同伴', after: 'アフ',
  })
  setHeaderStyle(hr)
  for (const m of months) {
    const k = multiKPI[m]
    const tg = multiTarget[m] ?? 0
    const ach = tg > 0 && k ? Math.round((k.monthlySales / tg) * 100) : 0
    const perDay = k && k.workDays > 0 ? Math.round(k.monthlySales / k.workDays) : 0
    const row = ws.addRow({
      month: m,
      sales: k?.monthlySales ?? 0,
      target: tg,
      achievement: tg > 0 ? `${ach}%` : '—',
      avg: k?.avgSpend ?? 0,
      workdays: k?.workDays ?? 0,
      perWorkday: perDay,
      visits: k?.totalVisitCount ?? 0,
      honshimei: k?.honshimeiCount ?? 0,
      banai: k?.banaiMonthlyCount ?? 0,
      free: k?.freeCount ?? 0,
      douhan: k?.douhanCount ?? 0,
      after: k?.afterCount ?? 0,
    })
    row.getCell('sales').numFmt = yen
    row.getCell('target').numFmt = yen
    row.getCell('avg').numFmt = yen
    row.getCell('perWorkday').numFmt = yen
    setBordersOnRow(row)
    // 達成率に色
    if (tg > 0) {
      const c = row.getCell('achievement')
      if (ach >= 100) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.green } }
        c.font = { color: { argb: COLOR.greenText }, bold: true }
      } else if (ach >= 80) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.yellow } }
        c.font = { color: { argb: COLOR.yellowText }, bold: true }
      } else {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.red } }
        c.font = { color: { argb: COLOR.redText }, bold: true }
      }
    }
  }
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]

  // ─── シート2: 顧客サマリ（参考） ───
  const rows: CustomerSummaryRow[] = customers.map(c => ({
    customer: c, visits: visitsByCustomer[c.id] ?? [],
  }))
  rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)
  addCustomerSummarySheet(wb, rows, '顧客サマリー')

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_月次総合レポート_${todayStr()}.xlsx`)
}

// ───────────────────────────────────────────────────────
//  D-④ 相性分析 Excel
//  相性タブの全テーブル（ランク/地域/入口/好み/年齢/職業/LTV/ボトル）
// ───────────────────────────────────────────────────────
export async function exportCompatibilityAnalysis(params: {
  cast: CastProfile
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
  bottlesByCustomer?: Record<string, CustomerBottle[]>
}): Promise<void> {
  const { cast, customers, visitsByCustomer, bottlesByCustomer = {} } = params
  const ExcelJS_runtime = await loadExcel(); const wb = new ExcelJS_runtime.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  // ─── 集計関数（顧客の累計売上 + 来店数 + リピート率を属性別にグルーピング） ───
  type Aggr = {
    key: string
    customerCount: number
    visitCount: number
    totalSales: number
    avgPerVisit: number
    avgPerCustomer: number
    medianLtv: number
    repeatRate: number
  }
  const groupBy = (getKey: (c: Customer) => string | null | undefined): Aggr[] => {
    const groups = new Map<string, { perCust: Map<string, { v: number; t: number }>; total: number; visits: number; repeat: number }>()
    for (const c of customers) {
      const vs = (visitsByCustomer[c.id] ?? []).filter(v => Number(v.amount_spent) > 0)
      const total = vs.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
      const visitCount = vs.length
      const k = getKey(c)
      if (!k) continue
      const g = groups.get(k) ?? { perCust: new Map(), total: 0, visits: 0, repeat: 0 }
      g.perCust.set(c.id, { v: visitCount, t: total })
      g.total += total
      g.visits += visitCount
      if (visitCount >= 2) g.repeat += 1
      groups.set(k, g)
    }
    const result: Aggr[] = []
    for (const [key, g] of groups) {
      const cc = g.perCust.size
      const ltvList = [...g.perCust.values()].map(x => x.t).sort((a, b) => a - b)
      const median = ltvList.length === 0 ? 0
        : ltvList.length % 2 === 1
          ? ltvList[Math.floor(ltvList.length / 2)]
          : Math.round((ltvList[ltvList.length / 2 - 1] + ltvList[ltvList.length / 2]) / 2)
      result.push({
        key,
        customerCount: cc,
        visitCount: g.visits,
        totalSales: g.total,
        avgPerVisit: g.visits > 0 ? Math.round(g.total / g.visits) : 0,
        avgPerCustomer: cc > 0 ? Math.round(g.total / cc) : 0,
        medianLtv: median,
        repeatRate: cc > 0 ? Math.round((g.repeat / cc) * 100) : 0,
      })
    }
    return result.sort((a, b) => b.totalSales - a.totalSales)
  }

  const totalSales = customers.reduce((s, c) =>
    s + (visitsByCustomer[c.id] ?? []).reduce((a, v) => a + (Number(v.amount_spent) || 0), 0), 0)

  const buildAggrSheet = (sheetName: string, keyLabel: string, rows: Aggr[]) => {
    const ws = wb.addWorksheet(sanitizeSheetName(sheetName))
    ws.addRow([`【${sheetName}】 ${todayStr()} 時点`])
    ws.mergeCells(1, 1, 1, 8)
    const t2 = ws.getRow(1)
    t2.height = 24
    t2.getCell(1).font = { size: 12, bold: true, color: { argb: COLOR.pinkText } }
    t2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
    ws.columns = [
      { key: 'key', width: 14 },
      { key: 'cc', width: 10 },
      { key: 'vc', width: 10 },
      { key: 'total', width: 14 },
      { key: 'share', width: 10 },
      { key: 'avgVisit', width: 12 },
      { key: 'avgCust', width: 12 },
      { key: 'median', width: 12 },
      { key: 'repeat', width: 10 },
    ]
    const hr2 = ws.addRow({
      key: keyLabel, cc: '顧客数', vc: '来店数',
      total: '累計売上', share: 'シェア',
      avgVisit: '1回単価', avgCust: '1人平均', median: '中央値LTV', repeat: 'リピ率',
    })
    setHeaderStyle(hr2)
    for (const r of rows) {
      const share = totalSales > 0 ? Math.round((r.totalSales / totalSales) * 100) : 0
      const row = ws.addRow({
        key: r.key, cc: r.customerCount, vc: r.visitCount,
        total: r.totalSales, share: `${share}%`,
        avgVisit: r.avgPerVisit, avgCust: r.avgPerCustomer,
        median: r.medianLtv, repeat: `${r.repeatRate}%`,
      })
      row.getCell('total').numFmt = yen
      row.getCell('avgVisit').numFmt = yen
      row.getCell('avgCust').numFmt = yen
      row.getCell('median').numFmt = yen
      setBordersOnRow(row)
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]
  }

  // 各属性別シート
  buildAggrSheet('ランク別', 'ランク', groupBy(c => c.customer_rank ?? '未設定'))
  buildAggrSheet('地域別', '地域', groupBy(c => c.region ?? '未設定'))
  buildAggrSheet('入口別', '指名ルート', groupBy(c => c.nomination_route ?? '未設定'))
  buildAggrSheet('好みのタイプ別', '好みのタイプ', groupBy(c => c.favorite_type ?? '未設定'))
  buildAggrSheet('キャストタイプ別', 'キャストタイプ', groupBy(c => c.cast_type ?? '未設定'))
  buildAggrSheet('年齢層別', '年齢層', groupBy(c => c.age_group ?? '未設定'))
  buildAggrSheet('職業別', '職業', groupBy(c => c.occupation ?? '未設定'))

  // LTV Top10
  const ltvWs = wb.addWorksheet('LTV Top10')
  ltvWs.addRow([`【LTV Top 10】 ${todayStr()} 時点`])
  ltvWs.mergeCells(1, 1, 1, 7)
  const t3 = ltvWs.getRow(1)
  t3.height = 24
  t3.getCell(1).font = { size: 12, bold: true, color: { argb: COLOR.pinkText } }
  t3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
  ltvWs.columns = [
    { key: 'rank', width: 6 },
    { key: 'name', width: 20 },
    { key: 'crank', width: 8 },
    { key: 'region', width: 12 },
    { key: 'visits', width: 10 },
    { key: 'avg', width: 12 },
    { key: 'total', width: 14 },
  ]
  const hr3 = ltvWs.addRow({
    rank: '#', name: '顧客名', crank: 'ランク', region: '地域',
    visits: '来店', avg: '客単価', total: '累計売上',
  })
  setHeaderStyle(hr3)
  const ltv = customers
    .map(c => {
      const vs = (visitsByCustomer[c.id] ?? []).filter(v => Number(v.amount_spent) > 0)
      return {
        c, total: vs.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0), vc: vs.length,
      }
    })
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
  for (let i = 0; i < ltv.length; i++) {
    const x = ltv[i]
    const row = ltvWs.addRow({
      rank: i + 1, name: x.c.customer_name, crank: x.c.customer_rank ?? '',
      region: x.c.region ?? '', visits: x.vc,
      avg: x.vc > 0 ? Math.round(x.total / x.vc) : 0,
      total: x.total,
    })
    row.getCell('avg').numFmt = yen
    row.getCell('total').numFmt = yen
    setBordersOnRow(row)
  }

  // ボトル分析
  const bottleWs = wb.addWorksheet('ボトル分析')
  bottleWs.addRow([`【ボトル分析】 ${todayStr()} 時点`])
  bottleWs.mergeCells(1, 1, 1, 5)
  const t4 = bottleWs.getRow(1)
  t4.height = 24
  t4.getCell(1).font = { size: 12, bold: true, color: { argb: COLOR.pinkText } }
  t4.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.pinkLight } }
  bottleWs.columns = [
    { key: 'name', width: 20 },
    { key: 'crank', width: 8 },
    { key: 'region', width: 12 },
    { key: 'count', width: 8 },
    { key: 'brands', width: 40 },
  ]
  const hr4 = bottleWs.addRow({
    name: '顧客名', crank: 'ランク', region: '地域',
    count: '本数', brands: '銘柄',
  })
  setHeaderStyle(hr4)
  const bottlerData = customers
    .map(c => ({ c, list: bottlesByCustomer[c.id] ?? [] }))
    .filter(x => x.list.length > 0)
    .sort((a, b) => b.list.length - a.list.length)
  for (const b of bottlerData) {
    const row = bottleWs.addRow({
      name: b.c.customer_name, crank: b.c.customer_rank ?? '',
      region: b.c.region ?? '', count: b.list.length,
      brands: b.list.map(x => x.bottle_name).filter(Boolean).join(' / '),
    })
    setBordersOnRow(row)
  }

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_相性分析_${todayStr()}.xlsx`)
}
