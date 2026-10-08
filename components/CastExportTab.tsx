'use client'

import { C } from '@/lib/colors'

type Props = {
  exporting: boolean
  customerCount: number
  honshimeiCount: number
  onExportAll: () => void
  onExportHonshimei: () => void
  onOpenSalesList: () => void
}

/** スタッフ用タブ。出力処理・対象顧客は既存のワークスペースと共通。 */
export default function CastExportTab({ exporting, customerCount, honshimeiCount, onExportAll, onExportHonshimei, onOpenSalesList }: Props) {
  const exports = [
    { label: '全顧客履歴を出力', description: '担当する全てのお客様の情報と来店履歴', onClick: onExportAll, disabled: exporting || customerCount === 0 },
    { label: '本指名のみ出力', description: '本指名のお客様だけをまとめたリスト', onClick: onExportHonshimei, disabled: exporting || honshimeiCount === 0 },
    { label: '営業リスト出力', description: '条件を絞り込んでお客様のリストを作成', onClick: onOpenSalesList, disabled: exporting },
  ]
  return <section aria-label="出力リスト" style={{ paddingTop:16, color:C.dark }}>
    <h2 style={{ fontSize:18, margin:'0 0 8px' }}>出力リスト</h2>
    <p style={{ fontSize:12, color:C.dark2, margin:'0 0 16px' }}>表示中のキャストのお客様情報をExcelで出力します。</p>
    <div style={{ display:'grid', gap:12 }}>
      {exports.map(item => <div key={item.label} style={{ padding:14, border:`1px solid ${C.border}`, borderRadius:12, background:C.white }}>
        <button type="button" onClick={item.onClick} disabled={item.disabled} style={{ width:'100%', minHeight:44, padding:'10px 14px', border:`1px solid ${C.pink}`, borderRadius:8, fontFamily:'inherit', fontSize:14, fontWeight:700, background:C.tagBg2, color:C.pinkDeep, cursor:item.disabled ? 'not-allowed' : 'pointer', opacity:item.disabled ? 0.5 : 1 }}>
          {exporting ? '出力中…' : item.label}
        </button>
        <p style={{ fontSize:12, color:C.dark2, margin:'8px 0 0' }}>{item.description}</p>
      </div>)}
    </div>
  </section>
}
