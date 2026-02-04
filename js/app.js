/**
 * 国試問題ジェネレーター メインアプリケーション
 * UIイベント処理、各モジュールの統合
 */

import { loadSubjects, loadQuestions, getThemeFilePath, getAllThemeFilePaths, loadHtmlContent, loadMultipleHtmlContents } from './data.js';
import { loadSettings, saveSettings, hasApiKey, estimateCost, getCurrentProvider } from './api.js';
import { generateQuestions, exportToCSV, exportToJSON, buildPrompt } from './generator.js';
import { requireRole, getCurrentUser } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { createQuestionSet } from './firestore.js';

// アプリケーション状態
const state = {
  subjects: [],
  generatedQuestions: [],
  savedQuestions: [],  // 保存済み問題
  generationContext: {
    subject: '',
    theme: '',
    difficulty: ''
  },
  examState: {
    currentIndex: 0,
    answers: [],
    startTime: null,
    timerInterval: null
  }
};

// LocalStorageキー
const STORAGE_KEY = 'kokushi_saved_questions';

// DOM要素
const elements = {
  subjectSelect: null,
  themeSelect: null,
  questionCount: null,
  countMinus: null,
  countPlus: null,
  costEstimate: null,
  generateBtn: null,
  resultsSection: null,
  questionsList: null,
  examSection: null,
  examResultsSection: null,
  settingsModal: null,
  settingsBtn: null,
  closeSettingsBtn: null,
  saveSettingsBtn: null,
  // 新しい設定要素
  claudeApiKeyInput: null,
  geminiApiKeyInput: null,
  claudeModelSelect: null,
  geminiModelSelect: null,
  claudeSettings: null,
  geminiSettings: null
};

/**
 * 初期化
 */
async function init() {
  // 認証 & admin権限チェック
  const user = await requireRole('admin');
  if (!user) return;

  // 認証ヘッダー描画
  renderAuthHeader(document.getElementById('app-header'), user, 'admin', { showSettings: true });

  // DOM要素を取得
  elements.subjectSelect = document.getElementById('subject-select');
  elements.themeSelect = document.getElementById('theme-select');
  elements.questionCount = document.getElementById('question-count');
  elements.countMinus = document.getElementById('count-minus');
  elements.countPlus = document.getElementById('count-plus');
  elements.costEstimate = document.getElementById('cost-estimate');
  elements.generateBtn = document.getElementById('generate-btn');
  elements.resultsSection = document.getElementById('results-section');
  elements.questionsList = document.getElementById('questions-list');
  elements.examSection = document.getElementById('exam-section');
  elements.examResultsSection = document.getElementById('exam-results-section');
  elements.settingsModal = document.getElementById('settings-modal');
  elements.settingsBtn = document.getElementById('settings-btn');
  elements.closeSettingsBtn = document.getElementById('close-settings-btn');
  elements.saveSettingsBtn = document.getElementById('save-settings-btn');

  // 新しい設定要素
  elements.claudeApiKeyInput = document.getElementById('claude-api-key-input');
  elements.geminiApiKeyInput = document.getElementById('gemini-api-key-input');
  elements.claudeModelSelect = document.getElementById('claude-model-select');
  elements.geminiModelSelect = document.getElementById('gemini-model-select');
  elements.claudeSettings = document.getElementById('claude-settings');
  elements.geminiSettings = document.getElementById('gemini-settings');

  // イベントリスナーを設定
  setupEventListeners();

  // データを読み込み
  try {
    state.subjects = await loadSubjects();
    await loadQuestions();
    populateSubjects();
    updateCostEstimate();
    updateGenerateButton();
  } catch (error) {
    console.error('Failed to initialize:', error);
    alert('データの読み込みに失敗しました。ページを再読み込みしてください。');
  }

  // 設定を読み込み
  loadSettingsToUI();

  // 保存済み問題を読み込み
  loadSavedQuestions();
  updateSavedCount();
}

/**
 * 設定をUIに反映
 */
