'use client'

// ─────────────────────────────────────────────────────────────────────
//  SectionDetail – ホームから開いた各セクションの振り分けルーター
//
//  sectionId に応じて適切な子コンポーネントを呼び出す純粋関数。
//  React #300 再発防止：useState / useMemo / useEffect 一切なし
// ─────────────────────────────────────────────────────────────────────

import type { ManualData, SevenStep } from '@/types/manual'
import Chapter0View from '@/components/manual/Chapter0View'
import CastTypesView from '@/components/manual/CastTypesView'
import PhilosophyFileView from '@/components/manual/PhilosophyFileView'
import Manual44View from '@/components/manual/Manual44View'
import StepThemeList from '@/components/manual/StepThemeList'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'

export type SectionId =
  | 'before'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'step5'
  | 'step6'
  | 'step7'
  | 'topics44'
  | 'irokoi'
  | 'cast-type'

type Props = {
  sectionId: SectionId
  data: ManualData
  onBack: () => void
  onOpenTheme: (key: string) => void
  onOpenManual: (id: string) => void
}

// sectionId → ステップ番号（1〜7）
function stepNoFromSectionId(id: SectionId): number | null {
  if (id === 'step1') return 1
  if (id === 'step2') return 2
  if (id === 'step3') return 3
  if (id === 'step4') return 4
  if (id === 'step5') return 5
  if (id === 'step6') return 6
  if (id === 'step7') return 7
  return null
}

// STEP用ヘッダー（戻る + STEPタイトル + purpose）
function StepHeader({
  no,
  step,
  onBack,
}: {
  no: number
  step: SevenStep | undefined
  onBack: () => void
}) {
  return (
    <div
      style={{
        padding: '16px 16px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: READ_FONT,
      }}
    >
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            color: PINK,
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
        >
          ← 戻る
        </button>
      </div>
      <div
        style={{
          background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '16px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#FFFFFF',
              background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
              padding: '4px 11px',
              borderRadius: 100,
              letterSpacing: '0.1em',
            }}
          >
            STEP{no}
          </span>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: HEAD,
            letterSpacing: '0.02em',
            lineHeight: 1.4,
          }}
        >
          {step?.title || `STEP${no}`}
        </div>
        {step?.purpose ? (
          <div
            style={{
              fontSize: 12.5,
              color: MUTED,
              marginTop: 6,
              lineHeight: 1.75,
              letterSpacing: '0.02em',
            }}
          >
            {step.purpose}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function SectionDetail({
  sectionId,
  data,
  onBack,
  onOpenTheme,
  onOpenManual,
}: Props) {
  if (sectionId === 'before') {
    return <Chapter0View data={data} onBack={onBack} />
  }

  if (sectionId === 'topics44') {
    return (
      <Manual44View
        data={data}
        onOpenManual={onOpenManual}
        onBack={onBack}
      />
    )
  }

  if (sectionId === 'irokoi') {
    return <PhilosophyFileView data={data} onBack={onBack} />
  }

  if (sectionId === 'cast-type') {
    return (
      <CastTypesView
        data={data}
        onBack={onBack}
        onJumpManual={onOpenManual}
      />
    )
  }

  // step1〜step7
  const no = stepNoFromSectionId(sectionId)
  if (no != null) {
    const stepKey = `STEP${no}`
    const stepMeta = (data.sevenSteps ?? []).find((s) => s.no === no)
    return (
      <div
        style={{
          fontFamily: READ_FONT,
        }}
      >
        <StepHeader no={no} step={stepMeta} onBack={onBack} />
        <StepThemeList
          step={stepKey}
          data={data}
          onOpenTheme={onOpenTheme}
          onOpenManual={onOpenManual}
        />
      </div>
    )
  }

  // フォールバック
  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          color: PINK,
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 14px',
          borderRadius: 10,
          cursor: 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.04em',
          marginBottom: 16,
        }}
      >
        ← 戻る
      </button>
      <div
        style={{
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '24px 20px',
          textAlign: 'center',
          color: MUTED,
          fontSize: 13,
        }}
      >
        セクションが見つかりません。
      </div>
    </div>
  )
}
