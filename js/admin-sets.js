/**
 * 管理者 問題セット管理ページ
 * セット一覧表示・編集（問題の追加/除外）・削除
 * フルページセクション切替 + 検索機能
 */

import { requireRole } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getQuestionSets, deleteQuestionSet, updateQuestionSet } from './firestore.js';

const STORAGE_KEY = 'kokushi_saved_questions';
const DELETED_KEY = 'kokushi_deleted_questions';

const state = {
  user: null,
  sets: [],
  // 編集状態
  editingSetId: null,
  editQuestions: [],
  editSelectedIds: new Set(),
  editSearchQuery: '',
  // 問題追加状態
  poolLoaded: false,
  allPoolQuestions: [],
  filteredPoolQuestions: [],
  addSelectedIds: new Set(),
  addFilter: { subject: '', theme: '' },
  addSearchQuery: ''
};

const elements = {};

// ユーティリティ
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, length) {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

// 初期化
async function init() {
  state.user = await requireRole('admin');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'admin');

  // 一覧要素
  elements.setsContainer = document.getElementById('sets-container');
  elements.setsCount = document.getElementById('sets-count');
  elements.emptySets = document.getElementById('empty-sets');
  elements.loadingState = document.getElementById('loading-state');
  elements.setsSection = document.getElementById('sets-section');

  // 編集セクション要素
  elements.editSection = document.getElementById('edit-set-section');
  elements.editTitle = document.getElementById('edit-set-title');
  elements.editDescription = document.getElementById('edit-set-description');
  elements.editQuestionCount = document.getElementById('edit-set-question-count');
  elements.editQuestionsContainer = document.getElementById('edit-set-questions-container');
  elements.editSelectAllBtn = document.getElementById('edit-select-all-btn');
  elements.editRemoveBtn = document.getElementById('edit-remove-selected-btn');
  elements.editAddBtn = document.getElementById('edit-add-questions-btn');
  elements.saveEditBtn = document.getElementById('save-edit-set-btn');
  elements.editSearchInput = document.getElementById('edit-search-input');

  // 問題追加セクション要素
  elements.addSection = document.getElementById('add-questions-section');
  elements.addFilterSubject = document.getElementById('add-filter-subject');
  elements.addFilterTheme = document.getElementById('add-filter-theme');
  elements.addPoolLoading = document.getElementById('add-pool-loading');
  elements.addPoolCount = document.getElementById('add-pool-count');
  elements.addQuestionsContainer = document.getElementById('add-questions-container');
  elements.addEmpty = document.getElementById('add-empty');
  elements.addSubmitBtn = document.getElementById('add-questions-submit-btn');
  elements.addCountText = document.getElementById('add-questions-count-text');
  elements.addSearchInput = document.getElementById('add-search-input');

  setupEventListeners();
  await loadSets();
}

function setupEventListeners() {
  // 編集セクション
  document.getElementById('back-to-sets-btn').addEventListener('click', closeEditSection);
  elements.editSelectAllBtn.addEventListener('click', toggleSelectAllEdit);
  elements.editRemoveBtn.addEventListener('click', removeSelectedFromEdit);
  elements.editAddBtn.addEventListener('click', openAddQuestionsSection);
  elements.saveEditBtn.addEventListener('click', saveEditedSet);

  // 編集セクション検索
  elements.editSearchInput.addEventListener('input', debounce((e) => {
    state.editSearchQuery = e.target.value.trim().toLowerCase();
    renderEditQuestions();
    updateEditRemoveBtn();
  }, 300));

  // 問題追加セクション
  document.getElementById('back-to-edit-btn').addEventListener('click', closeAddQuestionsSection);
  elements.addFilterSubject.addEventListener('change', onAddFilterSubjectChange);
  elements.addFilterTheme.addEventListener('change', onAddFilterThemeChange);
  elements.addSubmitBtn.addEventListener('click', addSelectedToSet);

  // 問題追加セクション検索
  elements.addSearchInput.addEventListener('input', debounce((e) => {
    state.addSearchQuery = e.target.value.trim().toLowerCase();
    filterPoolQuestions();
    renderPoolQuestions();
    updateAddSubmitBtn();
  }, 300));
}

