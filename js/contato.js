// Caixa de contato pública: grava em "mensagens" (tipo contato). Sem login.
import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setFormMessage, cooldownRemaining, markSubmitted, normalizeBrPhone, isValidEmail } from "./utils.js";

const form = document.querySelector("#contato-form");
const msg = document.querySelector("#contato-message");
const btn = form?.querySelector('button[type="submit"]');

// O formulário fica fora da página principal e só aparece quando solicitado.
const modal = document.querySelector("#contato-modal");
const openModalButton = document.querySelector("#open-contato-modal");
const closeModalButton = modal?.querySelector(".modal-close");
let previousFocus = null;

function openContactModal() {
  if (!modal) return;
  previousFocus = document.activeElement;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("#ct-nome")?.focus();
}

function closeContactModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  previousFocus?.focus?.();
}

openModalButton?.addEventListener("click", openContactModal);
closeModalButton?.addEventListener("click", closeContactModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeContactModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) {
    closeContactModal();
  }
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (btn?.disabled) return;
  if (form.querySelector("#ct-site")?.value) return; // honeypot

  const nome = form.querySelector("#ct-nome").value.trim().replace(/\s+/g, " ");
  const contato = form.querySelector("#ct-contato").value.trim();
  const assunto = form.querySelector("#ct-assunto").value.trim();
  const mensagem = form.querySelector("#ct-mensagem").value.trim();

  if (nome.length < 2) return setFormMessage(msg, "Informe seu nome.");
  if (!isValidEmail(contato) && !normalizeBrPhone(contato)) {
    return setFormMessage(msg, "Informe um e-mail ou telefone válido (com DDD).");
  }
  if (assunto.length < 3) return setFormMessage(msg, "Informe o assunto.");
  if (mensagem.length < 5) return setFormMessage(msg, "Escreva sua mensagem.");

  const wait = cooldownRemaining("contato");
  if (wait) return setFormMessage(msg, `Aguarde ${wait} segundos antes de enviar novamente.`);

  btn.disabled = true;
  btn.textContent = "Enviando...";
  setFormMessage(msg, "Enviando sua mensagem...", "success");
  try {
    await addDoc(collection(db, "mensagens"), {
      tipo: "contato",
      nome,
      contato: isValidEmail(contato) ? contato : normalizeBrPhone(contato),
      assunto,
      mensagem,
      status: "pendente",
      criadoEm: serverTimestamp()
    });
    markSubmitted("contato");
    form.reset();
    setFormMessage(msg, "Mensagem enviada com sucesso! Entraremos em contato assim que possível.", "success");
  } catch (err) {
    console.error(err);
    setFormMessage(msg, "Não foi possível enviar sua mensagem agora. Tente novamente mais tarde ou use o WhatsApp.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar mensagem";
  }
});
