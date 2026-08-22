import { diffDaysJST, todayJST } from './dateUtils'

export const NEW_CAST_TRAINING_TIER = '新人層' as const
export const NEW_CAST_TRAINING_TOTAL_DAYS = 90

export type NewCastTrainingStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type NewCastTrainingSectionId = `step${NewCastTrainingStepNumber}`

export type NewCastTrainingStep = {
  step: NewCastTrainingStepNumber
  title: string
  shortTitle: string
  guidance: string
  startDay: number
  endDay: number
  manualSectionId: NewCastTrainingSectionId
  note?: string
}

export const NEW_CAST_TRAINING_STEPS: readonly NewCastTrainingStep[] = [
  {
    step: 1,
    title: '基礎接客',
    shortTitle: '基礎接客',
    guidance: 'お客様に違和感を与えず、安心して過ごしていただく基礎を身につける期間です。',
    startDay: 1,
    endDay: 4,
    manualSectionId: 'step1',
  },
  {
    step: 2,
    title: 'ドリンク営業',
    shortTitle: 'ドリンク営業',
    guidance: '自然にドリンクをいただく会話と、応援したくなる空気を身につける期間です。',
    startDay: 5,
    endDay: 9,
    manualSectionId: 'step2',
  },
  {
    step: 3,
    title: '連絡先交換',
    shortTitle: '連絡先交換',
    guidance: '連絡先を交換する流れと、次につながる登録・お礼連絡を身につける期間です。',
    startDay: 10,
    endDay: 14,
    manualSectionId: 'step3',
  },
  {
    step: 4,
    title: '場内・延長',
    shortTitle: '場内・延長',
    guidance: '場内指名と延長を提案するタイミングや会話を身につける期間です。',
    startDay: 15,
    endDay: 28,
    manualSectionId: 'step4',
  },
  {
    step: 5,
    title: 'アフター',
    shortTitle: 'アフター',
    guidance: 'アフターを次回来店につなげる考え方と行動を身につける期間です。',
    startDay: 29,
    endDay: 42,
    manualSectionId: 'step5',
    note: 'この期間にB層の教育担当へ引き継ぎます。',
  },
  {
    step: 6,
    title: '営業連絡',
    shortTitle: '営業連絡',
    guidance: '忘れられない接点を作り、来店につながる営業連絡を身につける期間です。',
    startDay: 43,
    endDay: 56,
    manualSectionId: 'step6',
  },
  {
    step: 7,
    title: 'リピート・再来店計画',
    shortTitle: 'リピート',
    guidance: 'これまでの接客をつなげ、初リピートと再来店の計画を作る期間です。',
    startDay: 57,
    endDay: 90,
    manualSectionId: 'step7',
  },
] as const

export type NewCastTrainingProgress = {
  startDate: string
  today: string
  elapsedDays: number
  dayNumber: number
  weekNumber: number
  progressPercent: number
  phase: 'before_start' | 'in_progress' | 'completed'
  currentStep: NewCastTrainingStep | null
  daysUntilStart: number
  daysUntilNextStep: number | null
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function getNewCastTrainingProgress(
  startDate: string | null | undefined,
  today = todayJST(),
): NewCastTrainingProgress | null {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(today)) return null

  const elapsedDays = diffDaysJST(today, startDate)
  if (elapsedDays < 0) {
    return {
      startDate,
      today,
      elapsedDays,
      dayNumber: 0,
      weekNumber: 0,
      progressPercent: 0,
      phase: 'before_start',
      currentStep: null,
      daysUntilStart: Math.abs(elapsedDays),
      daysUntilNextStep: null,
    }
  }

  const dayNumber = elapsedDays + 1
  if (dayNumber > NEW_CAST_TRAINING_TOTAL_DAYS) {
    return {
      startDate,
      today,
      elapsedDays,
      dayNumber,
      weekNumber: Math.ceil(dayNumber / 7),
      progressPercent: 100,
      phase: 'completed',
      currentStep: null,
      daysUntilStart: 0,
      daysUntilNextStep: null,
    }
  }

  const currentStep = NEW_CAST_TRAINING_STEPS.find(
    step => dayNumber >= step.startDay && dayNumber <= step.endDay,
  ) ?? null

  return {
    startDate,
    today,
    elapsedDays,
    dayNumber,
    weekNumber: Math.ceil(dayNumber / 7),
    progressPercent: Math.min(100, Math.max(0, Math.round((dayNumber / NEW_CAST_TRAINING_TOTAL_DAYS) * 100))),
    phase: 'in_progress',
    currentStep,
    daysUntilStart: 0,
    daysUntilNextStep: currentStep && currentStep.step < 7
      ? currentStep.endDay + 1 - dayNumber
      : null,
  }
}

export function getTrainingStepStatus(
  step: NewCastTrainingStep,
  progress: NewCastTrainingProgress,
): 'completed' | 'current' | 'upcoming' {
  if (progress.phase === 'completed') return 'completed'
  if (progress.phase === 'before_start') return 'upcoming'
  if (progress.currentStep?.step === step.step) return 'current'
  return progress.dayNumber > step.endDay ? 'completed' : 'upcoming'
}