// ====================
// セクション切替
// ====================

function openEditSection(setId) {
  const set = state.sets.find(s => s.id === setId);
  if (!set) return;

  state.editingSetId = setId;
  state.editQuestions = [...(set.questions || [])];
  state.editSelectedIds.clear();
  state.editSearchQuery = '';
  elements.editSearchInput.value = '';

  elements.editTitle.value = set.title || '';
  elements.editDescription.value = set.description || '';

  elements.setsSection.hidden = true;
  elements.editSection.hidden = false;
  window.scrollTo(0, 0);

  renderEditQuestions();
  updateEditRemoveBtn();
}

function closeEditSection() {
  elements.editSection.hidden = true;
  elements.setsSection.hidden = false;
  state.editingSetId = null;
  state.editQuestions = [];
  state.editSelectedIds.clear();
  state.editSearchQuery = '';
}

function openAddQuestionsSection() {
  state.addSelectedIds.clear();
  state.addFilter = { subject: '', theme: '' };
  state.addSearchQuery = '';

  elements.addFilterSubject.value = '';
  elements.addFilterTheme.value = '';
  elements.addFilterTheme.disabled = true;
  elements.addPoolCount.hidden = true;
  elements.addSearchInput.value = '';

  elements.editSection.hidden = true;
  elements.addSection.hidden = false;
  window.scrollTo(0, 0);

  if (!state.poolLoaded) {
    elements.addPoolLoading.hidden = false;
    elements.addQuestionsContainer.innerHTML = '';
    elements.addEmpty.hidden = true;

    loadQuestionPool().then(() => {
      elements.addPoolLoading.hidden = true;
      state.poolLoaded = true;
      filterPoolQuestions();
      updateAddFilterDropdowns();
      renderPoolQuestions();
      updateAddSubmitBtn();
    });
  } else {
    filterPoolQuestions();
    updateAddFilterDropdowns();
    renderPoolQuestions();
    updateAddSubmitBtn();
  }
}

function closeAddQuestionsSection() {
  elements.addSection.hidden = true;
  elements.editSection.hidden = false;
  window.scrollTo(0, 0);
  state.addSelectedIds.clear();
  state.addSearchQuery = '';
}

// ====================
// セット一覧
// ====================

async function loadSets() {
  try {
    state.sets = await getQuestionSets(state.user.uid);
    elements.loadingState.hidden = true;
    elements.setsSection.hidden = false;
    renderSets();
  } catch (error) {
    console.error('Failed to load question sets:', error);
    elements.loadingState.hidden = true;
    elements.setsSection.hidden = false;
    elements.emptySets.hidden = false;
    elements.emptySets.textContent = '読み込みに失敗しました。';
  }
}

function renderSets() {
  elements.setsCount.textContent = `${state.sets.length}件`;
  elements.setsContainer.innerHTML = '';

  if (state.sets.length === 0) {
    elements.emptySets.hidden = false;
    return;
  }

  elements.emptySets.hidden = true;

  state.sets.forEach(set => {
    const card = document.createElement('div');
    card.className = 'set-card';

    const createdAt = set.createdAt?.toDate
      ? set.createdAt.toDate().toLocaleDateString('ja-JP')
      : '---';

    card.innerHTML = `
      <div class="set-card-header">
        <div class="set-card-title">${escapeHtml(set.title)}</div>
      </div>
      ${set.description ? `<div class="set-card-meta">${escapeHtml(set.description)}</div>` : ''}
      <div class="set-card-meta">${set.questionCount}問 / 作成日: ${createdAt}</div>
      <div class="set-card-footer">
        <div class="share-code-display">
          <span>${set.shareCode}</span>
          <button class="share-code-copy-btn" data-code="${set.shareCode}" title="コードをコピー">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
        <div class="set-card-actions">
          <button class="btn btn-secondary btn-sm edit-set-btn" data-id="${set.id}">編集</button>
          <button class="btn btn-secondary btn-sm view-grades-btn" data-id="${set.id}" data-title="${escapeHtml(set.title)}">成績を見る</button>
          <button class="btn btn-danger btn-sm delete-set-btn" data-id="${set.id}" data-title="${escapeHtml(set.title)}">削除</button>
        </div>
      </div>
    `;

    elements.setsContainer.appendChild(card);
  });

  // コピーボタン
  elements.setsContainer.querySelectorAll('.share-code-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      try {
        await navigator.clipboard.writeText(code);
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        }, 2000);
      } catch (e) {
        alert('コピーに失敗しました: ' + code);
      }
    });
  });

  // 編集ボタン
  elements.setsContainer.querySelectorAll('.edit-set-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditSection(btn.dataset.id));
  });

  // 成績ボタン
  elements.setsContainer.querySelectorAll('.view-grades-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `admin-grades.html?setId=${btn.dataset.id}`;
    });
  });

  // 削除ボタン
  elements.setsContainer.querySelectorAll('.delete-set-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const title = btn.dataset.title;
      if (!confirm(`「${title}」を削除しますか？\nこの操作は取り消せません。`)) return;

      try {
        await deleteQuestionSet(btn.dataset.id);
        state.sets = state.sets.filter(s => s.id !== btn.dataset.id);
        renderSets();
      } catch (error) {
        console.error('Failed to delete:', error);
        alert('削除に失敗しました。');
      }
    });
  });
}

