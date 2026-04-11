import { Customer, DiagnosisResult } from '@/types';

export function diagnoseCustomer(customer: Customer): DiagnosisResult {
  const result: DiagnosisResult = {
    priority: '低',
    priorityReason: '',
    strategyPolicy: '',
    specificStrategy: '',
    dangerAlert: '',
    coreStrategy: '',
    ngAction: '',
    finalAction: '',
    objective: '',
    tone: '丁寧',
    distance: '程よい距離感',
    frequency: '週1回程度',
    bestTime: '20:00 - 22:00',
    ngTime: '深夜・早朝',
    ngDay: '特になし',
    caution: '',
    points: [],
    recommendedMemo: '',
    messages: {
      light: '',
      standard: '',
      aggressive: ''
    }
  };

  const name = customer.nickname || customer.customer_name;
  const isMarried = customer.spouse_status === '有';
  const level = customer.romance_level;
  const trend = customer.trend;
  const sales = customer.sales_expectation;

  // 1. 優先度と売上期待値の反映
  const today = new Date().toISOString().split('T')[0];
  if (customer.next_contact_date && customer.next_contact_date <= today) {
    result.priority = '高';
    result.priorityReason = '連絡予定日超過';
  } else if (sales === '高' || customer.customer_rank === 'S') {
    result.priority = '高';
    result.priorityReason = 'VIP顧客・高期待値';
  } else if (trend === '上昇') {
    result.priority = '中';
    result.priorityReason = '温度感上昇中（チャンス）';
  } else {
    result.priority = '低';
    result.priorityReason = '現状維持';
  }

  // 2. 攻略方針 & 最重要攻略ポイント
  if (customer.customer_rank === 'S') {
    result.strategyPolicy = '【神客・絶対維持型】';
    result.coreStrategy = '追わずに価値を高め、相手の「特別な居場所」を死守せよ。';
  } else if (trend === '下降') {
    result.strategyPolicy = '【離脱阻止・リカバリー型】';
    result.coreStrategy = '営業色を完全に消し、純粋な気遣いのみで執着心を再燃させよ。';
  } else if (sales === '高') {
    result.strategyPolicy = '【積極投資・エース育成型】';
    result.coreStrategy = '会う理由をこちらから作り、一気に来店習慣を定着させよ。';
  } else {
    result.strategyPolicy = '【安定運用・コスト管理型】';
    result.coreStrategy = '無理に太くせず、細く長い接点で忘却を防止せよ。';
  }

  // 3. 具体戦略
  let strat = '';
  if (trend === '上昇') strat += '今が攻め時。少しわがままを言っても通る時期。';
  else if (trend === '下降') strat += '今は引く時期。しつこくすると嫌われる。';
  
  if (customer.phase === '関係構築') strat += ' 内緒話や将来の約束をして、二人だけの世界を作る。';
  else if (customer.phase === '囲い込み') strat += ' 他の客とは違う「唯一無二」の存在であることを強調。';
  result.specificStrategy = strat || '相手のペースに合わせつつ、次回の来店フックを一つ投げる。';

  // 4. 危険アラート
  if (isMarried && trend === '下降') {
    result.dangerAlert = '既婚で下降中。追い連絡はブロックのリスク大。1週間以上放置を推奨。';
  } else if (customer.ng_type === '連絡遅い' && trend === '上昇') {
    result.dangerAlert = '相手の返信が遅いタイプ。返信を催促した瞬間に冷めます。';
  } else if (level >= 4 && sales === '低') {
    result.dangerAlert = '色恋が先行しすぎ。売上に繋がらない「ただの恋人」化の危険あり。';
  } else {
    result.dangerAlert = 'なし（標準的な警戒）';
  }

  // 5. NG行動
  result.ngAction = isMarried ? '日曜連絡・夜21時以降の通知・家庭の詮索。' : '既読スルーへの追撃・感情的な発言・他店キャストの自慢。';

  // 6. メッセージ生成 (キャストタイプ別調整)
  const generateMessages = () => {
    let light = '';
    let standard = '';
    let aggressive = '';

    const cast = customer.cast_type || '清楚・可愛い系';
    
    // キャストタイプ別の語尾・絵文字
    const style = {
      '清楚・可愛い系': { suffix: '✨', mid: '😊', aggressive: '🎀', tone: 'お疲れ様です！' },
      '綺麗・お姉さん系': { suffix: '🍷', mid: '✨', aggressive: '👠', tone: 'お疲れ様。' },
      'ノリ・友達系': { suffix: '🔥', mid: '🙌', aggressive: '⚡️', tone: 'お疲れー！' },
      '色恋・小悪魔系': { suffix: '💕', mid: '😈', aggressive: '💋', tone: 'お疲れ様💕' }
    }[cast];

    if (customer.customer_rank === 'S') {
      light = `${name}様、${style.tone}${style.suffix}\nお忙しい日々かと思いますが、体調崩されてないですか？💦\nふと${name}様のスマートな立ち振る舞いを思い出してLINEしました。お体ご自愛くださいね。`;
      standard = `${name}様、${style.tone}${style.mid}\nまた${name}様とゆっくりお話しできる時間を楽しみにしております。もしこちらにお越しの予定があれば、是非教えてくださいね。`;
      aggressive = `${name}様、${style.tone}${style.aggressive}\n今度${name}様のお好きそうな極上の〇〇が入る予定なのですが、是非一番に${name}様に味わっていただきたくて。お時間合えば少しだけでも顔出していただけませんか？`;
    } else if (isMarried) {
      light = `${name}さん、${style.tone}${style.suffix}\n今日もお仕事頑張ってますか？😊あまり無理せず、${name}さんにとって良い一日になりますように！`;
      standard = `${name}さん、${style.tone}${style.mid}\nお仕事大変な中、いつも私のこと気にかけてくれてありがとう✨\n${name}さんにとってここが、一番リラックスできる場所になれるよう頑張りますね。返信は不要ですよ！`;
      aggressive = `${name}さん、${style.tone}${style.aggressive}\n今度${name}さんに喜んでもらえそうな〇〇準備しておきますね😊もしお仕事帰りに少しでも余裕があれば、是非癒やされに来てください。無理はしないでくださいね！`;
    } else {
      light = `${name}さん、${style.tone}${style.mid}\n今なにしてるのかなーってふと思っちゃった${style.suffix}\n今日もお互い頑張ろうね！`;
      standard = `${name}さん、${style.tone}${style.mid}\n昨日は${name}さんと話せて元気出たよ！😊また${name}さんとゆっくりお酒飲みながら話したいな。今週のどこかで会えたりするかな？`;
      aggressive = `${name}さん、${style.tone}${style.aggressive}\n${name}さんに早く会いたいな✨\n今夜か明日、もしタイミング合えば少しだけ顔出してくれないかな？${name}さんの顔見れたら最高に元気出るよ！`;
    }

    return { light, standard, aggressive };
  };

  result.messages = generateMessages();
  result.finalAction = trend === '下降' ? '今日は営業せず「無償の気遣い」のみで様子見。' : 
                       (result.priority === '高' ? '具体的な来店希望日を提示してクロージング。' : '日常の雑談から「会いたい」気持ちを育てる。');
  result.recommendedMemo = result.finalAction;

  return result;
}
