/**
 * 保存済み問題管理ページ
 * アコーディオン形式で問題を表示・管理
 */

import { exportToCSV, exportToJSON } from './generator.js';

// LocalStorageキー
const STORAGE_KEY = 'kokushi_saved_questions';

// アプリケーション状態
const state = {
  savedQuestions: [],
  filteredQuestions: [],
  currentFilter: {
    subject: '',
    theme: ''
  },
  examState: {
    questions: [],
    currentIndex: 0,
    answers: [],
    startTime: null,
    timerInterval: null
  }
};

/**
 * 初期化
 */
function init() {
  loadSavedQuestions();

  if (state.savedQuestions.length === 0) {
    showEmptyState();
    return;
  }

  state.filteredQuestions = [...state.savedQuestions];

  renderStatsDashboard();
  updateFilterDropdowns();
  renderQuestions();
  setupEventListeners();
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  // フィルター
  document.getElementById('filter-subject').addEventListener('change', onFilterSubjectChange);
  document.getElementById('filter-theme').addEventListener('change', onFilterThemeChange);
  document.getElementById('filter-clear-btn').addEventListener('click', clearFilter);

  // アクション
  document.getElementById('expand-all-btn').addEventListener('click', expandAll);
  document.getElementById('collapse-all-btn').addEventListener('click', collapseAll);
  document.getElementById('find-duplicates-btn').addEventListener('click', findDuplicates);
  document.getElementById('start-filtered-exam-btn').addEventListener('click', startExam);
  document.getElementById('export-csv-btn').addEventListener('click', onExportCSV);
  document.getElementById('export-json-btn').addEventListener('click', onExportJSON);
  document.getElementById('delete-filtered-btn').addEventListener('click', deleteFilteredQuestions);

  // 重複検出モーダル
  document.getElementById('close-duplicates-btn').addEventListener('click', closeDuplicatesModal);
  document.getElementById('cancel-duplicates-btn').addEventListener('click', closeDuplicatesModal);
  document.getElementById('delete-selected-duplicates-btn').addEventListener('click', deleteSelectedDuplicates);
  document.querySelector('#duplicates-modal .modal-backdrop').addEventListener('click', closeDuplicatesModal);

  // テーマ統合モーダル
  document.getElementById('merge-themes-btn').addEventListener('click', openMergeThemesModal);
  document.getElementById('close-merge-btn').addEventListener('click', closeMergeThemesModal);
  document.getElementById('cancel-merge-btn').addEventListener('click', closeMergeThemesModal);
  document.getElementById('execute-merge-btn').addEventListener('click', executeMergeThemes);
  document.querySelector('#merge-themes-modal .modal-backdrop').addEventListener('click', closeMergeThemesModal);

  // 試験関連
  document.getElementById('exam-prev-btn').addEventListener('click', () => navigateExam(-1));
  document.getElementById('exam-next-btn').addEventListener('click', () => navigateExam(1));
  document.getElementById('retry-btn').addEventListener('click', retryExam);
  document.getElementById('back-to-list-btn').addEventListener('click', backToList);
}

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
  } catch (error) {
    console.error('Failed to save questions:', error);
    alert('保存に失敗しました。');
  }
}

/**
 * 空状態を表示
 */
function showEmptyState() {
  document.getElementById('empty-state').hidden = false;
  document.querySelectorAll('.section:not(#empty-state)').forEach(el => {
    if (!el.querySelector('.header')) el.hidden = true;
  });
}

/**
 * 統計を計算
 */
function calculateStats() {
  const stats = {};
  state.savedQuestions.forEach(q => {
    const subject = q.subject || '未分類';
    const theme = q.theme || '未分類';
    if (!stats[subject]) stats[subject] = { total: 0, themes: {} };
    stats[subject].total++;
    if (!stats[subject].themes[theme]) stats[subject].themes[theme] = 0;
    stats[subject].themes[theme]++;
  });
  return stats;
}

/**
 * 統計ダッシュボードを描画
 */
