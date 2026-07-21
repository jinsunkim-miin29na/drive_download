const els = {
  driveLink: document.querySelector("#driveLink"),
  albumName: document.querySelector("#albumName"),
  clientId: document.querySelector("#clientId"),
  pasteButton: document.querySelector("#pasteButton"),
  loginButton: document.querySelector("#loginButton"),
  scanButton: document.querySelector("#scanButton"),
  prepareButton: document.querySelector("#prepareButton"),
  clearButton: document.querySelector("#clearButton"),
  shortcutButton: document.querySelector("#shortcutButton"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  copyCallbackButton: document.querySelector("#copyCallbackButton"),
  compareButton: document.querySelector("#compareButton"),
  savedCount: document.querySelector("#savedCount"),
  batchStart: document.querySelector("#batchStart"),
  batchSize: document.querySelector("#batchSize"),
  batchStatus: document.querySelector("#batchStatus"),
  compareResult: document.querySelector("#compareResult"),
  progressResult: document.querySelector("#progressResult"),
  downloadLink: document.querySelector("#downloadLink"),
  payloadPreview: document.querySelector("#payloadPreview"),
  statusStrip: document.querySelector("#statusStrip"),
  linkType: document.querySelector("#linkType"),
  payloadState: document.querySelector("#payloadState"),
  imageCount: document.querySelector("#imageCount"),
  videoCount: document.querySelector("#videoCount"),
  totalCount: document.querySelector("#totalCount"),
  fileList: document.querySelector("#fileList"),
};

const SHORTCUT_NAME = "Drive Album Save";
const STORAGE_KEY = "drive-save-state";
const PROGRESS_KEY = "drive-save-progress";
const IMAGE_PREFIX = "image/";
const VIDEO_PREFIX = "video/";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DEFAULT_CLIENT_ID = "1001713877115-or3ne8osm3hcc2rnh3hfjavtrsv6c0pg.apps.googleusercontent.com";

let currentPayload = null;
let driveFiles = [];
let driveInfo = null;
let accessToken = "";
let tokenClient = null;

function extractDriveInfo(rawText) {
  const text = rawText.trim();
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const path = url.pathname;
  const folderMatch = path.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  const fileMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const openId = url.searchParams.get("id");

  if (folderMatch) {
    return {
      id: folderMatch[1],
      type: "folder",
      url: text,
      openUrl: `https://drive.google.com/drive/folders/${folderMatch[1]}`,
    };
  }

  const fileId = fileMatch?.[1] || openId;
  if (fileId) {
    return {
      id: fileId,
      type: "file",
      url: text,
      openUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    };
  }

  return {
    id: "",
    type: "unknown",
    url: text,
    openUrl: text,
  };
}

function setStatus(message, isError = false) {
  els.statusStrip.textContent = message;
  els.statusStrip.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  els.scanButton.disabled = isBusy;
  els.prepareButton.disabled = isBusy;
  els.scanButton.textContent = isBusy ? "확인 중" : "Drive 확인";
}

function saveState() {
  const state = {
    driveLink: els.driveLink.value,
    albumName: els.albumName.value,
    batchStart: els.batchStart.value,
    batchSize: els.batchSize.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const progress = readProgress();
  const restoredStart = progress.lastSaved ? String(progress.lastSaved + 1) : "1";
  if (!saved) {
    els.batchStart.value = restoredStart;
    els.clientId.value = DEFAULT_CLIENT_ID;
    return;
  }

  try {
    const state = JSON.parse(saved);
    els.driveLink.value = state.driveLink || "";
    els.albumName.value = state.albumName || "";
    els.batchStart.value = progress.lastSaved ? restoredStart : state.batchStart || "1";
    els.batchSize.value = state.batchSize || "50";
    els.clientId.value = DEFAULT_CLIENT_ID;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    els.clientId.value = DEFAULT_CLIENT_ID;
  }
}

function summarizeFiles(files) {
  const images = files.filter((file) => file.mimeType?.startsWith(IMAGE_PREFIX));
  const videos = files.filter((file) => file.mimeType?.startsWith(VIDEO_PREFIX));
  return {
    imageCount: images.length,
    videoCount: videos.length,
    totalCount: images.length + videos.length,
  };
}

function renderFiles(files) {
  const summary = summarizeFiles(files);
  const progress = readProgress();
  const lastSaved = Number(progress.lastSaved || 0);
  els.imageCount.textContent = String(summary.imageCount);
  els.videoCount.textContent = String(summary.videoCount);
  els.totalCount.textContent = String(summary.totalCount);

  if (!files.length) {
    els.fileList.textContent = "사진/동영상 파일을 찾지 못했습니다.";
    return;
  }

  els.fileList.innerHTML = "";

  for (const [index, file] of files.entries()) {
    const number = index + 1;
    const isDone = number <= lastSaved;
    const row = document.createElement("div");
    row.className = `file-row ${isDone ? "is-done" : "is-pending"}`;
    row.innerHTML = `
      <span>${number}. ${escapeHtml(file.name)}</span>
      <small>${isDone ? "완료" : "미완료"} · ${file.mimeType?.startsWith(IMAGE_PREFIX) ? "사진" : "동영상"}</small>
    `;
    els.fileList.appendChild(row);
  }

  updateBatchStatus();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mediaFileFromDrive(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    kind: file.mimeType?.startsWith(IMAGE_PREFIX) ? "image" : "video",
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    authorizationHeader: "Bearer {ACCESS_TOKEN}",
    webViewLink: file.webViewLink,
  };
}

function getBatchSettings() {
  const total = driveFiles.length;
  const rawStart = Number.parseInt(els.batchStart.value, 10);
  const rawSize = Number.parseInt(els.batchSize.value, 10);
  const start = Math.min(Math.max(Number.isFinite(rawStart) ? rawStart : 1, 1), Math.max(total, 1));
  const size = Math.min(Math.max(Number.isFinite(rawSize) ? rawSize : 50, 1), 200);
  const end = Math.min(start + size - 1, total);
  return {
    start,
    size,
    end,
    total,
    zeroStart: start - 1,
    zeroEnd: end,
  };
}

function getBatchFiles() {
  if (!driveFiles.length) return [];
  const batch = getBatchSettings();
  return driveFiles.slice(batch.zeroStart, batch.zeroEnd);
}

function updateBatchStatus() {
  const progress = readProgress();
  if (!driveFiles.length) {
    els.batchStatus.textContent = "Drive 확인 후 이번 묶음 범위를 표시합니다.";
    els.progressResult.textContent = progress.lastSaved
      ? `이전에 ${progress.lastSaved}번까지 저장했다고 기록되어 있습니다.`
      : "아직 저장 완료 위치가 없습니다.";
    return;
  }

  const batch = getBatchSettings();
  els.batchStart.value = String(batch.start);
  els.batchSize.value = String(batch.size);
  els.batchStatus.textContent = `이번 묶음: ${batch.start}~${batch.end}번 / 전체 ${batch.total}개`;
  els.progressResult.textContent = progress.lastSaved
    ? `저장 완료 기록: ${progress.lastSaved}번까지. 다음 시작 추천: ${Math.min(progress.lastSaved + 1, batch.total)}번`
    : "아직 저장 완료 위치가 없습니다.";
}

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeProgress(lastSaved) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({
    lastSaved,
    updatedAt: new Date().toISOString(),
  }));
}

