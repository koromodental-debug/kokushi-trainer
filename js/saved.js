/**
 * 問題一覧ページ
 * 静的JSONファイルから問題を読み込んで表示・学習
 */

import { requireRole, getCurrentUser } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { createQuestionSet } from './firestore.js';

// LocalStorageキー（app.jsと共通）
const STORAGE_KEY = 'kokushi_saved_questions';
const DELETED_KEY = 'kokushi_deleted_questions';

// アプリケーション状態
const state = {
  allQuestions: [],      // 全問題
  filteredQuestions: [], // フィルタ後の問題
  subjectsIndex: null,   // 科目インデックス
  selectedIds: new Set(), // 選択中の問題ID
  searchQuery: '',
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
 * debounceユーティリティ
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 検索マッチ判定
 */
function matchesSearch(q, query) {
  if (!query) return true;
  const haystack = [
    q.question || '',
    q.explanation || '',
    q.theme || '',
    q.subject || '',
    ...(q.choices || [])
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

/**
 * 初期化
 */
async function init() {
  // 認証 & admin権限チェック
  const user = await requireRole('admin');
  if (!user) return;

  // 認証ヘッダー描画
  renderAuthHeader(document.getElementById('app-header'), user, 'admin');

  showLoading(true);

  try {
    // インデックスを読み込む
    const indexResponse = await fetch('data/questions/index.json');
    if (!indexResponse.ok) throw new Error('Failed to load index');
    state.subjectsIndex = await indexResponse.json();

    // 全科目の問題を読み込む（静的JSONファイル）
    const allQuestions = [];
    for (const subject of state.subjectsIndex.subjects) {
      const response = await fetch(`data/questions/${subject.file}`);
      if (response.ok) {
        const data = await response.json();
        allQuestions.push(...data.questions);
      }
    }

    // localStorageからインポート済み問題もマージ
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const importedQuestions = JSON.parse(saved);
        if (Array.isArray(importedQuestions) && importedQuestions.length > 0) {
          allQuestions.push(...importedQuestions);
          console.log(`Merged ${importedQuestions.length} imported questions from localStorage`);
        }
      }
    } catch (e) {
      console.error('Failed to load imported questions:', e);
    }

    // 削除済みIDを除外
    const deletedIds = loadDeletedIds();
    const filtered = deletedIds.size > 0
      ? allQuestions.filter(q => !deletedIds.has(q.id))
      : allQuestions;

    state.allQuestions = filtered;
    state.filteredQuestions = [...filtered];

    console.log(`Loaded ${filtered.length} total questions`);

    showLoading(false);

    if (state.allQuestions.length === 0) {
      showEmptyState();
      return;
    }

    renderStatsDashboard();
    updateFilterDropdowns();
    renderQuestions();
    setupEventListeners();

  } catch (error) {
    console.error('Failed to load questions:', error);
    showLoading(false);
    showEmptyState();
  }
}

/**
 * ローディング表示
 */
function showLoading(show) {
  const loading = document.getElementById('loading-state');
  if (loading) {
    loading.hidden = !show;
  }
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
  // 検索
  document.getElementById('search-input').addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    applyFilter();
  }, 300));

  // フィルター
  document.getElementById('filter-subject').addEventListener('change', onFilterSubjectChange);
  document.getElementById('filter-theme').addEventListener('change', onFilterThemeChange);
  document.getElementById('filter-clear-btn').addEventListener('click', clearFilter);

  // アクション
  document.getElementById('expand-all-btn').addEventListener('click', expandAll);
  document.getElementById('collapse-all-btn').addEventListener('click', collapseAll);
  document.getElementById('start-filtered-exam-btn').addEventListener('click', startExam);
  document.getElementById('export-csv-btn').addEventListener('click', onExportCSV);
  document.getElementById('export-json-btn').addEventListener('click', onExportJSON);

  // 試験関連
  document.getElementById('exam-prev-btn').addEventListener('click', () => navigateExam(-1));
  document.getElementById('exam-next-btn').addEventListener('click', () => navigateExam(1));
  document.getElementById('retry-btn').addEventListener('click', retryExam);
  document.getElementById('back-to-list-btn').addEventListener('click', backToList);

  // 選択バー
  document.getElementById('deselect-all-btn').addEventListener('click', deselectAll);
  document.getElementById('create-set-selected-btn').addEventListener('click', () => openCreateSetModal(true));
  document.getElementById('delete-selected-btn').addEventListener('click', deleteSelected);

  // 問題セット作成
  document.getElementById('create-set-btn').addEventListener('click', () => openCreateSetModal(false));
  document.getElementById('close-create-set-btn').addEventListener('click', closeCreateSetModal);
  document.getElementById('create-set-modal').querySelector('.modal-backdrop').addEventListener('click', closeCreateSetModal);
  document.getElementById('create-set-submit-btn').addEventListener('click', onCreateQuestionSet);
}

