// Preenche os links oficiais (Instagram / WhatsApp) a partir de site-config.js.
import { INSTAGRAM_URL, INSTAGRAM_HANDLE, WHATSAPP_DISPLAY } from "./site-config.js";
import { institutionalWhatsappLink } from "./utils.js";

const set = (sel, fn) => { const n = document.querySelector(sel); if (n) fn(n); };
set("#link-instagram", (n) => { n.href = INSTAGRAM_URL; });
set("#txt-instagram", (n) => { n.textContent = INSTAGRAM_HANDLE; });
set("#footer-instagram", (n) => { n.href = INSTAGRAM_URL; });
set("#link-whatsapp", (n) => { n.href = institutionalWhatsappLink("Olá! Gostaria de falar com a Banda Milícia Odivelense."); });
set("#txt-whatsapp", (n) => { n.textContent = WHATSAPP_DISPLAY; });
