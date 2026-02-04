/**
 * 学生 成績履歴ページ
 */

import { requireRole } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getMyGrades } from './firestore.js';

const state = {
  user: null,
  grades: []
};

const elements = {};

async function init() {
  state.user = await requireRole('student');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'student');

  elements.loadingState = document.getElementById('loading-state');
  elements.gradesSection = document.getElementById('grades-section');
  elements.gradesTbody = document.getElementById('grades-tbody');
  elements.emptyGrades = document.getElementById('empty-grades');
  elements.gradesSummary = document.getElementById('grades-summary');

  await loadGrades();
}

async function loadGrades() {
  try {
    state.grades = await getMyGrades(state.user.uid);

    elements.loadingState.hidden = true;
    elements.gradesSection.hidden = false;

    if (state.grades.length === 0) {
      elements.emptyGrades.hidden = false;
      return;
    }

    renderSummary();
    renderGrades();
  } catch (error) {
    console.error('Failed to load grades:', error);
    elements.loadingState.hidden = true;
    elements.gradesSection.hidden = false;
    elements.emptyGrades.hidden = false;
    elements.emptyGrades.textContent = '読み込みに失敗しました。';
  }
}

function renderSummary() {
  const totalExams = state.grades.length;
  const avgPercentage = Math.round(
    state.grades.reduce((sum, g) => sum + (g.percentage || 0), 0) / totalExams
  );
  const bestGrade = state.grades.reduce((best, g) =>
    (g.percentage || 0) > (best.percentage || 0) ? g : best, state.grades[0]
  );

  const avgClass = avgPercentage >= 80 ? 'grade-high' : avgPercentage >= 60 ? 'grade-mid' : 'grade-low';

  elements.gradesSummary.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;padding:16px;background:var(--surface-alt);border-radius:var(--radius-md);text-align:center;">
        <div style="font-size:0.8125rem;color:var(--secondary-label);margin-bottom:4px;">受験回数</div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--system-blue);">${totalExams}</div>
      </div>
      <div style="flex:1;min-width:120px;padding:16px;background:var(--surface-alt);border-radius:var(--radius-md);text-align:center;">
        <div style="font-size:0.8125rem;color:var(--secondary-label);margin-bottom:4px;">平均正答率</div>
        <div class="${avgClass}" style="font-size:1.5rem;font-weight:700;">${avgPercentage}%</div>
      </div>
      <div style="flex:1;min-width:120px;padding:16px;background:var(--surface-alt);border-radius:var(--radius-md);text-align:center;">
        <div style="font-size:0.8125rem;color:var(--secondary-label);margin-bottom:4px;">最高スコア</div>
        <div class="grade-high" style="font-size:1.5rem;font-weight:700;">${bestGrade.percentage || 0}%</div>
      </div>
    </div>
  `;
}

function renderGrades() {
  elements.gradesTbody.innerHTML = '';

  state.grades.forEach(grade => {
    const tr = document.createElement('tr');

    const completedAt = grade.completedAt?.toDate
      ? grade.completedAt.toDate().toLocaleString('ja-JP')
      : '---';

    const timeSpent = formatTime(grade.timeSpentSeconds || 0);

    const pct = grade.percentage || 0;
    const gradeClass = pct >= 80 ? 'grade-high' : pct >= 60 ? 'grade-mid' : 'grade-low';

    tr.innerHTML = `
      <td>${escapeHtml(grade.questionSetTitle || '---')}</td>
      <td>${grade.score}/${grade.total}</td>
      <td class="${gradeClass}">${pct}%</td>
      <td>${timeSpent}</td>
      <td>${completedAt}</td>
    `;

    elements.gradesTbody.appendChild(tr);
  });
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
