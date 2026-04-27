// ─── Excel 出力ユーティリティ ──────────────────────────────────────
// 顧客来店履歴 / 営業リストを ExcelJS で生成しダウンロードする。
// すべてブラウザ側で完結。サーバ往復なし。

import ExcelJS from 'exceljs'
import type { Customer, CustomerVisit, CastProfile } from '@/types'

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

// 機能 A-1: キャストの全顧客履歴を出力（ハイブリッド 2 シート）
export async function exportCastAllCustomers(params: {
  cast: CastProfile
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
}): Promise<void> {
  const { cast, customers, visitsByCustomer } = params
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Éclat'
  wb.created = new Date()

  const rows: CustomerSummaryRow[] = customers.map((c) => ({
    customer: c,
    visits: visitsByCustomer[c.id] ?? [],
  }))

  // 累計売上で降順ソート
  rows.sort((a, b) => sumVisits(b.visits).total - sumVisits(a.visits).total)

  addCustomerSummarySheet(wb, rows, '顧客サマリー')
  addVisitDetailSheet(wb, rows, '来店履歴')

  const castName = cast.display_name || cast.cast_name || 'cast'
  await downloadWorkbook(wb, `${castName}_顧客履歴_${todayStr()}.xlsx`)
}

// 機能 A-2: 単独顧客の履歴を出力
export async function exportSingleCustomer(params: {
  customer: Customer
  visits: CustomerVisit[]
}): Promise<void> {
  const { customer, visits } = params
  const wb = new ExcelJS.Workbook()
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
  const wb = new ExcelJS.Workbook()
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
