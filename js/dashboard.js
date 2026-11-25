import { auth, db, storage } from "./firebase-config.js";
import { uploadPdfToDrive, deleteDriveFile } from "./google-drive.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const $ = (s) => document.querySelector(s);

let currentUser = null;
let profile = null;
let cachedPieces = [];
let cachedUsers = [];
let cachedClasses = [];

const roleText = {
  administrador: "Administrador",
  professor: "Professor",
  musico: "Músico",
  aluno: "Aluno",
  pendente: "Pendente"
};

const roleDescription = {
  administrador: "Gerencie os usuários, as notícias, a agenda, o repertório, as turmas e as frequências.",
  aluno: "Acompanhe suas aulas, repertório, comunicados e seu histórico individual de frequência.",
  musico: "Consulte agenda de ensaios e apresentações, repertório e comunicados da banda.",
  professor: "Organize suas turmas e registre a frequência dos alunos."
};

function notify(msg) {
  const el = $("#global-message");
  if (el) el.textContent = msg;
  if (!msg) return;
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

function canManage() {
  return profile?.perfil === "administrador";
}

function canTeach() {
  return ["administrador", "professor"].includes(profile?.perfil);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

// ==================== AUTENTICAÇÃO E GUARD ====================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUser = user;
  try {
    const snap = await getDoc(doc(db, "usuarios", user.uid));
    if (!snap.exists() || snap.data().ativo !== true) {
      await signOut(auth);
      window.location.href = "login.html";
      return;
    }
    profile = snap.data();

    document.body.classList.remove("role-administrador", "role-aluno", "role-musico", "role-professor");
    document.body.classList.add("role-" + profile.perfil);

    $("#user-name").textContent = profile.nome || user.email;
    $("#user-role-badge").textContent = roleText[profile.perfil] || profile.perfil;
    $("#welcome").textContent = `Olá, ${profile.nome || "integrante"}!`;
    $("#role-description").textContent = roleDescription[profile.perfil] || "Área interna do portal.";

    const usersTab = document.querySelector('[data-view="usuarios"]');
    if (usersTab) {
      usersTab.style.display = canManage() ? "" : "none";
    }

    await refreshAll();
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
    notify("Erro ao carregar seu perfil. Confira a configuração e as regras do Firebase.");
  }
});

$("#logout")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ==================== NAVEGAÇÃO ENTRE ABAS ====================
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".side-link").forEach((x) => x.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    $("#view-" + button.dataset.view)?.classList.add("active");
  });
});

document.querySelectorAll("[data-cancel]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const form = $("#" + btn.dataset.cancel);
    if (form) {
      form.reset();
      form.classList.add("hidden");
    }
  });
});

// ==================== RENDERIZAÇÃO DE LINHAS ====================
function buildRow({ title, detail, sub = "", tag = "", tagClass = "", actions = [] }) {
  const el = document.createElement("div");
  el.className = "data-row";

  const left = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = detail || "";
  left.append(h, p);

  if (sub) {
    const s = document.createElement("p");
    s.className = "row-sub";
    s.textContent = sub;
    left.append(s);
  }

  el.append(left);

  if (tag || actions.length) {
    const right = document.createElement("div");
    right.className = "row-right";
    if (tag) {
      const t = document.createElement("span");
      t.className = "tag " + tagClass;
      t.textContent = tag;
      right.append(t);
    }
    actions.forEach((btn) => right.append(btn));
    el.append(right);
  }

  return el;
}

