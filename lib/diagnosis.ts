import { Customer, DiagnosisResult } from '@/types';

// ─── 好みタイプ別：現場レベルの具体的行動 ──────────────────────────────

const FAVORITE_ACTIONS: Record<string, { what: string; actions: string[] }> = {
  '可愛い系': {
    what: '甘えてくる子・守ってあげたくなる子を求めている',
    actions: [
      '「どうしよう〜」「教えてください😢」と小さく頼る場面を作る',
      '失敗談や不器用なエピソードを笑い話として話す',
      '褒められたら「やったー！嬉しい！」と大げさに喜ぶ',
      '絵文字はハート・にこにこ系を自然に使う',
    ],
  },
  '清楚系': {
    what: '品のある落ち着いた子・信頼できる子を求めている',
    actions: [
      '語尾は「〜ですね」「〜ました」で統一。タメ口は使わない',
      '「！！」「笑」「草」は使わない。句読点で区切った文章にする',
      '下ネタや下品な話には乗らず、さりげなく話題を変える',
      '返信は少し間を置いて、丁寧に返す',
    ],
  },
  '綺麗系': {
    what: '大人の色気・自分を高めてくれる存在を求めている',
    actions: [
      '長文は送らない。短く、余韻を残す文章にする',
      '「素敵ですね」「さすがです」を自然に入れる',
      '自分から弱さを見せない。余裕があるトーンを保つ',
      '返信を少し遅くして、追われる側を意識する',
    ],
  },
  'ギャル系': {
    what: 'ノリが良く明るい子・一緒にいて楽しい子を求めている',
    actions: [
      '「それ最高じゃん！」「やばすぎ笑」などノリよく返す',
      '返信テンポは速めに。長文より短文テンポを意識',
      '流行りの話題・面白い話を先に振る',
      'スタンプや絵文字を使ってテンション高めを演出',
    ],
  },
  '大人系': {
    what: '知性・落ち着き・会話のレベルが高い子を求めている',
    actions: [
      'ドラマ・映画・ビジネスの話を自然に振る',
      '「最近何か面白いもの見ましたか？」と知的な質問をする',
      '「！」「笑」を減らし、落ち着いたトーンを保つ',
      '相手が話したことを次回も覚えて触れる（「先日おっしゃってた〇〇って…」）',
    ],
  },
  '癒し系': {
    what: '安らぎ・ホッとできる存在を求めている',
    actions: [
      '「今日も疲れたでしょ」「ゆっくり休んでね」を自然に入れる',
      '否定せず「そうなんだね」「大変だったね」と全部受け止める',
      '返信はゆっくりで良い。即レスより温かみを優先',
      '静かに寄り添う文章にする。テンションを上げすぎない',
    ],
  },
  '甘え系': {
    what: '頼られたい・男として立てられたい気持ちがある',
    actions: [
      '「〇〇さんに相談してもいいですか？」と頼る場面を作る',
      '「〇〇さんが言ってくれたおかげで助かりました」と感謝を返す',
      '決断は相手に委ねる（「どっちがいいと思いますか？」）',
      '「〇〇さんしか頼れなくて…」と特別感を演出する',
    ],
  },
  '強気系': {
    what: 'リードされたい・刺激がほしい・S心をくすぐりたい',
    actions: [
      '返信を少し遅らせて追わせる。即レスしすぎない',
      '意見をはっきり言う（「それは私は違うと思う」）',
      'たまに軽く否定を入れる（「え、それはどうかな笑」）',
      '「来て」とストレートに言わず、焦らして待たせる',
    ],
  },
  'お姉さん系': {
    what: '包んでほしい・一歩引いてサポートしてほしい',
    actions: [
      '悩みや弱さを少し見せて、相手に頼る場面を作る',
      '「〇〇さんならどうしますか？」と意見を仰ぐ',
      '相手の判断を立てる（「さすがですね」「そういう考え方好きです」）',
      '甘えるシーンを自然に作る（「頼っていいですか？」）',
    ],
  },
  '素朴系': {
    what: '飾らない自然体・作り込まれていない素の子を求めている',
    actions: [
      '日常の話（ご飯・天気・今日あったこと）を気軽に送る',
      '過剰な絵文字・スタンプは避けてシンプルな文章にする',
      'ブランドや高級感をアピールしない',
      '「今日こんなことあって笑えた」みたいな素の話をする',
    ],
  },
  '明るい子': {
    what: '元気をもらいたい・会うと明るくなれる子を求めている',
    actions: [
      '「今日いいことあった！」「元気出た！」とポジティブ発信をする',
      'ネガティブな話は避ける。暗い話題には乗りすぎない',
      '「〇〇さんと話すと元気になる〜」と言葉にして伝える',
      'テンション高め・テンポ速めで明るさを演出する',
    ],
  },
  '落ち着いた子': {
    what: 'ゆったり過ごせる子・静かに安心できる関係を求めている',
    actions: [
      '短文でゆっくり返す。テンションを上げすぎない',
      '沈黙や間を怖がらず、ゆとりある返信をする',
      '「ゆっくり話せてよかった」と静かな充実感を伝える',
      '急かすような連絡・返信催促は絶対にしない',
    ],
  },
};

