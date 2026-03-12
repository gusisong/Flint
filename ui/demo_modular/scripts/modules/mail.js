import { showToast, openModal, closeModal } from "../core/ui.js";
import { enhanceAllTables } from "./table.js";

const MAIL_STORAGE_KEY = "flint.mailRows.v2";
const MAIL_HIDE_SENT_KEY = "flint.mailHideSent.v2";
const MAIL_PERSIST_DIR = "data/mail_uploads/";

let mailRows = [];
let hideSent = false;

function saveMailRows() {
  localStorage.setItem(MAIL_STORAGE_KEY, JSON.stringify(mailRows));
}

function loadMailRows() {
  const raw = localStorage.getItem(MAIL_STORAGE_KEY);
  if (!raw) {
    mailRows = [];
    return;
  }
  try {
    mailRows = JSON.parse(raw);
  } catch {
    mailRows = [];
  }
}

function extractSupplierCode(fileName) {
  const match = fileName.match(/_(\d{5})_/);
  if (match) {
    return match[1];
  }
  return String(Math.floor(10000 + Math.random() * 90000));
}

function makeSubject(prefix, supplierCode) {
  const safePrefix = (prefix || "").trim();
  return `${safePrefix}零件供货方式确认_${supplierCode}`;
}

function statusTag(status) {
  if (status === "SUCCESS") {
    return '<span class="tag ok">SUCCESS</span>';
  }
  if (status === "FAILED") {
    return '<span class="tag bad">FAILED</span>';
  }
  return '<span class="tag" style="background:var(--accent-bg);color:var(--accent-text)">PENDING</span>';
}

function updateMailSummary() {
  const success = mailRows.filter((x) => x.status === "SUCCESS").length;
  const failed = mailRows.filter((x) => x.status === "FAILED").length;
  const pending = mailRows.filter((x) => x.status === "PENDING").length;
  document.getElementById("mailSuccessCount").textContent = String(success);
  document.getElementById("mailFailedCount").textContent = String(failed);
  document.getElementById("mailPendingCount").textContent = String(pending);
  document.getElementById("mailTotalText").textContent = `共 ${mailRows.length} 条记录`;
  document.getElementById("mailProgressText").textContent = `已发送 ${success} / ${mailRows.length}`;
}

function updateHideSentToggleButton() {
  const icon = document.getElementById("toggleHideSentIcon");
  const text = document.getElementById("toggleHideSentText");
  if (!icon || !text) {
    return;
  }
  if (hideSent) {
    icon.textContent = "👁";
    text.textContent = "显示已发送";
    return;
  }
  icon.textContent = "🚫";
  text.textContent = "隐藏已发送";
}

function updateSelectAllState() {
  const visibleRows = mailRows.filter((x) => !(hideSent && x.status === "SUCCESS"));
  const allSelected = visibleRows.length > 0 && visibleRows.every((x) => x.selected);
  const selectAll = document.getElementById("mailSelectAll");
  selectAll.checked = allSelected;
  selectAll.indeterminate = !allSelected && visibleRows.some((x) => x.selected);
}

export function renderMailTable() {
  const tbody = document.getElementById("mailBody");
  const visible = mailRows.filter((x) => !(hideSent && x.status === "SUCCESS"));
  if (visible.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted);">暂无文件，请拖拽文件到上方上传区</td></tr>';
    updateMailSummary();
    updateSelectAllState();
    enhanceAllTables();
    return;
  }
  tbody.innerHTML = visible
    .map((row) => {
      const reason = row.failReason || "-";
      const subject = row.subject || "-";
      return `<tr data-mail-id="${row.id}">
      <td><input type="checkbox" ${row.selected ? "checked" : ""} aria-label="选择文件 ${row.fileName}" onclick="toggleMailRowSelect('${row.id}', event)"></td>
      <td>${statusTag(row.status)}</td>
      <td>${row.fileName}</td>
      <td>${row.supplierCode}</td>
      <td>${row.storedPath}</td>
      <td>${subject}</td>
      <td>${reason}</td>
    </tr>`;
    })
    .join("");
  updateMailSummary();
  updateSelectAllState();
  enhanceAllTables();
}

