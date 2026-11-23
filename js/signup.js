import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const requestForm = document.querySelector("#request-form");
const signupMessage = document.querySelector("#signup-form-message");
const submitButton = requestForm?.querySelector('button[type="submit"]');

function showSignupMessage(text, type = "error") {
  if (!signupMessage) return;
  signupMessage.textContent = text;
  signupMessage.style.color = type === "success" ? "#176b38" : "#8b1e2d";
}

requestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requestForm.reportValidity()) return;

  const name = document.querySelector("#name").value.trim();
  const email = document.querySelector("#req-email").value.trim();
  const phone = document.querySelector("#phone").value.trim();
  const requestedProfile = document.querySelector("#profile").value;
  const instrument = document.querySelector("#instrument")?.value.trim() || "";
  const reason = document.querySelector("#reason").value.trim();
  const password = document.querySelector("#new-password").value;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
  }
  showSignupMessage("Conectando ao Firebase e enviando sua solicitação...", "info");

  let createdUser = null;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = credential.user;

    await setDoc(doc(db, "usuarios", createdUser.uid), {
      nome: name,
      email: createdUser.email,
      telefone: phone,
      instrumento: instrument,
      perfil: "pendente",
      perfilSolicitado: requestedProfile,
      observacao: reason,
      ativo: false,
      criadoEm: serverTimestamp()
    });

    await signOut(auth);
    requestForm.reset();
    showSignupMessage("Solicitação registrada com sucesso! Aguarde a análise da administração.", "success");
  } catch (error) {
    console.error("Erro no cadastro do Portal BMO:", error);
    const messages = {
      "auth/email-already-in-use": "Este e-mail já possui cadastro. Tente entrar ou use outro e-mail.",
      "auth/invalid-email": "O e-mail informado é inválido.",
      "auth/weak-password": "A senha é fraca. Use pelo menos 6 caracteres.",
      "auth/operation-not-allowed": "O cadastro por e-mail e senha está desativado no Firebase Authentication.",
      "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente.",
      "permission-denied": "O Firebase Authentication criou a conta, mas o Firestore bloqueou a gravação. Confira as regras do Firestore.",
      "unavailable": "O Firestore está indisponível no momento. Tente novamente."
    };
    const code = error?.code || "";
    const detail = messages[code] || error?.message || "Erro desconhecido.";
    showSignupMessage("Não foi possível concluir o cadastro: " + detail);

    if (createdUser) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.warn("Não foi possível encerrar a sessão após a falha:", signOutError);
      }
      showSignupMessage("A conta foi criada no Authentication, mas os dados não foram gravados no Firestore. " + detail);
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Enviar solicitação";
    }
  }
});
