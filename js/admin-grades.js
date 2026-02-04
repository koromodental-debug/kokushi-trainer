/**
 * 管理者 成績ダッシュボードページ
 */

import { requireRole } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getAllGrades, getGradesByQuestionSet, getQuestionSetById } from './firestore.js';

const state = {
  user: null,
  allGrades: [],
  filteredGrades: [],
  filterSetId: ''
};

const elements = {};

async function init() {
  state.user = await requireRole('admin');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'admin');

  elements.loadingState = document.getElementById('loading-state');
  elements.gradesSection = document.getElementById('grades-section');
  elements.gradesTbody = document.getElementById('grades-tbody');
  elements.emptyGrades = document.getElementById('empty-grades');
  elements.searchInput = document.getElementById('search-input');
  elements.filterSet = document.getElementById('filter-set');
  elements.gradesTitle = document.getElementById('grades-title');

  setupEventListeners();

  // URLパラメータで問題セットフィルター
  const params = new URLSearchParams(window.location.search);
  const setId = params.get('setId');

  if (setId) {
    state.filterSetId = setId;
    const setData = await getQuestionSetById(setId);
    if (setData) {
      elements.gradesTitle.textContent = `成績: ${setData.title}`;
    }
  }

  await loadGrades();
}

function setupEventListeners() {
  elements.searchInput.addEventListener('input', applyFilters);
  elements.filterSet.addEventListener('change', () => {
    state.filterSetId = elements.filterSet.value;
    applyFilters();
  });
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
}

async function loadGrades() {
  try {
    if (state.filterSetId) {
      state.allGrades = await getGradesByQuestionSet(state.filterSetId);
    } else {
      state.allGrades = await getAllGrades();
    }

    state.filteredGrades = [...state.allGrades];

    // 問題セットフィルタードロップダウンを構築
    buildSetFilter();

    elements.loadingState.hidden = true;
    elements.gradesSection.hidden = false;

    renderGrades();
  } catch (error) {
    console.error('Failed to load grades:', error);
    elements.loadingState.hidden = true;
    elements.gradesSection.hidden = false;
    elements.emptyGrades.hidden = false;
    elements.emptyGrades.textContent = '読み込みに失敗しました。';
  }
}

function buildSetFilter() {
  const sets = new Map();
  state.allGrades.forEach(g => {
    if (g.questionSetId && !sets.has(g.questionSetId)) {
      sets.set(g.questionSetId, g.questionSetTitle || g.shareCode || g.questionSetId);
    }
  });

  elements.filterSet.innerHTML = '<option value="">すべての問題セット</option>';
  sets.forEach((title, id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = title;
    elements.filterSet.appendChild(option);
  });

  if (state.filterSetId) {
    elements.filterSet.value = state.filterSetId;
  }
}

function applyFilters() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const setId = state.filterSetId;

  state.filteredGrades = state.allGrades.filter(g => {
    if (setId && g.questionSetId !== setId) return false;
    if (searchTerm) {
      const name = (g.userName || '').toLowerCase();
      const email = (g.userEmail || '').toLowerCase();
      if (!name.includes(searchTerm) && !email.includes(searchTerm)) return false;
    }
    return true;
  });

  renderGrades();
}

function renderGrades() {
  elements.gradesTbody.innerHTML = '';

  if (state.filteredGrades.length === 0) {
    elements.emptyGrades.hidden = false;
    return;
  }

  elements.emptyGrades.hidden = true;

  state.filteredGrades.forEach(grade => {
    const tr = document.createElement('tr');

    const completedAt = grade.completedAt?.toDate
      ? grade.completedAt.toDate().toLocaleString('ja-JP')
      : '---';

    const timeSpent = formatTime(grade.timeSpentSeconds || 0);

    const pct = grade.percentage || 0;
    const gradeClass = pct >= 80 ? 'grade-high' : pct >= 60 ? 'grade-mid' : 'grade-low';

    tr.innerHTML = `
      <td>${escapeHtml(grade.userName || '不明')}</td>
      <td>${escapeHtml(grade.questionSetTitle || '---')}</td>
      <td><code>${escapeHtml(grade.shareCode || '---')}</code></td>
      <td>${grade.score}/${grade.total}</td>
      <td class="${gradeClass}">${pct}%</td>
      <td>${timeSpent}</td>
      <td>${completedAt}</td>
    `;

    elements.gradesTbody.appendChild(tr);
  });
}

function exportCSV() {
  const grades = state.filteredGrades;
  if (grades.length === 0) {
    alert('出力する成績がありません。');
    return;
  }

  const headers = ['学生名', 'メール', '問題セット', '共有コード', '得点', '満点', '正答率(%)', '所要時間(秒)', '日時'];
  const rows = grades.map(g => [
    g.userName || '',
    g.userEmail || '',
    g.questionSetTitle || '',
    g.shareCode || '',
    g.score,
    g.total,
    g.percentage,
    g.timeSpentSeconds || 0,
    g.completedAt?.toDate ? g.completedAt.toDate().toISOString() : ''
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grades_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatTime(seconds) {
  if (!seconds) return '---';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
