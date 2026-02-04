/**
 * Firebase 初期化モジュール
 * CDN経由のModular SDKを使用
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-firestore.js';

// Firebase設定
// TODO: デプロイ前に実際のFirebaseプロジェクト設定に置き換えてください
const firebaseConfig = {
  apiKey: "AIzaSyBnFXyFJycOQT9psd_Ha5rAHg-6NIGae58",
  authDomain: "kokoshiclass.firebaseapp.com",
  projectId: "kokoshiclass",
  storageBucket: "kokoshiclass.firebasestorage.app",
  messagingSenderId: "689438092025",
  appId: "1:689438092025:web:47de8f506b561a74a51028",
  measurementId: "G-RJ581Y4VCT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
