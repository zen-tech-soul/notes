// Firebase init (CDN modules) — project: notes-zen
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  "apiKey": "AIzaSyAeUZAMXa_-o3jE8qLb41NSSC8W8bzsg20",
  "authDomain": "notes-zen.firebaseapp.com",
  "projectId": "notes-zen",
  "storageBucket": "notes-zen.firebasestorage.app",
  "messagingSenderId": "644235629424",
  "appId": "1:644235629424:web:668a503d414654fad5f5b5",
  "measurementId": "G-B7R8RVCWSD"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Offline cache (best-effort; may fail with multi-tab)
enableIndexedDbPersistence(db).catch(() => {});

export const nowTs = () => serverTimestamp();
