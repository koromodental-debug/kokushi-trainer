/**
 * Firestore データ操作モジュール
 * 問題セット・成績・ユーザー管理のCRUD
 */

import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, limit
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';
import { generateShareCode } from './share-code.js';

// ========================
// 問題セット CRUD
// ========================

/**
 * 問題セットを作成
 * @param {object} data - { title, description, questions, createdBy }
 * @returns {Promise<string>} docId
 */
export async function createQuestionSet(data) {
  const shareCode = await generateShareCode();

  const docRef = await addDoc(collection(db, 'questionSets'), {
    title: data.title,
    description: data.description || '',
    shareCode,
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
    questionCount: data.questions.length,
    questions: data.questions
  });

  return docRef.id;
}

/**
 * 管理者の問題セット一覧を取得
 * @param {string} uid - 管理者のUID
 */
export async function getQuestionSets(uid) {
  const q = query(
    collection(db, 'questionSets'),
    where('createdBy', '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 全問題セットを取得（管理者用）
 */
export async function getAllQuestionSets() {
  const q = query(
    collection(db, 'questionSets'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 共有コードで問題セットを取得
 * @param {string} code
 */
export async function getQuestionSetByShareCode(code) {
  const q = query(
    collection(db, 'questionSets'),
    where('shareCode', '==', code.toUpperCase()),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * 問題セットをIDで取得
 */
export async function getQuestionSetById(id) {
  const d = await getDoc(doc(db, 'questionSets', id));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data() };
}

/**
 * 問題セットを更新
 */
export async function updateQuestionSet(id, data) {
  await updateDoc(doc(db, 'questionSets', id), data);
}

/**
 * 問題セットを削除
 */
export async function deleteQuestionSet(id) {
  await deleteDoc(doc(db, 'questionSets', id));
}

// ========================
// 成績 CRUD
// ========================

/**
 * 成績を保存
 * @param {object} data
 */
export async function saveGrade(data) {
  const docRef = await addDoc(collection(db, 'grades'), {
    userId: data.userId,
    userName: data.userName,
    userEmail: data.userEmail,
    questionSetId: data.questionSetId,
    questionSetTitle: data.questionSetTitle,
    shareCode: data.shareCode,
    score: data.score,
    total: data.total,
    percentage: data.percentage,
    answers: data.answers,
    completedAt: serverTimestamp(),
    timeSpentSeconds: data.timeSpentSeconds
  });
  return docRef.id;
}

/**
 * 自分の成績一覧を取得
 * @param {string} userId
 */
export async function getMyGrades(userId) {
  const q = query(
    collection(db, 'grades'),
    where('userId', '==', userId),
    orderBy('completedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 全成績を取得（管理者用）
 */
export async function getAllGrades() {
  const q = query(
    collection(db, 'grades'),
    orderBy('completedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * 問題セット別の成績を取得
 * @param {string} questionSetId
 */
export async function getGradesByQuestionSet(questionSetId) {
  const q = query(
    collection(db, 'grades'),
    where('questionSetId', '==', questionSetId),
    orderBy('completedAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ========================
// ユーザー管理
// ========================

/**
 * 全ユーザーを取得（管理者用）
 */
export async function getAllUsers() {
  const q = query(
    collection(db, 'users'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * ユーザーのロールを更新
 * @param {string} uid
 * @param {string} role - "admin" | "student"
 */
export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, 'users', uid), { role });
}
