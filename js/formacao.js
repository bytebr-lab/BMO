// Seção pública "Formação Musical": cursos carregados dinamicamente do Firestore.
import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MATRICULA_URL } from "./site-config.js";
import { el, safeImageSrc } from "./utils.js";

const grid = document.querySelector("#formacao-cursos");
const modal = document.querySelector("#curso-modal");
const modalBody = document.querySelector("#curso-modal-body");
let cursos = [];
let lastFocus = null;

function message(text) {
  const p = el("p", "muted", text);
  grid.replaceChildren(p);
}

function cardImage(curso, cls) {
  const src = safeImageSrc(curso.imagem);
  if (src) {
    const img = el("img", cls);
    img.src = src;
    img.alt = `Instrumento: ${curso.nome || "curso"}`;
    img.loading = "lazy";
    return img;
  }
  const ph = el("div", cls + " course-placeholder", "🎼");
  ph.setAttribute("aria-hidden", "true");
  return ph;
}

function textBlock(title, content) {
  if (!content || !String(content).trim()) return null;
  const wrap = el("div", "course-block");
  wrap.append(el("h4", "", title), el("p", "", content));
  return wrap;
}

function openModal(curso) {
  lastFocus = document.activeElement;
  const frag = document.createDocumentFragment();

  frag.append(cardImage(curso, "course-modal-img"));
  const body = el("div", "course-modal-text");
  body.append(el("h3", "", curso.nome || "Curso"));

  if (curso.etapaPosterior) {
    body.append(el("span", "tag tag-amber", "Etapa posterior à formação instrumental individual"));
  }

  [
    textBlock("Apresentação do curso", curso.apresentacao),
    textBlock("Breve história do instrumento", curso.historia),
    textBlock("Características e curiosidades", curso.caracteristicas),
    textBlock("Faixa etária", curso.faixaEtaria),
    textBlock("Requisitos", curso.requisitos)
  ].forEach((b) => b && body.append(b));

  const actions = el("div", "actions course-actions");
  if (curso.inscricoesAbertas === true) {
    const a = el("a", "btn", "Tenho interesse");
    a.href = `pre-inscricao.html?curso=${encodeURIComponent(curso.id)}`;
    actions.append(a);
  } else {
    actions.append(el("p", "muted", "As pré-inscrições para este curso não estão abertas no momento."));
  }
  if (MATRICULA_URL) {
    const m = el("a", "btn btn-outline", "Matrícula");
    m.href = MATRICULA_URL; m.target = "_blank"; m.rel = "noopener noreferrer";
    actions.append(m);
  }
  body.append(actions);
  frag.append(body);

  modalBody.replaceChildren(frag);
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  modal.querySelector(".modal-close")?.focus();
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  lastFocus?.focus?.();
}

function render() {
  const frag = document.createDocumentFragment();
  cursos.forEach((curso) => {
    const card = el("article", "card course-card");
    card.append(cardImage(curso, "course-card-img"));
    card.append(el("h3", "", curso.nome || "Curso"));
    if (curso.etapaPosterior) card.append(el("span", "tag tag-amber", "Etapa posterior à formação instrumental"));
    const resumo = (curso.apresentacao || "").trim();
    card.append(el("p", "", resumo.length > 140 ? resumo.slice(0, 140).trimEnd() + "…" : resumo));
    const btn = el("button", "btn btn-small btn-outline", "Saiba mais");
    btn.type = "button";
    btn.addEventListener("click", () => openModal(curso));
    card.append(btn);
    frag.append(card);
  });
  grid.replaceChildren(frag);
}

async function loadCursos() {
  if (!grid) return;
  try {
    const snap = await getDocs(query(collection(db, "cursos"), where("ativo", "==", true), limit(60)));
    cursos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    if (!cursos.length) return message("Em breve divulgaremos os cursos oferecidos pela escola de música.");
    render();
  } catch (err) {
    console.error("Erro ao carregar cursos:", err);
    message("Não foi possível carregar os cursos no momento. Tente novamente mais tarde.");
  }
}

modal?.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest(".modal-close")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeModal();
});

loadCursos();