// ─── キャストタイプ別：具体的な振る舞い方 ──────────────────────────────

const CAST_ACTIONS: Record<string, string[]> = {
  '清楚系': [
    '語尾は「〜ですね」「〜ました」で統一。タメ口はNG',
    '絵文字は控えめに。「！！」「笑」「www」は使わない',
    '返信は少し間を置く。即レスで軽く見せない',
  ],
  '可愛い系': [
    '語尾に「〜だよ」「〜だね」を使い、親しみを出す',
    '素直なリアクション（「えー！すごい！」）を大げさにする',
    '困ったときに積極的に頼って可愛げを出す',
  ],
  '綺麗系': [
    '長文を送らない。短く余韻を残す',
    '相手の話をじっくり聞き、すぐ自分の話をしない',
    '返信を遅らせて、追われる側を意識する',
  ],
  'ギャル系': [
    '「笑」「やばい」などを使いノリよく返す',
    '返信テンポを速くし、軽快なやり取りを意識',
    'スタンプや絵文字でテンション高めを演出',
  ],
  'お姉さん系': [
    '愚痴や悩みをまず全部聞く。アドバイスは後',
    '「大変だったね」「無理しないでね」と労いを先に入れる',
    '自分から弱さを見せず、常に余裕ある態度を保つ',
  ],
  '癒し系': [
    '返信のテンポはゆっくり。温かみある文章を優先',
    '「今日もお疲れ様」「ゆっくり休んでね」を自然に入れる',
    '相手の話に「うんうん」「そうなんだ」と共感を先に示す',
  ],
  'サバサバ系': [
    '長文は避け、テンポよく短文で返す',
    '気を使いすぎず「それ面白いね」とフラットに話す',
    '約束は守る。ドタキャンや曖昧な返事はしない',
  ],
  '色恋営業型': [
    '「今日〇〇さんのこと考えてた」など特別感を言葉にする',
    '返信に少し時間をかけ、焦らしを意識する',
    '「〇〇さんだけに話すんだけど…」と秘密感を演出する',
  ],
  '友達営業型': [
    '「最近どう？」と近況を気軽に聞く',
    '自分の日常も少し話して、対等な友達感を出す',
    '「今度一緒に行きたい」など共通の楽しみを提案する',
  ],
  '聞き役タイプ': [
    '質問は1つずつ。「それってどういうこと？」と深掘りする',
    '相手の話を要約して返す（「つまり〜ってこと？」）',
    '自分の意見は控えめにし、「そう思うんだね」と受け止める',
  ],
  '盛り上げ役': [
    '話題のニュースや面白い話を先に持っていく',
    '「それ絶対楽しいじゃん！」と一緒に盛り上がる',
    'スタンプや絵文字でテンション高めを演出する',
  ],
  'S系': [
    '返信を少し遅らせ、追わせる意識を持つ',
    '意見をはっきり言い、相手に合わせすぎない',
    '「それはちょっと違うかな」とたまに軽く否定を入れる',
  ],
  'M系': [
    '「〇〇さんに頼ってもいいですか？」と相手を立てる',
    '決断は相手に委ね「〇〇さんが決めてくれたら嬉しい」と伝える',
    '「助けてもらってありがとうございます」と感謝を丁寧に伝える',
  ],
};

