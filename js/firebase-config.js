import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Configuração do Firebase - Portal BMO
export const firebaseConfig = {
  apiKey: "AIzaSyAngLILH0e6EN6uSLU5MCNGZtX2fhvxPck",
  authDomain: "portal-bmo.firebaseapp.com",
  projectId: "portal-bmo",
  storageBucket: "portal-bmo.firebasestorage.app",
  messagingSenderId: "595090656534",
  appId: "1:595090656534:web:b9662c96700ee774d85437",
  measurementId: "G-KQ6VGM0LKN"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
