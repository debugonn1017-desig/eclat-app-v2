import { Customer, DiagnosisResult } from '@/types';

const CAST_STRATEGIES: Record<string, { description: string; strategy: string }> = {
  '清楚系': { description: '誠実さと品格を重視', strategy: '敬語を交えた丁寧な対応と、一線を画した上品な振る舞いで信頼を築く。' },
  '可愛い系': { description: '愛嬌と親しみやすさ', strategy: '明るい笑顔と素直な感情表現で、守ってあげたいと思わせる愛されキャラを確立する。' },
  '綺麗系': { description: '憧れの存在としての華やかさ', strategy: '落ち着いたトーンと洗練された仕草で、特別感を演出しつつ聞き役に徹する。' },
  'ギャル系': { description: 'ノリの良さとギャップ', strategy: 'フレンドリーなタメ口を織り交ぜつつ、時折見せる真面目さや気遣いで心を掴む。' },
  'お姉さん系': { description: '包容力と余裕', strategy: '相手の悩みを受け止める聞き上手さと、落ち着いた大人の色気で安心感を与える。' },
  '癒し系': { description: '穏やかさと安らぎ', strategy: 'ゆっくりとしたテンポの会話と共感力の高さで、日常の疲れを忘れさせる存在になる。' },
  'サバサバ系': { description: '裏表のなさと軽快さ', strategy: '友達のような気楽な関係を築きつつ、自立した女性としての魅力をアピールする。' },
  '色恋営業型': { description: '疑似恋愛のドキドキ感', strategy: '好意をストレートに伝え、二人だけの秘密や約束を増やすことで依存度を高める。' },
  '友達営業型': { description: '一番の理解者', strategy: '損得抜きで楽しめる関係を作り、プライベートな相談もできる深い信頼関係を目指す。' },
  '聞き役タイプ': { description: '承認欲求を満たす', strategy: '相手の話を深掘りし、全力で肯定することで「自分を分かってくれる」と思わせる。' },
  '盛り上げ役': { description: '楽しさの提供', strategy: '常に明るい話題を提供し、会うだけで元気になれるエンターテイナーとして振る舞う。' },
  'S系': { description: '主導権を握る', strategy: '自信に満ちた態度で相手をリードし、時折見せる優しさ（アメとムチ）で惹きつける。' },
  'M系': { description: '献身的なサポート', strategy: '相手を立て、一歩引いた位置から支える姿勢を見せることで自己肯定感を満たす。' },
};