function suggestNextBatchStart() {
  const progress = readProgress();
  if (!progress.lastSaved) return;
  const next = Math.min(progress.lastSaved + 1, Math.max(driveFiles.length, progress.lastSaved + 1));
  els.batchStart.value = String(next);
  updateBatchStatus();
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > 8000) {
        window.clearInterval(timer);
        reject(new Error("Google 로그인 라이브러리를 불러오지 못했습니다."));
      }
    }, 100);
  });
}

async function ensureAccessToken(prompt = "") {
  const clientId = els.clientId.value.trim();
  if (!clientId) {
    throw new Error("Google OAuth Client ID를 입력해주세요.");
  }

  await waitForGoogleIdentity();

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        accessToken = response.access_token;
        els.loginButton.textContent = "로그인됨";
        setStatus("Google Drive 읽기 권한을 받았습니다.");
        resolve(accessToken);
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

async function loginGoogle() {
  saveState();
  try {
    await ensureAccessToken("consent");
  } catch (error) {
    setStatus(`Google 로그인 실패: ${error.message}`, true);
  }
}

async function fetchDriveFolderFiles(folderId) {
  const files = [];
  let pageToken = "";
  const token = accessToken || await ensureAccessToken("");

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,webViewLink)",
      pageSize: "1000",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody?.error?.message || `Drive API 오류 ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files
    .filter((file) => file.mimeType?.startsWith(IMAGE_PREFIX) || file.mimeType?.startsWith(VIDEO_PREFIX))
    .map(mediaFileFromDrive);
}

async function scanDrive() {
  saveState();
  driveInfo = extractDriveInfo(els.driveLink.value);
  driveFiles = [];
  updatePayload(null);
  renderFiles([]);

  if (!driveInfo) {
    els.linkType.textContent = "오류";
    setStatus("Google Drive 공유 주소를 먼저 넣어주세요.", true);
    return;
  }

  els.linkType.textContent = driveInfo.type === "folder" ? "폴더" : driveInfo.type === "file" ? "파일" : "링크";
  els.downloadLink.href = driveInfo.openUrl;
  els.downloadLink.classList.remove("is-disabled");

  if (driveInfo.type === "file") {
    driveFiles = [{
      id: driveInfo.id,
      name: "Drive 파일",
      mimeType: "application/octet-stream",
      kind: "file",
      downloadUrl: driveInfo.openUrl,
      webViewLink: driveInfo.url,
    }];
    els.imageCount.textContent = "0";
    els.videoCount.textContent = "0";
    els.totalCount.textContent = "1";
    els.fileList.textContent = "단일 파일 링크입니다. 사진/동영상 여부는 단축어 다운로드 단계에서 확인합니다.";
    setStatus("단일 파일 링크입니다. 폴더 개수 확인 없이 단축어로 넘길 수 있습니다.");
    updateBatchStatus();
    return;
  }

  if (driveInfo.type !== "folder") {
    setStatus("폴더 또는 파일 ID를 찾지 못했습니다. Drive 공유 링크 형식을 확인해주세요.", true);
    return;
  }

  setBusy(true);
  setStatus("Drive 폴더에서 사진/동영상 목록을 확인하는 중입니다.");

  try {
    driveFiles = await fetchDriveFolderFiles(driveInfo.id);
    renderFiles(driveFiles);
    suggestNextBatchStart();
    const summary = summarizeFiles(driveFiles);
    setStatus(`Drive 폴더에서 사진 ${summary.imageCount}개, 동영상 ${summary.videoCount}개를 찾았습니다.`);
  } catch (error) {
    setStatus(`Drive 목록 확인 실패: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function buildPayload() {
  const albumName = els.albumName.value.trim();
  driveInfo = driveInfo || extractDriveInfo(els.driveLink.value);

  if (!driveInfo) {
    setStatus("Google Drive 공유 주소를 먼저 넣어주세요.", true);
    return null;
  }

  if (!albumName) {
    setStatus("아이폰 사진 앱에 만들 앨범 이름을 입력해주세요.", true);
    return null;
  }

  if (driveInfo.type === "file" && driveFiles.length === 0) {
    driveFiles = [{
      id: driveInfo.id,
      name: "Drive 파일",
      mimeType: "application/octet-stream",
      kind: "file",
      downloadUrl: driveInfo.openUrl,
      authorizationHeader: accessToken ? "Bearer {ACCESS_TOKEN}" : "",
      webViewLink: driveInfo.url,
    }];
  }

  els.linkType.textContent = driveInfo.type === "folder" ? "폴더" : driveInfo.type === "file" ? "파일" : "링크";

  const summary = summarizeFiles(driveFiles);
  const batch = getBatchSettings();
  const selectedFiles = getBatchFiles();
  const selectedSummary = summarizeFiles(selectedFiles);
  const expectedCount = driveInfo.type === "folder" ? selectedFiles.length : Math.max(selectedFiles.length, 1);

  return {
    albumName,
    source: "google-drive",
    type: driveInfo.type,
    folderId: driveInfo.type === "folder" ? driveInfo.id : "",
    id: driveInfo.id,
    url: driveInfo.url,
    openUrl: driveInfo.openUrl,
    expectedCount,
    mediaSummary: selectedSummary,
    totalMediaSummary: summary,
    batch: {
      start: batch.start,
      end: batch.end,
      size: batch.size,
      total: batch.total,
    },
    files: selectedFiles,
    accessToken,
    authorizationHeader: accessToken ? `Bearer ${accessToken}` : "",
    callbackUrl: makeCallbackUrl(expectedCount, albumName),
    createdAt: new Date().toISOString(),
  };
}

function makeCallbackUrl(expectedCount, albumName) {
  const callback = new URL(window.location.href);
  callback.search = "";
  callback.hash = "";
  callback.searchParams.set("expected", String(expectedCount));
  callback.searchParams.set("album", albumName);
  callback.searchParams.set("saved", "{SAVED_COUNT}");
  return callback.toString();
}

function updatePayload(payload) {
  currentPayload = payload;
  window.currentPayload = payload;
  els.payloadPreview.textContent = JSON.stringify(payload || {}, null, 2);
  els.payloadState.textContent = payload ? "생성됨" : "미생성";
  els.payloadState.classList.toggle("muted", !payload);

  const hasPayload = Boolean(payload);
  els.shortcutButton.disabled = !hasPayload;
  els.copyPayloadButton.disabled = !hasPayload;
  els.copyCallbackButton.disabled = !hasPayload;

  if (payload?.openUrl) {
    els.downloadLink.href = payload.openUrl;
    els.downloadLink.classList.remove("is-disabled");
  }
}

function prepare() {
  saveState();
  const payload = buildPayload();
  if (!payload) {
    updatePayload(null);
    return;
  }

  updatePayload(payload);
  if (payload.type === "folder" && payload.expectedCount === 0) {
    setStatus("payload는 만들었지만 Drive에서 사진/동영상을 찾지 못했습니다. 공유 권한과 로그인 계정을 확인해주세요.", true);
    return;
  }

  if (payload.batch) {
    setStatus(`이번 묶음 ${payload.batch.start}~${payload.batch.end}번, ${payload.expectedCount}개를 단축어에 넘깁니다.`);
  } else {
    setStatus(`단축어에 넘길 목록을 만들었습니다. 예상 다운로드 개수는 ${payload.expectedCount}개입니다.`);
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    els.driveLink.value = text;
    saveState();
  } catch {
    setStatus("클립보드 권한을 받을 수 없습니다. 주소를 길게 눌러 직접 붙여넣어 주세요.", true);
  }
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    setStatus("복사가 막혔습니다. 아래 내용을 길게 눌러 복사해주세요.", true);
  }
}