function loadSettingsToUI() {
  const settings = loadSettings();

  // APIキー
  elements.claudeApiKeyInput.value = settings.claudeApiKey || '';
  elements.geminiApiKeyInput.value = settings.geminiApiKey || '';

  // モデル
  elements.claudeModelSelect.value = settings.claudeModel || 'claude-sonnet-4-20250514';
  elements.geminiModelSelect.value = settings.geminiModel || 'gemini-2.0-flash';

  // プロバイダー選択
  const provider = settings.provider || 'claude';
  document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
  updateProviderSettings(provider);
}

/**
 * プロバイダー設定の表示を切り替え
 */
function updateProviderSettings(provider) {
  if (provider === 'gemini') {
    elements.claudeSettings.hidden = true;
    elements.geminiSettings.hidden = false;
  } else {
    elements.claudeSettings.hidden = false;
    elements.geminiSettings.hidden = true;
  }
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  // 科目選択
  elements.subjectSelect.addEventListener('change', onSubjectChange);

  // 問題数
  elements.countMinus.addEventListener('click', () => adjustCount(-1));
  elements.countPlus.addEventListener('click', () => adjustCount(1));
  elements.questionCount.addEventListener('change', () => {
    updateCostEstimate();
    updateGenerateButton();
  });

  // 難易度
  document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
    radio.addEventListener('change', updateCostEstimate);
  });

  // 生成ボタン
  elements.generateBtn.addEventListener('click', onGenerate);

  // プロンプト生成ボタン
  document.getElementById('prompt-btn').addEventListener('click', onGeneratePrompt);
  document.getElementById('copy-prompt-btn').addEventListener('click', onCopyPrompt);

  // エクスポートボタン
  document.getElementById('export-csv-btn').addEventListener('click', onExportCSV);
  document.getElementById('export-json-btn').addEventListener('click', onExportJSON);
  document.getElementById('start-exam-btn').addEventListener('click', startExam);

  // 設定モーダル
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.closeSettingsBtn.addEventListener('click', closeSettings);
  elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', closeSettings);
  elements.saveSettingsBtn.addEventListener('click', onSaveSettings);

  // プロバイダー切り替え
  document.querySelectorAll('input[name="provider"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateProviderSettings(e.target.value);
    });
  });

  // 試験関連
  document.getElementById('exam-prev-btn').addEventListener('click', () => navigateExam(-1));
  document.getElementById('exam-next-btn').addEventListener('click', () => navigateExam(1));
  document.getElementById('retry-btn').addEventListener('click', retryExam);
  document.getElementById('new-exam-btn').addEventListener('click', newExam);

  // インポート関連
  document.getElementById('import-btn').addEventListener('click', onImportJSON);
  document.getElementById('clear-saved-btn').addEventListener('click', clearSavedQuestions);

  // 問題セット作成
  document.getElementById('create-set-btn').addEventListener('click', openCreateSetModal);
  document.getElementById('close-create-set-btn').addEventListener('click', closeCreateSetModal);
  document.getElementById('create-set-modal').querySelector('.modal-backdrop').addEventListener('click', closeCreateSetModal);
  document.getElementById('create-set-submit-btn').addEventListener('click', onCreateQuestionSet);
}

/**
 * 科目一覧を表示
 */
function populateSubjects() {
  elements.subjectSelect.innerHTML = '<option value="">科目を選択...</option>';

  state.subjects.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.name;
    option.textContent = `${subject.name}（${subject.theme_count}テーマ）`;
    elements.subjectSelect.appendChild(option);
  });
}

/**
 * 科目選択時の処理
 */
function onSubjectChange() {
  const subjectName = elements.subjectSelect.value;
  const subject = state.subjects.find(s => s.name === subjectName);

  elements.themeSelect.innerHTML = '';

  if (!subject) {
    elements.themeSelect.innerHTML = '<option value="">先に科目を選択してください</option>';
    elements.themeSelect.disabled = true;
    updateGenerateButton();
    return;
  }

  // テーマ一覧を表示
  elements.themeSelect.innerHTML = '<option value="">すべてのテーマ</option>';

  subject.themes.forEach(themeObj => {
    const option = document.createElement('option');
    // themeObjは {name: "テーマ名", file: "ファイルパス"} の形式
    const themeName = typeof themeObj === 'object' ? themeObj.name : themeObj;
    option.value = themeName;
    option.textContent = themeName;
    elements.themeSelect.appendChild(option);
  });

  elements.themeSelect.disabled = false;
  updateGenerateButton();
}

