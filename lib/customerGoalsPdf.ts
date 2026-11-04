import { C } from '@/lib/colors'
import { goalDifference, type GoalReport } from '@/lib/starCustomerGoals'
import { starredElapsedDays } from '@/lib/starredCustomers'

export const goalReportPrintColors = { ink: C.printInk, muted: C.printMuted, rule: C.printRule }
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

/** ブラウザにある日本語フォントで高解像度描画。外部フォント送信・取得は不要。 */
export async function createCustomerGoalsPdf(report: GoalReport): Promise<Blob> {
  await document.fonts.ready
  const width = 794, height = 1123, left = 22, footerTop = height - left - 14, bottom = footerTop - 5, usable = width - left * 2
  const gutter = 12, columnWidth = (usable - gutter) / 2, inset = 4, inner = columnWidth - inset * 2
  const bodySize = 11.5, lineHeight = 13.8, ink = goalReportPrintColors.ink, muted = goalReportPrintColors.muted
  const columns = [.15, .27, .27, .31].map(ratio => inner * ratio)
  const images: Uint8Array[] = []
  let currentCanvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D, y = 0, column = 0, contentTop = 0
  const font = (size: number, bold = false) => `${bold ? '600 ' : ''}${size}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif`
  const finishPage = async () => {
    if (!currentCanvas) return
    ctx.font = font(bodySize); ctx.fillStyle = muted
    ctx.fillText(`Éclat  /  ${report.today}  /  ${images.length + 1}ページ`, left, footerTop)
    const blob = await new Promise<Blob>((resolve, reject) => currentCanvas!.toBlob(b => b ? resolve(b) : reject(new Error('PDFの画像を作成できませんでした')), 'image/jpeg', 0.94))
    images.push(new Uint8Array(await blob.arrayBuffer()))
    // スマホのメモリに全ページ分の大きなcanvasを同時保持しない。
    currentCanvas.width = 0; currentCanvas.height = 0; currentCanvas = null
  }
  const newPage = async () => {
    await finishPage()
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2
    const context = canvas.getContext('2d')
    if (!context) throw new Error('この端末ではPDFを作成できません。印刷ボタンから保存してください')
    currentCanvas = canvas; ctx = context; ctx.scale(2, 2); ctx.fillStyle = C.white; ctx.fillRect(0, 0, width, height)
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.font = font(16, true)
    y = left
    for (const line of lines(ctx, `${report.castName}  お客様の目標・実績`, usable)) { ctx.fillText(line, left, y); y += 20 }
    ctx.font = font(bodySize)
    for (const line of lines(ctx, `${report.month.replace('-', '年')}月  /  ${report.today}時点  /  ${report.scopeLabel || '⭐️全員'} ${report.rows.length}名`, usable)) { ctx.fillText(line, left, y); y += lineHeight }
    ctx.fillStyle = muted
    for (const text of [goalReportTotals(report), goalReportExplanation]) {
      for (const line of lines(ctx, text, usable)) { ctx.fillText(line, left, y); y += lineHeight }
    }
    contentTop = y + 5; y = contentTop; column = 0
  }
  const nextColumn = async () => {
    if (column === 0) { column = 1; y = contentTop }
    else await newPage()
  }
  await newPage()
  for (const row of report.rows) {
    const check = row.checked === null ? '確認状況未取得' : row.checked ? `本日確認済み${row.checkedBy ? ' / ' + row.checkedBy : ''}` : '本日未確認'
    const metadata = `${row.castName ? '担当 ' + row.castName + ' / ' : ''}${row.category} / ${row.region || '地域未設定'} / ${row.occupation || '職業未設定'}`
    const visit = `最終入店 ${row.lastVisit || '未記録'} / ${goalReportElapsed(report.today, row.lastVisit)} / ${check}`
    const identity = (continued: boolean) => {
      ctx!.font = font(13, true)
      const nameLines = lines(ctx!, row.name + (continued ? '（続き）' : ''), inner)
      const result = nameLines.map(text => ({ height: 16, runs: [{ text, x: 0, size: 13, bold: true, color: ink }] }))
      const last = result[result.length - 1], nameWidth = ctx!.measureText(nameLines[nameLines.length - 1]).width
      const detail = continued ? `${row.castName ? '担当 ' + row.castName + ' / ' : ''}${row.category}` : metadata
      ctx!.font = font(bodySize)
      // 氏名・分類等が同じ行に収まる時だけ並べる。長名や長い担当名は全文を次行へ送る。
      if (nameWidth + 8 + ctx!.measureText(detail).width <= inner) {
        last.runs.push({ text: detail, x: nameWidth + 8, size: bodySize, bold: false, color: muted })
      } else {
        result.push(...lines(ctx!, detail, inner).map(text => ({ height: lineHeight, runs: [{ text, x: 0, size: bodySize, bold: false, color: muted }] })))
      }
      if (!continued) result.push(...lines(ctx!, visit, inner).map(text => ({ height: lineHeight, runs: [{ text, x: 0, size: bodySize, bold: false, color: muted }] })))
      return result
    }
    const metricValues = [
      ['項目', '目標', '実績', '差'],
      ['売上', row.targetSales === null ? '未設定' : goalYen(row.targetSales), goalYen(row.sales), goalGapLabel(row.targetSales, row.sales, '円')],
      ['来店', row.targetVisits === null ? '未設定' : row.targetVisits + '回', row.visits + '回', goalGapLabel(row.targetVisits, row.visits, '回')],
    ]
    const metrics = metricValues.map((values, index) => {
      const cells = values.map((text, i) => {
        const size = index > 0 && i === 2 ? 12 : bodySize, bold = index > 0 && i === 2
        ctx!.font = font(size, bold)
        return { lines: metricLines(ctx!, text, columns[i] - 4), size, bold }
      })
      return { cells, height: Math.max(...cells.map(cell => cell.lines.length)) * lineHeight + 1 }
    })
    ctx!.font = font(bodySize)
    const noteLines = lines(ctx!, `備考 ${row.note.trim() ? row.note : '—'}`, inner)
    let offset = 0
    do {
      const continued = offset > 0, identityLines = identity(continued)
      const visibleMetrics = continued ? [] : metrics
      const baseHeight = 4 + identityLines.reduce((sum, line) => sum + line.height, 0) + 2 + visibleMetrics.reduce((sum, metric) => sum + metric.height, 0) + (continued ? lineHeight : 0)
      const desired = baseHeight + (noteLines.length - offset) * lineHeight + 4
      if (bottom - y < Math.min(desired, baseHeight + 3 * lineHeight + 4)) await nextColumn()
      // 極端に長い名前等も描画領域外へ書き出さない。
      if (baseHeight + lineHeight + 4 > bottom - y) throw new Error('お客様情報が長いためPDFに収まりません。印刷からPDF保存してください')
      const x = left + column * (columnWidth + gutter), top = y
      y += 4
      for (const line of identityLines) {
        for (const run of line.runs) { ctx!.font = font(run.size, run.bold); ctx!.fillStyle = run.color; ctx!.fillText(run.text, x + inset + run.x, y + (run.size < 13 && line.height === 16 ? 1 : 0)) }
        y += line.height
      }
      y += 2
      for (const [index, metric] of visibleMetrics.entries()) {
        let cellX = x + inset
        for (const [i, cell] of metric.cells.entries()) {
          ctx!.font = font(cell.size, cell.bold); ctx!.fillStyle = index === 0 || i === 3 ? muted : ink; ctx!.textAlign = i ? 'right' : 'left'
          for (const [j, line] of cell.lines.entries()) ctx!.fillText(line, i ? cellX + columns[i] - 2 : cellX + 2, y + .5 + j * lineHeight)
          cellX += columns[i]
        }
        ctx!.textAlign = 'left'; y += metric.height
      }
      ctx!.font = font(bodySize)
      if (continued) { ctx!.fillStyle = muted; ctx!.fillText('備考（続き）', x + inset, y); y += lineHeight }
      const take = Math.max(1, Math.min(noteLines.length - offset, Math.floor((bottom - y - 4) / lineHeight)))
      ctx!.fillStyle = ink
      for (const line of noteLines.slice(offset, offset + take)) { ctx!.fillText(line, x + inset, y); y += lineHeight }
      offset += take; y += 4
      ctx!.strokeStyle = goalReportPrintColors.rule; ctx!.lineWidth = .5; ctx!.strokeRect(x, top, columnWidth, y - top)
      y += 4
      if (offset < noteLines.length) await nextColumn()
    } while (offset < noteLines.length)
  }
  await finishPage()
  return encodeImagePdf(images, width * 2, height * 2)
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