function renderStatsDashboard() {
  const stats = calculateStats();
  const treeContainer = document.getElementById('stats-tree');
  const totalCountEl = document.getElementById('stats-total-count');

  totalCountEl.textContent = `${state.savedQuestions.length}問`;
  treeContainer.innerHTML = '';

  if (Object.keys(stats).length === 0) {
    treeContainer.innerHTML = '<div class="stats-empty">保存済みの問題がありません</div>';
    return;
  }

  Object.entries(stats).forEach(([subject, data]) => {
    const subjectDiv = document.createElement('div');
    subjectDiv.className = 'stats-subject';
    subjectDiv.innerHTML = `
      <div class="stats-subject-header" data-subject="${escapeHtml(subject)}">
        <span class="stats-subject-name">
          <span class="chevron">▶</span>
          ${escapeHtml(subject)}
        </span>
        <span class="stats-subject-count">${data.total}問</span>
      </div>
      <div class="stats-themes">
        ${Object.entries(data.themes).map(([theme, count]) => `
          <div class="stats-theme" data-subject="${escapeHtml(subject)}" data-theme="${escapeHtml(theme)}">
            <span class="stats-theme-name">${escapeHtml(theme)}</span>
            <span class="stats-theme-count">${count}問</span>
          </div>
        `).join('')}
      </div>
    `;
    treeContainer.appendChild(subjectDiv);
  });

  // イベントリスナー
  treeContainer.querySelectorAll('.stats-subject-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('expanded');
    });
  });

  treeContainer.querySelectorAll('.stats-theme').forEach(themeEl => {
    themeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      filterByTheme(themeEl.dataset.subject, themeEl.dataset.theme);
    });
  });
}

/**
 * フィルタードロップダウンを更新
 */
function updateFilterDropdowns() {
  const stats = calculateStats();
  const subjectSelect = document.getElementById('filter-subject');
  const themeSelect = document.getElementById('filter-theme');

  subjectSelect.innerHTML = '<option value="">すべての科目</option>';
  Object.keys(stats).forEach(subject => {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = `${subject}（${stats[subject].total}問）`;
    subjectSelect.appendChild(option);
  });

  if (state.currentFilter.subject) {
    subjectSelect.value = state.currentFilter.subject;
    updateThemeDropdown(state.currentFilter.subject);
    if (state.currentFilter.theme) {
      themeSelect.value = state.currentFilter.theme;
    }
  }
}

/**
 * テーマドロップダウンを更新
 */
function updateThemeDropdown(subject) {
  const themeSelect = document.getElementById('filter-theme');
  const stats = calculateStats();

  themeSelect.innerHTML = '<option value="">すべてのテーマ</option>';

  if (subject && stats[subject]) {
    Object.entries(stats[subject].themes).forEach(([theme, count]) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = `${theme}（${count}問）`;
      themeSelect.appendChild(option);
    });
    themeSelect.disabled = false;
  } else {
    themeSelect.disabled = true;
  }
}

/**
 * 科目フィルター変更
 */
function onFilterSubjectChange() {
  const subject = document.getElementById('filter-subject').value;
  state.currentFilter.subject = subject;
  state.currentFilter.theme = '';
  updateThemeDropdown(subject);
  applyFilter();
}

/**
 * テーマフィルター変更
 */
function onFilterThemeChange() {
  state.currentFilter.theme = document.getElementById('filter-theme').value;
  applyFilter();
}

/**
 * テーマで絞り込み
 */
function filterByTheme(subject, theme) {
  state.currentFilter.subject = subject;
  state.currentFilter.theme = theme;

  document.getElementById('filter-subject').value = subject;
  updateThemeDropdown(subject);
  document.getElementById('filter-theme').value = theme;

  applyFilter();
}

/**
 * フィルター適用
 */
function applyFilter() {
  const { subject, theme } = state.currentFilter;

  state.filteredQuestions = state.savedQuestions.filter(q => {
    if (subject && (q.subject || '未分類') !== subject) return false;
    if (theme && (q.theme || '未分類') !== theme) return false;
    return true;
  });

  const filterResult = document.getElementById('filter-result');
  const filterResultText = document.getElementById('filter-result-text');

  if (subject || theme) {
    filterResult.hidden = false;
    let filterDesc = subject || '';
    if (theme) filterDesc += ` > ${theme}`;
    filterResultText.textContent = `${filterDesc}: ${state.filteredQuestions.length}問`;
  } else {
    filterResult.hidden = true;
  }

  renderQuestions();
}

