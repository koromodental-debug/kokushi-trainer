/**
 * ナビゲーション & ヘッダー描画モジュール
 * ロールに応じた表示切替
 */

import { logout, getCurrentUser, getUserRole } from './auth.js';

/**
 * 認証済みヘッダーを描画
 * @param {HTMLElement} headerEl - .header要素
 * @param {object} user - Firebase Auth user
 * @param {string} role - "admin" | "student"
 * @param {object} options - { showSettings: boolean }
 */
export function renderAuthHeader(headerEl, user, role, options = {}) {
  const isAdmin = role === 'admin';
  const photoURL = user.photoURL || '';
  const displayName = user.displayName || user.email;
  const roleLabel = isAdmin ? '管理者' : '学生';
  const roleClass = isAdmin ? 'role-admin' : 'role-student';

  // ナビゲーションリンク
  const navLinks = isAdmin
    ? [
        { href: 'index.html', label: '問題生成' },
        { href: 'saved.html', label: '問題一覧' },
        { href: 'admin-sets.html', label: '問題セット' },
        { href: 'admin-grades.html', label: '成績' },
        { href: 'admin-users.html', label: 'ユーザー' }
      ]
    : [
        { href: 'student.html', label: 'ホーム' },
        { href: 'student-grades.html', label: '成績' }
      ];

  // 現在のページをハイライト
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  headerEl.innerHTML = `
    <div class="header-left">
      <h1 class="header-title">国試トレーナー</h1>
      <span class="role-badge ${roleClass}">${roleLabel}</span>
    </div>
    <nav class="header-nav">
      ${navLinks.map(link => `
        <a href="${link.href}" class="nav-link ${currentPage === link.href ? 'active' : ''}">${link.label}</a>
      `).join('')}
    </nav>
    <div class="header-right">
      <div class="user-info">
        ${photoURL ? `<img src="${photoURL}" alt="" class="user-avatar">` : '<div class="user-avatar-placeholder"></div>'}
        <span class="user-name">${escapeHtml(displayName)}</span>
      </div>
      ${options.showSettings ? `
        <button id="settings-btn" class="icon-btn" aria-label="設定">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      ` : ''}
      <button id="logout-btn" class="icon-btn" aria-label="ログアウト" title="ログアウト">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  `;

  // ログアウトボタン
  headerEl.querySelector('#logout-btn').addEventListener('click', async () => {
    if (confirm('ログアウトしますか？')) {
      await logout();
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