// ====================
// 問題セット編集
// ====================

function renderEditQuestions() {
  elements.editQuestionCount.textContent = state.editQuestions.length;
  elements.editQuestionsContainer.innerHTML = '';

  // 検索フィルタリング
  const query = state.editSearchQuery;
  const displayQuestions = query
    ? state.editQuestions.filter(q => matchesSearch(q, query))
    : state.editQuestions;

  if (state.editQuestions.length === 0) {
    elements.editQuestionsContainer.innerHTML = '<div class="no-questions">問題がありません。「問題を追加」から追加できます。</div>';
    return;
  }

  if (displayQuestions.length === 0) {
    elements.editQuestionsContainer.innerHTML = '<div class="no-questions">検索に一致する問題がありません。</div>';
    return;
  }

  displayQuestions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.dataset.id = q.id;

    const isSelected = state.editSelectedIds.has(q.id);

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `
      <div class="accordion-header-left">
        <label class="question-checkbox-label" title="選択">
          <input type="checkbox" class="edit-question-checkbox" data-id="${q.id}" ${isSelected ? 'checked' : ''}>
        </label>
        <span class="accordion-number">${i + 1}</span>
        <span class="accordion-theme">${escapeHtml(q.theme || q.subject || '')}</span>
      </div>
      <div class="accordion-header-center">
        <span class="accordion-question-preview">${escapeHtml(truncate(q.question, 60))}</span>
      </div>
      <div class="accordion-header-right">
        <span class="accordion-answer">正解: ${q.answer}</span>
        <span class="accordion-chevron">▼</span>
      </div>
    `;

    const content = document.createElement('div');
    content.className = 'accordion-content';
    content.innerHTML = `
      <div class="accordion-question-full">${escapeHtml(q.question)}</div>
      <ul class="choices-list">
        ${(q.choices || []).map((choice, j) => {
          const label = String.fromCharCode(65 + j);
          const isCorrect = (q.answer || '').includes(label);
          return `<li class="choice-item ${isCorrect ? 'correct' : ''}">
            <span class="choice-label">${label.toLowerCase()}.</span>
            ${escapeHtml(choice)}
          </li>`;
        }).join('')}
      </ul>
      ${q.explanation ? `<div class="explanation">
        <div class="explanation-label">解説</div>
        ${escapeHtml(q.explanation)}
      </div>` : ''}
    `;

    const checkbox = header.querySelector('.edit-question-checkbox');
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.editSelectedIds.add(q.id);
      } else {
        state.editSelectedIds.delete(q.id);
      }
      updateEditRemoveBtn();
    });

    header.addEventListener('click', (e) => {
      if (e.target.closest('.question-checkbox-label')) return;
      item.classList.toggle('expanded');
    });

    item.appendChild(header);
    item.appendChild(content);
    elements.editQuestionsContainer.appendChild(item);
  });
}

