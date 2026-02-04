/**
 * 管理者 ユーザー管理ページ
 */

import { requireRole, getCurrentUser } from './auth.js';
import { renderAuthHeader } from './nav.js';
import { getAllUsers, updateUserRole } from './firestore.js';

const state = {
  user: null,
  allUsers: [],
  filteredUsers: []
};

const elements = {};

async function init() {
  state.user = await requireRole('admin');
  if (!state.user) return;

  renderAuthHeader(document.getElementById('app-header'), state.user, 'admin');

  elements.loadingState = document.getElementById('loading-state');
  elements.usersSection = document.getElementById('users-section');
  elements.usersContainer = document.getElementById('users-container');
  elements.usersCount = document.getElementById('users-count');
  elements.emptyUsers = document.getElementById('empty-users');
  elements.searchInput = document.getElementById('search-input');

  elements.searchInput.addEventListener('input', applyFilter);

  await loadUsers();
}

async function loadUsers() {
  try {
    state.allUsers = await getAllUsers();
    state.filteredUsers = [...state.allUsers];

    elements.loadingState.hidden = true;
    elements.usersSection.hidden = false;

    renderUsers();
  } catch (error) {
    console.error('Failed to load users:', error);
    elements.loadingState.hidden = true;
    elements.usersSection.hidden = false;
    elements.emptyUsers.hidden = false;
    elements.emptyUsers.textContent = '読み込みに失敗しました。';
  }
}

function applyFilter() {
  const term = elements.searchInput.value.toLowerCase();
  state.filteredUsers = state.allUsers.filter(u => {
    const name = (u.displayName || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return name.includes(term) || email.includes(term);
  });
  renderUsers();
}

function renderUsers() {
  elements.usersCount.textContent = `${state.filteredUsers.length}人`;
  elements.usersContainer.innerHTML = '';

  if (state.filteredUsers.length === 0) {
    elements.emptyUsers.hidden = false;
    return;
  }

  elements.emptyUsers.hidden = true;

  state.filteredUsers.forEach(user => {
    const item = document.createElement('div');
    item.className = 'user-list-item';

    const isAdmin = user.role === 'admin';
    const isSelf = user.id === state.user.uid;
    const roleLabel = isAdmin ? '管理者' : '学生';
    const roleClass = isAdmin ? 'role-admin' : 'role-student';

    const lastLogin = user.lastLoginAt?.toDate
      ? user.lastLoginAt.toDate().toLocaleDateString('ja-JP')
      : '---';

    item.innerHTML = `
      <div class="user-list-info">
        ${user.photoURL
          ? `<img src="${user.photoURL}" alt="" class="user-list-avatar">`
          : '<div class="user-list-avatar" style="width:36px;height:36px;border-radius:50%;background:var(--surface-alt);border:1px solid var(--border-color)"></div>'
        }
        <div class="user-list-details">
          <span class="user-list-name">${escapeHtml(user.displayName || '名前なし')}</span>
          <span class="user-list-email">${escapeHtml(user.email || '')}</span>
          <span class="user-list-email">最終ログイン: ${lastLogin}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="role-badge ${roleClass}">${roleLabel}</span>
        ${isSelf
          ? '<span style="font-size:0.75rem;color:var(--tertiary-label)">自分</span>'
          : `<button class="btn btn-sm ${isAdmin ? 'btn-secondary' : 'btn-warning'} toggle-role-btn"
               data-uid="${user.id}" data-current-role="${user.role}" data-name="${escapeHtml(user.displayName || user.email)}">
               ${isAdmin ? '学生に変更' : '管理者に昇格'}
             </button>`
        }
      </div>
    `;

    elements.usersContainer.appendChild(item);
  });

  // ロール切替ボタン
  elements.usersContainer.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const currentRole = btn.dataset.currentRole;
      const name = btn.dataset.name;
      const newRole = currentRole === 'admin' ? 'student' : 'admin';
      const action = newRole === 'admin' ? '管理者に昇格' : '学生に降格';

      if (!confirm(`${name} を${action}しますか？`)) return;

      try {
        btn.disabled = true;
        btn.textContent = '変更中...';
        await updateUserRole(uid, newRole);

        // ローカル状態を更新
        const userObj = state.allUsers.find(u => u.id === uid);
        if (userObj) userObj.role = newRole;

        renderUsers();
      } catch (error) {
        console.error('Failed to update role:', error);
        alert('ロール変更に失敗しました。');
        btn.disabled = false;
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