/**
 * 空状態を表示
 */
function showEmptyState() {
  document.getElementById('empty-state').hidden = false;
  document.querySelectorAll('.section:not(#empty-state):not(#loading-state)').forEach(el => {
    if (!el.querySelector('.header')) el.hidden = true;
  });
}

/**
 * 統計を計算
 */
function calculateStats() {
  const stats = {};
  state.allQuestions.forEach(q => {
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

  totalCountEl.textContent = `${state.allQuestions.length}問`;
  treeContainer.innerHTML = '';

  if (Object.keys(stats).length === 0) {
    treeContainer.innerHTML = '<div class="stats-empty">問題がありません</div>';
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
  const query = state.searchQuery;

  state.filteredQuestions = state.allQuestions.filter(q => {
    if (subject && (q.subject || '未分類') !== subject) return false;
    if (theme && (q.theme || '未分類') !== theme) return false;
    if (!matchesSearch(q, query)) return false;
    return true;
  });

  const filterResult = document.getElementById('filter-result');
  const filterResultText = document.getElementById('filter-result-text');

  if (subject || theme || query) {
    filterResult.hidden = false;
    let filterDesc = '';
    if (subject) filterDesc = subject;
    if (theme) filterDesc += ` > ${theme}`;
    if (query) filterDesc += (filterDesc ? ' / ' : '') + `「${query}」`;
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
  state.searchQuery = '';
  document.getElementById('filter-subject').value = '';
  document.getElementById('filter-theme').value = '';
  document.getElementById('filter-theme').disabled = true;
  document.getElementById('search-input').value = '';
  document.getElementById('filter-result').hidden = true;
  state.filteredQuestions = [...state.allQuestions];
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
      <div class="question-group-header-left">
        <label class="group-checkbox-label" title="このグループをすべて選択">
          <input type="checkbox" class="group-select-checkbox" data-subject="${escapeHtml(subject)}">
        </label>
        <h3>${escapeHtml(subject)}</h3>
      </div>
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

    // グループ全選択チェックボックス
    const groupCheckbox = header.querySelector('.group-select-checkbox');
    groupCheckbox.addEventListener('change', () => {
      const ids = questions.map(q => q.id);
      if (groupCheckbox.checked) {
        ids.forEach(id => state.selectedIds.add(id));
      } else {
        ids.forEach(id => state.selectedIds.delete(id));
      }
      // 個別チェックボックスを同期
      card.querySelectorAll('.question-select-checkbox').forEach(cb => {
        cb.checked = groupCheckbox.checked;
      });
      updateSelectionBar();
    });

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
      const item = createAccordionItem(q, i + 1, groupCheckbox, questions);
      list.appendChild(item);
    });

    card.appendChild(list);
    container.appendChild(card);
  });

  // 選択状態を復元
  updateSelectionBar();
}