function updateEditRemoveBtn() {
  const count = state.editSelectedIds.size;
  elements.editRemoveBtn.disabled = count === 0;
  elements.editRemoveBtn.textContent = count > 0 ? `${count}問を除外` : '選択を除外';

  // 検索中は表示中の問題のみで全選択判定
  const query = state.editSearchQuery;
  const displayQuestions = query
    ? state.editQuestions.filter(q => matchesSearch(q, query))
    : state.editQuestions;

  const allSelected = displayQuestions.length > 0 &&
    displayQuestions.every(q => state.editSelectedIds.has(q.id));
  elements.editSelectAllBtn.textContent = allSelected ? '全解除' : '全選択';
}

function toggleSelectAllEdit() {
  // 検索中は表示中の問題のみ選択/解除
  const query = state.editSearchQuery;
  const displayQuestions = query
    ? state.editQuestions.filter(q => matchesSearch(q, query))
    : state.editQuestions;

  const allSelected = displayQuestions.length > 0 &&
    displayQuestions.every(q => state.editSelectedIds.has(q.id));

  if (allSelected) {
    displayQuestions.forEach(q => state.editSelectedIds.delete(q.id));
  } else {
    displayQuestions.forEach(q => state.editSelectedIds.add(q.id));
  }

  elements.editQuestionsContainer.querySelectorAll('.edit-question-checkbox').forEach(cb => {
    cb.checked = state.editSelectedIds.has(cb.dataset.id);
  });

  updateEditRemoveBtn();
}

function removeSelectedFromEdit() {
  const count = state.editSelectedIds.size;
  if (count === 0) return;
  if (!confirm(`選択した${count}問をセットから除外しますか？`)) return;

  state.editQuestions = state.editQuestions.filter(q => !state.editSelectedIds.has(q.id));
  state.editSelectedIds.clear();
  renderEditQuestions();
  updateEditRemoveBtn();
}

async function saveEditedSet() {
  const title = elements.editTitle.value.trim();
  if (!title) {
    alert('タイトルを入力してください。');
    return;
  }

  const btn = elements.saveEditBtn;
  btn.querySelector('.btn-text').hidden = true;
  btn.querySelector('.btn-loading').hidden = false;
  btn.disabled = true;

  try {
    const description = elements.editDescription.value.trim();

    await updateQuestionSet(state.editingSetId, {
      title,
      description,
      questions: state.editQuestions,
      questionCount: state.editQuestions.length
    });

    // ローカルステートも更新
    const idx = state.sets.findIndex(s => s.id === state.editingSetId);
    if (idx !== -1) {
      state.sets[idx].title = title;
      state.sets[idx].description = description;
      state.sets[idx].questions = state.editQuestions;
      state.sets[idx].questionCount = state.editQuestions.length;
    }

    closeEditSection();
    renderSets();
  } catch (error) {
    console.error('Failed to save:', error);
    alert('保存に失敗しました: ' + error.message);
  } finally {
    btn.querySelector('.btn-text').hidden = false;
    btn.querySelector('.btn-loading').hidden = true;
    btn.disabled = false;
  }
}

// ====================
// 問題追加
// ====================

