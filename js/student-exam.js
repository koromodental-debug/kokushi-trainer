/**
 * 学生 試験実施ページ
 * 問題セットから試験を実施し、Firestoreに成績を保存
 */

import { requireRole } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getQuestionSetById, saveGrade } from './firestore.js';

const state = {
  user: null,
  questionSet: null,
  questions: [],
  examState: {
    currentIndex: 0,
    answers: [],
    startTime: null,
    timerInterval: null
  }
};

const elements = {};

async function init() {
  state.user = await requireRole('student');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'student');

  elements.loadingState = document.getElementById('loading-state');
  elements.startSection = document.getElementById('start-section');
  elements.examSection = document.getElementById('exam-section');
  elements.examResultsSection = document.getElementById('exam-results-section');
  elements.errorSection = document.getElementById('error-section');

  // URLパラメータからセットIDを取得
  const params = new URLSearchParams(window.location.search);
  const setId = params.get('setId');

  if (!setId) {
    showError();
    return;
  }

  try {
    state.questionSet = await getQuestionSetById(setId);
    if (!state.questionSet || !state.questionSet.questions) {
      showError();
      return;
    }

    state.questions = state.questionSet.questions;

    // 開始画面を表示
    elements.loadingState.hidden = true;
    elements.startSection.hidden = false;

    document.getElementById('exam-set-title').textContent = state.questionSet.title;
    document.getElementById('exam-set-info').textContent = `${state.questions.length}問 / 共有コード: ${state.questionSet.shareCode}`;

    setupEventListeners();

  } catch (error) {
    console.error('Failed to load question set:', error);
    showError();
  }
}

function setupEventListeners() {
  document.getElementById('start-exam-btn').addEventListener('click', startExam);
  document.getElementById('exam-prev-btn').addEventListener('click', () => navigateExam(-1));
  document.getElementById('exam-next-btn').addEventListener('click', () => navigateExam(1));
  document.getElementById('retry-btn').addEventListener('click', () => {
    elements.examResultsSection.hidden = true;
    startExam();
  });
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'student.html';
  });
}

function showError() {
  elements.loadingState.hidden = true;
  elements.errorSection.hidden = false;
}

function startExam() {
  state.examState = {
    currentIndex: 0,
    answers: new Array(state.questions.length).fill(null),
    startTime: Date.now(),
    timerInterval: null
  };

  elements.startSection.hidden = true;
  elements.examSection.hidden = false;
  elements.examResultsSection.hidden = true;
  elements.examSection.classList.add('fade-in');

  startTimer();
  showExamQuestion(0);
}

function startTimer() {
  const timerEl = document.getElementById('exam-timer');
  state.examState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.examState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function showExamQuestion(index) {
  const question = state.questions[index];
  const total = state.questions.length;

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

function selectAnswer(questionIndex, answer) {
  state.examState.answers[questionIndex] = answer;
  document.querySelectorAll('.exam-choice').forEach(el => {
    el.classList.toggle('selected', el.dataset.answer === answer);
  });
}

function navigateExam(delta) {
  const newIndex = state.examState.currentIndex + delta;
  const total = state.questions.length;

  if (newIndex < 0) return;
  if (newIndex >= total) {
    finishExam();
    return;
  }

  state.examState.currentIndex = newIndex;
  showExamQuestion(newIndex);
}

async function finishExam() {
  if (state.examState.timerInterval) {
    clearInterval(state.examState.timerInterval);
  }

  const timeSpentSeconds = Math.floor((Date.now() - state.examState.startTime) / 1000);

  // 採点
  let correct = 0;
  const answers = state.questions.map((q, i) => {
    const userAnswer = state.examState.answers[i];
    const isCorrect = userAnswer === q.answer;
    if (isCorrect) correct++;
    return {
      questionId: q.id || `q_${i}`,
      userAnswer: userAnswer || '',
      correctAnswer: q.answer,
      isCorrect
    };
  });

  const total = state.questions.length;
  const percentage = Math.round((correct / total) * 100);

  // UIを更新
  elements.examSection.hidden = true;
  elements.examResultsSection.hidden = false;
  elements.examResultsSection.classList.add('fade-in');

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

  // レビューを表示
  const reviewContainer = document.getElementById('exam-review');
  reviewContainer.innerHTML = '';

  answers.forEach((review, i) => {
    const div = document.createElement('div');
    div.className = `review-item ${review.isCorrect ? 'correct' : 'incorrect'}`;
    const questionText = state.questions[i].question;
    div.innerHTML = `
      <div class="review-question">問題${i + 1}: ${escapeHtml(questionText.substring(0, 50))}${questionText.length > 50 ? '...' : ''}</div>
      <div class="review-answer">
        あなたの回答: <span class="${review.isCorrect ? 'correct-answer' : 'your-answer'}">${review.userAnswer || '未回答'}</span>
        ${!review.isCorrect ? `/ 正解: <span class="correct-answer">${review.correctAnswer}</span>` : ''}
      </div>
    `;
    reviewContainer.appendChild(div);
  });

  // Firestoreに成績を保存
  const savingIndicator = document.getElementById('saving-indicator');
  const saveSuccess = document.getElementById('save-success');
  savingIndicator.hidden = false;

  try {
    await saveGrade({
      userId: state.user.uid,
      userName: state.user.displayName || '',
      userEmail: state.user.email || '',
      questionSetId: state.questionSet.id,
      questionSetTitle: state.questionSet.title,
      shareCode: state.questionSet.shareCode,
      score: correct,
      total,
      percentage,
      answers,
      timeSpentSeconds
    });

    savingIndicator.hidden = true;
    saveSuccess.hidden = false;
  } catch (error) {
    console.error('Failed to save grade:', error);
    savingIndicator.hidden = true;
    // 保存失敗しても試験結果は表示する
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
