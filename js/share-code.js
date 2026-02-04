/**
 * 共有コード生成モジュール
 * 6文字の一意なコードを生成（紛らわしい文字を除外）
 */

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';

// 紛らわしい文字を除外: O, 0, I, 1, L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * ランダムコードを1つ生成
 */
function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

/**
 * Firestoreで一意性を確認しながら共有コードを生成
 * @returns {Promise<string>} 一意な6文字コード
 */
export async function generateShareCode() {
  let code;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    code = randomCode();
    const q = query(
      collection(db, 'questionSets'),
      where('shareCode', '==', code),
      limit(1)
    );
    const snapshot = await getDocs(q);
    exists = !snapshot.empty;
    attempts++;
  }

  if (exists) {
    throw new Error('共有コードの生成に失敗しました。再度お試しください。');
  }

  return code;
}
