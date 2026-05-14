// COSTES キャスト教科書のデータ型
// public/manual/data.json の構造に対応

export interface ManualReaction {
  type: 'kenson' | 'jiman' | 'jigyaku' | string
  label: string
  text: string
  reply: string
}

export interface ManualItem {
  id: string
  title: string
  step: string
  category: string
  group: string
  scene: string
  purpose: string
  serif: string
  reactions: ManualReaction[]
  info: string
  why: string
  standard: string
  keywords: string[]
}

export interface SevenStep {
  no: number
  title: string
  purpose: string
}

export interface PhilosophyReason {
  name: string
  explain: string
}

export interface PhilosophyAction {
  name: string
  explain: string
}

export interface Philosophy {
  concept: string
  purpose: string
  reasons: PhilosophyReason[]
  actions: PhilosophyAction[]
  ngList: string[]
  balance: {
    earlyStage: string
    deepStage: string
  }
}

export interface Chapter0Section {
  no?: string
  title: string
  content: string
}

export interface Chapter0 {
  title: string
  filename: string
  rawMarkdown: string
  sections?: Chapter0Section[]
}

export interface CastType {
  id: string
  icon: string
  name: string
  tagline?: string
  feature?: string
  weapon?: string
  strong?: string
  weak?: string
}

export interface ActionDoc {
  id: string
  title: string
  step: string
  side: string
  rawMarkdown?: string
  [key: string]: unknown
}

export interface ConversationDoc {
  id: string
  title: string
  step: string
  side: string
  rawMarkdown?: string
  [key: string]: unknown
}

export interface ThemeDoc {
  key: string
  step: string
  title: string
  subtitle?: string
  order?: number
  action_id?: string | null
  conv_id?: string | null
  no_conv?: boolean
}

export interface PhilosophyFile {
  id: string
  title: string
  subtitle?: string
  filename: string
  rawMarkdown?: string
}

export interface ManualData {
  version: string
  generatedAt: string
  philosophy: Philosophy
  sevenSteps: SevenStep[]
  manuals: ManualItem[]
  castTypes: CastType[]
  chapter_0: Chapter0
  actions: ActionDoc[]
  conversations: ConversationDoc[]
  themes: ThemeDoc[]
  philosophy_files: PhilosophyFile[]
  extras_groups: {
    irokoi?: PhilosophyFile[]
    eigyou_handan?: PhilosophyFile[]
  }
}