/**
 * 問題数を調整
 */
function adjustCount(delta) {
  const current = parseInt(elements.questionCount.value) || 5;
  const newValue = Math.max(1, Math.min(20, current + delta));
  elements.questionCount.value = newValue;
  updateCostEstimate();
  updateGenerateButton();
}

/**
 * コスト見積もりを更新
 */
function updateCostEstimate() {
  const count = parseInt(elements.questionCount.value) || 5;
  const cost = estimateCost(count);
  const providerName = cost.provider === 'gemini' ? 'Gemini' : 'Claude';
  elements.costEstimate.textContent = `約${cost.totalJPY}円（${providerName} ${count}問 × 約${cost.perQuestionJPY}円）`;
}

/**
 * 生成ボタンの状態を更新
 */
function updateGenerateButton() {
  const hasSubject = elements.subjectSelect.value !== '';
  const hasKey = hasApiKey();
  const count = parseInt(elements.questionCount.value) || 0;

  // API生成ボタン
  elements.generateBtn.disabled = !hasSubject || !hasKey || count < 1;

  if (!hasKey) {
    elements.generateBtn.querySelector('.btn-text').textContent = 'APIキーを設定';
  } else if (!hasSubject) {
    elements.generateBtn.querySelector('.btn-text').textContent = '科目を選択';
  } else {
    elements.generateBtn.querySelector('.btn-text').textContent = 'APIで生成';
  }

  // プロンプト生成ボタン（APIキー不要、科目選択のみ必要）
  const promptBtn = document.getElementById('prompt-btn');
  promptBtn.disabled = !hasSubject || count < 1;
}

/**
 * 問題を生成
 */
