// 德化廟務：背景推播（App 沒開時，由這裡顯示通知；點通知會打開 App）
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyAnEEFWFIh925VP9Zk2QYAYcMoUxyWCrtI',
  authDomain: 'dehua-temple-managers-ap-ab58a.firebaseapp.com',
  projectId: 'dehua-temple-managers-ap-ab58a',
  storageBucket: 'dehua-temple-managers-ap-ab58a.firebasestorage.app',
  messagingSenderId: '1066790243199',
  appId: '1:1066790243199:web:e1762e1b3fdfd7f6ac284a'
});
firebase.messaging();
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
