'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Spinner from '@/components/ui/Spinner'
import SectionDetail from '@/components/manual/SectionDetail'
import ThemeView from '@/components/manual/ThemeView'
import ManualItemView from '@/components/manual/ManualItemView'
import { useManualData } from '@/hooks/useManualData'
import {
  getNewCastTrainingProgress,
  getTrainingStepStatus,
  NEW_CAST_TRAINING_STEPS,
  type NewCastTrainingSectionId,
} from '@/lib/newCastTraining'
import styles from './NewCastTrainingTab.module.css'

type Props = {
  castId: string
  castName: string
  trainingStartDate: string | null
  canManageTraining: boolean
  onTrainingStartDateSaved?: (value: string | null) => void
}

function formatDate(value: string | null | undefined) {
  if (!value) return '未設定'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value
}

function ManualOverlay({ sectionId, onClose }: {
  sectionId: NewCastTrainingSectionId
  onClose: () => void
}) {
  const { data, loading, error } = useManualData()
  const [openThemeKey, setOpenThemeKey] = useState<string | null>(null)
  const [openManualId, setOpenManualId] = useState<string | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const currentTheme = openThemeKey && data
    ? data.themes?.find(theme => theme.key === openThemeKey)
    : undefined
  const currentManual = openManualId && data
    ? data.manuals?.find(manual => manual.id === openManualId)
    : undefined

  return (
    <div className={styles.overlayBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.overlayPanel}
        role="dialog"
        aria-modal="true"
        aria-label="接客マニュアル"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className={styles.overlayHeader}>
          <div>
            <span className={styles.eyebrow}>90日育成ナビ</span>
            <h2>接客マニュアル</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="マニュアルを閉じる">×</button>
        </header>
        <div className={styles.overlayBody}>
          {error ? (
            <div className={styles.manualMessage}>マニュアルを読み込めませんでした</div>
          ) : loading || !data ? (
            <div className={styles.manualMessage}><Spinner size="md" label="マニュアルを読み込み中…" /></div>
          ) : openManualId && currentManual ? (
            <ManualItemView item={currentManual} onBack={() => setOpenManualId(null)} />
          ) : openThemeKey && currentTheme ? (
            <ThemeView theme={currentTheme} data={data} onBack={() => setOpenThemeKey(null)} />
          ) : (
            <SectionDetail
              sectionId={sectionId}
              data={data}
              onBack={onClose}
              onOpenTheme={setOpenThemeKey}
              onOpenManual={setOpenManualId}
            />
          )}
        </div>
      </section>
    </div>
  )
}