async function onGenerate() {
  const subject = elements.subjectSelect.value;
  const theme = elements.themeSelect.value;
  const count = parseInt(elements.questionCount.value) || 5;
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;

  // コスト確認
  const cost = estimateCost(count);
  const providerName = cost.provider === 'gemini' ? 'Gemini' : 'Claude';
  const confirmed = confirm(
    `この操作は従量課金の${providerName} APIを使用します。\n\n` +
    `推定コスト: 約${cost.totalJPY}円（${count}問 × 約${cost.perQuestionJPY}円）\n\n` +
    `実行してよろしいですか？`
  );

  if (!confirmed) return;

  // UIを更新
  setLoading(true);

  try {
    const questions = await generateQuestions({
      subject,
      theme,
      count,
      difficulty
    });

    state.generatedQuestions = questions;
    state.generationContext = {
      subject,
      theme: theme || 'すべてのテーマ',
      difficulty: difficulty === 'hisshu' ? '必修レベル' : '一般レベル'
    };
    displayResults(questions);

  } catch (error) {
    console.error('Generation failed:', error);
    alert(`問題生成に失敗しました: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

/**
 * ローディング状態を設定
 */
function setLoading(loading) {
  elements.generateBtn.disabled = loading;
  elements.generateBtn.querySelector('.btn-text').hidden = loading;
  elements.generateBtn.querySelector('.btn-loading').hidden = !loading;
}

/**
 * プロンプトを生成（API不要）
 */
async function onGeneratePrompt() {
  const subject = elements.subjectSelect.value;
  const theme = elements.themeSelect.value;
  const count = parseInt(elements.questionCount.value) || 5;
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;

  // ボタンを一時的に無効化
  const promptBtn = document.getElementById('prompt-btn');
  const originalText = promptBtn.textContent;
  promptBtn.textContent = '教材を読み込み中...';
  promptBtn.disabled = true;

  try {
    // 教材HTMLを読み込む
    let materialContent = null;

    if (theme) {
      // テーマが指定されている場合、そのテーマのHTMLを読み込む
      const filePath = getThemeFilePath(subject, theme);
      if (filePath) {
        materialContent = await loadHtmlContent(filePath);
      }
    } else {
      // テーマ未指定の場合、科目の全テーマから最大3つ読み込む
      const allPaths = getAllThemeFilePaths(subject);
      if (allPaths.length > 0) {
        const selectedPaths = allPaths.slice(0, 3); // 最大3ファイル
        materialContent = await loadMultipleHtmlContents(selectedPaths, 8000);
      }
    }

    // プロンプトを生成
    const prompt = buildPrompt({
      subject,
      theme,
      count,
      difficulty,
      materialContent
    });

    // プロンプトセクションを表示
    const promptSection = document.getElementById('prompt-section');
    const promptOutput = document.getElementById('prompt-output');

    promptOutput.textContent = prompt;
    promptSection.hidden = false;
    promptSection.classList.add('fade-in');

    // プロンプトセクションまでスクロール
    promptSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Failed to generate prompt:', error);
    alert('プロンプト生成に失敗しました: ' + error.message);
  } finally {
    promptBtn.textContent = originalText;
    promptBtn.disabled = false;
  }
}

/**
 * プロンプトをクリップボードにコピー
 */
async function onCopyPrompt() {
  const promptOutput = document.getElementById('prompt-output');
  const copyBtn = document.getElementById('copy-prompt-btn');

  try {
    await navigator.clipboard.writeText(promptOutput.textContent);

    // ボタンのテキストを一時的に変更
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'コピーしました！';
    copyBtn.classList.add('copied');

    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('コピーに失敗しました。手動でコピーしてください。');
  }
}

/**
 * 結果を表示
 */
function displayResults(questions) {
  elements.resultsSection.hidden = false;
  elements.resultsSection.classList.add('fade-in');

  const { subject, theme, difficulty } = state.generationContext;

  elements.questionsList.innerHTML = '';

  // 出題情報ヘッダーを追加
  const infoHeader = document.createElement('div');
  infoHeader.className = 'generation-info';
  infoHeader.innerHTML = `
    <div class="info-item"><span class="info-label">科目:</span> ${escapeHtml(subject)}</div>
    <div class="info-item"><span class="info-label">テーマ:</span> ${escapeHtml(theme)}</div>
    <div class="info-item"><span class="info-label">難易度:</span> ${escapeHtml(difficulty)}</div>
  `;
  elements.questionsList.appendChild(infoHeader);

  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="question-header">
        <span class="question-number">問題 ${i + 1}</span>
        <span class="question-meta">${escapeHtml(subject)} / ${escapeHtml(theme)}</span>
      </div>
      <div class="question-text">${escapeHtml(q.question)}</div>
      <ul class="choices-list">
        ${q.choices.map((choice, j) => {
          const label = String.fromCharCode(65 + j);
          const isCorrect = q.answer.includes(label);
          return `<li class="choice-item ${isCorrect ? 'correct' : ''}">
            <span class="choice-label">${label.toLowerCase()}.</span>
            ${escapeHtml(choice)}
          </li>`;
        }).join('')}
      </ul>
      <div class="explanation">
        <div class="explanation-label">解説（正解: ${q.answer}）</div>
        ${escapeHtml(q.explanation)}
      </div>
    `;
    elements.questionsList.appendChild(item);
  });

  // 結果セクションまでスクロール
  elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * CSVエクスポート
 */
function onExportCSV() {
  if (state.generatedQuestions.length === 0) return;

  const csv = exportToCSV(state.generatedQuestions, state.generationContext);
  const filename = `generated_${state.generationContext.subject}_${state.generationContext.theme}.csv`.replace(/\s+/g, '_');
  downloadFile(csv, filename, 'text/csv');
}

/**
 * JSONエクスポート
 */
function onExportJSON() {
  if (state.generatedQuestions.length === 0) return;

  const json = exportToJSON(state.generatedQuestions, state.generationContext);
  const filename = `generated_${state.generationContext.subject}_${state.generationContext.theme}.json`.replace(/\s+/g, '_');
  downloadFile(json, filename, 'application/json');
}

/**
 * ファイルをダウンロード
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 模擬試験を開始
 */
function startExam() {
  if (state.generatedQuestions.length === 0) return;

  // 状態をリセット
  state.examState = {
    currentIndex: 0,
    answers: new Array(state.generatedQuestions.length).fill(null),
    startTime: Date.now(),
    timerInterval: null
  };

  // UIを切り替え
  elements.resultsSection.hidden = true;
  elements.examSection.hidden = false;
  elements.examResultsSection.hidden = true;
  elements.examSection.classList.add('fade-in');

  // タイマーを開始
  startTimer();

  // 最初の問題を表示
  showExamQuestion(0);
}

/**
 * タイマーを開始
 */
function startTimer() {
  const timerEl = document.getElementById('exam-timer');

  state.examState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.examState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

/**
 * 試験問題を表示
 */
function showExamQuestion(index) {
  const question = state.generatedQuestions[index];
  const total = state.generatedQuestions.length;

  // 進捗を更新
  document.getElementById('exam-progress').textContent = `${index + 1} / ${total}`;

  // 問題文を表示
  document.getElementById('exam-question').textContent = question.question;

  // 選択肢を表示
  const choicesContainer = document.getElementById('exam-choices');
  choicesContainer.innerHTML = '';

  question.choices.forEach((choice, i) => {
    const label = String.fromCharCode(65 + i);
    const div = document.createElement('div');
    div.className = 'exam-choice';
    if (state.examState.answers[index] === label) {
      div.classList.add('selected');
    }
    div.dataset.answer = label;
    div.innerHTML = `
      <span class="exam-choice-label">${label}</span>
      <span class="exam-choice-text">${escapeHtml(choice)}</span>
    `;
    div.addEventListener('click', () => selectAnswer(index, label));
    choicesContainer.appendChild(div);
  });

  // ナビゲーションボタンを更新
  document.getElementById('exam-prev-btn').disabled = index === 0;

  const nextBtn = document.getElementById('exam-next-btn');
  if (index === total - 1) {
    nextBtn.textContent = '採点する';
  } else {
    nextBtn.textContent = '次の問題';
  }
}

/**
 * 解答を選択
 */
function selectAnswer(questionIndex, answer) {
  state.examState.answers[questionIndex] = answer;

  // UIを更新
  document.querySelectorAll('.exam-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.answer === answer);
  });
}

/**
 * 試験をナビゲート
 */
function navigateExam(delta) {
  const newIndex = state.examState.currentIndex + delta;
  const total = state.generatedQuestions.length;

  if (newIndex < 0) return;

  if (newIndex >= total) {
    // 採点
    finishExam();
    return;
  }

  state.examState.currentIndex = newIndex;
  showExamQuestion(newIndex);
}

/**
 * 試験を終了・採点
 */
function finishExam() {
  // タイマーを停止
  if (state.examState.timerInterval) {
    clearInterval(state.examState.timerInterval);
  }

  // 採点
  let correct = 0;
  const reviews = state.generatedQuestions.map((q, i) => {
    const userAnswer = state.examState.answers[i];
    const isCorrect = userAnswer === q.answer;
    if (isCorrect) correct++;

    return {
      question: q.question,
      userAnswer,
      correctAnswer: q.answer,
      isCorrect
    };
  });

  // 結果を表示
  elements.examSection.hidden = true;
  elements.examResultsSection.hidden = false;
  elements.examResultsSection.classList.add('fade-in');

  const total = state.generatedQuestions.length;
  const percentage = Math.round((correct / total) * 100);

  document.getElementById('score-value').textContent = correct;
  document.getElementById('score-total').textContent = total;
  document.getElementById('score-percentage').textContent = `${percentage}%`;

  // 合否判定の色分け
  const percentageEl = document.getElementById('score-percentage');
  if (percentage >= 80) {
    percentageEl.style.color = 'var(--system-green)';
  } else if (percentage >= 60) {
    percentageEl.style.color = 'var(--system-orange)';
  } else {
    percentageEl.style.color = 'var(--system-red)';
  }

  // レビューを表示
  const reviewContainer = document.getElementById('exam-review');
  reviewContainer.innerHTML = '';

  reviews.forEach((review, i) => {
    const div = document.createElement('div');
    div.className = `review-item ${review.isCorrect ? 'correct' : 'incorrect'}`;
    div.innerHTML = `
      <div class="review-question">問題${i + 1}: ${escapeHtml(review.question.substring(0, 50))}${review.question.length > 50 ? '...' : ''}</div>
      <div class="review-answer">
        あなたの回答: <span class="${review.isCorrect ? 'correct-answer' : 'your-answer'}">${review.userAnswer || '未回答'}</span>
        ${!review.isCorrect ? `/ 正解: <span class="correct-answer">${review.correctAnswer}</span>` : ''}
      </div>
    `;
    reviewContainer.appendChild(div);
  });
}

/**
 * 試験をやり直す
 */
function retryExam() {
  startExam();
}

/**
 * 新しい問題を生成
 */
function newExam() {
  elements.examResultsSection.hidden = true;
  elements.resultsSection.hidden = true;
  document.getElementById('generator-form').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 設定モーダルを開く
 */
function openSettings() {
  loadSettingsToUI();
  elements.settingsModal.hidden = false;
}

/**
 * 設定モーダルを閉じる
 */
function closeSettings() {
  elements.settingsModal.hidden = true;
}

/**
 * 設定を保存
 */
function onSaveSettings() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const claudeApiKey = elements.claudeApiKeyInput.value.trim();
  const geminiApiKey = elements.geminiApiKeyInput.value.trim();
  const claudeModel = elements.claudeModelSelect.value;
  const geminiModel = elements.geminiModelSelect.value;

  // バリデーション
  if (provider === 'claude' && claudeApiKey && !claudeApiKey.startsWith('sk-ant-')) {
    alert('Claude APIキーの形式が正しくありません。sk-ant-で始まるキーを入力してください。');
    return;
  }

  if (provider === 'gemini' && geminiApiKey && geminiApiKey.length < 10) {
    alert('Gemini APIキーの形式が正しくありません。');
    return;
  }

  saveSettings({
    provider,
    claudeApiKey,
    geminiApiKey,
    claudeModel,
    geminiModel
  });

  updateGenerateButton();
  updateCostEstimate();
  closeSettings();
  alert('設定を保存しました。');
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ====================
// 保存・インポート機能
// ====================

/**
 * 保存済み問題を読み込む
 */
function loadSavedQuestions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state.savedQuestions = saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Failed to load saved questions:', error);
    state.savedQuestions = [];
  }
}

