import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-form-message");
const resetLink = document.querySelector("#reset-password-link");

function setMessage(text, isSuccess = false) {
  if (!loginMessage) return;
  loginMessage.textContent = text;
  loginMessage.style.color = isSuccess ? "#176b38" : "#641b2b";
}

// Se já estiver autenticado e ativo, redireciona direto ao painel
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (snap.exists() && snap.data().ativo === true) {
      window.location.href = "painel.html";
    }
  } catch (_) {
    // Ignora na checagem inicial
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  setMessage("Verificando acesso...");

  try {
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    const result = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, "usuarios", result.user.uid));

    if (!snap.exists() || snap.data().ativo !== true) {
      await signOut(auth);
      setMessage("Acesso pendente ou perfil não encontrado. Aguarde a aprovação da administração.");
      return;
    }

    window.location.href = "painel.html";
  } catch (err) {
    console.error("Erro no login:", err);
    const codes = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns instantes e tente novamente.",
      "auth/network-request-failed": "Falha de conexão com a internet."
    };
    setMessage(codes[err?.code] || "Não foi possível entrar. Confira seus dados e tente novamente.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

resetLink?.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = loginForm?.email?.value?.trim();
  if (!email) {
    setMessage("Digite seu e-mail no campo acima antes de solicitar a redefinição de senha.");
    loginForm?.email?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.", true);
  } catch (err) {
    console.error("Erro ao enviar redefinição:", err);
    setMessage("Não foi possível enviar o e-mail de recuperação. Confira o endereço digitado.");
  }
});