async function loadQuestionPool() {
  const allQuestions = [];

  try {
    const indexResponse = await fetch('data/questions/index.json');
    if (indexResponse.ok) {
      const index = await indexResponse.json();
      for (const subject of index.subjects) {
        const response = await fetch(`data/questions/${subject.file}`);
        if (response.ok) {
          const data = await response.json();
          allQuestions.push(...data.questions);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load static questions:', e);
  }

  // localStorage インポート済み問題
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const imported = JSON.parse(saved);
      if (Array.isArray(imported)) {
        allQuestions.push(...imported);
      }
    }
  } catch (e) {
    console.error('Failed to load imported questions:', e);
  }

  // 削除済みIDを除外
  try {
    const data = localStorage.getItem(DELETED_KEY);
    if (data) {
      const deletedIds = new Set(JSON.parse(data));
      state.allPoolQuestions = allQuestions.filter(q => !deletedIds.has(q.id));
    } else {
      state.allPoolQuestions = allQuestions;
    }
  } catch (e) {
    state.allPoolQuestions = allQuestions;
  }
}

function filterPoolQuestions() {
  const { subject, theme } = state.addFilter;
  const query = state.addSearchQuery;
  const existingIds = new Set(state.editQuestions.map(q => q.id));

  state.filteredPoolQuestions = state.allPoolQuestions.filter(q => {
    if (existingIds.has(q.id)) return false;
    if (subject && (q.subject || '未分類') !== subject) return false;
    if (theme && (q.theme || '未分類') !== theme) return false;
    if (!matchesSearch(q, query)) return false;
    return true;
  });
}

function getPoolStats() {
  const existingIds = new Set(state.editQuestions.map(q => q.id));
  const pool = state.allPoolQuestions.filter(q => !existingIds.has(q.id));

  const stats = {};
  pool.forEach(q => {
    const subject = q.subject || '未分類';
    const theme = q.theme || '未分類';
    if (!stats[subject]) stats[subject] = { total: 0, themes: {} };
    stats[subject].total++;
    if (!stats[subject].themes[theme]) stats[subject].themes[theme] = 0;
    stats[subject].themes[theme]++;
  });
  return stats;
}

function updateAddFilterDropdowns() {
  const stats = getPoolStats();

  elements.addFilterSubject.innerHTML = '<option value="">すべての科目</option>';
  Object.entries(stats).forEach(([subject, data]) => {
    const option = document.createElement('option');
    option.value = subject;
    option.textContent = `${subject}（${data.total}問）`;
    elements.addFilterSubject.appendChild(option);
  });

  if (state.addFilter.subject) {
    elements.addFilterSubject.value = state.addFilter.subject;
    updateAddThemeDropdown(stats);
  }
}

function updateAddThemeDropdown(stats) {
  if (!stats) stats = getPoolStats();
  const subject = state.addFilter.subject;

  elements.addFilterTheme.innerHTML = '<option value="">すべてのテーマ</option>';

  if (subject && stats[subject]) {
    Object.entries(stats[subject].themes).forEach(([theme, count]) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = `${theme}（${count}問）`;
      elements.addFilterTheme.appendChild(option);
    });
    elements.addFilterTheme.disabled = false;
  } else {
    elements.addFilterTheme.disabled = true;
  }
}

function onAddFilterSubjectChange() {
  state.addFilter.subject = elements.addFilterSubject.value;
  state.addFilter.theme = '';
  elements.addFilterTheme.value = '';
  updateAddThemeDropdown();
  state.addSelectedIds.clear();
  filterPoolQuestions();
  renderPoolQuestions();
  updateAddSubmitBtn();
}

function onAddFilterThemeChange() {
  state.addFilter.theme = elements.addFilterTheme.value;
  state.addSelectedIds.clear();
  filterPoolQuestions();
  renderPoolQuestions();
  updateAddSubmitBtn();
}