/**
 * アコーディオンアイテムを作成
 */
function createAccordionItem(question, number, groupCheckbox, groupQuestions) {
  const item = document.createElement('div');
  item.className = 'accordion-item';
  item.dataset.id = question.id;

  const isSelected = state.selectedIds.has(question.id);

  const header = document.createElement('div');
  header.className = 'accordion-header';
  header.innerHTML = `
    <div class="accordion-header-left">
      <label class="question-checkbox-label" title="選択">
        <input type="checkbox" class="question-select-checkbox" data-id="${question.id}" ${isSelected ? 'checked' : ''}>
      </label>
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
      ${escapeHtml(question.explanation || '解説なし')}
    </div>
    <div class="accordion-actions">
      <button class="btn btn-danger btn-sm delete-question-btn" data-id="${question.id}">この問題を削除</button>
    </div>
  `;

  // チェックボックスのクリック
  const checkbox = header.querySelector('.question-select-checkbox');
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.selectedIds.add(question.id);
    } else {
      state.selectedIds.delete(question.id);
    }
    // グループチェックボックスの状態を同期
    const allInGroup = groupQuestions.every(q => state.selectedIds.has(q.id));
    const someInGroup = groupQuestions.some(q => state.selectedIds.has(q.id));
    groupCheckbox.checked = allInGroup;
    groupCheckbox.indeterminate = someInGroup && !allInGroup;
    updateSelectionBar();
  });

  // ヘッダークリックで展開（チェックボックス以外）
  header.addEventListener('click', (e) => {
    if (e.target.closest('.question-checkbox-label')) return;
    item.classList.toggle('expanded');
  });

  // 個別削除
  content.querySelector('.delete-question-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteQuestions([question.id]);
  });

  item.appendChild(header);
  item.appendChild(content);

  return item;
}

// ====================
// 選択・一括削除
// ====================

/**
 * 選択バーの表示を更新
 */
function updateSelectionBar() {
  const bar = document.getElementById('selection-bar');
  const count = state.selectedIds.size;
  if (count > 0) {
    bar.hidden = false;
    document.getElementById('selected-count').textContent = `${count}問を選択中`;
  } else {
    bar.hidden = true;
  }
}

/**
 * すべての選択を解除
 */
function deselectAll() {
  state.selectedIds.clear();
  document.querySelectorAll('.question-select-checkbox, .group-select-checkbox').forEach(cb => {
    cb.checked = false;
    cb.indeterminate = false;
  });
  updateSelectionBar();
}

/**
 * 選択した問題を一括削除
 */
function deleteSelected() {
  const count = state.selectedIds.size;
  if (count === 0) return;
  if (!confirm(`選択した${count}問を削除しますか？\nこの操作は取り消せません。`)) return;

  deleteQuestions([...state.selectedIds]);
  state.selectedIds.clear();
}

// ====================
// 問題セット作成
// ====================

/**
 * 問題セット作成対象の問題を取得
 */
function getQuestionsForSet(fromSelection) {
  if (fromSelection && state.selectedIds.size > 0) {
    return state.allQuestions.filter(q => state.selectedIds.has(q.id));
  }
  // 選択なし → フィルタ中ならフィルタ結果、そうでなければ全問題
  return state.filteredQuestions.length > 0 ? state.filteredQuestions : state.allQuestions;
}

/**
 * モーダルを開く
 */
