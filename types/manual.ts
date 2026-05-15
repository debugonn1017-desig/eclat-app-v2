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

export interface Chapter0Subsection {
  num?: number
  title: string
  body: string
}

export interface Chapter0Section {
  id?: string
  no?: string
  title: string
  body?: string
  content?: string
  subsections?: Chapter0Subsection[]
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
  basic?: string
  advice?: string
  recommended?: string[]
}

export interface ActionDoc {
  id: string
  title: string
  step: string | number
  side: string
  rawMarkdown?: string
  [key: string]: unknown
}

export interface ConversationDoc {
  id: string
  title: string
  step: string | number
  side: string
  rawMarkdown?: string
  [key: string]: unknown
}

export interface ThemeDoc {
  key: string
  step: string | number
  title: string
  subtitle?: string
  order?: number
  action_id?: string | null
  conv_id?: string | null
  no_conv?: boolean
}

export interface PhilosophyFileSubsection {
  num?: number
  title: string
  body: string
}

export interface PhilosophyFileSection {
  id?: string
  title: string
  body?: string
  subsections?: PhilosophyFileSubsection[]
}

export interface PhilosophyFile {
  id: string
  title: string
  subtitle?: string
  filename: string
  rawMarkdown?: string
  sections?: PhilosophyFileSection[]
}

export interface ExtrasGroupLink {
  label: string
  sublabel?: string
  target: string
  target_type: string
}

export interface ExtrasGroup {
  title: string
  subtitle?: string
  icon?: string
  description?: string
  links: ExtrasGroupLink[]
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
    irokoi?: ExtrasGroup
    eigyou_handan?: ExtrasGroup
  }
}
