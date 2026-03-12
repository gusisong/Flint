import { showToast } from "../core/ui.js";
import { enhanceAllTables } from "./table.js";

const INBOUND_UPLOAD_KEY = "flint.inboundUploads.v1";

let inboundSelectedFiles = [];
let inboundUploadSeq = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function saveInboundSelectedFiles() {
  const payload = inboundSelectedFiles.map((entry) => ({
    id: entry.id,
    fileName: entry.fileName || entry.file?.name || "",
  }));
  localStorage.setItem(INBOUND_UPLOAD_KEY, JSON.stringify(payload));
}

function loadInboundSelectedFiles() {
  const raw = localStorage.getItem(INBOUND_UPLOAD_KEY);
  if (!raw) {
    inboundSelectedFiles = [];
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    inboundSelectedFiles = Array.isArray(parsed)
      ? parsed
          .filter((entry) => entry && entry.id && entry.fileName)
          .map((entry) => ({ id: entry.id, fileName: entry.fileName }))
      : [];
  } catch {
    inboundSelectedFiles = [];
  }
}

export function renderInboundUploadedFiles() {
  const container = document.getElementById("inboundUploadedFiles");
  if (!container) {
    return;
  }
  if (inboundSelectedFiles.length === 0) {
    container.classList.add("empty");
    container.textContent = "尚未上传文件";
    return;
  }

  container.classList.remove("empty");
  const visible = inboundSelectedFiles.slice(0, 10);
  const hiddenCount = Math.max(0, inboundSelectedFiles.length - visible.length);
  const listHtml = visible
    .map((entry) => {
      const fileName = entry.fileName || entry.file?.name || "未知文件";
      return `<div class="uploaded-file-item">
        <span class="uploaded-file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
        <button class="uploaded-file-remove" type="button" title="移除文件" aria-label="移除 ${escapeHtml(fileName)}" onclick="removeInboundFile('${entry.id}')">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>`;
    })
    .join("");

  const summary = `<div>已上传 ${inboundSelectedFiles.length} 个文件</div>`;
  const foldHint = hiddenCount > 0 ? `<div>其余 ${hiddenCount} 个文件已折叠显示</div>` : "";
  container.innerHTML = `${summary}<div class="uploaded-file-list">${listHtml}</div>${foldHint}`;
}

export function removeInboundFile(fileId) {
  const previous = inboundSelectedFiles.length;
  inboundSelectedFiles = inboundSelectedFiles.filter((entry) => entry.id !== fileId);
  if (inboundSelectedFiles.length === previous) {
    return;
  }
  saveInboundSelectedFiles();
  renderInboundUploadedFiles();
  showToast(`已移除文件，剩余 ${inboundSelectedFiles.length} 个（已同步队列）`, "info");
}

export function handleInboundDropFiles(files) {
  if (!files.length) {
    return;
  }
  const nextEntries = files.map((file) => ({
    id: `inbound_${Date.now()}_${inboundUploadSeq++}`,
    file,
    fileName: file.name,
  }));
  inboundSelectedFiles = [...inboundSelectedFiles, ...nextEntries];
  saveInboundSelectedFiles();
  renderInboundUploadedFiles();
  showToast(`Inbound 已接收 ${inboundSelectedFiles.length} 个文件（已同步队列）`, "success");
}

export function simulateReview() {
  if (inboundSelectedFiles.length === 0) {
    showToast("请先拖拽 Inbound 文件到上传区域", "info");
    return;
  }
  const tbody = document.getElementById("inboundBody");
  tbody.innerHTML = `
    <tr class="skeleton-row"><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:48px"></div></td><td><div class="skeleton" style="width:64px"></div></td><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:180px"></div></td></tr>
    <tr class="skeleton-row"><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:48px"></div></td><td><div class="skeleton" style="width:64px"></div></td><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:180px"></div></td></tr>
    <tr class="skeleton-row"><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:48px"></div></td><td><div class="skeleton" style="width:64px"></div></td><td><div class="skeleton" style="width:120px"></div></td><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:180px"></div></td></tr>
  `;
  document.getElementById("inboundSummary").innerHTML = '<span style="color:var(--brand)">审查中...</span>';
  setTimeout(() => {
    tbody.innerHTML = `
      <tr><td>Inbound_W12.xlsx</td><td>54</td><td>WUH</td><td>10243</td><td>ACME Corp</td><td>P-A1021</td><td>前桥总成</td><td><div class="issue-tags"><span class="issue-tag code">供应商编码不一致</span><span class="issue-tag method">Inbound方式错误</span></div></td></tr>
      <tr><td>Inbound_W12.xlsx</td><td>78</td><td>SHA</td><td>10876</td><td>GlobalParts Ltd</td><td>P-B7780</td><td>制动卡钳</td><td><div class="issue-tags"><span class="issue-tag distance">运输距离超限</span></div></td></tr>
      <tr><td>Inbound_W13.xlsx</td><td>12</td><td>NAN</td><td>11502</td><td>东方精密</td><td>P-C4412</td><td>稳定杆</td><td><div class="issue-tags"><span class="issue-tag required">缺少必填字段</span><span class="issue-tag whitelist">白名单外组合</span></div></td></tr>
      <tr><td>Inbound_W14.xlsx</td><td>33</td><td>TJN</td><td>12011</td><td>北辰制造</td><td>P-D3320</td><td>散热支架</td><td><div class="issue-tags"><span class="issue-tag vmi">VMI规则冲突</span></div></td></tr>
    `;
    document.getElementById("inboundSummary").innerHTML = `
      <div class="stat"><span><span class="dot red"></span> 编码相关 1</span><span><span class="dot orange"></span> 距离相关 1</span><span><span class="dot gray"></span> 规则相关 2</span></div>
      <span>共 4 条问题 · 4 个文件</span>
    `;
    enhanceAllTables();
    showToast(`审查完成：发现 4 条问题（已审查 ${inboundSelectedFiles.length} 个文件）`, "success");
  }, 1800);
}

export function initializeInboundModule(setupDropzone) {
  loadInboundSelectedFiles();
  setupDropzone("inboundDropzone", handleInboundDropFiles);
  renderInboundUploadedFiles();
}