function actionBtn(label, variant, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn btn-small ${variant}`;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// ==================== NOTÍCIAS ====================
async function loadNewsList() {
  const target = $("#news-list");
  target.innerHTML = "";
  try {
    const q = canManage()
      ? query(collection(db, "noticias"), limit(50))
      : query(collection(db, "noticias"), where("publicada", "==", true), limit(50));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => timestampValue(b.criadoEm) - timestampValue(a.criadoEm));

    if (!items.length) {
      target.innerHTML = '<p class="muted">Ainda não há notícias registradas.</p>';
      return [];
    }

    items.forEach((item) => {
      const actions = [];
      if (canManage()) {
        actions.push(
          actionBtn("Editar", "btn-outline", () => {
            $("#news-form-title").textContent = "Editar notícia";
            $("#news-edit-id").value = item.id;
            $("#news-title").value = item.titulo || "";
            $("#news-body").value = item.conteudo || "";
            $("#news-photo-caption").value = "";
            $("#news-photos").value = "";
            renderNewsPhotoPreview(item.fotos || []);
            $("#news-published").checked = item.publicada === true;
            $("#news-form").classList.remove("hidden");
            $("#news-title").focus();
          }),
          actionBtn("Excluir", "btn-danger", async () => {
            if (!confirm(`Excluir a notícia "${item.titulo}"?`)) return;
            await deleteDoc(doc(db, "noticias", item.id));
            for (const photo of (item.fotos || [])) {
              if (photo?.path) deleteObject(storageRef(storage, photo.path)).catch((error) => console.warn("Não foi possível remover foto antiga:", error));
            }
            notify("Notícia excluída.");
            await refreshAll();
          })
        );
      }
      target.append(
        buildRow({
          title: item.titulo || "Sem título",
          detail: item.conteudo || "",
          tag: item.publicada ? "Publicada" : "Rascunho",
          tagClass: item.publicada ? "tag-green" : "tag-amber",
          actions
        })
      );
    });
    return items;
  } catch (err) {
    console.error(err);
    target.innerHTML = '<p class="muted">Não foi possível carregar as notícias.</p>';
    return [];
  }
}

function renderNewsPhotoPreview(existing = []) {
  const target = $("#news-photo-preview");
  if (!target) return;
  target.replaceChildren();
  existing.forEach((photo) => {
    if (!photo?.url) return;
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = photo.legenda || "Foto já adicionada";
    img.className = "image-preview";
    target.append(img);
  });
}

$("#news-photos")?.addEventListener("change", () => {
  const target = $("#news-photo-preview");
  if (!target) return;
  target.replaceChildren();
  const selected = Array.from($("#news-photos").files || []);
  if (selected.length > 8) {
    $("#news-photos").value = "";
    $("#news-upload-status").textContent = "Selecione no máximo 8 imagens por vez.";
    return;
  }
  for (const file of selected) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      $("#news-photos").value = "";
      target.replaceChildren();
      $("#news-upload-status").textContent = "Use imagens JPG, PNG ou WebP com até 8 MB cada.";
      return;
    }
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.className = "image-preview";
    target.append(img);
  }
  $("#news-upload-status").textContent = selected.length ? `${selected.length} imagem(ns) selecionada(s).` : "";
});

$("#new-news")?.addEventListener("click", () => {
  $("#news-form").reset();
  $("#news-edit-id").value = "";
  $("#news-form-title").textContent = "Publicar notícia";
  $("#news-published").checked = true;
  $("#news-photo-caption").value = "";
  $("#news-photos").value = "";
  renderNewsPhotoPreview([]);
  $("#news-upload-status").textContent = "";
  $("#news-form").classList.toggle("hidden");
});

$("#news-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canManage()) return;
  const editId = $("#news-edit-id").value;
  const existing = editId ? (await getDoc(doc(db, "noticias", editId))).data() || {} : {};
  const payload = {
    titulo: $("#news-title").value.trim(),
    conteudo: $("#news-body").value.trim(),
    publicada: $("#news-published").checked
  };
  const files = Array.from($("#news-photos").files || []);
  if (!payload.titulo || !payload.conteudo) return notify("Informe o título e o conteúdo da notícia.");
  if (files.length > 8 || files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024)) {
    return notify("Selecione até 8 imagens, com no máximo 8 MB cada.");
  }
  const saveButton = e.target.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  $("#news-upload-status").textContent = files.length ? "Enviando fotografias..." : "Salvando notícia...";
  const uploaded = [];
  try {
    const caption = $("#news-photo-caption").value.trim();
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `noticias/${currentUser.uid}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      uploaded.push({ url, path, legenda: caption });
    }
    payload.fotos = [...(Array.isArray(existing.fotos) ? existing.fotos : []), ...uploaded];
    if (editId) {
      await updateDoc(doc(db, "noticias", editId), payload);
      notify("Notícia atualizada.");
    } else {
      await addDoc(collection(db, "noticias"), {
        ...payload, autor: currentUser.uid, criadoEm: serverTimestamp()
      });
      notify("Notícia salva.");
    }
    e.target.reset();
    $("#news-edit-id").value = "";
    $("#news-photo-preview").replaceChildren();
    $("#news-upload-status").textContent = "";
    e.target.classList.add("hidden");
    await refreshAll();
  } catch (err) {
    console.error(err);
    for (const photo of uploaded) deleteObject(storageRef(storage, photo.path)).catch(() => {});
    notify("Não foi possível salvar a notícia ou enviar as fotografias. Verifique as regras do Firebase Storage.");
  } finally {
    saveButton.disabled = false;
  }
});

// ==================== AGENDA / EVENTOS ====================
async function loadEventsList() {
  const target = $("#events-list");
  target.innerHTML = "";
  try {
    const q = canManage()
      ? query(collection(db, "eventos"), limit(50))
      : query(collection(db, "eventos"), where("publico", "==", true), limit(50));
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(a.data || 0).getTime() - new Date(b.data || 0).getTime());

    if (!items.length) {
      target.innerHTML = '<p class="muted">Ainda não há eventos cadastrados.</p>';
      return [];
    }

    items.forEach((item) => {
      const actions = [];
      if (canManage()) {
        actions.push(
          actionBtn("Editar", "btn-outline", () => {
            $("#event-form-title").textContent = "Editar evento";
            $("#event-edit-id").value = item.id;
            $("#event-title").value = item.titulo || "";
            $("#event-date").value = item.data || "";
            $("#event-place").value = item.local || "";
            $("#event-description").value = item.descricao || "";
            $("#event-published").checked = item.publico === true;
            $("#event-form").classList.remove("hidden");
            $("#event-title").focus();
          }),
          actionBtn("Excluir", "btn-danger", async () => {
            if (!confirm(`Excluir o evento "${item.titulo}"?`)) return;
            await deleteDoc(doc(db, "eventos", item.id));
            notify("Evento excluído.");
            await refreshAll();
          })
        );
      }
      const subParts = [];
      if (item.data) subParts.push(`Data: ${formatDate(item.data)}`);
      if (item.local) subParts.push(`Local: ${item.local}`);
      target.append(
        buildRow({
          title: item.titulo || "Evento",
          detail: item.descricao || "Sem descrição adicional.",
          sub: subParts.join(" • "),
          tag: item.publico ? "Público" : "Interno",
          tagClass: item.publico ? "tag-green" : "",
          actions
        })
      );
    });
    return items;
  } catch (err) {
    console.error(err);
    target.innerHTML = '<p class="muted">Não foi possível carregar a agenda.</p>';
    return [];
  }
}

