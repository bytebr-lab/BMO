// Funções compartilhadas pelas novas páginas/módulos do Portal BMO.
import { WHATSAPP_NUMBER, SUBMIT_COOLDOWN_SECONDS } from "./site-config.js";

export function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Normaliza telefone brasileiro: remove +55 opcional. Retorna só DDD+número ou "" se inválido. */
export function normalizeBrPhone(value) {
  let d = onlyDigits(value);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return "";
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return "";
  if (d.length === 11 && d[2] !== "9") return "";
  if (d.length === 10 && !/[2-9]/.test(d[2])) return "";
  return d;
}

export function formatBrPhone(digits) {
  const d = onlyDigits(digits);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(digits || "");
}

/** Máscara de digitação (DDD) 9XXXX-XXXX */
export function maskPhoneInput(input) {
  input.addEventListener("input", () => {
    const d = onlyDigits(input.value).slice(0, 11);
    let out = d;
    if (d.length > 6) out = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`;
    else if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    else if (d.length > 0) out = `(${d}`;
    input.value = out;
  });
}

export function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (d > now) return false;
  return now.getFullYear() - d.getFullYear() <= 110;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value || "");
}

/** Link do WhatsApp (wa.me) a partir de telefone brasileiro. Retorna "" se inválido. */
export function whatsappLink(phone, text) {
  const d = normalizeBrPhone(phone);
  if (!d) return "";
  return `https://wa.me/55${d}?text=${encodeURIComponent(text || "")}`;
}

export function institutionalWhatsappLink(text) {
  return `https://wa.me/${WHATSAPP_NUMBER}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}

/** Só aceita imagens em data URL ou https, evitando esquemas perigosos. */
export function safeImageSrc(src) {
  const s = String(src || "").trim();
  if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  return "";
}

export function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export function formatDateTime(value) {
  const ts = timestampValue(value);
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(ts));
}

export function formatBirth(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

/** Proteção simples contra envios repetidos no mesmo navegador. */
export function cooldownRemaining(key) {
  try {
    const last = Number(localStorage.getItem("bmo_last_" + key) || 0);
    const left = SUBMIT_COOLDOWN_SECONDS * 1000 - (Date.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  } catch (_) { return 0; }
}
export function markSubmitted(key) {
  try { localStorage.setItem("bmo_last_" + key, String(Date.now())); } catch (_) { /* ignora */ }
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function setFormMessage(node, text, type = "error") {
  if (!node) return;
  node.textContent = text;
  node.style.color = type === "success" ? "#176b38" : "#8b1e2d";
}

/** Redimensiona uma imagem escolhida e devolve data URL JPEG (cabe no Firestore, sem Storage). */
export function imageFileToDataUrl(file, maxSide = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("Arquivo não é uma imagem."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