/**
 * フィルタークリア
 */
function clearFilter() {
  state.currentFilter = { subject: '', theme: '' };
  document.getElementById('filter-subject').value = '';
  document.getElementById('filter-theme').value = '';
  document.getElementById('filter-theme').disabled = true;
  document.getElementById('filter-result').hidden = true;
  state.filteredQuestions = [...state.savedQuestions];
  renderQuestions();
}

/**
 * 問題リストを描画（アコーディオン形式）
 */
function renderQuestions() {
  const container = document.getElementById('questions-container');
  container.innerHTML = '';

  if (state.filteredQuestions.length === 0) {
    container.innerHTML = '<div class="card"><div class="no-questions">該当する問題がありません</div></div>';
    return;
  }

  // 科目ごとにグループ化
  const grouped = {};
  state.filteredQuestions.forEach(q => {
    const key = q.subject || '未分類';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(q);
  });

  Object.entries(grouped).forEach(([subject, questions]) => {
    const card = document.createElement('div');
    card.className = 'card question-group-card';
    card.dataset.subject = subject;

    const header = document.createElement('div');
    header.className = 'question-group-header';
    header.innerHTML = `
      <h3>${escapeHtml(subject)}</h3>
      <div class="question-group-actions">
        <button class="btn-icon-sm expand-group-btn" title="このグループを展開">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <button class="btn-icon-sm collapse-group-btn" title="このグループを折りたたみ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>
        <span class="question-group-count">${questions.length}問</span>
      </div>
    `;
    card.appendChild(header);

    // グループ展開/折りたたみボタンのイベント
    header.querySelector('.expand-group-btn').addEventListener('click', () => {
      card.querySelectorAll('.accordion-item').forEach(item => item.classList.add('expanded'));
    });
    header.querySelector('.collapse-group-btn').addEventListener('click', () => {
      card.querySelectorAll('.accordion-item').forEach(item => item.classList.remove('expanded'));
    });

    const list = document.createElement('div');
    list.className = 'accordion-list';

    questions.forEach((q, i) => {
      const item = createAccordionItem(q, i + 1);
      list.appendChild(item);
    });

    card.appendChild(list);
    container.appendChild(card);
  });
}

/**
 * アコーディオンアイテムを作成
 */
function createAccordionItem(question, number) {
  const item = document.createElement('div');
  item.className = 'accordion-item';
  item.dataset.id = question.id;

  const header = document.createElement('div');
  header.className = 'accordion-header';
  header.innerHTML = `
    <div class="accordion-header-left">
      <span class="accordion-number">${number}</span>
      <span class="accordion-theme">${escapeHtml(question.theme || '')}</span>
    </div>
    <div class="accordion-header-center">
      <span class="accordion-question-preview">${escapeHtml(truncate(question.question, 60))}</span>
    </div>
    <div class="accordion-header-right">
      <span class="accordion-answer">正解: ${question.answer}</span>
      <span class="accordion-chevron">▼</span>
    </div>
  `;

  const content = document.createElement('div');
  content.className = 'accordion-content';
  content.innerHTML = `
    <div class="accordion-question-full">${escapeHtml(question.question)}</div>
    <ul class="choices-list">
      ${question.choices.map((choice, j) => {
        const label = String.fromCharCode(65 + j);
        const isCorrect = question.answer.includes(label);
        return `<li class="choice-item ${isCorrect ? 'correct' : ''}">
          <span class="choice-label">${label.toLowerCase()}.</span>
          ${escapeHtml(choice)}
        </li>`;
      }).join('')}
    </ul>
    <div class="explanation">
      <div class="explanation-label">解説</div>
      ${escapeHtml(question.explanation)}
    </div>
    <div class="accordion-actions">
      <button class="btn btn-danger btn-sm delete-question-btn" data-id="${question.id}">この問題を削除</button>
    </div>
  `;

  header.addEventListener('click', () => {
    item.classList.toggle('expanded');
  });

  content.querySelector('.delete-question-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteQuestion(question.id);
  });

  item.appendChild(header);
  item.appendChild(content);

  return item;
}

/**
 * すべて展開
 */