$("#new-event")?.addEventListener("click", () => {
  $("#event-form").reset();
  $("#event-edit-id").value = "";
  $("#event-form-title").textContent = "Cadastrar evento";
  $("#event-published").checked = true;
  $("#event-form").classList.toggle("hidden");
});

$("#event-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canManage()) return;
  const editId = $("#event-edit-id").value;
  const payload = {
    titulo: $("#event-title").value.trim(),
    data: $("#event-date").value,
    local: $("#event-place").value.trim(),
    descricao: $("#event-description").value.trim(),
    publico: $("#event-published").checked
  };
  try {
    if (editId) {
      await updateDoc(doc(db, "eventos", editId), payload);
      notify("Evento atualizado.");
    } else {
      await addDoc(collection(db, "eventos"), {
        ...payload,
        criadoPor: currentUser.uid,
        criadoEm: serverTimestamp()
      });
      notify("Evento salvo.");
    }
    e.target.reset();
    $("#event-edit-id").value = "";
    e.target.classList.add("hidden");
    await refreshAll();
  } catch (err) {
    console.error(err);
    notify("Não foi possível salvar o evento.");
  }
});

// ==================== REPERTÓRIO ====================
function renderPieces() {
  const target = $("#pieces-list");
  target.innerHTML = "";
  const term = ($("#repertorio-search")?.value || "").toLowerCase().trim();
  const cat = $("#repertorio-filter-cat")?.value || "";

  const filtered = cachedPieces.filter((item) => {
    const matchesTerm =
      !term ||
      (item.titulo || "").toLowerCase().includes(term) ||
      (item.compositor || "").toLowerCase().includes(term);
    const matchesCat = !cat || item.categoria === cat;
    return matchesTerm && matchesCat;
  });

  if (!filtered.length) {
    target.innerHTML = '<p class="muted">Nenhuma música encontrada no repertório.</p>';
    return;
  }

  filtered.forEach((item) => {
    const actions = [];
    if (item.arquivoUrl && /^https:\/\//.test(item.arquivoUrl)) {
      const pdf = document.createElement("a");
      pdf.className = "btn btn-small";
      pdf.textContent = "Abrir PDF";
      pdf.href = item.arquivoUrl;
      pdf.target = "_blank";
      pdf.rel = "noopener noreferrer";
      pdf.title = item.arquivoNome || "Arranjo em PDF";
      actions.push(pdf);
    }
    if (canManage()) {
      actions.push(
        actionBtn("Editar", "btn-outline", () => {
          $("#piece-file").value = "";
          $("#piece-file-remove").checked = false;
          $("#piece-file-current").textContent = item.arquivoNome ? `PDF atual: ${item.arquivoNome}` : "";
          $("#piece-file-current").classList.toggle("hidden", !item.arquivoNome);
          $("#piece-file-remove-label").classList.toggle("hidden", !item.arquivoUrl);
          $("#piece-form-title").textContent = "Editar música";
          $("#piece-edit-id").value = item.id;
          $("#piece-title").value = item.titulo || "";
          $("#piece-composer").value = item.compositor || "";
          $("#piece-category").value = item.categoria || "Dobrado";
          $("#piece-notes").value = item.observacoes || "";
          $("#piece-form").classList.remove("hidden");
          $("#piece-title").focus();
        }),
        actionBtn("Excluir", "btn-danger", async () => {
          if (!confirm(`Remover "${item.titulo}" do repertório?`)) return;
          await deleteDoc(doc(db, "repertorio", item.id));
          if (item.arquivoDriveId) deleteDriveFile(item.arquivoDriveId).catch((err) => console.warn("Não foi possível excluir o PDF do Drive:", err));
          else if (item.arquivoPath) deleteObject(storageRef(storage, item.arquivoPath)).catch(() => {});
          notify("Música removida do repertório.");
          await refreshAll();
        })
      );
    }
    target.append(
      buildRow({
        title: item.titulo || "Música",
        detail: item.compositor ? `Compositor / Arranjador: ${item.compositor}` : "Compositor não informado",
        sub: item.observacoes || "",
        tag: item.categoria || "Repertório",
        actions
      })
    );
  });
}

async function loadPiecesList() {
  try {
    const snap = await getDocs(query(collection(db, "repertorio"), limit(100)));
    cachedPieces = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "pt-BR"));
    renderPieces();
    return cachedPieces;
  } catch (err) {
    console.error(err);
    $("#pieces-list").innerHTML = '<p class="muted">Não foi possível carregar o repertório.</p>';
    return [];
  }
}