/**
 * 保存済み問題を保存
 */
function saveSavedQuestions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.savedQuestions));
    updateSavedCount();
  } catch (error) {
    console.error('Failed to save questions:', error);
    alert('保存に失敗しました。ストレージ容量が不足している可能性があります。');
  }
}

/**
 * 保存済み問題数を更新
 */
function updateSavedCount() {
  const countEl = document.getElementById('saved-count');
  countEl.textContent = `保存済み: ${state.savedQuestions.length}問`;
}

/**
 * JSONをクリーンアップ（改行や不正な文字を修正）
 */
function cleanupJSON(text) {
  // ```json ... ``` で囲まれている場合は抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  let jsonText = jsonMatch ? jsonMatch[1] : text;

  // 方法1: 全ての空白を正規化して1行にする
  // これにより途中で改行されたJSONも正しくパースできる
  let cleaned = jsonText
    .replace(/\r\n/g, '\n')           // Windows改行を統一
    .replace(/\n\s*/g, ' ')           // 改行+空白をスペースに
    .replace(/\s+/g, ' ')             // 連続空白を1つに
    .trim();

  return cleaned;
}

/**
 * JSONをインポート
 */
function onImportJSON() {
  const input = document.getElementById('json-input');
  const text = input.value.trim();

  if (!text) {
    alert('JSONを入力してください。');
    return;
  }

  try {
    // JSONをクリーンアップしてパース
    const cleanedText = cleanupJSON(text);
    let data;

    try {
      data = JSON.parse(cleanedText);
    } catch (e) {
      // それでも失敗したら、より積極的なクリーンアップを試みる
      console.log('First parse failed, trying aggressive cleanup...');
      const aggressiveCleaned = cleanedText
        .replace(/,\s*}/g, '}')       // 末尾カンマを除去
        .replace(/,\s*\]/g, ']')      // 配列末尾カンマを除去
        .replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')  // キーをクォート
        .replace(/:\s*'([^']*)'/g, ':"$1"');       // シングルクォートをダブルに
      data = JSON.parse(aggressiveCleaned);
    }

    // 問題配列を取得
    let questions = [];
    if (Array.isArray(data)) {
      questions = data;
    } else if (data.questions && Array.isArray(data.questions)) {
      questions = data.questions;
    } else {
      throw new Error('questionsの配列が見つかりません。');
    }

    if (questions.length === 0) {
      alert('インポートする問題が見つかりませんでした。');
      return;
    }

    // 各問題を検証・整形
    const now = Date.now();
    const importedQuestions = questions.map((q, i) => ({
      id: `imported_${now}_${i}`,
      question: q.question || '',
      choices: q.choices || [],
      answer: (q.answer || '').toUpperCase(),
      explanation: q.explanation || '',
      subject: q.subject || state.generationContext.subject || '未分類',
      theme: q.theme || state.generationContext.theme || '',
      importedAt: new Date().toISOString()
    }));

    // 既存の問題に追加
    state.savedQuestions = [...state.savedQuestions, ...importedQuestions];
    saveSavedQuestions();

    // 生成結果としても表示（問題セット作成ボタンを使えるようにする）
    state.generatedQuestions = importedQuestions;
    state.generationContext = {
      subject: importedQuestions[0]?.subject || '未分類',
      theme: importedQuestions[0]?.theme || '',
      difficulty: ''
    };
    displayResults(importedQuestions);

    // 入力をクリア
    input.value = '';

    // 成功メッセージ
    showImportSuccess(`${importedQuestions.length}問をインポートしました！`);

  } catch (error) {
    console.error('Import failed:', error);
    alert(`インポートに失敗しました: ${error.message}\n\nJSON形式を確認してください。`);
  }
}

