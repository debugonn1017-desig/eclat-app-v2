import { Customer, DiagnosisResult } from '@/types';

export function diagnoseCustomer(customer: Partial<Customer>): DiagnosisResult {
  const result: DiagnosisResult = {
    sales_priority: '低',
    sales_objective: 'まずは自分を知ってもらう',
    recommended_tone: '丁寧',
    recommended_distance: '程よい距離感',
    recommended_frequency: '週1回程度',
    best_time_to_contact: '20:00 - 22:00',
    ng_contact_time: '深夜・早朝',
    ng_contact_day: '特になし',
    warning_points: '特になし',
    important_points: '礼儀正しく誠実な対応',
    recommended_line_thanks: '',
    recommended_line_sales: '',
    recommended_line_visit: '',
    final_recommended_note: ''
  };

  const name = customer.nickname || customer.customer_name || 'お客様';
  const rank = customer.customer_rank;
  const route = customer.nomination_route;
  const occ = customer.occupation;
  const rel = customer.relationship_type;
  const phase = customer.phase;
  const spouse = customer.spouse_status;
  const fav = customer.favorite_type;
  const score = customer.score || 0;
  const ng = customer.ng_items;

  // 1. 優先度
  if (rank === 'S' || customer.sales_expectation === '高') {
    result.sales_priority = '高';
  } else if (rank === 'A' || customer.trend === '上昇') {
    result.sales_priority = '中';
  } else {
    result.sales_priority = '低';
  }

  // 2. 目的
  if (phase === '興味付け') result.sales_objective = 'まずは自分を知ってもらい、好感を持ってもらう段階です。';
  else if (phase === '接点維持') result.sales_objective = '忘れられないよう、日常的な話題で細く長く連絡を続けましょう。';
  else if (phase === '距離を縮める') result.sales_objective = '共通の趣味やプライベートな話題を増やし、親密度を上げましょう。';
  else if (phase === '来店を増やす') result.sales_objective = 'イベントの案内や「会いたい」気持ちを伝え、来店のきっかけを作りましょう。';
  else if (phase === '固定化する') result.sales_objective = '唯一無二の存在（パートナー的存在）になり、安定した指名を維持しましょう。';

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
  if (rel === '認知' || rel === '場内') result.recommended_frequency = '3日に1回程度';
  else if (rel === 'リピート' || rel === '安定') result.recommended_frequency = '毎日〜2日に1回';
  else result.recommended_frequency = '週1〜2回、定期的';

  // 5. 連絡時間・NG
  if (occ === 'サラリーマン' || occ === '公務員・堅い職業') {
    result.best_time_to_contact = '12:00-13:00, 19:00-22:00';
    result.ng_contact_time = '9:00-12:00, 13:00-18:00';
  } else if (occ === '夜職' || occ === '飲食') {
    result.best_time_to_contact = '15:00-18:00, 2:00-4:00';
    result.ng_contact_time = '8:00-14:00';
  }

  if (spouse === '有') result.ng_contact_day = '土日祝（家族優先）';
  if (ng === '日曜連絡NG') result.ng_contact_day = '日曜日';
  if (ng === '深夜連絡NG') result.ng_contact_time += ', 24:00以降';

  // 6. 禁止事項・注意事項（キャストがやってはいけないこと）
  let warnings: string[] = [];
  
  // 基本の禁止行動（全客共通）
  warnings.push('返信が来ていない状態で追いLINEしない');
  warnings.push('他のお客様の話を出さない');
  warnings.push('無理に距離を詰めない');

  // 条件別の具体的禁止行動
  if (ng === 'ドタキャン') warnings.push('当日いきなり来店打診しない');
  if (ng === 'しつこい営業NG' || ng === '重い営業NG') warnings.push('1日に何度もLINEを送らない');
  if (spouse === '有') warnings.push('22時以降の夜遅い時間に営業LINEを送らない');
  if (ng === '連絡遅い') warnings.push('既読がついた直後に返信を催促しない');
  if (customer.sales_expectation === '低') warnings.push('高額なボトルを無理に勧めない');
  if (ng === 'お金にシビア' || ng === '金銭感覚ズレ') warnings.push('金額や売上の話を急にしない');
  if (phase === '興味付け' || phase === '接点維持') warnings.push('店に来ることを前提で話さない');
  if (rel === '認知' || rel === '場内') warnings.push('プライベートな内容を根掘り葉掘り聞かない');
  
  result.warning_points = warnings.join('。') + '。';

  let importants: string[] = [];
  if (route === 'ロイヤル層→本指名') importants.push('最重要顧客。全ての要望を最優先し、特別感を演出。');
  if (fav) importants.push(`「${fav}」な振る舞いや服装を意識すると効果的です。`);
  if (occ === '経営者') importants.push('仕事への理解と、聞き役に徹する姿勢が喜ばれます。');
  result.important_points = importants.length > 0 ? importants.join(' ') : '礼儀正しく誠実な対応を継続しましょう。';

  // 7. LINE templates
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

  result.final_recommended_note = `${rank}ランクの${name}様に対しては、「${result.sales_objective}」を意識しましょう。${result.warning_points !== '特になし' ? '⚠️' + result.warning_points : ''}に気をつけつつ、${result.recommended_frequency}のペースで接点を持ち続けるのがベストです。`;

  return result;
}
