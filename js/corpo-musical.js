// Página pública "Corpo Musical": integrantes agrupados por naipe.
import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, safeImageSrc } from "./utils.js";
import { NAIPES_ORDEM } from "./naipes.js";

const container = document.querySelector("#corpo-musical-lista");

function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
}

function memberCard(m) {
  const card = el("article", "card member-card");
  const src = safeImageSrc(m.foto);
  if (src) {
    const img = el("img", "member-photo");
    img.src = src; img.alt = `Foto de ${m.nome}`; img.loading = "lazy";
    card.append(img);
  } else {
    const ph = el("div", "member-photo member-initials", initials(m.nome));
    ph.setAttribute("aria-hidden", "true");
    card.append(ph);
  }
  card.append(el("h4", "", m.nome || ""));
  card.append(el("p", "", m.instrumento || ""));
  if (m.funcao) card.append(el("small", "card-meta", m.funcao));
  return card;
}

async function load() {
  if (!container) return;
  try {
    const snap = await getDocs(query(collection(db, "corpo_musical"), where("ativo", "==", true), limit(300)));
    const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!members.length) {
      container.replaceChildren(el("p", "muted", "Em breve apresentaremos os integrantes da banda."));
      return;
    }
    const groups = new Map();
    members.forEach((m) => {
      const key = (m.naipe || "Outros").trim() || "Outros";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    const rank = (n) => { const i = NAIPES_ORDEM.indexOf(n); return i === -1 ? 999 : i; };
    const names = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR"));

    const frag = document.createDocumentFragment();
    names.forEach((naipe) => {
      const sec = el("section", "naipe-group");
      const list = groups.get(naipe).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
      const h = el("h3", "naipe-title", naipe);
      h.append(el("span", "naipe-count", String(list.length)));
      const grid = el("div", "members-grid");
      list.forEach((m) => grid.append(memberCard(m)));
      sec.append(h, grid);
      frag.append(sec);
    });
    container.replaceChildren(frag);
  } catch (err) {
    console.error("Erro ao carregar corpo musical:", err);
    container.replaceChildren(el("p", "muted", "Não foi possível carregar os integrantes no momento."));
  }
}
load();