export default function NewCastTrainingTab({
  castId,
  castName,
  trainingStartDate,
  canManageTraining,
  onTrainingStartDateSaved,
}: Props) {
  const [draftStartDate, setDraftStartDate] = useState(trainingStartDate ?? '')
  const [savedStartDate, setSavedStartDate] = useState(trainingStartDate)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [manualSectionId, setManualSectionId] = useState<NewCastTrainingSectionId | null>(null)
  const closeManual = useCallback(() => setManualSectionId(null), [])

  useEffect(() => {
    setDraftStartDate(trainingStartDate ?? '')
    setSavedStartDate(trainingStartDate)
  }, [trainingStartDate, castId])

  const progress = useMemo(
    () => getNewCastTrainingProgress(savedStartDate),
    [savedStartDate],
  )

  const saveStartDate = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const response = await fetch(`/api/admin/casts/${encodeURIComponent(castId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ training_start_date: draftStartDate || null }),
      })
      const json = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(json.error || '入店日を保存できませんでした')
      const nextValue = draftStartDate || null
      setSavedStartDate(nextValue)
      onTrainingStartDateSaved?.(nextValue)
      setSaveMessage(nextValue ? '入店日を保存しました' : '入店日を未設定に戻しました')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '入店日を保存できませんでした')
    } finally {
      setSaving(false)
    }
  }

  const current = progress?.currentStep ?? null

  return (
    <div className={styles.root}>
      <section className={styles.introCard}>
        <div className={styles.introTop}>
          <div>
            <span className={styles.eyebrow}>90日育成ナビ</span>
            <h1>{castName}さんの現在地</h1>
          </div>
          {progress?.phase === 'in_progress' ? (
            <span className={styles.dayBadge}>入店{progress.dayNumber}日目・{progress.weekNumber}週目</span>
          ) : null}
        </div>

        {canManageTraining ? (
          <div className={styles.dateEditor}>
            <label htmlFor={`training-start-date-${castId}`}>
              入店日
              <input
                id={`training-start-date-${castId}`}
                type="date"
                value={draftStartDate}
                onChange={event => setDraftStartDate(event.target.value)}
                disabled={saving}
              />
            </label>
            <button
              type="button"
              onClick={saveStartDate}
              disabled={saving || draftStartDate === (savedStartDate ?? '')}
            >
              {saving ? '保存中…' : '入店日を保存'}
            </button>
          </div>
        ) : (
          <div className={styles.readOnlyDate}>入店日：{formatDate(savedStartDate)}</div>
        )}
        {saveError ? <p className={styles.error}>{saveError}</p> : null}
        {saveMessage ? <p className={styles.success}>{saveMessage}</p> : null}

        {!progress ? (
          <div className={styles.emptyStartDate}>
            <strong>入店日が未設定です</strong>
            <p>{canManageTraining ? '入店日を入力すると、現在のSTEPを自動計算します。' : '黒服に入店日の登録を依頼してください。'}</p>
          </div>
        ) : progress.phase === 'before_start' ? (
          <div className={styles.emptyStartDate}>
            <strong>育成開始まであと{progress.daysUntilStart}日</strong>
            <p>{formatDate(progress.startDate)}から90日育成が始まります。</p>
          </div>
        ) : progress.phase === 'completed' ? (
          <div className={styles.completedCard}>
            <span>90 DAYS COMPLETE</span>
            <strong>90日育成期間が終了しました</strong>
            <p>キャスト層は自動変更しません。黒服による育成終了・キャスト層の確認が必要です。</p>
            <button type="button" onClick={() => setManualSectionId('step7')}>STEP7を振り返る</button>
          </div>
        ) : current ? (
          <>
            <div className={styles.progressHeader}>
              <span>90日中 {progress.dayNumber}日目</span>
              <span>{progress.progressPercent}%</span>
            </div>
            <div className={styles.progressTrack} aria-label={`90日育成 ${progress.progressPercent}%`}>
              <span style={{ width: `${progress.progressPercent}%` }} />
            </div>
            <div className={styles.currentStepCard}>
              <div className={styles.currentStepNumber}>STEP {current.step}</div>
              <div className={styles.currentStepContent}>
                <span>現在の育成段階</span>
                <h2>{current.title}</h2>
                <p>{current.guidance}</p>
                {current.note ? <div className={styles.handoverNote}>{current.note}</div> : null}
                {progress.daysUntilNextStep !== null ? (
                  <div className={styles.nextStepText}>次のSTEPまであと{progress.daysUntilNextStep}日</div>
                ) : (
                  <div className={styles.nextStepText}>90日育成の仕上げ期間です</div>
                )}
              </div>
              <button
                type="button"
                className={styles.manualButton}
                onClick={() => setManualSectionId(current.manualSectionId)}
              >
                STEP{current.step}のマニュアルを開く
              </button>
            </div>
          </>
        ) : null}
      </section>

      {progress ? (
        <section className={styles.timelineSection}>
          <div className={styles.sectionHeading}>
            <span>TRAINING ROADMAP</span>
            <h2>90日間の育成工程</h2>
            <p>チェックシートではなく、現在学ぶ段階と次に読むマニュアルを確認する画面です。</p>
          </div>
          <div className={styles.timeline}>
            {NEW_CAST_TRAINING_STEPS.map(step => {
              const status = getTrainingStepStatus(step, progress)
              return (
                <article key={step.step} className={`${styles.timelineItem} ${styles[status]}`}>
                  <div className={styles.timelineMarker} aria-hidden>
                    {status === 'completed' ? '✓' : status === 'current' ? '●' : '○'}
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineTitleRow}>
                      <div>
                        <span>STEP {step.step}・{step.startDay}〜{step.endDay}日目</span>
                        <h3>{step.title}</h3>
                      </div>
                      <span className={styles.statusLabel}>
                        {status === 'completed' ? '通過' : status === 'current' ? '現在ここ' : 'これから'}
                      </span>
                    </div>
                    {status === 'current' ? <p>{step.guidance}</p> : null}
                    {step.note ? <small>{step.note}</small> : null}
                    <button type="button" onClick={() => setManualSectionId(step.manualSectionId)}>
                      STEP{step.step}のマニュアルを見る
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {manualSectionId ? (
        <ManualOverlay sectionId={manualSectionId} onClose={closeManual} />
      ) : null}
    </div>
  )
}