/**
 * インポート成功メッセージを表示
 */
function showImportSuccess(message) {
  const container = document.getElementById('import-section').querySelector('.card');

  // 既存のメッセージを削除
  const existing = container.querySelector('.import-success');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'import-success';
  div.textContent = message;
  container.appendChild(div);

  // 3秒後に消える
  setTimeout(() => div.remove(), 3000);
}



/**
 * 全問題を削除
 */
function clearSavedQuestions() {
  if (state.savedQuestions.length === 0) {
    alert('保存済みの問題がありません。');
    return;
  }

  if (!confirm(`保存済みの${state.savedQuestions.length}問を全て削除しますか？\nこの操作は取り消せません。`)) {
    return;
  }

  state.savedQuestions = [];
  saveSavedQuestions();
  document.getElementById('saved-section').hidden = true;
  alert('全ての問題を削除しました。');
}



// ====================
// 問題セット作成
// ====================

function openCreateSetModal() {
  if (state.generatedQuestions.length === 0) {
    alert('問題がまだ生成されていません。');
    return;
  }

  const modal = document.getElementById('create-set-modal');
  document.getElementById('set-question-count').textContent = state.generatedQuestions.length;

  // タイトルのデフォルト値
  const titleInput = document.getElementById('set-title-input');
  if (!titleInput.value) {
    const { subject, theme } = state.generationContext;
    titleInput.value = `${subject}${theme && theme !== 'すべてのテーマ' ? ' - ' + theme : ''}`;
  }

  modal.hidden = false;
}

