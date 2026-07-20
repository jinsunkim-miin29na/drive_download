const els = {
  driveLink: document.querySelector("#driveLink"),
  albumName: document.querySelector("#albumName"),
  pasteButton: document.querySelector("#pasteButton"),
  prepareButton: document.querySelector("#prepareButton"),
  clearButton: document.querySelector("#clearButton"),
  shortcutButton: document.querySelector("#shortcutButton"),
  copyPayloadButton: document.querySelector("#copyPayloadButton"),
  downloadLink: document.querySelector("#downloadLink"),
  payloadPreview: document.querySelector("#payloadPreview"),
  statusStrip: document.querySelector("#statusStrip"),
  linkType: document.querySelector("#linkType"),
};

const SHORTCUT_NAME = "Drive Album Save";
const STORAGE_KEY = "drive-album-helper-state";
let currentPayload = null;

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

function saveState() {
  const state = {
    driveLink: els.driveLink.value,
    albumName: els.albumName.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    const state = JSON.parse(saved);
    els.driveLink.value = state.driveLink || "";
    els.albumName.value = state.albumName || "";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function updateResult(payload) {
  currentPayload = payload;
  els.payloadPreview.textContent = JSON.stringify(payload || {}, null, 2);

  const hasPayload = Boolean(payload);
  els.shortcutButton.disabled = !hasPayload;
  els.copyPayloadButton.disabled = !hasPayload;

  if (payload?.openUrl) {
    els.downloadLink.href = payload.openUrl;
    els.downloadLink.classList.remove("is-disabled");
  } else {
    els.downloadLink.href = "#";
    els.downloadLink.classList.add("is-disabled");
  }
}

function prepare() {
  const albumName = els.albumName.value.trim();
  const info = extractDriveInfo(els.driveLink.value);

  if (!info) {
    els.linkType.textContent = "오류";
    updateResult(null);
    setStatus("Google Drive 공유 주소를 먼저 넣어주세요.", true);
    return;
  }

  if (!albumName) {
    els.linkType.textContent = "오류";
    updateResult(null);
    setStatus("아이폰 사진 앱에 만들 앨범 이름을 입력해주세요.", true);
    return;
  }

  const payload = {
    albumName,
    source: "google-drive",
    type: info.type,
    id: info.id,
    url: info.url,
    openUrl: info.openUrl,
    createdAt: new Date().toISOString(),
  };

  els.linkType.textContent = info.type === "folder" ? "폴더" : info.type === "file" ? "파일" : "링크";
  updateResult(payload);
  saveState();

  if (info.type === "folder") {
    setStatus("폴더 링크입니다. 단축어가 폴더 ZIP 또는 Drive 열기 흐름으로 이어받게 준비했습니다.");
  } else if (info.type === "file") {
    setStatus("파일 링크입니다. 직접 다운로드 주소와 단축어 실행 정보를 만들었습니다.");
  } else {
    setStatus("Drive 링크로 보이지만 파일/폴더 ID를 찾지 못했습니다. 원본 링크를 그대로 전달합니다.");
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    els.driveLink.value = text;
    prepare();
  } catch {
    setStatus("클립보드 권한을 받을 수 없습니다. 주소를 길게 눌러 직접 붙여넣어 주세요.", true);
  }
}

async function copyPayload() {
  if (!currentPayload) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(currentPayload));
    setStatus("단축어 입력 정보를 클립보드에 복사했습니다.");
  } catch {
    setStatus("복사가 막혔습니다. 아래 JSON을 길게 눌러 복사해주세요.", true);
  }
}

function runShortcut() {
  if (!currentPayload) return;

  const shortcutUrl = new URL("shortcuts://run-shortcut");
  shortcutUrl.searchParams.set("name", SHORTCUT_NAME);
  shortcutUrl.searchParams.set("input", "text");
  shortcutUrl.searchParams.set("text", JSON.stringify(currentPayload));
  window.location.href = shortcutUrl.toString();
}

function clearAll() {
  els.driveLink.value = "";
  els.albumName.value = "";
  els.linkType.textContent = "대기";
  updateResult(null);
  localStorage.removeItem(STORAGE_KEY);
  setStatus("링크를 넣으면 가능한 저장 방법을 확인합니다.");
}

els.prepareButton.addEventListener("click", prepare);
els.pasteButton.addEventListener("click", pasteFromClipboard);
els.copyPayloadButton.addEventListener("click", copyPayload);
els.shortcutButton.addEventListener("click", runShortcut);
els.clearButton.addEventListener("click", clearAll);
els.driveLink.addEventListener("input", saveState);
els.albumName.addEventListener("input", saveState);

restoreState();
if (els.driveLink.value || els.albumName.value) {
  prepare();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