function expandAll() {
  document.querySelectorAll('.accordion-item').forEach(item => {
    item.classList.add('expanded');
  });
}

/**
 * すべて折りたたみ
 */
function collapseAll() {
  document.querySelectorAll('.accordion-item').forEach(item => {
    item.classList.remove('expanded');
  });
}

/**
 * 個別の問題を削除
 */
function deleteQuestion(id) {
  if (!confirm('この問題を削除しますか？')) return;

  state.savedQuestions = state.savedQuestions.filter(q => q.id !== id);
  state.filteredQuestions = state.filteredQuestions.filter(q => q.id !== id);
  saveSavedQuestions();

  const item = document.querySelector(`.accordion-item[data-id="${id}"]`);
  if (item) {
    item.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      item.remove();
      renderStatsDashboard();
      updateFilterDropdowns();

      if (state.savedQuestions.length === 0) {
        showEmptyState();
      }
    }, 300);
  }
}

/**
 * 絞り込んだ問題を削除
 */
function deleteFilteredQuestions() {
  const questions = state.filteredQuestions;
  if (questions.length === 0) {
    alert('削除する問題がありません。');
    return;
  }

  const { subject, theme } = state.currentFilter;
  let msg = '';
  if (subject && theme) {
    msg = `「${subject} > ${theme}」の${questions.length}問を削除しますか？`;
  } else if (subject) {
    msg = `「${subject}」の${questions.length}問を削除しますか？`;
  } else {
    msg = `全${questions.length}問を削除しますか？`;
  }

  if (!confirm(msg + '\nこの操作は取り消せません。')) return;

  const deleteIds = new Set(questions.map(q => q.id));
  state.savedQuestions = state.savedQuestions.filter(q => !deleteIds.has(q.id));
  saveSavedQuestions();

  clearFilter();
  renderStatsDashboard();
  updateFilterDropdowns();

  if (state.savedQuestions.length === 0) {
    showEmptyState();
  } else {
    alert(`${deleteIds.size}問を削除しました。`);
  }
}

/**
 * CSVエクスポート
 */
function onExportCSV() {
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.savedQuestions;
  if (questions.length === 0) return;

  const csv = exportToCSV(questions, { subject: '保存済み問題' });
  downloadFile(csv, `saved_questions_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

/**
 * JSONエクスポート
 */
function onExportJSON() {
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.savedQuestions;
  if (questions.length === 0) return;

  const json = exportToJSON(questions, { subject: '保存済み問題' });
  downloadFile(json, `saved_questions_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
}

/**
 * ファイルダウンロード
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

// ====================
// 模擬試験機能
// ====================

/**
 * 模擬試験開始
 */
function startExam() {
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.savedQuestions;
  if (questions.length === 0) {
    alert('問題がありません。');
    return;
  }

  state.examState.questions = [...questions];

  if (questions.length > 1 && confirm('問題をシャッフルしますか？')) {
    state.examState.questions.sort(() => Math.random() - 0.5);
  }

  state.examState.currentIndex = 0;
  state.examState.answers = new Array(state.examState.questions.length).fill(null);
  state.examState.startTime = Date.now();

  // UIを切り替え
  hideAllSections();
  document.getElementById('exam-section').hidden = false;

  startTimer();
  showExamQuestion(0);
}

/**
 * タイマー開始
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
  const question = state.examState.questions[index];
  const total = state.examState.questions.length;

  document.getElementById('exam-progress').textContent = `${index + 1} / ${total}`;
  document.getElementById('exam-question').textContent = question.question;

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

  document.getElementById('exam-prev-btn').disabled = index === 0;
  const nextBtn = document.getElementById('exam-next-btn');
  nextBtn.textContent = index === total - 1 ? '採点する' : '次の問題';
}

/**
 * 解答を選択
 */
function selectAnswer(questionIndex, answer) {
  state.examState.answers[questionIndex] = answer;
  document.querySelectorAll('.exam-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.answer === answer);
  });
}

/**
 * 試験をナビゲート
 */
function navigateExam(delta) {
  const newIndex = state.examState.currentIndex + delta;
  const total = state.examState.questions.length;

  if (newIndex < 0) return;
  if (newIndex >= total) {
    finishExam();
    return;
  }

  state.examState.currentIndex = newIndex;
  showExamQuestion(newIndex);
}

