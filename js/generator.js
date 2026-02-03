/**
 * 問題生成エンジン
 * 過去問パターン分析、プロンプト組み立て、結果整形
 */

import { getQuestionsBySubject, formatQuestionsForPrompt } from './data.js';
import { callAPI } from './api.js';

// プロンプトテンプレート（教材なし版）
const PROMPT_TEMPLATE_SIMPLE = `あなたは歯科医師国家試験の問題作成者です。以下の条件に従って、オリジナルの国試そっくり問題を作成してください。

【参考過去問】
以下の過去問を参考に、類似の形式・難易度で新しい問題を作成してください：

{PAST_QUESTIONS}

【生成条件】
- 科目: {SUBJECT}
- テーマ: {THEME}
- 問題数: {COUNT}問
- 難易度: {DIFFICULTY}

【問題作成ガイドライン】
1. 過去問と同一または酷似した問題は作成しない
2. 医学的・歯科学的に正確な内容のみを使用する
3. 選択肢は5つ（a〜e）とし、正解は1つ（または指定があれば複数）
4. 誤答選択肢は「もっともらしいが間違い」となるよう工夫する
5. 問題文は簡潔明瞭に、必要に応じて臨床シナリオを含める
6. 解説は「なぜその答えが正解なのか」「なぜ他の選択肢が誤りなのか」を簡潔に説明

【問題文の禁止事項】
- 「コツ」「覚え方」「テクニック」「ポイント」「見分け方」を問う問題は作成禁止
- 国試は純粋な知識・判断力を問うもの。学習法や暗記法を問うのは不適切
- 適切な問い方の例：「〜の特徴はどれか」「〜について正しいのはどれか」「〜の原因はどれか」「〜で適切なのはどれか」

【選択肢作成の重要ルール】
- **全選択肢の文法形式を必ず統一する**（例：全て「〜である」、全て「〜する」など）
- 形式だけで正解が絞れる問題は作成禁止（消去法で解ける問題はNG）
- 全選択肢が同じカテゴリの内容であること（例：全て症状、全て治療法など）
- 選択肢の長さも概ね揃える（1つだけ極端に長い/短いのはNG）

【難易度の目安】
- 必修レベル：基本的な知識を問う、正答率70%以上を想定
- 一般レベル：応用力・判断力を問う、正答率50-70%を想定

【出力形式】
必ず以下のJSON形式のみを出力してください。説明文や前置きは不要です。

\`\`\`json
{
  "questions": [
    {
      "subject": "科目名",
      "theme": "テーマ名",
      "question": "問題文",
      "choices": ["選択肢a", "選択肢b", "選択肢c", "選択肢d", "選択肢e"],
      "answer": "A",
      "explanation": "【テーマ名】についての解説文（2-3文程度）"
    }
  ]
}
\`\`\`

【重要：テーマ名の指定】
- 「subject」は必ず「{SUBJECT}」を使用すること
- 「theme」は必ず「{THEME_STRICT}」を使用すること
- 上記以外のテーマ名を使用しないこと

【注意】
- 回答は「A」「B」「C」「D」「E」の大文字で表記
- 複数解答の場合は「AB」「BC」のように連結
- 選択肢の順序は臨床的・論理的に自然な並びにする`;

// プロンプトテンプレート（教材あり版）
const PROMPT_TEMPLATE_WITH_MATERIAL = `あなたは歯科医師国家試験の問題作成者です。以下の教材と過去問を参考に、オリジナルの国試そっくり問題を作成してください。

【参考教材】
以下の教材内容に基づいて、正確な知識を問う問題を作成してください。教材に記載されていない内容は出題しないでください。

{MATERIAL}

【参考過去問】
以下の過去問を参考に、類似の形式・難易度で新しい問題を作成してください：

{PAST_QUESTIONS}

【生成条件】
- 科目: {SUBJECT}
- テーマ: {THEME}
- 問題数: {COUNT}問
- 難易度: {DIFFICULTY}

【問題作成ガイドライン】
1. **必ず上記の教材内容に基づいた問題を作成する**（教材にない知識は使わない）
2. 過去問と同一または酷似した問題は作成しない
3. 選択肢は5つ（a〜e）とし、正解は1つ（または指定があれば複数）
4. 誤答選択肢は「もっともらしいが間違い」となるよう工夫する
5. 問題文は簡潔明瞭に、必要に応じて臨床シナリオを含める
6. 解説は教材の内容を引用しつつ、なぜ正解/不正解かを説明

【問題文の禁止事項】
- 「コツ」「覚え方」「テクニック」「ポイント」「見分け方」を問う問題は作成禁止
- 国試は純粋な知識・判断力を問うもの。学習法や暗記法を問うのは不適切
- 適切な問い方の例：「〜の特徴はどれか」「〜について正しいのはどれか」「〜の原因はどれか」「〜で適切なのはどれか」

【選択肢作成の重要ルール】
- **全選択肢の文法形式を必ず統一する**（例：全て「〜である」、全て「〜する」など）
- 形式だけで正解が絞れる問題は作成禁止（消去法で解ける問題はNG）
- 全選択肢が同じカテゴリの内容であること（例：全て症状、全て治療法など）
- 選択肢の長さも概ね揃える（1つだけ極端に長い/短いのはNG）

【難易度の目安】
- 必修レベル：基本的な知識を問う、正答率70%以上を想定
- 一般レベル：応用力・判断力を問う、正答率50-70%を想定

【出力形式】
必ず以下のJSON形式のみを出力してください。説明文や前置きは不要です。

\`\`\`json
{
  "questions": [
    {
      "subject": "科目名",
      "theme": "テーマ名",
      "question": "問題文",
      "choices": ["選択肢a", "選択肢b", "選択肢c", "選択肢d", "選択肢e"],
      "answer": "A",
      "explanation": "【テーマ名】についての解説文（教材の内容を参照）"
    }
  ]
}
\`\`\`

【重要：テーマ名の指定】
- 「subject」は必ず「{SUBJECT}」を使用すること
- 「theme」は必ず「{THEME_STRICT}」を使用すること
- 上記以外のテーマ名を使用しないこと

【注意】
- 回答は「A」「B」「C」「D」「E」の大文字で表記
- 複数解答の場合は「AB」「BC」のように連結
- 選択肢の順序は臨床的・論理的に自然な並びにする`;

