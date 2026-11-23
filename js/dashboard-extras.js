// Painel administrativo — módulos adicionais: Gerenciar Cursos, Gerenciar Corpo Musical e
// Inscrições e Mensagens. Roda em paralelo ao dashboard.js (que não foi alterado) e só é ativado
// para o perfil "administrador" ativo. A navegação entre abas e o botão "Cancelar" já são tratados
// pelo dashboard.js (atributos data-view / data-cancel).
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { NAIPES_ORDEM } from "./naipes.js";
import {
  el, safeImageSrc, imageFileToDataUrl, timestampValue, formatDateTime, formatBirth,
  formatBrPhone, whatsappLink
} from "./utils.js";

const $ = (s) => document.querySelector(s);
let currentUser = null;
let cachedCourses = [];
let cachedMembers = [];
let cachedInbox = [];
let started = false;

function notify(msg) {
  let toast = document.querySelector(".toast-banner");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast-banner";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function actionBtn(label, variant, onClick) {
  const b = el("button", `btn btn-small ${variant}`, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function row({ title, detail, sub, extra, tag, tagClass = "", actions = [], thumb }) {
  const r = el("div", "data-row" + (thumb !== undefined ? " with-thumb" : ""));
  if (thumb !== undefined) {
    const src = safeImageSrc(thumb);
    if (src) { const i = el("img", "admin-thumb"); i.src = src; i.alt = ""; r.append(i); }
    else r.append(el("div", "admin-thumb course-placeholder", "🎼"));
  }
  const left = el("div");
  left.append(el("h3", "", title));
  if (detail) left.append(el("p", "", detail));
  if (sub) left.append(el("p", "row-sub", sub));
  if (extra) left.append(el("p", "msg-body", extra));
  r.append(left);
  const right = el("div", "row-right");
  if (tag) right.append(el("span", "tag " + tagClass, tag));
  actions.forEach((a) => right.append(a));
  r.append(right);
  return r;
}

function wireImagePicker({ fileSel, previewSel, removeSel, urlSel, maxSide, state }) {
  const file = $(fileSel), preview = $(previewSel), remove = $(removeSel), url = urlSel ? $(urlSel) : null;
  const refresh = () => {
    const src = safeImageSrc(state.value);
    if (src) { preview.src = src; preview.classList.remove("hidden"); remove.classList.remove("hidden"); }
    else { preview.removeAttribute("src"); preview.classList.add("hidden"); remove.classList.add("hidden"); }
  };
  file.addEventListener("change", async () => {
    if (!file.files[0]) return;
    try {
      state.value = await imageFileToDataUrl(file.files[0], maxSide);
      if (url) url.value = "";
      refresh();
    } catch (err) {
      notify(err.message || "Não foi possível usar essa imagem.");
      file.value = "";
    }
  });
  url?.addEventListener("input", () => {
    const v = url.value.trim();
    state.value = /^https:\/\//i.test(v) ? v : (state.value.startsWith("data:") ? state.value : "");
    refresh();
  });
  remove.addEventListener("click", () => { state.value = ""; file.value = ""; if (url) url.value = ""; refresh(); });
  return { refresh, set(v) { state.value = v || ""; file.value = ""; if (url) url.value = /^https:\/\//i.test(state.value) ? state.value : ""; refresh(); } };
}

// ============================ CURSOS ============================
const courseImage = { value: "" };
let coursePicker;

const COURSE_SEED = [
  { nome: "Curso de Musicalização", ordem: 10, apresentacao: "Primeiro contato com a música: ritmo, percepção sonora, canto e noções básicas de teoria, de forma lúdica e acolhedora.", etapaPosterior: false },
  { nome: "Curso de Flauta Doce", ordem: 20, apresentacao: "Iniciação instrumental com a flauta doce, desenvolvendo leitura musical, respiração e coordenação.", etapaPosterior: false },
  { nome: "Curso de Trompete", ordem: 30, apresentacao: "Formação instrumental individual no trompete, instrumento de metal fundamental no repertório da banda.", etapaPosterior: false },
  { nome: "Curso de Saxofone", ordem: 40, apresentacao: "Formação instrumental individual no saxofone, com técnica, leitura e repertório.", etapaPosterior: false },
  { nome: "Prática de Banda", ordem: 50, apresentacao: "Vivência do conjunto: ensaio coletivo, repertório e execução em grupo. É a etapa posterior à formação instrumental individual, conforme a organização pedagógica da instituição.", etapaPosterior: true }
];

async function loadCourses() {
  const target = $("#courses-list");
  try {
    const snap = await getDocs(query(collection(db, "cursos"), limit(100)));
    cachedCourses = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    $("#seed-courses").classList.toggle("hidden", cachedCourses.length > 0);
    target.replaceChildren();
    if (!cachedCourses.length) {
      target.append(el("p", "muted", "Nenhum curso cadastrado. Use \"+ Novo curso\" ou \"Cadastrar cursos iniciais\"."));
      return;
    }
    cachedCourses.forEach((c) => {
      const flags = [];
      if (c.etapaPosterior) flags.push("Etapa posterior à formação instrumental");
      flags.push(c.inscricoesAbertas ? "Pré-inscrições abertas" : "Pré-inscrições fechadas");
      const toggle = actionBtn(c.ativo ? "Desativar" : "Ativar", "btn-outline", async () => {
        try { await updateDoc(doc(db, "cursos", c.id), { ativo: !c.ativo }); notify(c.ativo ? "Curso desativado." : "Curso ativado."); await loadCourses(); }
        catch (err) { console.error(err); notify("Não foi possível alterar o curso."); }
      });
      const edit = actionBtn("Editar", "btn-outline", () => openCourseForm(c));
      const del = actionBtn("Excluir", "btn-danger", async () => {
        if (!confirm(`Excluir o curso "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
        try { await deleteDoc(doc(db, "cursos", c.id)); notify("Curso excluído."); await loadCourses(); }
        catch (err) { console.error(err); notify("Não foi possível excluir o curso."); }
      });
      target.append(row({
        title: c.nome || "Curso",
        detail: (c.apresentacao || "").slice(0, 140),
        sub: flags.join(" • "),
        tag: c.ativo ? "Ativo" : "Inativo",
        tagClass: c.ativo ? "tag-green" : "tag-amber",
        actions: [toggle, edit, del],
        thumb: c.imagem || ""
      }));
    });
  } catch (err) {
    console.error(err);
    target.replaceChildren(el("p", "muted", "Não foi possível carregar os cursos."));
  }
}

function openCourseForm(c) {
  const f = $("#course-form");
  f.reset();
  $("#course-edit-id").value = c?.id || "";
  $("#course-form-title").textContent = c ? "Editar curso" : "Cadastrar curso";
  $("#course-name").value = c?.nome || "";
  $("#course-intro").value = c?.apresentacao || "";
  $("#course-history").value = c?.historia || "";
  $("#course-traits").value = c?.caracteristicas || "";
  $("#course-age").value = c?.faixaEtaria || "";
  $("#course-reqs").value = c?.requisitos || "";
  $("#course-order").value = c?.ordem ?? 10;
  $("#course-active").checked = c ? c.ativo === true : true;
  $("#course-open").checked = c ? c.inscricoesAbertas === true : true;
  $("#course-later").checked = c?.etapaPosterior === true;
  coursePicker.set(c?.imagem || "");
  f.classList.remove("hidden");
  $("#course-name").focus();
}

function initCourses() {
  coursePicker = wireImagePicker({
    fileSel: "#course-image-file", previewSel: "#course-image-preview", removeSel: "#course-image-remove",
    urlSel: "#course-image-url", maxSide: 800, state: courseImage
  });
  $("#new-course").addEventListener("click", () => {
    const f = $("#course-form");
    if (!f.classList.contains("hidden") && !$("#course-edit-id").value) return f.classList.add("hidden");
    openCourseForm(null);
  });
  $("#course-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = $("#course-edit-id").value;
    const payload = {
      nome: $("#course-name").value.trim(),
      apresentacao: $("#course-intro").value.trim(),
      historia: $("#course-history").value.trim(),
      caracteristicas: $("#course-traits").value.trim(),
      faixaEtaria: $("#course-age").value.trim(),
      requisitos: $("#course-reqs").value.trim(),
      imagem: courseImage.value || "",
      ordem: Number($("#course-order").value) || 0,
      ativo: $("#course-active").checked,
      inscricoesAbertas: $("#course-open").checked,
      etapaPosterior: $("#course-later").checked
    };
    if (!payload.nome || !payload.apresentacao) return notify("Informe o nome e a apresentação do curso.");
    try {
      if (editId) { await updateDoc(doc(db, "cursos", editId), { ...payload, atualizadoEm: serverTimestamp() }); notify("Curso atualizado."); }
      else { await addDoc(collection(db, "cursos"), { ...payload, criadoPor: currentUser.uid, criadoEm: serverTimestamp() }); notify("Curso cadastrado."); }
      e.target.reset(); coursePicker.set(""); e.target.classList.add("hidden");
      await loadCourses();
    } catch (err) {
      console.error(err);
      notify("Não foi possível salvar o curso. A imagem pode ser grande demais — tente outra.");
    }
  });
  $("#seed-courses").addEventListener("click", async () => {
    if (!confirm("Cadastrar os 5 cursos iniciais (Musicalização, Flauta Doce, Trompete, Saxofone e Prática de Banda)? Você poderá editá-los depois.")) return;
    try {
      for (const c of COURSE_SEED) {
        await addDoc(collection(db, "cursos"), {
          ...c, historia: "", caracteristicas: "", faixaEtaria: "", requisitos: "", imagem: "",
          ativo: true, inscricoesAbertas: true, criadoPor: currentUser.uid, criadoEm: serverTimestamp()
        });
      }
      notify("Cursos iniciais cadastrados. Complete história, imagem e requisitos editando cada curso.");
      await loadCourses();
    } catch (err) { console.error(err); notify("Não foi possível cadastrar os cursos iniciais."); }
  });
  loadCourses();
}

// ============================ CORPO MUSICAL ============================
const memberPhoto = { value: "" };
let memberPicker;

function renderMembers() {
  const target = $("#members-list");
  const term = ($("#members-search").value || "").toLowerCase().trim();
  const naipe = $("#members-filter-naipe").value;
  const list = cachedMembers.filter((m) =>
    (!term || (m.nome || "").toLowerCase().includes(term) || (m.instrumento || "").toLowerCase().includes(term)) &&
    (!naipe || m.naipe === naipe));
  target.replaceChildren();
  if (!list.length) return target.append(el("p", "muted", cachedMembers.length ? "Nenhum integrante encontrado com esse filtro." : "Nenhum integrante cadastrado ainda."));
  list.forEach((m) => {
    const toggle = actionBtn(m.ativo ? "Ocultar" : "Exibir", "btn-outline", async () => {
      try { await updateDoc(doc(db, "corpo_musical", m.id), { ativo: !m.ativo }); notify(m.ativo ? "Integrante ocultado." : "Integrante exibido."); await loadMembers(); }
      catch (err) { console.error(err); notify("Não foi possível alterar o integrante."); }
    });
    const edit = actionBtn("Editar", "btn-outline", () => openMemberForm(m));
    const del = actionBtn("Remover", "btn-danger", async () => {
      if (!confirm(`Remover "${m.nome}" do corpo musical?`)) return;
      try { await deleteDoc(doc(db, "corpo_musical", m.id)); notify("Integrante removido."); await loadMembers(); }
      catch (err) { console.error(err); notify("Não foi possível remover."); }
    });
    target.append(row({
      title: m.nome || "Integrante",
      detail: `${m.instrumento || ""}${m.funcao ? " • " + m.funcao : ""}`,
      sub: `Naipe: ${m.naipe || "—"}`,
      tag: m.ativo ? "Visível" : "Oculto",
      tagClass: m.ativo ? "tag-green" : "tag-amber",
      actions: [toggle, edit, del],
      thumb: m.foto || ""
    }));
  });
}

function refreshNaipeOptions() {
  const names = new Set(NAIPES_ORDEM);
  cachedMembers.forEach((m) => m.naipe && names.add(m.naipe));
  const list = $("#naipes-sugestoes");
  list.replaceChildren(...[...names].map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  const sel = $("#members-filter-naipe");
  const current = sel.value;
  const used = [...new Set(cachedMembers.map((m) => m.naipe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  sel.replaceChildren(new Option("Todos os naipes", ""), ...used.map((n) => new Option(n, n)));
  sel.value = used.includes(current) ? current : "";
}

async function loadMembers() {
  try {
    const snap = await getDocs(query(collection(db, "corpo_musical"), limit(400)));
    cachedMembers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.naipe || "").localeCompare(b.naipe || "", "pt-BR") || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    refreshNaipeOptions();
    renderMembers();
  } catch (err) {
    console.error(err);
    $("#members-list").replaceChildren(el("p", "muted", "Não foi possível carregar os integrantes."));
  }
}

function openMemberForm(m) {
  const f = $("#member-form");
  f.reset();
  $("#member-edit-id").value = m?.id || "";
  $("#member-form-title").textContent = m ? "Editar integrante" : "Cadastrar integrante";
  $("#member-name").value = m?.nome || "";
  $("#member-instrument").value = m?.instrumento || "";
  $("#member-naipe").value = m?.naipe || "";
  $("#member-role").value = m?.funcao || "";
  $("#member-active").checked = m ? m.ativo === true : true;
  memberPicker.set(m?.foto || "");
  f.classList.remove("hidden");
  $("#member-name").focus();
}

function initMembers() {
  memberPicker = wireImagePicker({
    fileSel: "#member-photo-file", previewSel: "#member-photo-preview", removeSel: "#member-photo-remove",
    maxSide: 360, state: memberPhoto
  });
  $("#new-member").addEventListener("click", () => {
    const f = $("#member-form");
    if (!f.classList.contains("hidden") && !$("#member-edit-id").value) return f.classList.add("hidden");
    openMemberForm(null);
  });
  $("#members-search").addEventListener("input", renderMembers);
  $("#members-filter-naipe").addEventListener("change", renderMembers);
  $("#member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = $("#member-edit-id").value;
    const payload = {
      nome: $("#member-name").value.trim(),
      instrumento: $("#member-instrument").value.trim(),
      naipe: $("#member-naipe").value.trim(),
      funcao: $("#member-role").value.trim(),
      foto: memberPhoto.value || "",
      ativo: $("#member-active").checked
    };
    if (!payload.nome || !payload.instrumento || !payload.naipe) return notify("Informe nome, instrumento e naipe.");
    try {
      if (editId) { await updateDoc(doc(db, "corpo_musical", editId), { ...payload, atualizadoEm: serverTimestamp() }); notify("Integrante atualizado."); }
      else { await addDoc(collection(db, "corpo_musical"), { ...payload, criadoPor: currentUser.uid, criadoEm: serverTimestamp() }); notify("Integrante cadastrado."); }
      e.target.reset(); memberPicker.set(""); e.target.classList.add("hidden");
      await loadMembers();
    } catch (err) { console.error(err); notify("Não foi possível salvar o integrante."); }
  });
  loadMembers();
}

// ============================ CAIXA DE MENSAGENS ============================
const STATUS = {
  pendente: { label: "Pendente", cls: "tag-amber" },
  em_atendimento: { label: "Em atendimento", cls: "" },
  concluida: { label: "Concluída", cls: "tag-green" }
};

function updateBadge() {
  const n = cachedInbox.filter((i) => (i.status || "pendente") === "pendente").length;
  const b = $("#inbox-badge");
  b.textContent = String(n);
  b.classList.toggle("hidden", n === 0);
}

function waText(item) {
  if (item.tipo === "inscricao") {
    return `Olá! Aqui é da Banda Milícia Odivelense. Recebemos seu interesse no curso de ${item.cursoNome || "música"} e gostaríamos de conversar sobre sua inscrição.`;
  }
  return `Olá! Aqui é da Banda Milícia Odivelense. Recebemos sua mensagem${item.assunto ? ` sobre "${item.assunto}"` : ""} e gostaríamos de conversar com você.`;
}

function renderInbox() {
  const target = $("#inbox-list");
  const term = ($("#inbox-search").value || "").toLowerCase().trim();
  const type = $("#inbox-filter-type").value;
  const status = $("#inbox-filter-status").value;
  const list = cachedInbox.filter((i) => {
    if (type && i.tipo !== type) return false;
    if (status && (i.status || "pendente") !== status) return false;
    if (!term) return true;
    return [i.nome, i.cursoNome, i.telefone, i.whatsapp, i.contato, i.assunto, i.mensagem]
      .some((v) => (v || "").toLowerCase().includes(term));
  });
  target.replaceChildren();
  if (!list.length) return target.append(el("p", "muted", cachedInbox.length ? "Nada encontrado com esse filtro." : "Nenhuma inscrição ou mensagem recebida ainda."));

  list.forEach((i) => {
    const coll = i.tipo === "inscricao" ? "inscricoes" : "mensagens";
    const st = i.status || "pendente";
    const select = document.createElement("select");
    select.className = "status-select";
    select.setAttribute("aria-label", "Alterar status");
    Object.entries(STATUS).forEach(([v, s]) => select.append(new Option(s.label, v)));
    select.value = STATUS[st] ? st : "pendente";
    select.addEventListener("change", async () => {
      try { await updateDoc(doc(db, coll, i.id), { status: select.value }); i.status = select.value; notify("Status atualizado."); updateBadge(); renderInbox(); }
      catch (err) { console.error(err); notify("Não foi possível atualizar o status."); select.value = st; }
    });

    const actions = [select];
    const phone = i.tipo === "inscricao" ? (i.whatsapp || i.telefone) : i.contato;
    const wa = whatsappLink(phone, waText(i));
    if (wa) {
      const a = el("a", "btn btn-small", "Conversar pelo WhatsApp");
      a.href = wa; a.target = "_blank"; a.rel = "noopener noreferrer";
      actions.push(a);
    } else if (i.contato && i.contato.includes("@")) {
      const a = el("a", "btn btn-small btn-outline", "Responder por e-mail");
      a.href = `mailto:${i.contato}?subject=${encodeURIComponent("Re: " + (i.assunto || "Contato Banda Milícia Odivelense"))}`;
      actions.push(a);
    }
    actions.push(actionBtn("Excluir", "btn-danger", async () => {
      if (!confirm(`Excluir este registro de ${i.nome}? Esta ação não pode ser desfeita.`)) return;
      try { await deleteDoc(doc(db, coll, i.id)); notify("Registro excluído."); await loadInbox(); }
      catch (err) { console.error(err); notify("Não foi possível excluir."); }
    }));

    let detail, extra = i.mensagem || "";
    if (i.tipo === "inscricao") {
      detail = `Curso: ${i.cursoNome || "—"} • Tel: ${formatBrPhone(i.telefone)}` +
        (i.whatsapp && i.whatsapp !== i.telefone ? ` • WhatsApp: ${formatBrPhone(i.whatsapp)}` : "") +
        ` • Nascimento: ${formatBirth(i.dataNascimento)}`;
    } else {
      detail = `Assunto: ${i.assunto || "—"} • Contato: ${i.contato && !i.contato.includes("@") ? formatBrPhone(i.contato) : (i.contato || "—")}`;
    }
    target.append(row({
      title: `${i.nome || "Sem nome"} — ${i.tipo === "inscricao" ? "Pré-inscrição" : "Mensagem de contato"}`,
      detail,
      sub: `Recebida em ${formatDateTime(i.criadoEm)}`,
      extra,
      tag: STATUS[st]?.label || st,
      tagClass: STATUS[st]?.cls || "",
      actions
    }));
  });
}

async function loadInbox() {
  const target = $("#inbox-list");
  try {
    const [a, b] = await Promise.all([
      getDocs(query(collection(db, "inscricoes"), limit(300))),
      getDocs(query(collection(db, "mensagens"), limit(300)))
    ]);
    const norm = (snap, tipo) => snap.docs.map((d) => ({ tipo, ...d.data(), id: d.id }));
    cachedInbox = [...norm(a, "inscricao"), ...norm(b, "contato")]
      .sort((x, y) => timestampValue(y.criadoEm) - timestampValue(x.criadoEm));
    updateBadge();
    renderInbox();
  } catch (err) {
    console.error(err);
    target.replaceChildren(el("p", "muted", "Não foi possível carregar a caixa. Confira se as regras do Firestore foram publicadas."));
  }
}

function initInbox() {
  $("#inbox-search").addEventListener("input", renderInbox);
  $("#inbox-filter-type").addEventListener("change", renderInbox);
  $("#inbox-filter-status").addEventListener("change", renderInbox);
  $("#reload-inbox").addEventListener("click", loadInbox);
  loadInbox();
}

// ============================ INÍCIO ============================
onAuthStateChanged(auth, async (user) => {
  if (!user || started) return;
  try {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    const p = snap.exists() ? snap.data() : null;
    if (!p || p.ativo !== true || p.perfil !== "administrador") return;
    started = true;
    currentUser = user;
    initCourses();
    initMembers();
    initInbox();
  } catch (err) {
    console.error("Módulos administrativos não iniciados:", err);
  }
});