// ==================== REPERTÓRIOS DE EVENTOS ====================
function fillSetlistSongOptions(selectedIds = []) {
  const select = $("#setlist-songs");
  if (!select) return;
  select.innerHTML = "";
  const ordered = [...selectedIds.map(id => cachedPieces.find(piece => piece.id === id)).filter(Boolean),
    ...cachedPieces.filter(piece => !selectedIds.includes(piece.id))];
  ordered.forEach(piece => {
    const opt = document.createElement("option"); opt.value = piece.id;
    opt.textContent = `${piece.titulo || "Sem título"}${piece.compositor ? " — " + piece.compositor : ""}`;
    opt.selected = selectedIds.includes(piece.id); select.append(opt);
  });
}

async function loadSetlists() {
  const target = $("#setlists-list"); if (!target) return [];
  target.innerHTML = "";
  try {
    const snap = await getDocs(query(collection(db,"repertorios_eventos"), limit(100)));
    const list = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b) => (a.dataEvento || "").localeCompare(b.dataEvento || ""));
    if (!list.length) { target.innerHTML = '<p class="muted">Nenhum repertório de evento criado ainda.</p>'; return []; }
    list.forEach(item => {
      const songs = (item.musicas || []).map(id => cachedPieces.find(p => p.id === id)?.titulo || "Música removida do catálogo");
      const actions = [];
      if (canManage()) actions.push(
        actionBtn("Editar", "btn-outline", () => {
          $("#setlist-form-title").textContent = "Editar repertório de evento";
          $("#setlist-edit-id").value = item.id; $("#setlist-name").value = item.nome || "";
          $("#setlist-description").value = item.descricao || ""; $("#setlist-date").value = item.dataEvento || "";
          $("#setlist-notes").value = item.observacoes || ""; fillSetlistSongOptions(item.musicas || []);
          $("#setlist-form").classList.remove("hidden");
        }),
        actionBtn("Excluir", "btn-danger", async () => {
          if (!confirm(`Excluir o repertório "${item.nome}"?`)) return;
          try { await deleteDoc(doc(db,"repertorios_eventos",item.id)); notify("Repertório de evento excluído."); await loadSetlists(); }
          catch(err) { console.error(err); notify("Não foi possível excluir o repertório."); }
        })
      );
      target.append(buildRow({title:item.nome || "Evento", detail:[item.dataEvento ? `Data: ${new Date(item.dataEvento + "T12:00:00").toLocaleDateString("pt-BR")}` : "Data não definida", `${songs.length} música(s)`].join(" • "),
        sub:[item.descricao, songs.length ? `Ordem: ${songs.join(" → ")}` : "Sem músicas selecionadas", item.observacoes].filter(Boolean).join(" | "), tag:"Evento", actions}));
    });
    return list;
  } catch(err) { console.error(err); target.innerHTML = '<p class="muted">Não foi possível carregar os repertórios de eventos.</p>'; return []; }
}

function moveSelectedSetlistSong(direction) {
  const select = $("#setlist-songs");
  if (!select) return;
  const options = [...select.options];
  const selected = options.findIndex(o => o.selected);
  if (selected < 0) return;
  const next = selected + direction;
  if (next < 0 || next >= options.length) return;
  const moving = options[selected], anchor = options[next];
  if (direction < 0) select.insertBefore(moving, anchor);
  else select.insertBefore(anchor, moving);
  moving.selected = true;
}
$("#setlist-up")?.addEventListener("click", () => moveSelectedSetlistSong(-1));
$("#setlist-down")?.addEventListener("click", () => moveSelectedSetlistSong(1));

$("#new-setlist")?.addEventListener("click", () => {
  if (!canManage()) return;
  $("#setlist-form").reset(); $("#setlist-edit-id").value = "";
  $("#setlist-form-title").textContent = "Criar repertório de evento"; fillSetlistSongOptions();
  $("#setlist-form").classList.remove("hidden");
});
$("#setlist-form")?.addEventListener("submit", async e => {
  e.preventDefault(); if (!canManage()) return;
  const editId = $("#setlist-edit-id").value;
  const payload = {nome:$("#setlist-name").value.trim(), descricao:$("#setlist-description").value.trim(),
    dataEvento:$("#setlist-date").value, musicas:[...$("#setlist-songs").selectedOptions].map(o => o.value),
    observacoes:$("#setlist-notes").value.trim()};
  if (!payload.musicas.length) { notify("Selecione pelo menos uma música do catálogo."); return; }
  try {
    if (editId) await updateDoc(doc(db,"repertorios_eventos",editId), payload);
    else await addDoc(collection(db,"repertorios_eventos"), {...payload, criadoPor:currentUser.uid, criadoEm:serverTimestamp()});
    notify(editId ? "Repertório atualizado." : "Repertório de evento criado.");
    e.target.reset(); $("#setlist-edit-id").value = ""; e.target.classList.add("hidden"); await loadSetlists();
  } catch(err) { console.error(err); notify("Não foi possível salvar o repertório de evento."); }
});

$("#repertorio-search")?.addEventListener("input", renderPieces);
$("#repertorio-filter-cat")?.addEventListener("change", renderPieces);

