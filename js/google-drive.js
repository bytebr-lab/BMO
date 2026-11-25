// Integração do Portal BMO com o Google Drive (OAuth 2.0 no navegador).
// Configure GOOGLE_CLIENT_ID com o ID de cliente OAuth do tipo Aplicativo da Web.
const GOOGLE_CLIENT_ID = "289765146197-c3204gg0fv5935c5voj1ricgu29tvauc.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "Portal BMO - Partituras";
const FOLDER_CACHE_KEY = "portalBmoDriveFolderId";

let tokenClient;
let accessToken = "";
let tokenExpiresAt = 0;
let pendingTokenResolve = null;
let pendingTokenReject = null;

function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return Promise.resolve(accessToken);
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith("COLE_AQUI")) {
    throw new Error("Configure o Client ID do Google em js/google-drive.js antes de enviar PDFs.");
  }
  if (!window.google?.accounts?.oauth2) {
    throw new Error("A biblioteca de autenticação do Google não carregou. Atualize a página.");
  }
  return new Promise((resolve, reject) => {
    pendingTokenResolve = resolve;
    pendingTokenReject = reject;
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            pendingTokenReject?.(new Error(response.error_description || response.error || "Autorização do Google não concluída."));
          } else {
            accessToken = response.access_token;
            tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
            pendingTokenResolve?.(accessToken);
          }
          pendingTokenResolve = null;
          pendingTokenReject = null;
        },
        error_callback: (error) => {
          pendingTokenReject?.(new Error(error?.message || "Falha na janela de autorização do Google."));
          pendingTokenResolve = null;
          pendingTokenReject = null;
        }
      });
    }
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function driveRequest(url, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json())?.error?.message || ""; } catch {}
    throw new Error(detail || `Google Drive respondeu ${response.status}.`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function getOrCreateFolder() {
  let folderId = localStorage.getItem(FOLDER_CACHE_KEY);
  if (folderId) {
    try {
      const existing = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,trashed`);
      if (existing?.id && !existing.trashed) return folderId;
    } catch { localStorage.removeItem(FOLDER_CACHE_KEY); }
  }
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name)`);
  folderId = found.files?.[0]?.id;
  if (!folderId) {
    const created = await driveRequest("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
    });
    folderId = created.id;
  }
  localStorage.setItem(FOLDER_CACHE_KEY, folderId);
  return folderId;
}

export async function uploadPdfToDrive(file) {
  const folderId = await getOrCreateFolder();
  const metadata = { name: file.name, mimeType: "application/pdf", parents: [folderId] };
  const boundary = "bmo_drive_upload_boundary";
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  const uploaded = await driveRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader" })
  });
  return {
    id: uploaded.id,
    name: uploaded.name || file.name,
    url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`
  };
}

export async function deleteDriveFile(fileId) {
  if (!fileId) return;
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}