// ─── 職業別トーン補正 ───────────────────────────────────────────────────

const OCC_TONE: Record<string, { tone: string; tips: string[] }> = {
  '経営者': {
    tone: '敬意を払いつつ対等感を出す。時間を無駄にしない短文を意識',
    tips: ['結論から先に書く（長文NG）', '「お忙しい中」より「少しだけ」で軽く連絡する', '尊重しつつ、媚びすぎない'],
  },
  'サラリーマン': {
    tone: '労いと癒し。仕事の疲れを受け止める存在になる',
    tips: ['「今日もお疲れ様」を自然に入れる', '愚痴は否定せず全部聞く', '「息抜きに来てほしい」で誘う'],
  },
  '接待役が多い': {
    tone: '使いやすさと気遣い。相手のペースに合わせる',
    tips: ['予定が読みにくいのでLINEは軽めに', '接待疲れを気遣う一言を入れる', '無理に誘わずタイミングを待つ'],
  },
  '自営業': {
    tone: '自由度を理解した上で、フランクに接する',
    tips: ['時間が不規則なのでプレッシャーをかけない', '仕事の話に興味を持って聞く', '「いつでもいいよ」スタンスで連絡'],
  },
  '医療系': {
    tone: '体調気遣い・誠実さ・落ち着き',
    tips: ['「無理しないでね」「体大丈夫ですか？」を自然に入れる', '不規則な勤務を理解して時間を読む', '夜勤明けの時間帯を意識する'],
  },
  '夜職': {
    tone: '同じ夜の世界として共感。テンポは速め',
    tips: ['起床時間（昼〜夕方）に合わせて連絡する', '仕事の愚痴は深く共感する', '夜が忙しい時間帯は連絡を避ける'],
  },
  '公務員・堅い職業': {
    tone: '丁寧さと信頼感。軽すぎるトーンはNG',
    tips: ['語尾は丁寧語を基本にする', '仕事中（9〜17時）の連絡は避ける', '信頼を積み上げるゆっくりした営業を意識'],
  },
  '土業': {
    tone: '誠実さと安心感',
    tips: ['現場仕事が多いので連絡タイミングを読む', '体を使う仕事への気遣いを入れる'],
  },
  '不動産': {
    tone: '対等感と信頼。交渉上手な相手なので媚びない',
    tips: ['対等な会話を意識する', '言葉を濁さず、はっきり話す'],
  },
  '金融': {
    tone: '品格と信頼。数字や結果に敏感な層',
    tips: ['曖昧な表現を避ける', '約束は必ず守る'],
  },
  '建設': {
    tone: '労いと気遣い。体力仕事を理解した対応',
    tips: ['「体大丈夫ですか？」を自然に入れる', '現場が多い昼間の連絡は控える'],
  },
  '飲食': {
    tone: '同じ接客業として共感。繁忙時間を理解',
    tips: ['ランチ・ディナーピーク（11〜14時・17〜22時）は連絡を避ける', '「大変だったね」で共感する'],
  },
  'IT': {
    tone: '論理的・効率的。無駄な長文を嫌う傾向',
    tips: ['結論から書く', '深夜や不規則時間帯にも対応できるよう柔軟に'],
  },
  '美容': {
    tone: '外見・センスへの共感。同じ美意識を持つ存在を演出',
    tips: ['美容の話題を振ると盛り上がりやすい', '見た目や雰囲気を褒めるポイントを作る'],
  },
  '広告': {
    tone: 'トレンド感・クリエイティブ感を大切に',
    tips: ['流行りの話題に乗れるようにする', '個性や感性を褒める'],
  },
  '士業': {
    tone: '品格・誠実さ・正確さ',
    tips: ['言葉遣いに気を配る', '仕事中（9〜18時）の連絡は避ける', '曖昧な約束はしない'],
  },
  'その他': {
    tone: '相手のペースに合わせて柔軟に対応',
    tips: ['最初は丁寧めに、反応を見ながら距離を縮める'],
  },
};