$("#new-piece")?.addEventListener("click", () => {
  $("#piece-form").reset();
  $("#piece-edit-id").value = "";
  $("#piece-form-title").textContent = "Adicionar ao repertório";
  $("#piece-file-current").classList.add("hidden");
  $("#piece-file-remove-label").classList.add("hidden");
  $("#piece-form").classList.toggle("hidden");
});

$("#piece-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!canManage()) return;
  const editId = $("#piece-edit-id").value;
  const payload = {
    titulo: $("#piece-title").value.trim(),
    compositor: $("#piece-composer").value.trim(),
    categoria: $("#piece-category").value,
    observacoes: $("#piece-notes").value.trim()
  };
  const submitBtn = e.target.querySelector('button[type="submit"]');
  let newPath = "";
  let newDriveId = "";
  try {
    const file = $("#piece-file").files[0];
    const old = editId ? cachedPieces.find((p) => p.id === editId) : null;
    if (file) {
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
        notify("Envie somente arquivos PDF.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        notify("O PDF deve ter no máximo 20 MB.");
        return;
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Enviando para o Google Drive..."; }
      const driveFile = await uploadPdfToDrive(file);
      newDriveId = driveFile.id;
      payload.arquivoUrl = driveFile.url;
      payload.arquivoNome = driveFile.name;
      payload.arquivoDriveId = driveFile.id;
      payload.arquivoPath = "";
    } else if (editId && $("#piece-file-remove").checked) {
      payload.arquivoUrl = "";
      payload.arquivoNome = "";
      payload.arquivoPath = "";
      payload.arquivoDriveId = "";
    }

    if (editId) {
      await updateDoc(doc(db, "repertorio", editId), payload);
      notify("Música atualizada.");
    } else {
      await addDoc(collection(db, "repertorio"), {
        ...payload,
        criadoPor: currentUser.uid,
        criadoEm: serverTimestamp()
      });
      notify("Música adicionada ao repertório.");
    }
    // Apaga o PDF antigo quando foi substituído ou removido
    if (old && (file || $("#piece-file-remove").checked)) {
      if (old.arquivoDriveId) deleteDriveFile(old.arquivoDriveId).catch((err) => console.warn("Não foi possível excluir o PDF antigo do Drive:", err));
      else if (old.arquivoPath) deleteObject(storageRef(storage, old.arquivoPath)).catch(() => {});
    }
    e.target.reset();
    $("#piece-edit-id").value = "";
    e.target.classList.add("hidden");
    await refreshAll();
  } catch (err) {
    console.error(err);
    if (newDriveId) deleteDriveFile(newDriveId).catch(() => {});
    if (newPath) deleteObject(storageRef(storage, newPath)).catch(() => {});
    console.error("Detalhe do erro ao salvar repertório:", err);
    notify(err?.message?.includes("Client ID") || err?.message?.includes("Google")
      ? `Falha no Google Drive: ${err.message}`
      : "Não foi possível salvar a música. Confira o console para detalhes.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Salvar música"; }
  }
});

// ==================== TURMAS ====================
function refreshClassFormOptions() {
  const teacherSelect = $("#class-teacher");
  const studentSelect = $("#class-students");
  if (teacherSelect) {
    const selected = teacherSelect.value;
    teacherSelect.innerHTML = '<option value="">Selecione um professor</option>';
    cachedUsers.filter(u => u.ativo === true && u.perfil === "professor").forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.id; opt.textContent = u.nome || u.email || "Professor";
      teacherSelect.append(opt);
    });
    if (selected) teacherSelect.value = selected;
  }
  if (studentSelect) {
    const selected = new Set([...studentSelect.selectedOptions].map(o => o.value));
    studentSelect.innerHTML = "";
    cachedUsers.filter(u => u.ativo === true && ["aluno", "musico"].includes(u.perfil)).forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.id; opt.textContent = u.nome || u.email || "Aluno";
      opt.selected = selected.has(u.id); studentSelect.append(opt);
    });
  }
}

function renderClassesList() {
  const target = $("#classes-list");
  if (!target) return;
  target.innerHTML = "";
  if (!cachedClasses.length) {
    target.innerHTML = '<p class="muted">Ainda não há turmas cadastradas.</p>';
    return;
  }
  cachedClasses.forEach(item => {
    const enrolled = Array.isArray(item.alunosUids) ? item.alunosUids : [];
    const names = (item.alunos || []).map(a => a.nome).filter(Boolean);
    if (!names.length && canManage()) names.push(...enrolled.map(uid => cachedUsers.find(u => u.id === uid)?.nome).filter(Boolean));
    const teacherName = cachedUsers.find(u => u.id === item.professorUid)?.nome || item.professor || "Professor não atribuído";
    const subParts = [];
    if (item.horario) subParts.push(`Horário: ${item.horario}`);
    subParts.push(`Professor(a): ${teacherName}`);
    subParts.push(`${enrolled.length} aluno(s) matriculado(s)`);
    if (names.length) subParts.push(`Alunos: ${names.join(", ")}`);
    const actions = [];
    if (canManage()) {
      actions.push(actionBtn("Editar / matrículas", "btn-outline", () => {
        refreshClassFormOptions();
        $("#class-form-title").textContent = "Editar turma e matrículas";
        $("#class-edit-id").value = item.id;
        $("#class-name").value = item.nome || "";
        $("#class-instrument").value = item.instrumento || "";
        $("#class-schedule").value = item.horario || "";
        $("#class-teacher").value = item.professorUid || "";
        [...$("#class-students").options].forEach(o => o.selected = enrolled.includes(o.value));
        $("#class-form").classList.remove("hidden");
        $("#class-name").focus();
      }), actionBtn("Excluir", "btn-danger", async () => {
        if (!confirm(`Excluir a turma "${item.nome}"? Os registros históricos de frequência serão preservados.`)) return;
        try {
          await deleteDoc(doc(db, "turmas", item.id));
          notify("Turma excluída."); await refreshAll();
        } catch (err) { console.error(err); notify("Não foi possível excluir a turma."); }
      }));
    }
    target.append(buildRow({
      title: item.nome || "Turma",
      detail: item.instrumento ? `Disciplina / Instrumento: ${item.instrumento}` : "",
      sub: subParts.join(" • "), tag: item.instrumento || "Turma", actions
    }));
  });
}