function copyPayload() {
  if (!currentPayload) return;
  copyText(JSON.stringify(currentPayload), "단축어 입력 정보를 클립보드에 복사했습니다.");
}

function copyCallback() {
  if (!currentPayload) return;
  copyText(currentPayload.callbackUrl, "단축어 완료 후 열 콜백 주소를 복사했습니다.");
}

function runShortcut() {
  if (!currentPayload) return;

  const payloadText = JSON.stringify(currentPayload);
  const shortcutUrl = buildShortcutUrl("text", payloadText);

  if (shortcutUrl.toString().length > 7500) {
    copyText(payloadText, "파일 목록이 길어서 정보를 클립보드에 복사했습니다. 단축어를 클립보드 입력으로 실행합니다.");
    window.setTimeout(() => {
      window.location.href = buildShortcutUrl("clipboard").toString();
    }, 350);
    return;
  }

  window.location.href = shortcutUrl.toString();
}

function buildShortcutUrl(input, text = "") {
  const params = [
    `name=${encodeURIComponent(SHORTCUT_NAME)}`,
    `input=${encodeURIComponent(input)}`,
  ];
  if (input === "text") {
    params.push(`text=${encodeURIComponent(text)}`);
  }
  return `shortcuts://run-shortcut?${params.join("&")}`;
}

