/**
 * 学生 ホームページ
 * 共有コード入力・問題セット一覧
 */

import { requireRole } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getQuestionSetByShareCode, getMyGrades } from './firestore.js';

// 参加済みセットをlocalStorageで管理
const JOINED_SETS_KEY = 'kokushi_joined_sets';

const state = {
  user: null,
  joinedSets: [], // { id, title, shareCode, questionCount }
  myGrades: []
};

const elements = {};

async function init() {
  state.user = await requireRole('student');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'student');

  elements.loadingState = document.getElementById('loading-state');
  elements.joinSection = document.getElementById('join-section');
  elements.setsSection = document.getElementById('sets-section');
  elements.setsContainer = document.getElementById('sets-container');
  elements.emptySets = document.getElementById('empty-sets');
  elements.shareCodeInput = document.getElementById('share-code-input');
  elements.joinBtn = document.getElementById('join-btn');
  elements.joinError = document.getElementById('join-error');

  setupEventListeners();
  loadJoinedSets();

  // 自分の成績を取得
  try {
    state.myGrades = await getMyGrades(state.user.uid);
  } catch (e) {
    console.error('Failed to load grades:', e);
  }

  elements.loadingState.hidden = true;
  elements.joinSection.hidden = false;
  elements.setsSection.hidden = false;

  renderSets();
}

function setupEventListeners() {
  elements.joinBtn.addEventListener('click', onJoin);
  elements.shareCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onJoin();
  });
  // 自動大文字変換
  elements.shareCodeInput.addEventListener('input', () => {
    elements.shareCodeInput.value = elements.shareCodeInput.value.toUpperCase();
  });
}

async function onJoin() {
  const code = elements.shareCodeInput.value.trim().toUpperCase();
  elements.joinError.hidden = true;

  if (!code || code.length !== 6) {
    showJoinError('6文字の共有コードを入力してください。');
    return;
  }

  // 既に参加済みか確認
  if (state.joinedSets.some(s => s.shareCode === code)) {
    showJoinError('このコードの問題セットには既に参加しています。');
    return;
  }

  elements.joinBtn.disabled = true;
  elements.joinBtn.textContent = '検索中...';

  try {
    const set = await getQuestionSetByShareCode(code);
    if (!set) {
      showJoinError('この共有コードの問題セットが見つかりません。');
      return;
    }

    // 参加リストに追加
    const joinedSet = {
      id: set.id,
      title: set.title,
      shareCode: set.shareCode,
      questionCount: set.questionCount
    };

    state.joinedSets.push(joinedSet);
    saveJoinedSets();

    elements.shareCodeInput.value = '';
    renderSets();

  } catch (error) {
    console.error('Failed to join:', error);
    showJoinError('参加に失敗しました。もう一度お試しください。');
  } finally {
    elements.joinBtn.disabled = false;
    elements.joinBtn.textContent = '参加';
  }
}

function showJoinError(message) {
  elements.joinError.textContent = message;
  elements.joinError.hidden = false;
}

function loadJoinedSets() {
  try {
    const saved = localStorage.getItem(JOINED_SETS_KEY);
    state.joinedSets = saved ? JSON.parse(saved) : [];
  } catch (e) {
    state.joinedSets = [];
  }
}

function saveJoinedSets() {
  localStorage.setItem(JOINED_SETS_KEY, JSON.stringify(state.joinedSets));
}

function renderSets() {
  elements.setsContainer.innerHTML = '';

  if (state.joinedSets.length === 0) {
    elements.emptySets.hidden = false;
    return;
  }

  elements.emptySets.hidden = true;

  state.joinedSets.forEach(set => {
    const card = document.createElement('div');
    card.className = 'set-card';

    // この問題セットの自分の成績を取得
    const mySetGrades = state.myGrades.filter(g => g.questionSetId === set.id);
    const bestGrade = mySetGrades.length > 0
      ? mySetGrades.reduce((best, g) => g.percentage > best.percentage ? g : best, mySetGrades[0])
      : null;

    card.innerHTML = `
      <div class="set-card-header">
        <div class="set-card-title">${escapeHtml(set.title)}</div>
      </div>
      <div class="set-card-meta">
        ${set.questionCount}問
        ${bestGrade ? ` / 最高スコア: ${bestGrade.percentage}%（${mySetGrades.length}回受験）` : ''}
      </div>
      <div class="set-card-footer">
        <span class="share-code-display" style="font-size:0.875rem;padding:4px 12px;">${set.shareCode}</span>
        <div class="set-card-actions">
          <button class="btn btn-accent btn-sm start-exam-btn" data-id="${set.id}">試験を開始</button>
        </div>
      </div>
    `;

    elements.setsContainer.appendChild(card);
  });

  // 試験開始ボタン
  elements.setsContainer.querySelectorAll('.start-exam-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `student-exam.html?setId=${btn.dataset.id}`;
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