function renderPoolQuestions() {
  elements.addQuestionsContainer.innerHTML = '';

  // 件数表示
  const { subject, theme } = state.addFilter;
  const query = state.addSearchQuery;

  if (subject || theme || query) {
    elements.addPoolCount.hidden = false;
    let desc = '';
    if (subject) desc = subject;
    if (theme) desc += ` > ${theme}`;
    if (query) desc += (desc ? ' / ' : '') + `「${query}」`;
    elements.addPoolCount.textContent = `${desc}: ${state.filteredPoolQuestions.length}問`;
  } else {
    elements.addPoolCount.hidden = false;
    elements.addPoolCount.textContent = `追加候補: ${state.filteredPoolQuestions.length}問`;
  }

  if (state.filteredPoolQuestions.length === 0) {
    elements.addEmpty.hidden = false;
    return;
  }

  elements.addEmpty.hidden = true;

  // 科目ごとにグループ化
  const grouped = {};
  state.filteredPoolQuestions.forEach(q => {
    const key = q.subject || '未分類';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(q);
  });

  Object.entries(grouped).forEach(([subject, questions]) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'edit-pool-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'edit-pool-group-header';
    groupHeader.innerHTML = `
      <label class="group-checkbox-label">
        <input type="checkbox" class="add-group-checkbox" data-subject="${escapeHtml(subject)}">
      </label>
      <span class="edit-pool-group-title">${escapeHtml(subject)}</span>
      <span class="edit-pool-group-count">${questions.length}問</span>
    `;

    const groupCheckbox = groupHeader.querySelector('.add-group-checkbox');

    const list = document.createElement('div');
    list.className = 'accordion-list';

    questions.forEach((q, i) => {
      const item = document.createElement('div');
      item.className = 'accordion-item';

      const isSelected = state.addSelectedIds.has(q.id);

      const header = document.createElement('div');
      header.className = 'accordion-header';
      header.innerHTML = `
        <div class="accordion-header-left">
          <label class="question-checkbox-label">
            <input type="checkbox" class="add-question-checkbox" data-id="${q.id}" ${isSelected ? 'checked' : ''}>
          </label>
          <span class="accordion-number">${i + 1}</span>
          <span class="accordion-theme">${escapeHtml(q.theme || '')}</span>
        </div>
        <div class="accordion-header-center">
          <span class="accordion-question-preview">${escapeHtml(truncate(q.question, 50))}</span>
        </div>
        <div class="accordion-header-right">
          <span class="accordion-answer">正解: ${q.answer}</span>
          <span class="accordion-chevron">▼</span>
        </div>
      `;

      const content = document.createElement('div');
      content.className = 'accordion-content';
      content.innerHTML = `
        <div class="accordion-question-full">${escapeHtml(q.question)}</div>
        <ul class="choices-list">
          ${(q.choices || []).map((choice, j) => {
            const label = String.fromCharCode(65 + j);
            const isCorrect = (q.answer || '').includes(label);
            return `<li class="choice-item ${isCorrect ? 'correct' : ''}">
              <span class="choice-label">${label.toLowerCase()}.</span>
              ${escapeHtml(choice)}
            </li>`;
          }).join('')}
        </ul>
        ${q.explanation ? `<div class="explanation">
          <div class="explanation-label">解説</div>
          ${escapeHtml(q.explanation)}
        </div>` : ''}
      `;

      const checkbox = header.querySelector('.add-question-checkbox');
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.addSelectedIds.add(q.id);
        } else {
          state.addSelectedIds.delete(q.id);
        }
        syncGroupCheckbox(groupCheckbox, questions);
        updateAddSubmitBtn();
      });

      header.addEventListener('click', (e) => {
        if (e.target.closest('.question-checkbox-label')) return;
        item.classList.toggle('expanded');
      });

      item.appendChild(header);
      item.appendChild(content);
      list.appendChild(item);
    });

    // グループチェックボックス
    groupCheckbox.addEventListener('change', () => {
      questions.forEach(q => {
        if (groupCheckbox.checked) {
          state.addSelectedIds.add(q.id);
        } else {
          state.addSelectedIds.delete(q.id);
        }
      });
      list.querySelectorAll('.add-question-checkbox').forEach(cb => {
        cb.checked = groupCheckbox.checked;
      });
      updateAddSubmitBtn();
    });

    groupDiv.appendChild(groupHeader);
    groupDiv.appendChild(list);
    elements.addQuestionsContainer.appendChild(groupDiv);
  });
}

function syncGroupCheckbox(groupCheckbox, questions) {
  const allSelected = questions.every(q => state.addSelectedIds.has(q.id));
  const someSelected = questions.some(q => state.addSelectedIds.has(q.id));
  groupCheckbox.checked = allSelected;
  groupCheckbox.indeterminate = someSelected && !allSelected;
}

function updateAddSubmitBtn() {
  const count = state.addSelectedIds.size;
  elements.addCountText.textContent = `${count}問を追加`;
  elements.addSubmitBtn.disabled = count === 0;
}

function addSelectedToSet() {
  if (state.addSelectedIds.size === 0) return;

  const selectedQuestions = state.allPoolQuestions
    .filter(q => state.addSelectedIds.has(q.id))
    .map(q => ({
      id: q.id,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation || '',
      subject: q.subject || '',
      theme: q.theme || ''
    }));

  state.editQuestions.push(...selectedQuestions);
  state.addSelectedIds.clear();
  state.addSearchQuery = '';

  closeAddQuestionsSection();
  renderEditQuestions();
  updateEditRemoveBtn();
}

document.addEventListener('DOMContentLoaded', init);