function closeCreateSetModal() {
  document.getElementById('create-set-modal').hidden = true;
}

async function onCreateQuestionSet() {
  const title = document.getElementById('set-title-input').value.trim();
  const description = document.getElementById('set-description-input').value.trim();

  if (!title) {
    alert('タイトルを入力してください。');
    return;
  }

  const submitBtn = document.getElementById('create-set-submit-btn');
  submitBtn.querySelector('.btn-text').hidden = true;
  submitBtn.querySelector('.btn-loading').hidden = false;
  submitBtn.disabled = true;

  try {
    const user = getCurrentUser();
    const questions = state.generatedQuestions.map((q, i) => ({
      id: q.id || `q_${Date.now()}_${i}`,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation || '',
      subject: q.subject || state.generationContext.subject || '',
      theme: q.theme || state.generationContext.theme || ''
    }));

    await createQuestionSet({
      title,
      description,
      questions,
      createdBy: user.uid
    });

    closeCreateSetModal();
    alert('問題セットを作成しました。「問題セット」ページで共有コードを確認できます。');

  } catch (error) {
    console.error('Failed to create question set:', error);
    alert('問題セットの作成に失敗しました: ' + error.message);
  } finally {
    submitBtn.querySelector('.btn-text').hidden = false;
    submitBtn.querySelector('.btn-loading').hidden = true;
    submitBtn.disabled = false;
  }
}

// アプリケーションを初期化
document.addEventListener('DOMContentLoaded', init);