function compareCounts() {
  const payload = currentPayload || window.currentPayload;
  const expected = payload?.expectedCount || Number(new URLSearchParams(window.location.search).get("expected") || 0);
  const saved = Number(els.savedCount.value || new URLSearchParams(window.location.search).get("saved") || 0);

  if (!expected) {
    els.compareResult.textContent = "먼저 Drive 확인 또는 정보 만들기를 실행해주세요.";
    return;
  }

  if (saved === expected) {
    const batch = payload?.batch || getBatchSettings();
    const lastSaved = batch.start + saved - 1;
    writeProgress(lastSaved);
    els.compareResult.textContent = `일치합니다. 이번 묶음 ${expected}개 중 ${saved}개 저장 완료. ${lastSaved}번까지 받았습니다.`;
    els.batchStart.value = String(Math.min(lastSaved + 1, Math.max(batch.total, lastSaved + 1)));
    saveState();
    renderFiles(driveFiles);
    updateBatchStatus();
    return;
  }

  const missing = expected - saved;
  const batch = payload?.batch || getBatchSettings();
  const lastSaved = saved > 0 ? batch.start + saved - 1 : batch.start - 1;
  if (saved > 0) writeProgress(lastSaved);
  els.compareResult.textContent = `차이가 있습니다. 이번 묶음 ${expected}개 중 ${saved}개 저장, 미저장 추정 ${missing}개입니다. ${lastSaved}번까지 받은 것으로 기록했습니다.`;
  saveState();
  renderFiles(driveFiles);
  updateBatchStatus();
}