async function loadClassesList() {
  const target = $("#classes-list");
  target.innerHTML = '<p class="muted">Carregando turmas...</p>';
  try {
    const q = canManage()
      ? query(collection(db, "turmas"), limit(100))
      : query(collection(db, "turmas"), where("professorUid", "==", currentUser.uid), limit(100));
    const snap = await getDocs(q);
    cachedClasses = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    const classSelect = $("#attendance-class");
    if (classSelect) {
      classSelect.innerHTML = '<option value="">Selecione a turma</option>';
      cachedClasses.forEach(c => {
        const opt = document.createElement("option"); opt.value = c.id;
        opt.textContent = `${c.nome} (${c.instrumento || "Geral"})`; classSelect.append(opt);
      });
    }
    renderClassesList();
    return cachedClasses;
  } catch (err) {
    console.error(err); target.innerHTML = '<p class="muted">Não foi possível carregar as turmas. Verifique as regras do Firebase e a atribuição do professor.</p>';
    return [];
  }
}

$("#new-class")?.addEventListener("click", () => {
  if (!canManage()) return;
  $("#class-form").reset(); $("#class-edit-id").value = "";
  $("#class-form-title").textContent = "Cadastrar turma";
  refreshClassFormOptions(); $("#class-form").classList.remove("hidden");
});

$("#class-form")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!canManage()) return;
  const editId = $("#class-edit-id").value;
  const teacherUid = $("#class-teacher").value;
  const teacher = cachedUsers.find(u => u.id === teacherUid);
  if (!teacherUid || !teacher) { notify("Selecione um professor ativo."); return; }
  const payload = {
    nome: $("#class-name").value.trim(), instrumento: $("#class-instrument").value.trim(),
    horario: $("#class-schedule").value.trim(), professorUid: teacherUid,
    professor: teacher.nome || teacher.email || "Professor",
    alunosUids: [...$("#class-students").selectedOptions].map(o => o.value),
    alunos: [...$("#class-students").selectedOptions].map(o => {
      const u = cachedUsers.find(user => user.id === o.value);
      return {uid:o.value, nome:u?.nome || u?.email || o.textContent, perfil:u?.perfil || "aluno"};
    })
  };
  try {
    if (editId) { await updateDoc(doc(db, "turmas", editId), payload); notify("Turma, professor e matrículas atualizados."); }
    else { await addDoc(collection(db, "turmas"), { ...payload, criadoPor: currentUser.uid, criadoEm: serverTimestamp() }); notify("Turma cadastrada."); }
    e.target.reset(); $("#class-edit-id").value = ""; e.target.classList.add("hidden"); await refreshAll();
  } catch (err) { console.error(err); notify("Não foi possível salvar a turma."); }
});

// ==================== FREQUÊNCIA ====================
function updateAttendanceStudents() {
  const select = $("#attendance-student");
  if (!select) return;
  const turma = cachedClasses.find(c => c.id === $("#attendance-class")?.value);
  const allowed = new Set(turma?.alunosUids || []);
  const roster = turma?.alunos || (canManage() ? cachedUsers.filter(u => allowed.has(u.id)).map(u => ({uid:u.id,nome:u.nome || u.email,perfil:u.perfil})) : []);
  select.innerHTML = '<option value="">Selecione o aluno</option>';
  roster.forEach(u => {
    const uid = u.uid || u.id;
    const opt = document.createElement("option"); opt.value = uid;
    opt.dataset.nome = u.nome || "Aluno"; opt.textContent = u.nome || "Aluno"; select.append(opt);
  });
}
$("#attendance-class")?.addEventListener("change", updateAttendanceStudents);