// ─── LINEテンプレートビルダー ───────────────────────────────────────

function buildThanksLine(name: string, occ: string, hobby: string, castType: string, score: number): string {
  const hobbyMention = hobby ? `\n${name}さんの${hobby}の話、もっと聞きたいな😊` : '';
  if (castType === '色恋営業型' || score >= 4) {
    return `${name}さん、昨日は会えて嬉しかったです💕\nそばにいると時間があっという間で…また会いたくなっちゃいました✨${hobbyMention}\n次はいつ来てくれますか？`;
  }
  if (castType === '友達営業型') {
    return `${name}さん！昨日はありがとうございました😊\nめちゃくちゃ楽しくて、帰り道もずっとニヤニヤしてました笑${hobbyMention}\nまたゆっくり話しましょ〜！`;
  }
  if (occ === '経営者' || occ === '自営業') {
    return `${name}さん、昨日はお時間いただきありがとうございました✨\nお話がとても勉強になりました。${hobbyMention}\nまたお会いできるのを楽しみにしております😊`;
  }
  if (occ === '公務員・堅い職業' || occ === '士業' || occ === '医療系') {
    return `${name}さん、昨日はありがとうございました✨\nお忙しい中来ていただけて、本当に嬉しかったです。${hobbyMention}\nまたお待ちしております😊`;
  }
  return `${name}さん、昨日はありがとうございました✨\n${name}さんとお話しすると、あっという間に時間が過ぎちゃいます😊${hobbyMention}\nまた${name}さんの笑顔が見れるのを楽しみにしてますね💕`;
}

function buildSalesLine(name: string, occ: string, hobby: string, castType: string, score: number, phase: string): string {
  const hobbyHook = hobby ? `${name}さんが好きそうな${hobby}の話を見つけて、` : '';
  if (castType === '色恋営業型' || score >= 4) {
    return `${name}さん、今日も頑張ってる？💕\nなんか今日、ふとしたときに${name}さんのこと思い出しちゃいました✨\nそっちは元気にしてますか？😊`;
  }
  if (phase === '認知' || phase === '場内') {
    return `${name}さん、こんにちは✨\n${hobbyHook ? hobbyHook + 'ふと' + name + 'さんのことが浮かびました😊' : 'ふとしたときに' + name + 'さんのことを思い出しました😊'}\n最近どんなことしてますか？`;
  }
  if (occ === '経営者' || occ === 'サラリーマン' || occ === '公務員・堅い職業') {
    return `${name}さん、お疲れ様です✨\n今日もお仕事忙しかったかな？💦\nたまには息抜きも大事ですよ😊 ${name}さんのこと、ちゃんと心配してます。`;
  }
  if (occ === '夜職' || occ === '飲食') {
    return `${name}さん、今日もお疲れ様でした💕\n夜のお仕事って体力いるよね…ちゃんと休めてる？\nそっちの話、もっと聞かせてほしいな😊`;
  }
  return `${name}さん、お疲れ様です✨\n${hobbyHook ? hobbyHook + 'ふと顔が浮かんじゃいました😊' : name + 'さんのこと、ふと思い出しました😊'}\n今度またゆっくりお話ししましょうね🎵`;
}

