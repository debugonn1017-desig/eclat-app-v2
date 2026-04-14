import { Customer, DiagnosisResult } from '@/types';

const CAST_STRATEGIES: Record<string, { description: string, strategy: string }> = {
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
  'M系': { description: '献身的なサポート', strategy: '相手を立て、一歩引いた位置から支える姿勢を見せることで自己肯定感を満たす。' }
};

const FAVORITE_APPROACHES: Record<string, { description: string, approach: string }> = {
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
  '落ち着いた子': { description: '静かに過ごしたい', approach: '沈黙も楽しめるようなゆったりした空間を作り、声を張りすぎず穏やかに接する。' }
};

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
    final_recommended_note: ''
  };

  const name = customer.nickname || customer.customer_name || 'お客様';
  const rank = customer.customer_rank;
  const castType = customer.cast_type || '清楚系';
  const favType = customer.favorite_type || '可愛い系';
  const rel = customer.relationship_type;
  const phase = customer.phase;
  const spouse = customer.spouse_status;
  const ngTags = customer.ng_items ? customer.ng_items.split(',').filter(Boolean) : [];
  const occ = customer.occupation;

  // 1. 優先度
  if (rank === 'S' || customer.sales_expectation === '高') {
    result.sales_priority = '高';
  } else if (rank === 'A' || customer.trend === '上昇') {
    result.sales_priority = '中';
  } else {
    result.sales_priority = '低';
  }

  // 2. キャストタイプ × 好みのタイプ = 戦略
  const castStrategy = CAST_STRATEGIES[castType] || CAST_STRATEGIES['清楚系'];
  const favApproach = FAVORITE_APPROACHES[favType] || FAVORITE_APPROACHES['可愛い系'];
  
  result.sales_objective = `${castStrategy.strategy} また、${favApproach.approach}`;

  // 3. 口調・距離感
  if (occ === '公務員・堅い職業' || occ === '士業' || occ === '医療系') {
    result.recommended_tone = '敬語ベースで品格重視';
    result.recommended_distance = '礼儀正しく、一線を画した距離感';
  } else if (occ === '経営者' || occ === '自営業') {
    result.recommended_tone = '敬意を払いつつ、親しみやすさを出す';
    result.recommended_distance = 'パートナーとして信頼される距離感';
  } else {
    result.recommended_tone = '相手のテンションに合わせる';
    result.recommended_distance = '明るくフレンドリーな距離感';
  }

  // 4. おすすめ頻度
  if (rel === '認知' || rel === '場内') result.recommended_contact_frequency = '3日に1回程度';
  else if (rel === 'リピート' || rel === '安定') result.recommended_contact_frequency = '毎日〜2日に1回';
  else result.recommended_contact_frequency = '週1〜2回、定期的';

  // 5. 連絡時間・NG
  if (occ === 'サラリーマン' || occ === '公務員・堅い職業') {
    result.best_time_to_contact = '12:00-13:00, 19:00-22:00';
    result.ng_contact_time = '9:00-12:00, 13:00-18:00';
  } else if (occ === '夜職' || occ === '飲食') {
    result.best_time_to_contact = '15:00-18:00, 2:00-4:00';
    result.ng_contact_time = '8:00-14:00';
  }

  if (spouse === '有') result.ng_contact_day = '土日祝（家族優先）';
  if (ngTags.includes('休日の連絡圧')) result.ng_contact_day = '休日';
  if (ngTags.includes('深夜連絡NG')) result.ng_contact_time += ', 24:00以降';

  // 6. 禁止事項・注意事項
  let warnings: string[] = [];
  if (ngTags.length > 0) {
    ngTags.forEach(tag => {
      if (tag === '既読無視追撃') warnings.push('返信が来ていない状態で追いLINEをしない');
      if (tag === '返信催促') warnings.push('「まだ？」などの催促を絶対にしない');
      if (tag === '下ネタ強すぎ') warnings.push('品のない下ネタには乗らず、華麗にかわす');
      if (tag === '詰めすぎ営業') warnings.push('店に来ることを強要せず、会いたい気持ちを優先して伝える');
      if (tag === '依存っぽい') warnings.push('重い愛情表現は避け、自立した女性として振る舞う');
    });
  }
  
  if (spouse === '有') warnings.push('22時以降の夜遅い時間にプライベートなLINEを送らない');
  if (phase === '興味付け' || phase === '接点維持') warnings.push('店に来ることを前提で話さない');
  
  result.warning_points = warnings.length > 0 ? warnings.join('。') + '。' : '特になし。';

  let importants: string[] = [];
  importants.push(`${castType}としての魅力を出しつつ、お客様が求める${favType}な要素を取り入れるのが鍵です。`);
  if (customer.nomination_route === 'ロイヤル層→本指名') importants.push('最重要顧客。全ての要望を最優先。');
  
  result.important_points = importants.join(' ');

  // 7. LINE templates
  // (Maintain existing template logic)
  const cast = customer.cast_name || '私';
  
  // お礼
  result.recommended_line_thanks = `${name}さん、昨日はありがとうございました✨\n${name}さんとお話ししてると、あっという間に時間が過ぎちゃいます😊\nまた${name}さんの笑顔が見れるのを楽しみにしてますね💕`;
  
  // 営業（きっかけ）
  if (occ === '経営者' || occ === 'サラリーマン') {
    result.recommended_line_sales = `${name}さん、お疲れ様です✨\n今日もお仕事忙しかったかな？💦\n${name}さん、あまり無理しないでくださいね。たまには息抜きも必要ですよ😊`;
  } else {
    result.recommended_line_sales = `${name}さん、お疲れ様です✨\n今日${name}さんの好きそうな〇〇を見つけて、ふと顔が浮かんじゃいました😊\n今度お話し聞かせてくださいね🎵`;
  }
  
  // 来店誘致
  result.recommended_line_visit = `${name}さん、お疲れ様💕\n実は今夜（or明日）、${name}さんに会いたいなーって思っちゃいました✨\n少しだけでも顔見せに来てくれたら、最高に嬉しいです！😊`;

  result.final_recommended_note = `${rank}ランクの${name}様に対しては、「${result.sales_objective}」を意識しましょう。${result.warning_points !== '特になし' ? '⚠️' + result.warning_points : ''}に気をつけつつ、${result.recommended_contact_frequency}のペースで接点を持ち続けるのがベストです。`;


  return result;
}