/**
 * 試験終了・採点
 */
function finishExam() {
  if (state.examState.timerInterval) {
    clearInterval(state.examState.timerInterval);
  }

  let correct = 0;
  const reviews = state.examState.questions.map((q, i) => {
    const userAnswer = state.examState.answers[i];
    const isCorrect = userAnswer === q.answer;
    if (isCorrect) correct++;
    return { question: q.question, userAnswer, correctAnswer: q.answer, isCorrect };
  });

  document.getElementById('exam-section').hidden = true;
  document.getElementById('exam-results-section').hidden = false;

  const total = state.examState.questions.length;
  const percentage = Math.round((correct / total) * 100);

  document.getElementById('score-value').textContent = correct;
  document.getElementById('score-total').textContent = total;
  document.getElementById('score-percentage').textContent = `${percentage}%`;

  const percentageEl = document.getElementById('score-percentage');
  if (percentage >= 80) {
    percentageEl.style.color = 'var(--system-green)';
  } else if (percentage >= 60) {
    percentageEl.style.color = 'var(--system-orange)';
  } else {
    percentageEl.style.color = 'var(--system-red)';
  }

  const reviewContainer = document.getElementById('exam-review');
  reviewContainer.innerHTML = '';

  reviews.forEach((review, i) => {
    const div = document.createElement('div');
    div.className = `review-item ${review.isCorrect ? 'correct' : 'incorrect'}`;
    div.innerHTML = `
      <div class="review-question">問題${i + 1}: ${escapeHtml(truncate(review.question, 50))}</div>
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
 * 問題一覧に戻る
 */
function backToList() {
  document.getElementById('exam-results-section').hidden = true;
  showAllSections();
}

/**
 * すべてのセクションを非表示
 */
function hideAllSections() {
  document.querySelectorAll('.main-content > .section').forEach(el => {
    el.hidden = true;
  });
}

/**
 * すべてのセクションを表示
 */
function showAllSections() {
  document.querySelectorAll('.main-content > .section').forEach(el => {
    if (el.id !== 'empty-state' && el.id !== 'exam-section' && el.id !== 'exam-results-section') {
      el.hidden = false;
    }
  });
}

// ====================
// 重複検出機能
// ====================

// 削除対象のIDを保持
let duplicatesToDelete = new Set();

/**
 * 重複問題を検出
 */
function findDuplicates() {
  // 問題文でグループ化（正規化して比較）
  const groups = {};

  state.savedQuestions.forEach(q => {
    // 問題文を正規化（空白・改行を統一）
    const normalizedQuestion = normalizeText(q.question);

    if (!groups[normalizedQuestion]) {
      groups[normalizedQuestion] = [];
    }
    groups[normalizedQuestion].push(q);
  });

  // 2件以上ある（重複している）グループを抽出
  const duplicateGroups = Object.entries(groups)
    .filter(([_, questions]) => questions.length > 1)
    .map(([normalizedQuestion, questions]) => ({
      question: questions[0].question, // 元の問題文
      items: questions.sort((a, b) => {
        // インポート日時でソート（古い順）
        const dateA = new Date(a.importedAt || 0);
        const dateB = new Date(b.importedAt || 0);
        return dateA - dateB;
      })
    }));

  // 結果を表示
  showDuplicatesModal(duplicateGroups);
}

/**
 * テキストを正規化
 */
function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')  // 連続空白を1つに
    .replace(/　/g, ' ')   // 全角スペースを半角に
    .trim()
    .toLowerCase();
}

/**
 * 重複検出モーダルを表示
 */
function showDuplicatesModal(duplicateGroups) {
  const modal = document.getElementById('duplicates-modal');
  const summary = document.getElementById('duplicates-summary');
  const list = document.getElementById('duplicates-list');

  // 初期化
  duplicatesToDelete = new Set();
  list.innerHTML = '';

  if (duplicateGroups.length === 0) {
    summary.className = 'duplicates-summary no-duplicates';
    summary.textContent = '重複問題は見つかりませんでした';
    document.getElementById('delete-selected-duplicates-btn').hidden = true;
  } else {
    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.items.length - 1, 0);
    summary.className = 'duplicates-summary';
    summary.textContent = `${duplicateGroups.length}グループ、${totalDuplicates}件の重複が見つかりました`;
    document.getElementById('delete-selected-duplicates-btn').hidden = false;

    // グループごとに表示
    duplicateGroups.forEach((group, groupIndex) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'duplicate-group';

      groupEl.innerHTML = `
        <div class="duplicate-group-header">
          <span class="duplicate-group-title">グループ ${groupIndex + 1}</span>
          <span class="duplicate-group-count">${group.items.length}件の重複</span>
        </div>
        <div class="duplicate-question-preview">${escapeHtml(truncate(group.question, 100))}</div>
        <div class="duplicate-items" data-group="${groupIndex}"></div>
      `;

      const itemsContainer = groupEl.querySelector('.duplicate-items');

      group.items.forEach((item, itemIndex) => {
        const isFirst = itemIndex === 0;
        const itemEl = document.createElement('div');
        itemEl.className = `duplicate-item ${isFirst ? 'to-keep' : 'to-delete'}`;
        itemEl.dataset.id = item.id;

        const importDate = item.importedAt
          ? new Date(item.importedAt).toLocaleDateString('ja-JP')
          : '不明';

        itemEl.innerHTML = `
          <input type="checkbox"
                 ${isFirst ? '' : 'checked'}
                 data-id="${item.id}"
                 data-group="${groupIndex}"
                 title="${isFirst ? 'チェックで削除対象に' : 'チェック解除で保持'}">
          <div class="duplicate-item-info">
            <div class="duplicate-item-subject">${escapeHtml(item.subject || '未分類')} / ${escapeHtml(item.theme || '未分類')}</div>
            <div class="duplicate-item-date">インポート: ${importDate}</div>
          </div>
          <span class="duplicate-item-label ${isFirst ? 'keep' : 'delete'}">${isFirst ? '保持' : '削除'}</span>
        `;

        // チェックボックスのイベント
        const checkbox = itemEl.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
          updateDuplicateSelection(e.target);
        });

        // 初期状態で最初以外を削除対象に
        if (!isFirst) {
          duplicatesToDelete.add(item.id);
        }

        itemsContainer.appendChild(itemEl);
      });

      list.appendChild(groupEl);
    });
  }

  modal.hidden = false;
}

/**
 * 重複選択を更新
 */
function updateDuplicateSelection(checkbox) {
  const id = checkbox.dataset.id;
  const itemEl = checkbox.closest('.duplicate-item');
  const label = itemEl.querySelector('.duplicate-item-label');

  if (checkbox.checked) {
    duplicatesToDelete.add(id);
    itemEl.classList.remove('to-keep');
    itemEl.classList.add('to-delete');
    label.textContent = '削除';
    label.classList.remove('keep');
    label.classList.add('delete');
  } else {
    duplicatesToDelete.delete(id);
    itemEl.classList.remove('to-delete');
    itemEl.classList.add('to-keep');
    label.textContent = '保持';
    label.classList.remove('delete');
    label.classList.add('keep');
  }

  // 削除ボタンのテキスト更新
  const deleteBtn = document.getElementById('delete-selected-duplicates-btn');
  deleteBtn.textContent = `選択した${duplicatesToDelete.size}件を削除`;
}

/**
 * 選択した重複を削除
 */
function deleteSelectedDuplicates() {
  if (duplicatesToDelete.size === 0) {
    alert('削除する問題を選択してください。');
    return;
  }

  if (!confirm(`${duplicatesToDelete.size}件の重複問題を削除しますか？`)) {
    return;
  }

  // 削除実行
  state.savedQuestions = state.savedQuestions.filter(q => !duplicatesToDelete.has(q.id));
  saveSavedQuestions();

  // モーダルを閉じる
  closeDuplicatesModal();

  // 画面を更新
  state.filteredQuestions = [...state.savedQuestions];
  clearFilter();
  renderStatsDashboard();
  updateFilterDropdowns();
  renderQuestions();

  if (state.savedQuestions.length === 0) {
    showEmptyState();
  }

  alert(`${duplicatesToDelete.size}件の重複問題を削除しました。`);
}

/**
 * 重複検出モーダルを閉じる
 */
function closeDuplicatesModal() {
  document.getElementById('duplicates-modal').hidden = true;
  duplicatesToDelete = new Set();
}

// ====================
// テーマ統合機能
// ====================

// 選択されたテーマを保持
let selectedThemesToMerge = new Set();

/**
 * テーマ統合モーダルを開く
 */
function openMergeThemesModal() {
  const modal = document.getElementById('merge-themes-modal');
  const list = document.getElementById('merge-themes-list');
  const targetInput = document.getElementById('merge-target-name');

  // 初期化
  selectedThemesToMerge = new Set();
  targetInput.value = '';
  list.innerHTML = '';

  // テーマ一覧を取得（科目+テーマでグループ化）
  const themeGroups = {};
  state.savedQuestions.forEach(q => {
    const subject = q.subject || '未分類';
    const theme = q.theme || '未分類';
    const key = `${subject}|||${theme}`;
    if (!themeGroups[key]) {
      themeGroups[key] = { subject, theme, count: 0 };
    }
    themeGroups[key].count++;
  });

  // テーマをリスト化（問題数が少ない順にソート）
  const themes = Object.values(themeGroups).sort((a, b) => a.count - b.count);

  if (themes.length === 0) {
    list.innerHTML = '<div class="no-questions">テーマがありません</div>';
    modal.hidden = false;
    return;
  }

  // テーマをリスト表示
  themes.forEach(({ subject, theme, count }) => {
    const item = document.createElement('div');
    item.className = 'merge-theme-item';
    item.dataset.subject = subject;
    item.dataset.theme = theme;

    item.innerHTML = `
      <input type="checkbox" data-subject="${escapeHtml(subject)}" data-theme="${escapeHtml(theme)}">
      <div class="merge-theme-info">
        <div class="merge-theme-name">${escapeHtml(theme)}</div>
        <div class="merge-theme-subject">${escapeHtml(subject)}</div>
      </div>
      <span class="merge-theme-count">${count}問</span>
    `;

    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      const key = `${subject}|||${theme}`;
      if (e.target.checked) {
        selectedThemesToMerge.add(key);
        item.classList.add('selected');
        // 最初に選択したテーマを統合先の候補として入力
        if (selectedThemesToMerge.size === 1 && !targetInput.value) {
          targetInput.value = theme;
        }
      } else {
        selectedThemesToMerge.delete(key);
        item.classList.remove('selected');
      }
    });

    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });

    list.appendChild(item);
  });

  modal.hidden = false;
}

/**
 * テーマ統合を実行
 */
function executeMergeThemes() {
  const targetName = document.getElementById('merge-target-name').value.trim();

  if (!targetName) {
    alert('統合先のテーマ名を入力してください。');
    return;
  }

  if (selectedThemesToMerge.size < 2) {
    alert('統合するテーマを2つ以上選択してください。');
    return;
  }

  // 選択されたテーマのsubject, themeを取得
  const themesToMerge = Array.from(selectedThemesToMerge).map(key => {
    const [subject, theme] = key.split('|||');
    return { subject, theme };
  });

  // 確認
  const themeNames = themesToMerge.map(t => t.theme).join('」「');
  if (!confirm(`「${themeNames}」を「${targetName}」に統合しますか？`)) {
    return;
  }

  // 統合実行
  let count = 0;
  state.savedQuestions.forEach(q => {
    const subject = q.subject || '未分類';
    const theme = q.theme || '未分類';
    const key = `${subject}|||${theme}`;

    if (selectedThemesToMerge.has(key)) {
      q.theme = targetName;
      count++;
    }
  });

  saveSavedQuestions();
  closeMergeThemesModal();

  // 画面を更新
  state.filteredQuestions = [...state.savedQuestions];
  clearFilter();
  renderStatsDashboard();
  updateFilterDropdowns();
  renderQuestions();

  alert(`${count}問のテーマを「${targetName}」に統合しました。`);
}

/**
 * テーマ統合モーダルを閉じる
 */
function closeMergeThemesModal() {
  document.getElementById('merge-themes-modal').hidden = true;
  selectedThemesToMerge = new Set();
}

// ====================
// ユーティリティ
// ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

// 初期化
document.addEventListener('DOMContentLoaded', init);