function openCreateSetModal(fromSelection) {
  const questions = getQuestionsForSet(fromSelection);
  if (questions.length === 0) {
    alert('問題がありません。');
    return;
  }

  // 対象問題をモーダルに記録
  state._setTargetFromSelection = fromSelection;

  const modal = document.getElementById('create-set-modal');
  document.getElementById('set-question-count').textContent = questions.length;

  // タイトルのデフォルト値
  const titleInput = document.getElementById('set-title-input');
  if (!titleInput.value) {
    const { subject, theme } = state.currentFilter;
    if (subject) {
      titleInput.value = `${subject}${theme ? ' - ' + theme : ''}`;
    }
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
    const targetQuestions = getQuestionsForSet(state._setTargetFromSelection);

    const questions = targetQuestions.map((q, i) => ({
      id: q.id || `q_${Date.now()}_${i}`,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation || '',
      subject: q.subject || '',
      theme: q.theme || ''
    }));

    await createQuestionSet({
      title,
      description,
      questions,
      createdBy: user.uid
    });

    closeCreateSetModal();
    document.getElementById('set-title-input').value = '';
    document.getElementById('set-description-input').value = '';
    alert(`問題セットを作成しました（${questions.length}問）。\n「問題セット」ページで共有コードを確認できます。`);

  } catch (error) {
    console.error('Failed to create question set:', error);
    alert('問題セットの作成に失敗しました: ' + error.message);
  } finally {
    submitBtn.querySelector('.btn-text').hidden = false;
    submitBtn.querySelector('.btn-loading').hidden = true;
    submitBtn.disabled = false;
  }
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
 * CSVエクスポート
 */
function onExportCSV() {
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.allQuestions;
  if (questions.length === 0) return;

  const headers = ['subject', 'theme', 'question', 'choice_a', 'choice_b', 'choice_c', 'choice_d', 'choice_e', 'answer', 'explanation'];
  const rows = questions.map(q => [
    q.subject || '',
    q.theme || '',
    q.question,
    q.choices[0] || '',
    q.choices[1] || '',
    q.choices[2] || '',
    q.choices[3] || '',
    q.choices[4] || '',
    q.answer,
    q.explanation || ''
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadFile(csv, `questions_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

/**
 * JSONエクスポート
 */
function onExportJSON() {
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.allQuestions;
  if (questions.length === 0) return;

  const json = JSON.stringify({ questions }, null, 2);
  downloadFile(json, `questions_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
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
  const questions = state.filteredQuestions.length > 0 ? state.filteredQuestions : state.allQuestions;
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
    if (el.id !== 'empty-state' && el.id !== 'loading-state' && el.id !== 'exam-section' && el.id !== 'exam-results-section') {
      el.hidden = false;
    }
  });
}

// ====================
// 問題削除
// ====================

/**
 * 削除済みIDセットを読み込む
 */
function loadDeletedIds() {
  try {
    const data = localStorage.getItem(DELETED_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch (e) {
    return new Set();
  }
}

/**
 * 削除済みIDを保存
 */
function saveDeletedIds(ids) {
  localStorage.setItem(DELETED_KEY, JSON.stringify([...ids]));
}

/**
 * 問題を一括削除
 * @param {string[]} ids - 削除する問題IDの配列
 */
function deleteQuestions(ids) {
  if (ids.length === 1 && !confirm('この問題を削除しますか？')) return;

  const idsSet = new Set(ids);

  // インポート済み問題をlocalStorageから削除
  const importedIds = ids.filter(id => id.startsWith('imported_'));
  if (importedIds.length > 0) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const questions = JSON.parse(saved);
        const importedIdsSet = new Set(importedIds);
        const updated = questions.filter(q => !importedIdsSet.has(q.id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Failed to delete imported questions:', e);
    }
  }

  // 静的JSON問題は削除IDリストに追加
  const staticIds = ids.filter(id => !id.startsWith('imported_'));
  if (staticIds.length > 0) {
    const deletedIds = loadDeletedIds();
    staticIds.forEach(id => deletedIds.add(id));
    saveDeletedIds(deletedIds);
  }

  // stateから除外して再描画
  state.allQuestions = state.allQuestions.filter(q => !idsSet.has(q.id));
  state.filteredQuestions = state.filteredQuestions.filter(q => !idsSet.has(q.id));
  renderStatsDashboard();
  updateFilterDropdowns();
  renderQuestions();
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
