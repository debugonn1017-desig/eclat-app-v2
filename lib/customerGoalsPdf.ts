import { C } from '@/lib/colors'
import { goalDifference, type GoalReport } from '@/lib/starCustomerGoals'
import { GOAL_REPORT_LAYOUT, goalReportCheckLabel, goalReportGroups, goalReportMetadata, goalReportMetric, goalReportShortDate, goalReportTheme } from '@/lib/customerGoalReportLayout'
import { starredElapsedDays } from '@/lib/starredCustomers'

export const goalReportPrintColors = { ink: goalReportTheme.ink, muted: goalReportTheme.muted, rule: goalReportTheme.rule }
export const goalReportExplanation = '目標未設定は0と区別。実績は対象月の実来店（予定・未来日を除く）。⭐️解除後も目標・備考は保存され、一覧・合計からは外れます。'

export const goalYen = (value: number) => '¥' + value.toLocaleString('ja-JP')
export function goalGapLabel(target: number | null | undefined, actual: number, unit: '円' | '回') {
  const d = goalDifference(target, actual)
  if (d.remaining === null) return '目標未設定'
  const number = (n: number) => unit === '円' ? goalYen(n) : `${n}回`
  return d.exceeded ? `${number(d.exceeded)}超過` : d.achieved ? '達成' : `あと${number(d.remaining)}`
}
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) { result.push(line); line = '' }
      line += char
    }
    result.push(line)
  }
  return result
}
/** 金額は桁区切り・超過の前を優先し、末尾1桁だけの折り返しを避ける。 */
export function goalReportMetricParts(text: string) {
  return (text.match(/[^,]*,|[^,]+$/g) || []).flatMap(part => part.endsWith('超過') ? [part.slice(0, -2), '超過'].filter(Boolean) : [part])
}
function metricLines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (!text.includes('¥')) return lines(ctx, text, width)
  const parts = goalReportMetricParts(text)
  if (parts.some(part => ctx.measureText(part).width > width)) return lines(ctx, text, width)
  const result: string[] = []
  let line = ''
  for (const part of parts) {
    if (line && ctx.measureText(line + part).width > width) { result.push(line); line = '' }
    line += part
  }
  if (line) result.push(line)
  return result
}

export function goalReportElapsed(today: string, lastVisit: string | null) {
  const days = starredElapsedDays(today, lastVisit)
  return days === null ? '経過未記録' : days < 0 ? '来店予定' : days === 0 ? '本日来店' : `${days}日経過`
}

export function goalReportTotals(report: GoalReport) {
  const totals = report.rows.reduce((s, r) => ({ target: s.target + (r.targetSales ?? 0), sales: s.sales + r.sales, targetVisits: s.targetVisits + (r.targetVisits ?? 0), visits: s.visits + r.visits, unset: s.unset + Number(r.targetSales === null || r.targetVisits === null) }), { target: 0, sales: 0, targetVisits: 0, visits: 0, unset: 0 })
  return `売上 ${goalYen(totals.sales)} / 目標 ${report.rows.some(r => r.targetSales !== null) ? goalYen(totals.target) : '未設定'}　来店 ${totals.visits}回 / 目標 ${report.rows.some(r => r.targetVisits !== null) ? totals.targetVisits + '回' : '未設定'}　未設定あり ${totals.unset}名`
}

/** 印刷の長い備考は短い継続明細へ分け、ページ末尾の大きな空白を避ける。 */
export function goalReportNoteParts(note: string) {
  const parts: string[] = []
  let part = '', breaks = 0
  for (const char of note.trim() ? note : '—') {
    if (part.length >= 280 || breaks >= 8) { parts.push(part); part = ''; breaks = 0 }
    part += char
    if (char === '\n') breaks++
  }
  if (part) parts.push(part)
  return parts
}

type ReportRun = { text: string; x: number; size: number; color: string; bold?: boolean; align?: CanvasTextAlign; badge?: { width: number; fill: string; border: string } }
type ReportLine = { height: number; runs: ReportRun[] }
type ReportCell = { lines: ReportLine[]; offset: number }

