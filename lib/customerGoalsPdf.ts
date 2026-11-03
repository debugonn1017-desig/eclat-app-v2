import { C } from '@/lib/colors'
import { goalDifference, type GoalReport } from '@/lib/starCustomerGoals'
import { starredElapsedDays } from '@/lib/starredCustomers'

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
  for (const char of note || '—') {
    if (part.length >= 800 || breaks >= 16) { parts.push(part); part = ''; breaks = 0 }
    part += char
    if (char === '\n') breaks++
  }
  if (part) parts.push(part)
  return parts
}

/** ブラウザにある日本語フォントで高解像度描画。外部フォント送信・取得は不要。 */
export async function createCustomerGoalsPdf(report: GoalReport): Promise<Blob> {
  await document.fonts.ready
  const width = 794, height = 1123, left = 32, bottom = height - 38, usable = width - left * 2
  const columns = [92, 204, 204, 230]
  const labels = ['項目', '目標', '実績', '差']
  const images: Uint8Array[] = []
  let currentCanvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D, y = 0
  const font = (size: number, bold = false) => `${bold ? '600 ' : ''}${size}px -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif`
  const finishPage = async () => {
    if (!currentCanvas) return
    ctx.font = font(11); ctx.fillStyle = C.dark2
    ctx.fillText(`Éclat  /  ${report.today}  /  ${images.length + 1}ページ`, left, height - 24)
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
    ctx.textBaseline = 'top'; ctx.fillStyle = C.dark; ctx.font = font(20, true)
    y = 26
    for (const line of lines(ctx, `${report.castName}  お客様の目標・実績`, usable)) { ctx.fillText(line, left, y); y += 26 }
    ctx.font = font(12)
    ctx.fillText(`${report.month.replace('-', '年')}月  /  ${report.today}時点  /  ${report.scopeLabel || '⭐️全員'} ${report.rows.length}名`, left, y + 6)
    y += 28
    ctx.font = font(11)
    for (const line of lines(ctx, goalReportTotals(report), usable)) { ctx.fillText(line, left, y); y += 17 }
    y += 12
    ctx.fillStyle = C.miniBg; ctx.fillRect(left, y, usable, 26)
    ctx.fillStyle = C.dark2; ctx.font = font(11, true)
    let x = left
    labels.forEach((label, i) => { ctx.textAlign = i ? 'right' : 'left'; ctx.fillText(label, i ? x + columns[i] - 10 : x + 8, y + 6); x += columns[i] })
    ctx.textAlign = 'left'; y += 34
  }
  await newPage()
  for (const row of report.rows) {
    const check = row.checked === null ? '確認状況未取得' : row.checked ? `本日確認済み${row.checkedBy ? ' / ' + row.checkedBy : ''}` : '本日未確認'
    const metadata = `${row.castName ? '担当 ' + row.castName + ' / ' : ''}${row.category} / ${row.region || '地域未設定'} / ${row.occupation || '職業未設定'}`
    const visit = `最終入店 ${row.lastVisit || '未記録'} / ${goalReportElapsed(report.today, row.lastVisit)} / ${check}`
    ctx!.font = font(14, true)
    const nameHeight = lines(ctx!, row.name, usable - 16).length * 20
    ctx!.font = font(11)
    const identityHeight = nameHeight + (lines(ctx!, metadata, usable - 16).length + lines(ctx!, visit, usable - 16).length) * 16 + 4
    const identity = (continued: boolean) => {
      ctx!.fillStyle = C.dark; ctx!.font = font(14, true)
      for (const line of lines(ctx!, row.name + (continued ? '（続き）' : ''), usable - 16)) { ctx!.fillText(line, left + 8, y); y += 20 }
      ctx!.font = font(11); ctx!.fillStyle = C.dark2
      for (const line of lines(ctx!, metadata, usable - 16)) { ctx!.fillText(line, left + 8, y); y += 16 }
      for (const line of lines(ctx!, visit, usable - 16)) { ctx!.fillText(line, left + 8, y); y += 16 }
      y += 4
    }
    const metric = (label: string, target: string, actual: string, gap: string) => {
      let x = left
      for (const [i, value] of [label, target, actual, gap].entries()) {
        ctx!.font = font(i === 2 ? 14 : 12, i === 2); ctx!.fillStyle = i === 3 ? C.dark2 : C.dark
        ctx!.textAlign = i ? 'right' : 'left'; ctx!.fillText(value, i ? x + columns[i] - 10 : x + 8, y + 3); x += columns[i]
      }
      ctx!.textAlign = 'left'; y += 24
    }
    ctx!.font = font(12)
    const noteLines = lines(ctx!, row.note || '—', usable - 16)
    // ふつうの明細は同じページへ。長い備考だけ継続ページへ分割する。
    const estimatedHeight = identityHeight + 87 + noteLines.length * 17
    if (bottom - y < Math.min(estimatedHeight, identityHeight + 136)) await newPage()
    identity(false)
    metric('売上', row.targetSales === null ? '未設定' : goalYen(row.targetSales), goalYen(row.sales), goalGapLabel(row.targetSales, row.sales, '円'))
    metric('来店回数', row.targetVisits === null ? '未設定' : row.targetVisits + '回', row.visits + '回', goalGapLabel(row.targetVisits, row.visits, '回'))
    let offset = 0
    while (offset < noteLines.length) {
      if (bottom - y < 42) { await newPage(); identity(true) }
      ctx!.font = font(10); ctx!.fillStyle = C.dark2; ctx!.fillText(offset ? '備考（続き）' : '備考', left + 8, y + 2); y += 18
      const take = Math.max(1, Math.min(noteLines.length - offset, Math.floor((bottom - y - 12) / 17)))
      ctx!.font = font(12); ctx!.fillStyle = C.dark
      noteLines.slice(offset, offset + take).forEach((line, i) => ctx!.fillText(line, left + 8, y + i * 17))
      y += take * 17; offset += take
      if (offset < noteLines.length) { await newPage(); identity(true) }
    }
    y += 9; ctx!.strokeStyle = C.border; ctx!.lineWidth = 0.7; ctx!.beginPath(); ctx!.moveTo(left, y); ctx!.lineTo(left + usable, y); ctx!.stroke(); y += 12
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