/**
 * プロンプトを組み立てる（外部からも利用可能）
 * @param {object} options - subject, theme, count, difficulty, materialContent
 */
export function buildPrompt(options) {
  const { subject, theme, count, difficulty, materialContent } = options;

  // 参考過去問を取得
  const refQuestions = getQuestionsBySubject(subject, theme, 5);
  const pastQuestionsText = refQuestions.length > 0
    ? formatQuestionsForPrompt(refQuestions)
    : '（参考過去問が見つかりませんでした。一般的な歯科医師国家試験の形式に従ってください。）';

  // テーマ名を決定（指定なしの場合は科目名を使用）
  const themeStrict = theme || subject;

  // 教材があるかどうかでテンプレートを選択
  let prompt;
  if (materialContent) {
    prompt = PROMPT_TEMPLATE_WITH_MATERIAL
      .replace('{MATERIAL}', materialContent)
      .replace('{PAST_QUESTIONS}', pastQuestionsText)
      .replace(/\{SUBJECT\}/g, subject)
      .replace('{THEME}', theme || '（指定なし：科目全般）')
      .replace(/\{THEME_STRICT\}/g, themeStrict)
      .replace('{COUNT}', count.toString())
      .replace('{DIFFICULTY}', difficulty === 'hisshu' ? '必修レベル' : '一般レベル');
  } else {
    prompt = PROMPT_TEMPLATE_SIMPLE
      .replace('{PAST_QUESTIONS}', pastQuestionsText)
      .replace(/\{SUBJECT\}/g, subject)
      .replace('{THEME}', theme || '（指定なし：科目全般）')
      .replace(/\{THEME_STRICT\}/g, themeStrict)
      .replace('{COUNT}', count.toString())
      .replace('{DIFFICULTY}', difficulty === 'hisshu' ? '必修レベル' : '一般レベル');
  }

  return prompt;
}

/**
 * APIレスポンスをパースする
 */
function parseResponse(text) {
  try {
    // JSONブロックを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;

    // JSONをパース
    const data = JSON.parse(jsonStr.trim());

    if (!data.questions || !Array.isArray(data.questions)) {
      throw new Error('Invalid response format: questions array not found');
    }

    // 各問題を検証・整形
    return data.questions.map((q, i) => ({
      id: `gen_${Date.now()}_${i}`,
      question: q.question || '',
      choices: q.choices || [],
      answer: (q.answer || '').toUpperCase(),
      explanation: q.explanation || ''
    }));

  } catch (error) {
    console.error('Failed to parse response:', error);
    console.error('Raw response:', text);
    throw new Error('APIレスポンスの解析に失敗しました。再度お試しください。');
  }
}

/**
 * 問題を生成する
 * @param {object} options - 生成オプション
 * @returns {Promise<Array>} 生成された問題の配列
 */
export async function generateQuestions(options) {
  const { subject, theme, count, difficulty } = options;

  if (!subject) {
    throw new Error('科目を選択してください。');
  }

  if (count < 1 || count > 20) {
    throw new Error('問題数は1〜20の範囲で指定してください。');
  }

  // プロンプトを組み立て
  const prompt = buildPrompt({
    subject,
    theme,
    count,
    difficulty
  });

  console.log('Generating questions with prompt length:', prompt.length);

  // API呼び出し
  const response = await callAPI(prompt, {
    maxTokens: 4096
  });

  console.log('API response received, usage:', response.usage);

  // レスポンスをパース
  const questions = parseResponse(response.text);

  // 問題数を検証
  if (questions.length !== count) {
    console.warn(`Expected ${count} questions, got ${questions.length}`);
  }

  return questions;
}

/**
 * 問題をCSV形式にエクスポート
 */
export function exportToCSV(questions, context = {}) {
  const headers = ['問題番号', '科目', 'テーマ', '難易度', '問題文', '選択肢a', '選択肢b', '選択肢c', '選択肢d', '選択肢e', '正解', '解説'];

  const rows = questions.map((q, i) => [
    i + 1,
    `"${(context.subject || '').replace(/"/g, '""')}"`,
    `"${(context.theme || '').replace(/"/g, '""')}"`,
    `"${(context.difficulty || '').replace(/"/g, '""')}"`,
    `"${(q.question || '').replace(/"/g, '""')}"`,
    `"${(q.choices[0] || '').replace(/"/g, '""')}"`,
    `"${(q.choices[1] || '').replace(/"/g, '""')}"`,
    `"${(q.choices[2] || '').replace(/"/g, '""')}"`,
    `"${(q.choices[3] || '').replace(/"/g, '""')}"`,
    `"${(q.choices[4] || '').replace(/"/g, '""')}"`,
    q.answer,
    `"${(q.explanation || '').replace(/"/g, '""')}"`
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * 問題をJSON形式にエクスポート
 */
export function exportToJSON(questions, context = {}) {
  const data = {
    generatedAt: new Date().toISOString(),
    subject: context.subject || '',
    theme: context.theme || '',
    difficulty: context.difficulty || '',
    questions: questions
  };
  return JSON.stringify(data, null, 2);
}