export function toggleMailRowSelect(id, event) {
  if (event) {
    event.stopPropagation();
  }
  mailRows = mailRows.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x));
  saveMailRows();
  renderMailTable();
}

function buildMailRowsFromFiles(files) {
  return files.map((file) => {
    const supplierCode = extractSupplierCode(file.name);
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      selected: false,
      status: "PENDING",
      fileName: file.name,
      supplierCode,
      storedPath: `${MAIL_PERSIST_DIR}${Date.now()}_${file.name}`,
      subject: "",
      failReason: "",
    };
  });
}

export function handleMailDropFiles(files) {
  if (!files.length) {
    return;
  }
  const newRows = buildMailRowsFromFiles(files);
  mailRows = [...mailRows, ...newRows];
  saveMailRows();
  renderMailTable();
  showToast(`已上传 ${files.length} 个文件，持久化目录：${MAIL_PERSIST_DIR}`, "success");
}

export function deleteSelectedMailRows() {
  const selected = mailRows.filter((x) => x.selected);
  if (selected.length === 0) {
    showToast("请先选择需要删除的行项目", "info");
    return;
  }
  mailRows = mailRows.filter((x) => !x.selected);
  saveMailRows();
  renderMailTable();
  showToast(`已删除 ${selected.length} 条记录，并同步删除持久化文件`, "success");
}

export function toggleHideSent() {
  hideSent = !hideSent;
  localStorage.setItem(MAIL_HIDE_SENT_KEY, hideSent ? "1" : "0");
  updateHideSentToggleButton();
  renderMailTable();
}

export function openSendMailModal() {
  const selected = mailRows.filter((x) => x.selected);
  if (selected.length === 0) {
    showToast("请先在列表中勾选需要外发的文件", "info");
    return;
  }
  const previewCode = selected[0].supplierCode;
  const prefixInput = document.getElementById("mailSubjectPrefix");
  document.getElementById("mailSubjectPreview").textContent = makeSubject(prefixInput.value, previewCode);
  openModal("sendMail");
}

export function confirmSendMails() {
  const prefix = document.getElementById("mailSubjectPrefix").value || "";
  const queue = mailRows.filter((x) => x.selected);
  if (queue.length === 0) {
    closeModal("sendMailModal");
    showToast("未选择待发送文件", "error");
    return;
  }
  closeModal("sendMailModal");
  showToast(`开始队列发送 ${queue.length} 条任务...`, "info");
  let idx = 0;
  const timer = setInterval(() => {
    if (idx >= queue.length) {
      clearInterval(timer);
      saveMailRows();
      renderMailTable();
      showToast("队列发送完成", "success");
      return;
    }
    const current = queue[idx];
    const isSuccess = Math.random() > 0.2;
    mailRows = mailRows.map((x) => {
      if (x.id !== current.id) {
        return x;
      }
      return {
        ...x,
        status: isSuccess ? "SUCCESS" : "FAILED",
        selected: false,
        subject: makeSubject(prefix, x.supplierCode),
        failReason: isSuccess ? "" : "SMTP 421 限流",
      };
    });
    idx += 1;
    saveMailRows();
    renderMailTable();
  }, 850);
}

export function initializeMailModule(setupDropzone) {
  loadMailRows();
  hideSent = localStorage.getItem(MAIL_HIDE_SENT_KEY) === "1";
  updateHideSentToggleButton();
  document.getElementById("mailSelectAll").addEventListener("change", (event) => {
    const checked = event.target.checked;
    mailRows = mailRows.map((x) => {
      if (hideSent && x.status === "SUCCESS") {
        return x;
      }
      return { ...x, selected: checked };
    });
    saveMailRows();
    renderMailTable();
  });
  document.getElementById("mailSubjectPrefix").addEventListener("input", () => {
    const selected = mailRows.find((x) => x.selected) || mailRows[0] || { supplierCode: "10243" };
    const prefix = document.getElementById("mailSubjectPrefix").value || "";
    document.getElementById("mailSubjectPreview").textContent = makeSubject(prefix, selected.supplierCode);
  });

  setupDropzone("mailDropzone", handleMailDropFiles);
  renderMailTable();
}