/** 承認済みA4横5列。折り返しを実測し、長いセルは行単位で次ページへ送る。 */
export async function createCustomerGoalsPdf(report: GoalReport): Promise<Blob> {
  await document.fonts.ready
  const { width, height, margin: left, font: sizes, lineHeight, rowHeight, categoryHeight } = GOAL_REPORT_LAYOUT
  const usable = width - left * 2, footerTop = height - left - lineHeight, bottom = footerTop - 5
  const columns = GOAL_REPORT_LAYOUT.columns.map(ratio => usable * ratio)
  const cellLefts = columns.map((_, index) => left + columns.slice(0, index).reduce((sum, value) => sum + value, 0))
  const ink = goalReportTheme.ink, muted = goalReportTheme.muted, padding = 8
  const font = (size: number, bold = false) => `${bold ? '500 ' : ''}${size}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif`
  const images: Uint8Array[] = []
  let currentCanvas: HTMLCanvasElement | null = null
  let ctx!: CanvasRenderingContext2D
  let y = 0, contentTop = 0

  const textLines = (text: string, available: number, size: number = sizes.body, color = ink, bold = false, align: CanvasTextAlign = 'left', leading: number = lineHeight): ReportLine[] => {
    ctx.font = font(size, bold)
    return lines(ctx, text, available).map(text => ({ height: leading, runs: [{ text, x: align === 'right' ? available : 0, size, color, bold, align }] }))
  }
  const drawLine = (line: ReportLine, x: number, top: number) => {
    for (const run of line.runs) {
      if (run.badge) {
        ctx.fillStyle = run.badge.fill; ctx.fillRect(x + run.x, top, run.badge.width, 12)
        ctx.strokeStyle = run.badge.border; ctx.lineWidth = .5; ctx.strokeRect(x + run.x, top, run.badge.width, 12)
      }
      ctx.font = font(run.size, run.bold); ctx.fillStyle = run.color; ctx.textAlign = run.align || 'left'
      ctx.fillText(run.text, x + run.x + (run.badge ? 3 : 0), top + (run.badge ? .5 : 0))
    }
    ctx.textAlign = 'left'
  }
  const horizontalRule = (x: number, top: number, length: number, color: string, thickness = .5) => {
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + length, top); ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke()
  }
  const finishPage = async () => {
    if (!currentCanvas) return
    ctx.font = font(sizes.body); ctx.fillStyle = goalReportTheme.soft; ctx.textAlign = 'left'
    ctx.fillText('実績は対象月の実来店（予定・未来日を除く）。— は目標未設定。', left, footerTop)
    ctx.textAlign = 'right'; ctx.fillText(`Éclat / ${report.today} / ${images.length + 1}ページ`, width - left, footerTop); ctx.textAlign = 'left'
    const canvas = currentCanvas
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PDFの画像を作成できませんでした')), 'image/jpeg', .94))
      images.push(new Uint8Array(await blob.arrayBuffer()))
    } finally {
      // 大きなcanvasは各ページをJPEGにした直後に解放する。
      canvas.width = 0; canvas.height = 0; currentCanvas = null
    }
  }
  const newPage = async () => {
    await finishPage()
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2
    const context = canvas.getContext('2d')
    if (!context) { canvas.width = 0; canvas.height = 0; throw new Error('この端末ではPDFを作成できません。印刷ボタンから保存してください') }
    currentCanvas = canvas; ctx = context; ctx.scale(2, 2); ctx.fillStyle = C.white; ctx.fillRect(0, 0, width, height)
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; y = left
    const month = `${report.month.replace('-', '年')}月`
    ctx.font = font(sizes.month)
    const monthWidth = ctx.measureText(month).width
    const title = textLines('Éclat　お客様別 目標・実績', usable - monthWidth - 12, sizes.title, ink, true, 'left', 20)
    for (const line of title) { drawLine(line, left, y); y += line.height }
    ctx.font = font(sizes.month); ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.fillText(month, width - left, left + 4); ctx.textAlign = 'left'
    const totals = report.rows.reduce((sum, row) => ({ sales: sum.sales + row.sales, targetSales: sum.targetSales + (row.targetSales ?? 0), visits: sum.visits + row.visits, targetVisits: sum.targetVisits + (row.targetVisits ?? 0) }), { sales: 0, targetSales: 0, visits: 0, targetVisits: 0 })
    const targetSales = report.rows.some(row => row.targetSales != null) ? goalYen(totals.targetSales) : '未設定'
    const targetVisits = report.rows.some(row => row.targetVisits != null) ? `${totals.targetVisits}回` : '未設定'
    const summary = `売上 ${goalYen(totals.sales)} / ${targetSales}　来店 ${totals.visits}回 / ${targetVisits}`
    ctx.font = font(sizes.body)
    const summaryWidth = Math.min(usable * .62, ctx.measureText(summary).width)
    const scope = `　${report.scopeLabel || '⭐️全員'}`
    const identity = textLines(`担当 ${report.castName}${scope}　${report.rows.length}名　${goalReportShortDate(report.today)}時点`, usable - summaryWidth - 10, sizes.body, muted)
    const summaryLines = textLines(summary, summaryWidth, sizes.body, muted, false, 'right')
    y += 3
    const summaryTop = y
    for (const line of identity) { drawLine(line, left, y); y += line.height }
    let summaryY = summaryTop
    for (const line of summaryLines) { drawLine(line, width - left - summaryWidth, summaryY); summaryY += line.height }
    y = Math.max(y, summaryY) + 3
    horizontalRule(left, y, usable, goalReportTheme.headerRule, .7)
    y += 3
    const labels = ['お客様・最終入店', '売上実績', '来店実績', '備考・確認状況', 'ひとことメモ']
    for (const [index, label] of labels.entries()) {
      ctx.font = font(sizes.body); ctx.fillStyle = muted; ctx.textAlign = index === 1 || index === 2 ? 'right' : 'left'
      ctx.fillText(label, cellLefts[index] + (ctx.textAlign === 'right' ? columns[index] - padding : padding), y + 3)
    }
    ctx.textAlign = 'left'; y += 18; contentTop = y
  }
  type ReportGroup = ReturnType<typeof goalReportGroups>[number]
  const drawCategory = (group: ReportGroup, continued = false) => {
    ctx.fillStyle = group.fill; ctx.fillRect(left, y, usable, categoryHeight)
    ctx.fillStyle = group.ink; ctx.fillRect(left, y, 3, categoryHeight)
    ctx.font = font(sizes.category, true); ctx.fillStyle = group.ink
    const category = group.category + (continued ? '（続き）' : '')
    ctx.fillText(category, left + padding, y + 2)
    const categoryWidth = ctx.measureText(category).width
    ctx.font = font(sizes.month); ctx.fillStyle = muted; ctx.fillText(group.subtitle, left + padding + categoryWidth + 8, y + 3)
    ctx.fillStyle = group.ink; ctx.textAlign = 'right'; ctx.fillText(`${group.rows.length}名`, width - left - padding, y + 3); ctx.textAlign = 'left'
    y += categoryHeight
  }
  const metricCell = (target: number | null, actual: number, unit: '円' | '回', available: number): ReportCell => {
    const metric = goalReportMetric(target, actual, unit)
    const result = textLines(metric.actual, available, sizes.actual, unit === '円' ? goalReportTheme.sales : goalReportTheme.visits, true, 'right', 14)
    const keyValue = (label: string, value: string, color: string) => {
      ctx.font = font(sizes.body)
      const labelWidth = label ? ctx.measureText(label).width + 3 : 0
      const wrapped = metricLines(ctx, value, available - labelWidth)
      result.push(...wrapped.map((text, index): ReportLine => ({ height: lineHeight, runs: [
        ...(index === 0 && label ? [{ text: label, x: 0, size: sizes.body, color: goalReportTheme.soft }] : []),
        { text, x: available, size: sizes.body, color, align: 'right' },
      ] })))
    }
    keyValue('目標', metric.target, muted)
    keyValue(metric.label, metric.value, metric.state === 'achieved' || metric.state === 'exceeded' ? goalReportTheme.achieved : metric.state === 'remaining' ? goalReportTheme.remaining : goalReportTheme.soft)
    return { lines: result, offset: 0 }
  }
  const identityCell = (row: GoalReport['rows'][number]): ReportCell => {
    const available = columns[0] - padding * 2
    const result = textLines(row.name, available, sizes.name, ink, true, 'left', 14)
    result.push(...textLines(goalReportMetadata(row), available, sizes.body, goalReportTheme.soft))
    const badges = [
      { text: `最終 ${goalReportShortDate(row.lastVisit, report.today)}`, color: goalReportTheme.dateInk, fill: goalReportTheme.dateFill, border: goalReportTheme.dateBorder },
      { text: goalReportElapsed(report.today, row.lastVisit), color: goalReportTheme.elapsedInk, fill: goalReportTheme.elapsedFill, border: goalReportTheme.elapsedBorder },
    ]
    let badgeLine: ReportLine = { height: 13, runs: [] }, badgeX = 0
    for (const badge of badges) {
      ctx.font = font(sizes.body)
      for (const text of lines(ctx, badge.text, available - 6)) {
        const badgeWidth = ctx.measureText(text).width + 6
        if (badgeX && badgeX + badgeWidth > available) { result.push(badgeLine); badgeLine = { height: 13, runs: [] }; badgeX = 0 }
        badgeLine.runs.push({ text, x: badgeX, size: sizes.body, color: badge.color, badge: { width: badgeWidth, fill: badge.fill, border: badge.border } })
        badgeX += badgeWidth + 4
      }
    }
    if (badgeLine.runs.length) result.push(badgeLine)
    return { lines: result, offset: 0 }
  }
  try {
    await newPage()
    for (const group of goalReportGroups(report)) {
      if (bottom - y < categoryHeight + rowHeight) await newPage()
      drawCategory(group)
      for (const row of group.rows) {
        const note = textLines(row.note.trim() ? row.note : '—', columns[3] - padding * 2)
        note.push({ height: 3, runs: [] }, ...textLines(goalReportCheckLabel(row), columns[3] - padding * 2, sizes.body, goalReportTheme.soft))
        const cells: ReportCell[] = [identityCell(row), metricCell(row.targetSales, row.sales, '円', columns[1] - padding * 2), metricCell(row.targetVisits, row.visits, '回', columns[2] - padding * 2), { lines: note, offset: 0 }]
        const remainingHeight = (cell: ReportCell) => cell.lines.slice(cell.offset).reduce((sum, line) => sum + line.height, 0)
        const fullHeight = Math.max(rowHeight, ...cells.map(cell => remainingHeight(cell) + 4))
        // 通常の顧客は行ごと送る。1ページを超える長文だけを分割する。
        const freshCapacity = bottom - contentTop - categoryHeight
        if (fullHeight > bottom - y && (fullHeight <= freshCapacity || bottom - y < rowHeight)) { await newPage(); drawCategory(group, true) }
        let continued = false
        do {
          if (bottom - y < rowHeight) { await newPage(); drawCategory(group, true) }
          const capacity = bottom - y - 4
          const chunks = cells.map(cell => {
            const selected: ReportLine[] = []
            let used = 0
            while (cell.offset < cell.lines.length && used + cell.lines[cell.offset].height <= capacity) {
              const line = cell.lines[cell.offset++]; selected.push(line); used += line.height
            }
            return { lines: selected, height: used }
          })
          const segmentHeight = Math.max(rowHeight, ...chunks.map(chunk => chunk.height + 4))
          if (!chunks.some(chunk => chunk.lines.length)) throw new Error('PDFのページに本文が収まりませんでした')
          const top = y
          for (const [index, chunk] of chunks.entries()) {
            let textY = top + Math.max(2, (segmentHeight - chunk.height) / 2)
            for (const line of chunk.lines) { drawLine(line, cellLefts[index] + padding, textY); textY += line.height }
          }
          if (continued && !chunks[0].lines.length) {
            for (const [index, line] of textLines('（前ページから続き）', columns[0] - padding * 2, sizes.body, muted).entries()) drawLine(line, cellLefts[0] + padding, top + 2 + index * lineHeight)
          }
          // 手書き用の2本線は各顧客の最初の明細にだけ描く。
          if (!continued) {
            const memoX = cellLefts[4] + padding, memoTop = top + (segmentHeight - 34) / 2
            horizontalRule(memoX, memoTop + 17, columns[4] - padding * 2, goalReportTheme.memoRule)
            horizontalRule(memoX, memoTop + 34, columns[4] - padding * 2, goalReportTheme.memoRule)
          }
          y += segmentHeight
          horizontalRule(left, y, usable, goalReportTheme.rule)
          continued = true
          if (cells.some(cell => cell.offset < cell.lines.length)) { await newPage(); drawCategory(group, true) }
        } while (cells.some(cell => cell.offset < cell.lines.length))
      }
    }
    if (!report.rows.length) { ctx.font = font(sizes.body); ctx.fillStyle = muted; ctx.fillText('対象のお客様はいません。', left + padding, y + 8) }
    await finishPage()
    return encodeImagePdf(images, width * 2, height * 2)
  } finally {
    const canvas = currentCanvas as HTMLCanvasElement | null
    if (canvas) { canvas.width = 0; canvas.height = 0 }
  }
}

/** JPEGページをPDF 1.4へ格納。xrefはUTF-8文字数でなく実バイト位置で作る。 */
export function encodeImagePdf(images: Uint8Array[], imageWidth: number, imageHeight: number): Blob {
  const encoder = new TextEncoder(), chunks: Uint8Array[] = [], offsets = [0]
  let length = 0
  const append = (value: string | Uint8Array) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.byteLength }
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length; append(`${id} 0 obj\n${body}\n`)
    if (stream) { append('stream\n'); append(stream); append('\nendstream\n') }
    append('endobj\n')
  }
  append('%PDF-1.4\n%Éclat\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)
  images.forEach((jpeg, i) => {
    const pageWidth = imageWidth > imageHeight ? 841.89 : 595.28, pageHeight = imageWidth > imageHeight ? 595.28 : 841.89
    const id = 3 + i * 3, content = encoder.encode(`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`)
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
    object(id + 2, `<< /Length ${content.length} >>`, content)
  })
  const xref = length
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (let i = 1; i < offsets.length; i++) append(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}
