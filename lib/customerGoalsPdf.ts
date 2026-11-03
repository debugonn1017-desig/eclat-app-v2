import { C } from '@/lib/colors'
import { goalDifference, type GoalReport } from '@/lib/starCustomerGoals'

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

/** ブラウザにある日本語フォントで高解像度描画。外部フォント送信・取得は不要。 */
export async function createCustomerGoalsPdf(report: GoalReport): Promise<Blob> {
  await document.fonts.ready
  const width = 1123, height = 794, left = 34, bottom = height - 38
  const columns = [174, 132, 102, 164, 142, 341]
  const labels = ['お客様 / 分類', '最終来店 / 本日確認', '目標 → 実績', '売上（円）', '来店回数', '備考']
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
    ctx.textBaseline = 'top'; ctx.fillStyle = C.dark; ctx.font = font(22, true)
    ctx.fillText(`${report.castName}  ⭐️お客様の目標・実績`, left, 26)
    ctx.font = font(12); ctx.fillText(`${report.month.replace('-', '年')}月  /  ${report.today}時点  /  ⭐️全員 ${report.rows.length}名`, left, 58)
    const totals = report.rows.reduce((s, r) => ({ target: s.target + (r.targetSales ?? 0), sales: s.sales + r.sales, targetVisits: s.targetVisits + (r.targetVisits ?? 0), visits: s.visits + r.visits, unset: s.unset + Number(r.targetSales === null || r.targetVisits === null) }), { target: 0, sales: 0, targetVisits: 0, visits: 0, unset: 0 })
    ctx.fillText(`売上 ${goalYen(totals.sales)} / 目標 ${goalYen(totals.target)}    来店 ${totals.visits}回 / 目標 ${totals.targetVisits}回    未設定あり ${totals.unset}名`, left, 80)
    ctx.fillStyle = C.tagBg; ctx.fillRect(left, 105, columns.reduce((a, b) => a + b), 30)
    ctx.fillStyle = C.dark; ctx.font = font(12, true)
    let x = left
    labels.forEach((label, i) => { ctx.fillText(label, x + 7, 113); x += columns[i] })
    y = 135
  }
  await newPage()
  for (const row of report.rows) {
    ctx!.font = font(12)
    const cells = [
      `${row.name}\n${row.category}\n${row.region || '地域未設定'} / ${row.occupation || '職業未設定'}`,
      `${row.lastVisit || '来店未記録'}\n${row.checked === null ? '確認状況未取得' : row.checked ? '本日確認済み' : '本日未確認'}${row.checkedBy ? '\n' + row.checkedBy : ''}`,
      '目標\n実績\n差',
      `${row.targetSales === null ? '未設定' : goalYen(row.targetSales)}\n${goalYen(row.sales)}\n${goalGapLabel(row.targetSales, row.sales, '円')}`,
      `${row.targetVisits === null ? '未設定' : row.targetVisits + '回'}\n${row.visits}回\n${goalGapLabel(row.targetVisits, row.visits, '回')}`,
      row.note || '—',
    ].map((text, index) => lines(ctx!, text, columns[index] - 14))
    let offset = 0
    const count = Math.max(...cells.map(cell => cell.length))
    while (offset < count) {
      if (bottom - y < 44) await newPage()
      const take = Math.min(count - offset, Math.floor((bottom - y - 16) / 18))
      const rowHeight = Math.max(44, take * 18 + 16)
      let x = left
      ctx!.font = font(12)
      cells.forEach((cell, index) => {
        ctx!.strokeStyle = C.border; ctx!.lineWidth = 0.6; ctx!.strokeRect(x, y, columns[index], rowHeight)
        ctx!.fillStyle = C.dark
        const visible = cell.slice(offset, offset + take)
        if (offset && index === 0 && visible.length === 0) ctx!.fillText(`${row.name}（続き）`, x + 7, y + 8, columns[index] - 14)
        visible.forEach((line, n) => ctx!.fillText(line, x + 7, y + 8 + n * 18))
        x += columns[index]
      })
      offset += take; y += rowHeight
      if (offset < count) await newPage()
    }
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
    const id = 3 + i * 3, content = encoder.encode('q 841.89 0 0 595.28 0 0 cm /Im0 Do Q')
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
    object(id + 2, `<< /Length ${content.length} >>`, content)
  })
  const xref = length
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (let i = 1; i < offsets.length; i++) append(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}
