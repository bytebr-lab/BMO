import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const menu = document.querySelector("#menu-toggle");
const mainNav = document.querySelector("#main-nav");

menu?.addEventListener("click", () => {
  mainNav?.classList.toggle("open");
});

mainNav?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => mainNav.classList.remove("open"));
});

const newsContainer = document.querySelector("#public-news");
const eventsContainer = document.querySelector("#public-events");

function showPublicMessage(container, message) {
  if (!container) return;
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = message;
  container.replaceChildren(p);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

async function loadNews() {
  if (!newsContainer) return;
  try {
    const q = query(
      collection(db, "noticias"),
      where("publicada", "==", true),
      limit(30)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      showPublicMessage(newsContainer, "Ainda não há notícias publicadas.");
      return;
    }
    const news = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => timestampValue(b.criadoEm) - timestampValue(a.criadoEm));

    const fragment = document.createDocumentFragment();
    news.slice(0, 6).forEach(item => {
      const article = document.createElement("article");
      article.className = "card";

      const title = document.createElement("h3");
      title.textContent = item.titulo || "Notícia da banda";

      const content = document.createElement("p");
      content.className = "news-content";
      content.textContent = item.conteudo || "";

      if (Array.isArray(item.fotos) && item.fotos.length) {
        const gallery = document.createElement("div");
        gallery.className = "news-gallery";
        item.fotos.slice(0, 8).forEach((photo) => {
          if (!photo || typeof photo.url !== "string" || !photo.url.startsWith("https://")) return;
          const figure = document.createElement("figure");
          const img = document.createElement("img");
          img.src = photo.url;
          img.alt = photo.legenda || item.titulo || "Fotografia da notícia";
          img.loading = "lazy";
          figure.append(img);
          if (photo.legenda) {
            const caption = document.createElement("figcaption");
            caption.textContent = photo.legenda;
            figure.append(caption);
          }
          gallery.append(figure);
        });
        if (gallery.childElementCount) article.append(gallery);
      }

      article.append(title, content);

      if (item.criadoEm) {
        const ts = timestampValue(item.criadoEm);
        if (ts > 0) {
          const meta = document.createElement("small");
          meta.className = "card-meta";
          meta.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(ts));
          article.append(meta);
        }
      }

      fragment.append(article);
    });
    newsContainer.replaceChildren(fragment);
  } catch (error) {
    console.error("Erro ao carregar notícias públicas:", error);
    showPublicMessage(
      newsContainer,
      "Não foi possível carregar as notícias. Verifique a conexão e as regras de leitura pública do Firestore."
    );
  }
}

async function loadEvents() {
  if (!eventsContainer) return;
  try {
    const q = query(
      collection(db, "eventos"),
      where("publico", "==", true),
      limit(50)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      showPublicMessage(eventsContainer, "Ainda não há eventos publicados na agenda.");
      return;
    }
    const events = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const dateA = new Date(a.data || 0).getTime();
        const dateB = new Date(b.data || 0).getTime();
        return dateA - dateB;
      });

    const fragment = document.createDocumentFragment();
    events.forEach(item => {
      const article = document.createElement("article");
      article.className = "event-item";

      const title = document.createElement("h3");
      title.textContent = item.titulo || "Atividade da banda";

      const date = document.createElement("p");
      date.className = "muted";
      date.textContent = formatDate(item.data);

      article.append(title, date);

      if (item.local) {
        const place = document.createElement("p");
        place.textContent = `Local: ${item.local}`;
        article.append(place);
      }

      if (item.descricao) {
        const description = document.createElement("p");
        description.textContent = item.descricao;
        article.append(description);
      }

      fragment.append(article);
    });
    eventsContainer.replaceChildren(fragment);
  } catch (error) {
    console.error("Erro ao carregar agenda pública:", error);
    showPublicMessage(
      eventsContainer,
      "Não foi possível carregar a agenda. Verifique a conexão e as regras de leitura pública do Firestore."
    );
  }
}

Promise.all([loadNews(), loadEvents()]);
