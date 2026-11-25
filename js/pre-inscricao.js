// Formulário público de pré-inscrição (sem login, sem criação de conta).
import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, limit, doc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  el, maskPhoneInput, normalizeBrPhone, isValidBirthDate, setFormMessage,
  cooldownRemaining, markSubmitted
} from "./utils.js";

const form = document.querySelector("#preinscricao-form");
const msg = document.querySelector("#preinscricao-message");
const select = document.querySelector("#pi-curso");
const submitBtn = form?.querySelector('button[type="submit"]');
const successBox = document.querySelector("#preinscricao-success");
const params = new URLSearchParams(location.search);
let cursos = [];

maskPhoneInput(document.querySelector("#pi-telefone"));
maskPhoneInput(document.querySelector("#pi-whatsapp"));
const birthInput = document.querySelector("#pi-nascimento");
if (birthInput) birthInput.max = new Date().toISOString().slice(0, 10);

async function loadCursos() {
  try {
    const snap = await getDocs(query(collection(db, "cursos"), where("ativo", "==", true), limit(60)));
    cursos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.inscricoesAbertas === true)
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    select.replaceChildren(new Option("Selecione o curso", ""));
    cursos.forEach((c) => select.append(new Option(c.nome, c.id)));
    const wanted = params.get("curso");
    if (wanted && cursos.some((c) => c.id === wanted)) select.value = wanted;
    if (!cursos.length) {
      setFormMessage(msg, "No momento não há cursos com pré-inscrição aberta.");
      if (submitBtn) submitBtn.disabled = true;
    }
  } catch (err) {
    console.error(err);
    select.replaceChildren(new Option("Não foi possível carregar os cursos", ""));
    setFormMessage(msg, "Não foi possível carregar os cursos. Tente novamente mais tarde.");
    if (submitBtn) submitBtn.disabled = true;
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitBtn?.disabled) return;
  // Honeypot: robôs costumam preencher campos ocultos.
  if (form.querySelector("#pi-site")?.value) return;

  const nome = form.querySelector("#pi-nome").value.trim().replace(/\s+/g, " ");
  const nascimento = birthInput.value;
  const telefone = normalizeBrPhone(form.querySelector("#pi-telefone").value);
  const whatsappRaw = form.querySelector("#pi-whatsapp").value.trim();
  const whatsapp = whatsappRaw ? normalizeBrPhone(whatsappRaw) : "";
  const cursoId = select.value;
  const curso = cursos.find((c) => c.id === cursoId);
  const mensagem = form.querySelector("#pi-mensagem").value.trim();

  if (nome.length < 3 || !nome.includes(" ")) return setFormMessage(msg, "Informe seu nome completo.");
  if (!isValidBirthDate(nascimento)) return setFormMessage(msg, "Informe uma data de nascimento válida.");
  if (!telefone) return setFormMessage(msg, "Informe um telefone válido com DDD. Ex.: (91) 99999-9999.");
  if (whatsappRaw && !whatsapp) return setFormMessage(msg, "O número de WhatsApp informado é inválido. Confira o DDD e o número.");
  if (!curso) return setFormMessage(msg, "Selecione o curso desejado.");

  const wait = cooldownRemaining("inscricao");
  if (wait) return setFormMessage(msg, `Aguarde ${wait} segundos antes de enviar novamente.`);

  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";
  setFormMessage(msg, "Enviando sua pré-inscrição...", "success");

  try {
    // ID determinístico (curso + telefone + dia): impede duplicatas acidentais, pois o público só pode CRIAR.
    const id = `${cursoId}_${telefone}_${todayKey()}`;
    await setDoc(doc(db, "inscricoes", id), {
      tipo: "inscricao",
      nome,
      dataNascimento: nascimento,
      telefone,
      whatsapp: whatsapp || telefone,
      cursoId,
      cursoNome: curso.nome,
      mensagem,
      status: "pendente",
      criadoEm: serverTimestamp()
    });
    markSubmitted("inscricao");
    form.reset();
    if (cursoId) select.value = "";
    form.classList.add("hidden");
    successBox?.classList.remove("hidden");
    successBox?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    console.error(err);
    if (err?.code === "permission-denied") {
      setFormMessage(msg, "Não foi possível registrar. Se você já enviou o interesse neste curso hoje, não precisa reenviar: a administração entrará em contato. Caso contrário, tente novamente mais tarde.");
    } else {
      setFormMessage(msg, "Não foi possível enviar agora. Verifique sua conexão e tente novamente.");
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar pré-inscrição";
  }
});

document.querySelector("#nova-preinscricao")?.addEventListener("click", () => {
  successBox.classList.add("hidden");
  form.classList.remove("hidden");
  setFormMessage(msg, "");
});

loadCursos();
