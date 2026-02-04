/**
 * 問題一覧ページ
 * 静的JSONファイルから問題を読み込んで表示・学習
 */

// アプリケーション状態
const state = {
  allQuestions: [],      // 全問題
  filteredQuestions: [], // フィルタ後の問題
  subjectsIndex: null,   // 科目インデックス
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
async function init() {
  showLoading(true);

  try {
    // インデックスを読み込む
    const indexResponse = await fetch('data/questions/index.json');
    if (!indexResponse.ok) throw new Error('Failed to load index');
    state.subjectsIndex = await indexResponse.json();

    // 全科目の問題を読み込む
    const allQuestions = [];
    for (const subject of state.subjectsIndex.subjects) {
      const response = await fetch(`data/questions/${subject.file}`);
      if (response.ok) {
        const data = await response.json();
        allQuestions.push(...data.questions);
      }
    }

    state.allQuestions = allQuestions;
    state.filteredQuestions = [...allQuestions];

    console.log(`Loaded ${allQuestions.length} questions from ${state.subjectsIndex.subjects.length} subjects`);

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

  state.filteredQuestions = state.allQuestions.filter(q => {
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
      ${escapeHtml(question.explanation || '解説なし')}
    </div>
  `;

  header.addEventListener('click', () => {
    item.classList.toggle('expanded');
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