function applyCallbackParams() {
  const params = new URLSearchParams(window.location.search);
  const expected = params.get("expected");
  const saved = params.get("saved");
  const album = params.get("album");

  if (!expected && !saved) return;
  if (album) els.albumName.value = album;
  if (saved && !saved.includes("{")) els.savedCount.value = saved;
  els.totalCount.textContent = expected || "0";
  compareCounts();
}

function clearAll() {
  els.driveLink.value = "";
  els.albumName.value = "";
  els.clientId.value = DEFAULT_CLIENT_ID;
  els.savedCount.value = "";
  els.batchStart.value = "1";
  els.batchSize.value = "50";
  driveFiles = [];
  driveInfo = null;
  accessToken = "";
  tokenClient = null;
  els.loginButton.textContent = "Google 로그인";
  els.linkType.textContent = "대기";
  renderFiles([]);
  updatePayload(null);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PROGRESS_KEY);
  setStatus("Drive 폴더를 확인하려면 공유 주소, 앨범 이름, OAuth Client ID를 넣고 Google 로그인을 해주세요.");
  els.compareResult.textContent = "Drive 확인 후 성공 개수를 입력하면 차이를 계산합니다.";
  els.progressResult.textContent = "아직 저장 완료 위치가 없습니다.";
}

els.loginButton.addEventListener("click", loginGoogle);
els.scanButton.addEventListener("click", scanDrive);
els.prepareButton.addEventListener("click", prepare);
els.pasteButton.addEventListener("click", pasteFromClipboard);
els.copyPayloadButton.addEventListener("click", copyPayload);
els.copyCallbackButton.addEventListener("click", copyCallback);
els.shortcutButton.addEventListener("click", runShortcut);
els.compareButton.addEventListener("click", compareCounts);
els.clearButton.addEventListener("click", clearAll);
els.driveLink.addEventListener("input", saveState);
els.albumName.addEventListener("input", saveState);
els.clientId.addEventListener("input", saveState);
els.batchStart.addEventListener("input", () => {
  saveState();
  updateBatchStatus();
});
els.batchSize.addEventListener("input", () => {
  saveState();
  updateBatchStatus();
});

restoreState();
applyCallbackParams();
if (els.driveLink.value) {
  driveInfo = extractDriveInfo(els.driveLink.value);
  if (driveInfo) {
    els.linkType.textContent = driveInfo.type === "folder" ? "폴더" : driveInfo.type === "file" ? "파일" : "링크";
    els.downloadLink.href = driveInfo.openUrl;
    els.downloadLink.classList.remove("is-disabled");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