async function loadAttendanceList() {
  const target = $("#attendance-list"); target.innerHTML = "";
  if (canTeach()) $("#attendance-subtitle").textContent = canManage()
    ? "Consulte e gerencie os registros de todas as turmas."
    : "Você está vendo somente as frequências das turmas atribuídas a você.";
  else if (profile.perfil === "aluno") $("#attendance-subtitle").textContent = "Seu histórico individual de frequência nas aulas.";
  else $("#attendance-subtitle").textContent = "Consulte registros de presença.";
  try {
    let items = [];
    if (canManage()) {
      const snap = await getDocs(query(collection(db, "frequencias"), limit(300)));
      items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    } else if (profile.perfil === "professor") {
      const batches = await Promise.all(cachedClasses.map(c => getDocs(query(collection(db, "frequencias"), where("turmaId", "==", c.id), limit(150)))));
      items = batches.flatMap(snap => snap.docs.map(d => ({ id:d.id, ...d.data() })));
    } else {
      const snap = await getDocs(query(collection(db, "frequencias"), where("alunoUid", "==", currentUser.uid), limit(100)));
      items = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    }
    items.sort((a,b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime());
    if (!items.length) { target.innerHTML = '<p class="muted">Ainda não há registros de frequência para estas turmas.</p>'; return []; }
    const statusBadge = { presente:{label:"Presente",cls:"tag-green"}, ausente:{label:"Ausente",cls:"tag-red"}, justificado:{label:"Justificado",cls:"tag-amber"} };
    items.forEach(item => {
      const badge = statusBadge[item.situacao] || {label:item.situacao || "Registrado",cls:""};
      const actions = [];
      if (canTeach()) actions.push(actionBtn("Remover", "btn-danger", async () => {
        if (!confirm("Remover este registro de frequência?")) return;
        try { await deleteDoc(doc(db,"frequencias",item.id)); notify("Registro removido."); await loadAttendanceList(); }
        catch(err) { console.error(err); notify("Não foi possível remover este registro."); }
      }));
      target.append(buildRow({ title:item.alunoNome || item.alunoUid || "Aluno", detail:`Turma: ${item.turma || "Não informada"}`,
        sub:item.data ? `Registrado em ${formatDate(item.data)}` : "", tag:badge.label, tagClass:badge.cls, actions }));
    });
    return items;
  } catch(err) { console.error(err); target.innerHTML = '<p class="muted">Não foi possível carregar as frequências. Verifique a atribuição da turma e as regras do Firebase.</p>'; return []; }
}

$("#attendance-form")?.addEventListener("submit", async e => {
  e.preventDefault(); if (!canTeach()) return;
  const alunoUid = $("#attendance-student").value;
  const alunoNome = $("#attendance-student").selectedOptions[0]?.dataset?.nome || alunoUid;
  const turmaId = $("#attendance-class").value;
  const turmaObj = cachedClasses.find(c => c.id === turmaId);
  const situacao = $("#attendance-status").value;
  if (!alunoUid || !turmaObj || !(turmaObj.alunosUids || []).includes(alunoUid)) { notify("Selecione uma turma e um aluno matriculado nela."); return; }
  try {
    await addDoc(collection(db,"frequencias"), { alunoUid, alunoNome, turmaId, turma:turmaObj.nome, situacao,
      registradoPor:currentUser.uid, data:new Date().toISOString(), criadoEm:serverTimestamp() });
    notify("Frequência registrada com sucesso."); await loadAttendanceList();
  } catch(err) { console.error(err); notify("Não foi possível registrar a frequência."); }
});

$("#migrate-attendance")?.addEventListener("click", async () => {
  if (!canManage()) return;
  if (!confirm("Vincular registros antigos às turmas pelo nome exato? Nenhum registro será excluído.")) return;
  try {
    const [classesSnap, attendanceSnap] = await Promise.all([
      getDocs(query(collection(db,"turmas"), limit(100))),
      getDocs(query(collection(db,"frequencias"), limit(500)))
    ]);
    const byName = new Map(classesSnap.docs.map(d => [String(d.data().nome || "").trim().toLowerCase(), d.id]));
    let updated = 0, unmatched = 0;
    for (const row of attendanceSnap.docs) {
      const data = row.data(); if (data.turmaId) continue;
      const turmaId = byName.get(String(data.turma || "").trim().toLowerCase());
      if (!turmaId) { unmatched++; continue; }
      await updateDoc(doc(db,"frequencias",row.id), {turmaId}); updated++;
    }
    notify(`${updated} registro(s) vinculados. ${unmatched} sem correspondência exata permaneceram preservados.`);
    await loadAttendanceList();
  } catch(err) { console.error(err); notify("Não foi possível migrar o histórico antigo."); }
});

// ==================== USUÁRIOS E ALUNOS ====================
function populateStudentDropdown(users) {
  cachedUsers = users;
  refreshClassFormOptions();
  updateAttendanceStudents();
  renderClassesList();
}

function renderUsers() {
  const target = $("#users-list");
  if (!target) return;
  target.innerHTML = "";

  const term = ($("#users-search")?.value || "").toLowerCase().trim();
  const statusFilter = $("#users-filter-status")?.value || "";

  const filtered = cachedUsers.filter((u) => {
    const matchesTerm =
      !term ||
      (u.nome || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term);
    let matchesStatus = true;
    if (statusFilter === "pendente") matchesStatus = u.perfil === "pendente" || u.ativo !== true;
    if (statusFilter === "ativo") matchesStatus = u.ativo === true;
    if (statusFilter === "inativo") matchesStatus = u.ativo !== true;
    return matchesTerm && matchesStatus;
  });

  if (!filtered.length) {
    target.innerHTML = '<p class="muted">Nenhum usuário encontrado com esse filtro.</p>';
    return;
  }

  filtered.forEach((u) => {
    const subParts = [];
    if (u.perfilSolicitado) subParts.push(`Solicitou: ${roleText[u.perfilSolicitado] || u.perfilSolicitado}`);
    if (u.instrumento) subParts.push(`Instrumento: ${u.instrumento}`);
    if (u.telefone) subParts.push(`Tel: ${u.telefone}`);
    if (u.observacao) subParts.push(`Obs: ${u.observacao}`);

    const controls = [];
    if (u.id !== currentUser.uid) {
      const select = document.createElement("select");
      select.style.width = "auto";
      select.style.marginBottom = "0";
      select.style.padding = "6px 10px";
      select.innerHTML = `
        <option value="pendente">Pendente</option>
        <option value="aluno">Aluno</option>
        <option value="musico">Músico</option>
        <option value="professor">Professor</option>
        <option value="administrador">Administrador</option>
      `;
      select.value = ["pendente", "aluno", "musico", "professor", "administrador"].includes(u.perfil)
        ? u.perfil
        : "pendente";

      const activeLabel = document.createElement("label");
      activeLabel.className = "check-label";
      activeLabel.style.margin = "0";
      const activeCheckbox = document.createElement("input");
      activeCheckbox.type = "checkbox";
      activeCheckbox.checked = u.ativo === true;
      activeLabel.append(activeCheckbox, document.createTextNode("Ativo"));

      const saveBtn = actionBtn("Salvar", "", async () => {
        try {
          await updateDoc(doc(db, "usuarios", u.id), {
            perfil: select.value,
            ativo: activeCheckbox.checked
          });
          notify(`Cadastro de ${u.nome || u.email} atualizado.`);
          await loadUsers();
        } catch (err) {
          console.error(err);
          notify("Falha ao atualizar perfil.");
        }
      });

      controls.push(select, activeLabel, saveBtn);
    }

    target.append(
      buildRow({
        title: u.nome || "Sem nome",
        detail: u.email || "",
        sub: subParts.join(" • "),
        tag: u.ativo ? `${roleText[u.perfil] || u.perfil} • Ativo` : "Pendente / Inativo",
        tagClass: u.ativo ? "tag-green" : "tag-amber",
        actions: controls
      })
    );
  });
}

async function loadUsers() {
  try {
    const snap = await getDocs(query(collection(db, "usuarios"), limit(150)));
    cachedUsers = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // Pendentes primeiro
        const pendA = a.ativo === true ? 1 : 0;
        const pendB = b.ativo === true ? 1 : 0;
        if (pendA !== pendB) return pendA - pendB;
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
      });
    populateStudentDropdown(cachedUsers);
    if (canManage()) renderUsers();
    return cachedUsers;
  } catch (err) {
    console.error(err);
    if ($("#users-list")) {
      $("#users-list").innerHTML = '<p class="muted">Não foi possível carregar usuários. Confira as regras.</p>';
    }
    return [];
  }
}