function buildVisitLine(name: string, castType: string, score: number, phase: string, occ: string): string {
  if (castType === '色恋営業型' || score >= 4) {
    return `${name}さん…実は今夜、どうしても会いたくて💕\n少しだけでも顔見せてもらえたら、最高に嬉しいです✨\n来てくれたら絶対に喜ばせます😊`;
  }
  if (phase === '安定' || phase === '来店操作可能') {
    return `${name}さん、今週どこかで時間ありますか？✨\n${name}さんに会いたいな〜って思って連絡しちゃいました😊\nお時間いただけたら嬉しいです💕`;
  }
  if (occ === '経営者' || occ === '接待役が多い') {
    return `${name}さん、ご都合よろしければぜひお顔を見せていただけませんか？✨\nいつでもお待ちしております😊`;
  }
  return `${name}さん、お疲れ様💕\n実は今夜（or 明日）、${name}さんに会いたいなって思っちゃいました✨\n少しだけでも来てくれたら、最高に嬉しいです！😊`;
}

// ─── メイン診断関数 ───────────────────────────────────────────────────

export function diagnoseCustomer(customer: Partial<Customer>): DiagnosisResult {
  const placeholder = '顧客情報を登録してください';

  // 診断に必要な主要項目が未登録かチェック
  const requiredFields = [
    customer.customer_rank,
    customer.cast_type,
    customer.favorite_type,
    customer.phase,
    customer.occupation,
    customer.age_group,
  ];
  const hasEnoughData = requiredFields.filter(Boolean).length >= 3;

  if (!hasEnoughData) {
    return {
      sales_priority: '',
      sales_objective: placeholder,
      recommended_tone: placeholder,
      recommended_distance: placeholder,
      recommended_contact_frequency: '',
      best_time_to_contact: '',
      ng_contact_time: '',
      ng_contact_day: '',
      warning_points: '',
      important_points: placeholder,
      recommended_line_thanks: placeholder,
      recommended_line_sales: placeholder,
      recommended_line_visit: placeholder,
      final_recommended_note: placeholder,
    };
  }

  const result: DiagnosisResult = {
    sales_priority: '低',
    sales_objective: '',
    recommended_tone: '丁寧',
    recommended_distance: '程よい距離感',
    recommended_contact_frequency: '週1回程度',
    best_time_to_contact: '20:00〜22:00',
    ng_contact_time: '深夜・早朝',
    ng_contact_day: '特になし',
    warning_points: '',
    important_points: '',
    recommended_line_thanks: '',
    recommended_line_sales: '',
    recommended_line_visit: '',
    final_recommended_note: '',
  };

  const name = customer.nickname || customer.customer_name || 'お客様';
  const rank = customer.customer_rank || 'C';
  const castType = customer.cast_type || '清楚系';
  const favType = customer.favorite_type || '可愛い系';
  const rel = customer.relationship_type || '認知';
  const phase = customer.phase || '認知';
  const spouse = customer.spouse_status || '無';
  const ngTags = customer.ng_items ? customer.ng_items.split(',').filter(Boolean) : [];
  const occ = customer.occupation || 'サラリーマン';
  const hobby = customer.hobby || '';
  const score = customer.score ?? 3;
  const age = customer.age_group || '30代';
  const route = customer.nomination_route || 'その他';

  // ── 1. 優先度 ──────────────────────────────────────────────────────
  if (rank === 'S' || customer.sales_expectation === '高') {
    result.sales_priority = '高';
  } else if (rank === 'A' || customer.trend === '上昇') {
    result.sales_priority = '中';
  } else {
    result.sales_priority = '低';
  }

  // ── 2. 営業目的（好みタイプ × キャストタイプの具体的行動リスト）──────
  const favData = FAVORITE_ACTIONS[favType] ?? FAVORITE_ACTIONS['可愛い系'];
  const castActions = CAST_ACTIONS[castType] ?? CAST_ACTIONS['清楚系'];

  const actionLines = [
    `【${name}さんが求めているもの】${favData.what}`,
    '',
    '【今すぐやること】',
    ...favData.actions.map((a, i) => `${i + 1}. ${a}`),
    '',
    `【${castType}として意識すること】`,
    ...castActions.map((a, i) => `${i + 1}. ${a}`),
  ];
  result.sales_objective = actionLines.join('\n');

  // ── 3. トーン・距離感（職業 × 年齢 × 色恋度）──────────────────────
  const occData = OCC_TONE[occ] ?? OCC_TONE['その他'];
  result.recommended_tone = occData.tone;

  if (score >= 4) {
    result.recommended_distance = '強めの特別感OK。意味深・ドキドキ感を使っていい段階';
  } else if (score === 3) {
    result.recommended_distance = '半プライベート感OK。少し特別な存在として意識させる';
  } else if (score <= 2) {
    result.recommended_distance = '信頼ベース。馴れ馴れしくしすぎず、丁寧に距離を縮める';
  }

  // ── 4. 推奨頻度（関係タイプ × ランク）─────────────────────────────
  if (rel === '認知' || rel === '場内') {
    result.recommended_contact_frequency = '週1〜2回。接点を切らさない程度に';
  } else if (rel === '初指名') {
    result.recommended_contact_frequency = '3日に1回。2回目来店を最優先に動く';
  } else if (rel === 'リピート') {
    result.recommended_contact_frequency = '2〜3日に1回。来店習慣を作る段階';
  } else if (rel === '安定' || rel === '来店操作可能') {
    result.recommended_contact_frequency = '毎日〜2日に1回。来店頻度アップを狙う';
  }

  // ── 5. 連絡時間・NG時間（職業 × 配偶者有無）────────────────────────
  if (occ === 'サラリーマン' || occ === '公務員・堅い職業' || occ === '接待役が多い' || occ === '士業') {
    result.best_time_to_contact = '12:00〜13:00 / 19:00〜22:00';
    result.ng_contact_time = '9:00〜12:00 / 13:00〜18:00（勤務中）';
  } else if (occ === '夜職' || occ === '飲食') {
    result.best_time_to_contact = '15:00〜18:00（起床後）';
    result.ng_contact_time = '8:00〜14:00（睡眠中）/ 営業時間中';
  } else if (occ === '経営者' || occ === '自営業') {
    result.best_time_to_contact = '7:00〜9:00 / 20:00〜23:00';
    result.ng_contact_time = '会議が多い10:00〜18:00は控えめに';
  } else if (occ === '医療系') {
    result.best_time_to_contact = '夜勤なければ19:00〜22:00 / 夜勤明けは14:00〜17:00';
    result.ng_contact_time = '勤務中（8:00〜18:00）は基本避ける';
  } else {
    result.best_time_to_contact = '20:00〜22:00';
    result.ng_contact_time = '深夜・早朝';
  }

  if (spouse === '有') {
    result.ng_contact_day = '日曜・祝日（家族優先）';
    result.ng_contact_time = (result.ng_contact_time || '') + ' / 21:00以降はNG';
    result.best_time_to_contact = '11:30〜13:30 / 17:00〜18:30（外出しやすい時間帯）';
  }
  if (ngTags.includes('休日の連絡圧')) result.ng_contact_day = '土日祝は連絡しない';
  if (ngTags.includes('深夜連絡NG')) result.ng_contact_time += ' / 深夜帯NG';

  // ── 6. 警告点（NGタグ × フェーズ × 色恋度 × 指名経緯）────────────────
  const warnings: string[] = [];

  const ngWarningMap: Record<string, string> = {
    '既読無視追撃': '既読スルーされても追いLINEは絶対にしない。返信が来るまで待つ',
    '返信催促': '「まだ？」「見た？」など催促する言葉は絶対にNG',
    '下ネタ強すぎ': '品のない下ネタには乗らず、華麗に話題を変える',
    '詰めすぎ営業': '来店を強要しない。「会いたい」という気持ちを伝えるにとどめる',
    '依存っぽい': '重い愛情表現・毎日連絡・「会えなくて寂しい」系はNG',
    '連投': '短時間に複数メッセージを送らない。1通にまとめる',
    '距離の詰めすぎ': '関係性に合わない馴れ馴れしさは逆効果。相手のペースに合わせる',
    '感情的': '感情的な返信は送らない。冷静に余裕ある対応を心がける',
    '比較トーク': '他のお客様・他のキャストとの比較トークは絶対にしない',
    '押し売り営業': 'イベント・同伴・来店を強く押し付けない',
    '圧をかける': '来店・返信・約束に対してプレッシャーをかけない',
    '空気を読まない連絡': '相手が忙しそうな時間・タイミングに連絡しない',
    '嫉妬煽り': '他の男性や元カノを刺激するような発言は避ける',
    '結婚観を詰める': '結婚・将来の話は絶対に自分から触れない',
    '金の話が多い': '売上・金額・イベントの話を多用しない',
  };

  ngTags.forEach(tag => {
    if (ngWarningMap[tag]) warnings.push(ngWarningMap[tag]);
  });

  // 指名経緯による追加注意
  if (route === 'ヘルプ→本指名') warnings.push('比較の中で選ばれている。「他と違う」と感じさせる対応を意識する');
  if (route === 'フリー→本指名') warnings.push('第一印象で来ている。2回目来店が最重要。浅い関係なので焦らない');
  if (route === 'SNS指名') warnings.push('SNSのイメージを壊さないこと。リアルで上回る対応が必要');
  if (route === '前店舗顧客') warnings.push('慣れによる雑さが出やすい。前より落とさない対応を意識する');
  if (route === 'ロイヤル層→本指名') warnings.push('最重要顧客。扱いを間違えると一番痛い層。最優先で動く');

  // 配偶者・フェーズ補正
  if (spouse === '有') warnings.push('21:00以降のLINEは絶対NG。土日祝も基本触れない');
  if (phase === '認知' || phase === '場内') warnings.push('来店前提の話し方をしない。今は関係構築最優先');
  if (score <= 2) warnings.push('色恋度が低い。馴れ馴れしい表現・甘い言葉は逆効果になりやすい');
  if (score >= 5) warnings.push('色恋度最大。感情的な事故リスクが高い。他客比較・独占欲には要注意');

  result.warning_points = warnings.length > 0 ? warnings.map(w => `・${w}`).join('\n') : '特になし';

  // ── 7. 重要ポイント（職業tips + 趣味 + 関係タイプ補正）─────────────────
  const importants: string[] = [];

  // 職業のコツ
  occData.tips.forEach(t => importants.push(t));

  // 趣味を使う
  if (hobby) importants.push(`「${hobby}」の話題を振ると心を開きやすい。積極的に使う`);

  // 関係段階による補正
  if (rel === '認知' || rel === '場内') importants.push('まだ関係が浅い。焦らず接点を増やすことを最優先に');
  if (rel === '初指名') importants.push('2回目来店が最重要。来て良かったと思わせる対応を');
  if (rel === '安定' || rel === '来店操作可能') importants.push('関係が安定している。来店頻度アップを狙うタイミング');

  // 年齢補正
  if (age === '20代') importants.push('20代はテンポ重視。長文より短文・スタンプでテンポよく返す');
  if (age === '50代以上') importants.push('50代以上は敬意と誠実さが最重要。軽いトーンに注意');

  result.important_points = importants.map(p => `・${p}`).join('\n');

  // ── 8. LINEテンプレート ─────────────────────────────────────────────
  result.recommended_line_thanks = buildThanksLine(name, occ, hobby, castType, score);
  result.recommended_line_sales = buildSalesLine(name, occ, hobby, castType, score, phase);
  result.recommended_line_visit = buildVisitLine(name, castType, score, phase, occ);

  // ── 9. 総合アドバイス ───────────────────────────────────────────────
  const priorityLabel = result.sales_priority === '高' ? '🔴最優先' : result.sales_priority === '中' ? '🟡注力' : '🟢維持';
  result.final_recommended_note = [
    `${priorityLabel}【${rank}ランク / ${phase} / 色恋度${score}】`,
    `推奨頻度：${result.recommended_contact_frequency}`,
    `連絡ベスト：${result.best_time_to_contact}`,
    warnings.length > 0 ? `⚠️ 要注意：${warnings[0]}` : '',
  ].filter(Boolean).join('\n');

  return result;
}