const FAVORITE_APPROACHES: Record<string, { description: string; approach: string }> = {
  '可愛い系': { description: '愛嬌のある子を求めている', approach: '素直なリアクションと甘え上手な一面を見せ、可愛がられるポジションを取る。' },
  '清楚系': { description: '品のある落ち着いた子を求めている', approach: '言葉遣いや仕草に気を配り、控えめながらも芯のある清楚な女性を演じる。' },
  '綺麗系': { description: '自慢できる美しい人を求めている', approach: '外見の磨き込みはもちろん、凛とした立ち振る舞いで「高嶺の花」感を維持する。' },
  'ギャル系': { description: 'ノリが良く明るい子を求めている', approach: '流行に敏感で、テンション高く会話を楽しみ、元気を与えられる存在になる。' },
  '大人系': { description: '知性的で余裕のある人を求めている', approach: '落ち着いた話題を選び、情緒が安定した大人の女性として接する。' },
  '癒し系': { description: '安らぎを求めている', approach: '否定せず全てを包み込むような優しさを見せ、心の拠り所としての地位を築く。' },
  '甘え系': { description: '頼られたい願望がある', approach: '小さなことでも相談したり頼ったりして、相手の自尊心と庇護欲を刺激する。' },
  '強気系': { description: 'リードされたい、刺激を求めている', approach: '自分の意見をはっきり言い、時には厳しく接することでM心をくすぐる。' },
  'お姉さん系': { description: '包容力やリードを求めている', approach: '包容力のある態度で接し、時には優しく諭すような大人の余裕を見せる。' },
  '素朴系': { description: '飾らない自然体な子を求めている', approach: '派手さを抑え、純粋で真っ直ぐな反応を心がけ、安心感を与える。' },
  '明るい子': { description: '元気をもらいたい', approach: 'ネガティブな話題は避け、常に前向きでパワーを与えられる太陽のような存在になる。' },
  '落ち着いた子': { description: '静かに過ごしたい', approach: '沈黙も楽しめるようなゆったりした空間を作り、声を張りすぎず穏やかに接する。' },
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
    return `${name}さん、こんにちは✨\n${hobbyHook ? hobbyHook + 'ふと${name}さんのことが浮かびました😊' : 'ふとしたときに' + name + 'さんのことを思い出しました😊'}\n最近どんなことしてますか？`;
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
  const result: DiagnosisResult = {
    sales_priority: '低',
    sales_objective: '',
    recommended_tone: '丁寧',
    recommended_distance: '程よい距離感',
    recommended_contact_frequency: '週1回程度',
    best_time_to_contact: '20:00 - 22:00',
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
  const rank = customer.customer_rank ?? 'C';
  const castType = customer.cast_type ?? '清楚系';
  const favType = customer.favorite_type ?? '可愛い系';
  const rel = customer.relationship_type ?? '認知';
  const phase = customer.phase ?? '認知';
  const spouse = customer.spouse_status ?? '無';
  const ngTags = customer.ng_items ? customer.ng_items.split(',').filter(Boolean) : [];
  const occ = customer.occupation ?? 'サラリーマン';
  const hobby = customer.hobby ?? '';
  const score = customer.score ?? 3;

  // 1. 優先度
  if (rank === 'S' || customer.sales_expectation === '高') {
    result.sales_priority = '高';
  } else if (rank === 'A' || customer.trend === '上昇') {
    result.sales_priority = '中';
  } else {
    result.sales_priority = '低';
  }

  // 2. 営業目的（キャストタイプ × 好みタイプ）
  const castStrategy = CAST_STRATEGIES[castType] ?? CAST_STRATEGIES['清楚系'];
  const favApproach = FAVORITE_APPROACHES[favType] ?? FAVORITE_APPROACHES['可愛い系'];
  result.sales_objective = `${castStrategy.strategy} また、${favApproach.approach}`;

  // 3. 口調・距離感
  if (occ === '公務員・堅い職業' || occ === '士業' || occ === '医療系') {
    result.recommended_tone = '敬語ベースで品格重視';
    result.recommended_distance = '礼儀正しく、一線を画した距離感';
  } else if (occ === '経営者' || occ === '自営業') {
    result.recommended_tone = '敬意を払いつつ、親しみやすさを出す';
    result.recommended_distance = 'パートナーとして信頼される距離感';
  } else if (castType === '色恋営業型' || score >= 4) {
    result.recommended_tone = '甘め・ドキドキ感を意識';
    result.recommended_distance = '近すぎず、でも特別感を保つ距離感';
  } else {
    result.recommended_tone = '相手のテンションに合わせる';
    result.recommended_distance = '明るくフレンドリーな距離感';
  }

  // 4. 推奨頻度
  if (rel === '認知' || rel === '場内') {
    result.recommended_contact_frequency = '3日に1回程度';
  } else if (rel === 'リピート' || rel === '安定' || rel === '来店操作可能') {
    result.recommended_contact_frequency = '毎日〜2日に1回';
  } else {
    result.recommended_contact_frequency = '週1〜2回、定期的に';
  }

  // 5. 連絡時間・NG
  if (occ === 'サラリーマン' || occ === '公務員・堅い職業' || occ === '接待役が多い') {
    result.best_time_to_contact = '12:00〜13:00 / 19:00〜22:00';
    result.ng_contact_time = '9:00〜12:00 / 13:00〜18:00（勤務中）';
  } else if (occ === '夜職' || occ === '飲食') {
    result.best_time_to_contact = '15:00〜18:00 / 深夜2:00〜4:00';
    result.ng_contact_time = '8:00〜14:00（睡眠中）';
  } else if (occ === '経営者' || occ === '自営業') {
    result.best_time_to_contact = '7:00〜9:00 / 20:00〜23:00';
    result.ng_contact_time = '会議が多い10:00〜18:00は控えめに';
  } else {
    result.best_time_to_contact = '20:00〜22:00';
    result.ng_contact_time = '深夜・早朝';
  }

  if (spouse === '有') {
    result.ng_contact_day = '土日祝（家族優先の可能性が高い）';
    result.ng_contact_time += ' / 22:00以降は避ける';
  }
  if (ngTags.includes('休日の連絡圧')) result.ng_contact_day = '休日は控える';
  if (ngTags.includes('深夜連絡NG')) result.ng_contact_time += ' / 深夜帯NG';

  // 6. 警告点
  const warnings: string[] = [];
  const ngWarningMap: Record<string, string> = {
    '既読無視追撃': '返信が来ていない状態での追いLINEは絶対にしない',
    '返信催促': '「まだ？」などの催促は絶対にしない',
    '下ネタ強すぎ': '品のない下ネタには乗らず、華麗にかわす',
    '詰めすぎ営業': '来店を強要せず、会いたい気持ちを優先して伝える',
    '依存っぽい': '重い愛情表現は避け、自立した女性として振る舞う',
    '連投': '短時間に複数メッセージを送らない',
    '距離の詰めすぎ': '関係性に合わない馴れ馴れしさは逆効果',
    '感情的': '感情的な返信は避け、常に余裕ある対応を心がける',
    '比較トーク': '他のお客様や他のキャストと比較するトークはしない',
    '押し売り営業': 'イベントや来店を強く押し付けない',
  };
  ngTags.forEach(tag => {
    if (ngWarningMap[tag]) warnings.push(ngWarningMap[tag]);
  });

  if (spouse === '有') warnings.push('22時以降のプライベートなLINEは控える');
  if (phase === '認知' || phase === '場内') warnings.push('来店を前提にした話し方をしない（まず関係構築を優先）');
  if (score <= 2) warnings.push('色恋度が低いため、馴れ馴れしい表現は逆効果になりやすい');

  result.warning_points = warnings.length > 0 ? warnings.join('。') + '。' : '特になし。';

  // 7. 重要ポイント
  const importants: string[] = [];
  importants.push(`${castType}としての魅力を出しながら、${name}さんが求める「${favType}」な要素を自然に取り入れることが重要です。`);
  if (customer.nomination_route === 'ロイヤル層→本指名') importants.push('最重要顧客。全ての要望を最優先で対応すること。');
  if (score >= 4) importants.push('色恋度が高いため、特別感・ドキドキ感を意識したアプローチが効果的。');
  if (hobby) importants.push(`「${hobby}」の話題は心を開くきっかけになりやすい。積極的に活用しましょう。`);

  result.important_points = importants.join(' ');

  // 8. LINEテンプレート（動的生成）
  result.recommended_line_thanks = buildThanksLine(name, occ, hobby, castType, score);
  result.recommended_line_sales = buildSalesLine(name, occ, hobby, castType, score, phase);
  result.recommended_line_visit = buildVisitLine(name, castType, score, phase, occ);

  // 9. 総合アドバイス
  result.final_recommended_note = [
    `【${rank}ランク / ${phase}】`,
    `${name}さんへの基本戦略：${result.sales_objective}`,
    `推奨頻度：${result.recommended_contact_frequency}`,
    result.warning_points !== '特になし。' ? `⚠️ 注意：${result.warning_points}` : '',
  ].filter(Boolean).join('\n');

  return result;
}
