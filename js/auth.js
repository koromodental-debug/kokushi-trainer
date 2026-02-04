/**
 * 認証モジュール
 * Firebase Auth によるログイン・ログアウト・ロール管理
 */

import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';

/**
 * Googleポップアップサインイン
 */
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // 初回ログイン時にユーザードキュメントを作成
  await createUserDoc(user);

  return user;
}

/**
 * サインアウト → login.htmlへリダイレクト
 */
export async function logout() {
  await signOut(auth);
  window.location.href = 'login.html';
}

/**
 * 未認証ならlogin.htmlへリダイレクト
 * 認証済みのユーザーを返す
 */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = 'login.html';
      } else {
        resolve(user);
      }
    });
  });
}

/**
 * ロール不一致なら適切なページへリダイレクト
 * @param {string} role - 要求されるロール ("admin" | "student")
 */
export async function requireRole(role) {
  const user = await requireAuth();
  const userRole = await getUserRole(user.uid);

  if (userRole !== role) {
    if (userRole === 'admin') {
      window.location.href = 'index.html';
    } else {
      window.location.href = 'student.html';
    }
    return null;
  }

  return user;
}

/**
 * Firestoreからロールを取得
 * @param {string} uid
 * @returns {Promise<string>} "admin" | "student"
 */
export async function getUserRole(uid) {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data().role || 'student';
  }
  return 'student';
}

/**
 * 初回ログイン時にユーザードキュメントを作成
 * 既に存在する場合はlastLoginAtのみ更新
 */
export async function createUserDoc(user) {
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    // 新規ユーザー: role は必ず "student"
    await setDoc(userRef, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: 'student',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    });
  } else {
    // 既存ユーザー: lastLoginAtのみ更新
    await setDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      displayName: user.displayName,
      photoURL: user.photoURL
    }, { merge: true });
  }
}

/**
 * 認証状態確定を待ってコールバックを実行
 * @param {function} callback - (user) => void
 */
export function onAuthReady(callback) {
  onAuthStateChanged(auth, callback);
}

/**
 * 現在のユーザーを取得
 */
export function getCurrentUser() {
  return auth.currentUser;
}
