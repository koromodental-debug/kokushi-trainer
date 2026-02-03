/**
 * データ管理モジュール
 * 過去問・教材データの読み込みと管理
 */

let questionsData = null;
let subjectsData = null;

/**
 * 過去問データを読み込む
 */
export async function loadQuestions() {
  if (questionsData) return questionsData;

  try {
    const response = await fetch('data/questions.json');
    if (!response.ok) throw new Error('Failed to load questions');
    questionsData = await response.json();
    console.log(`Loaded ${questionsData.length} questions`);
    return questionsData;
  } catch (error) {
    console.error('Error loading questions:', error);
    throw error;
  }
}

/**
 * 科目一覧を読み込む
 */
export async function loadSubjects() {
  if (subjectsData) return subjectsData;

  try {
    const response = await fetch('data/subjects.json');
    if (!response.ok) throw new Error('Failed to load subjects');
    subjectsData = await response.json();
    console.log(`Loaded ${subjectsData.length} subjects`);
    return subjectsData;
  } catch (error) {
    console.error('Error loading subjects:', error);
    throw error;
  }
}

/**
 * 科目に該当する過去問を取得
 * @param {string} subject - 科目名
 * @param {string} theme - テーマ（オプション）
 * @param {number} limit - 取得件数上限
 */
export function getQuestionsBySubject(subject, theme = null, limit = 10) {
  if (!questionsData) {
    console.error('Questions not loaded');
    return [];
  }

  // 科目名のマッピング（CSVとHTMLで名称が異なる場合の対応）
  const subjectMapping = {
    '保存修復学': ['保存修復'],
    '歯内療法学': ['歯内療法'],
    '歯周病学': ['歯周'],
    '冠橋義歯学': ['補綴', '歯冠'],
    '全部床義歯学': ['全部床', 'FD'],
    '部分床義歯学': ['部分床', 'PD'],
    '矯正': ['矯正'],
    '小児歯科': ['小児'],
    '口腔外科学': ['口腔外科', '外科'],
    '歯科麻酔学': ['麻酔'],
    '歯科放射線学': ['放射線'],
    '病理学': ['病理'],
    '解剖学': ['解剖'],
    '組織学': ['組織'],
    '生理学': ['生理'],
    '生化学': ['生化'],
    '薬理学': ['薬理'],
    '微生物学・免疫学': ['微生物', '免疫'],
    '歯科理工学': ['理工'],
    '口腔衛生': ['衛生', '予防'],
    '公衆衛生': ['衛生', '公衆'],
    '疫学': ['疫学'],
    'インプラント': ['インプラント'],
    '摂食嚥下': ['摂食', '嚥下'],
    '必修': ['必修']
  };

  const searchTerms = subjectMapping[subject] || [subject];

  let filtered = questionsData.filter(q => {
    // 科目が明示的に一致
    if (q.subject && searchTerms.some(term => q.subject.includes(term))) {
      return true;
    }
    // 問題文やテーマにキーワードが含まれる
    if (q.theme && searchTerms.some(term => q.theme.includes(term))) {
      return true;
    }
    return false;
  });

  // テーマでさらにフィルタリング
  if (theme) {
    filtered = filtered.filter(q =>
      (q.theme && q.theme.includes(theme)) ||
      (q.question && q.question.includes(theme))
    );
  }

  // ランダムに選択
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * 過去問をプロンプト用にフォーマット
 */
export function formatQuestionsForPrompt(questions) {
  return questions.map((q, i) => {
    const choices = q.choices
      .map((c, j) => `${String.fromCharCode(97 + j)}. ${c}`)
      .join('\n');

    return `【過去問${i + 1}】（${q.code}）
問題：${q.question}
${choices}
正解：${q.answer}`;
  }).join('\n\n');
}

/**
 * 統計情報を取得
 */
export function getStats() {
  if (!questionsData || !subjectsData) {
    return { questions: 0, subjects: 0 };
  }

  return {
    questions: questionsData.length,
    subjects: subjectsData.length
  };
}

/**
 * テーマに対応するHTMLファイルのパスを取得
 */
export function getThemeFilePath(subjectName, themeName) {
  if (!subjectsData) return null;

  const subject = subjectsData.find(s => s.name === subjectName);
  if (!subject) return null;

  const theme = subject.themes.find(t => t.name === themeName);
  return theme ? theme.file : null;
}

/**
 * 科目に属する全テーマのファイルパスを取得
 */
export function getAllThemeFilePaths(subjectName) {
  if (!subjectsData) return [];

  const subject = subjectsData.find(s => s.name === subjectName);
  if (!subject) return [];

  return subject.themes.map(t => t.file);
}

/**
 * HTMLファイルを読み込んでテキストを抽出
 */
export async function loadHtmlContent(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      console.warn(`Failed to load HTML: ${filePath}`);
      return null;
    }

    const html = await response.text();

    // HTMLからテキストを抽出（シンプルなパース）
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // スクリプトとスタイルを除去
    doc.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());

    // メインコンテンツを取得（articleやmainがあればそれを優先）
    const main = doc.querySelector('article, main, .content, body');
    if (!main) return null;

    // テキストを抽出してクリーンアップ
    let text = main.textContent || '';
    text = text
      .replace(/\s+/g, ' ')  // 連続空白を1つに
      .replace(/\n\s*\n/g, '\n')  // 連続改行を1つに
      .trim();

    // 長すぎる場合は切り詰め（トークン制限対策）
    const maxLength = 8000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...(以下省略)';
    }

    return text;
  } catch (error) {
    console.error(`Error loading HTML ${filePath}:`, error);
    return null;
  }
}

/**
 * 複数のHTMLファイルを読み込んで結合
 */
export async function loadMultipleHtmlContents(filePaths, maxTotal = 10000) {
  const contents = [];
  let totalLength = 0;

  for (const path of filePaths) {
    if (totalLength >= maxTotal) break;

    const content = await loadHtmlContent(path);
    if (content) {
      const remaining = maxTotal - totalLength;
      const truncated = content.length > remaining
        ? content.substring(0, remaining) + '...'
        : content;
      contents.push(truncated);
      totalLength += truncated.length;
    }
  }

  return contents.join('\n\n---\n\n');
}