$("#users-search")?.addEventListener("input", renderUsers);
$("#users-filter-status")?.addEventListener("change", renderUsers);

// ==================== ATUALIZAÇÃO GERAL ====================
async function refreshAll() {
  const [news, events, pieces, classes] = await Promise.all([
    loadNewsList(),
    loadEventsList(),
    loadPiecesList(),
    loadClassesList()
  ]);
  await loadSetlists();

  // Visão geral: comunicados recentes
  const recentNews = $("#recent-news");
  recentNews.innerHTML = "";
  const pubNews = news.filter((n) => n.publicada === true);
  if (!pubNews.length) {
    recentNews.innerHTML = '<p class="muted">Nenhum comunicado publicado.</p>';
  } else {
    pubNews.slice(0, 4).forEach((n) => {
      recentNews.append(
        buildRow({
          title: n.titulo,
          detail: n.conteudo?.slice(0, 140) + (n.conteudo?.length > 140 ? "..." : ""),
          tag: "Notícia"
        })
      );
    });
  }

  // Visão geral: próximos compromissos
  const recentEvents = $("#recent-events");
  recentEvents.innerHTML = "";
  const pubEvents = events.filter((e) => e.publico === true);
  if (!pubEvents.length) {
    recentEvents.innerHTML = '<p class="muted">Nenhum compromisso agendado.</p>';
  } else {
    pubEvents.slice(0, 4).forEach((ev) => {
      recentEvents.append(
        buildRow({
          title: ev.titulo,
          detail: ev.local ? `Local: ${ev.local}` : ev.descricao || "",
          tag: formatDate(ev.data)
        })
      );
    });
  }

  // Cards de estatísticas
  const stats = $("#stats");
  stats.innerHTML = "";
  const statItems = [
    ["Notícias publicadas", pubNews.length],
    ["Eventos na agenda", pubEvents.length],
    ["Músicas no repertório", pieces.length],
    ["Turmas ativas", classes.length]
  ];
  statItems.forEach(([label, value]) => {
    const el = document.createElement("div");
    el.className = "stat";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    el.append(strong, span);
    stats.append(el);
  });

  if (canManage()) {
    await loadUsers();
  }
  await loadAttendanceList();
}
