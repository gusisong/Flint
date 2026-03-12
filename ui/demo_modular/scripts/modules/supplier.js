import { showToast, closeModal } from "../core/ui.js";

export function getSelectedSupplierRow() {
  const selected = document.querySelector('input[name="supplierRow"]:checked');
  return selected ? selected.closest("tr") : null;
}

export function addSupplier() {
  const code = document.getElementById("newSupCode").value || "12345";
  const name = document.getElementById("newSupName").value || "新供应商";
  const email = document.getElementById("newSupEmail").value || "new@example.com";
  const tbody = document.getElementById("supplierBody");
  if (!tbody) {
    return;
  }
  const tr = document.createElement("tr");
  tr.style.animation = "reveal 0.3s ease";
  tr.setAttribute("data-supplier-code", code);
  tr.innerHTML = `<td><input type="radio" name="supplierRow" value="${code}" aria-label="选择供应商 ${code}"></td><td>${code}</td><td>${name}</td><td>${email}</td><td><span class="tag ok">启用</span></td>`;
  tbody.appendChild(tr);
  closeModal("addSupplierModal");
  showToast(`供应商 ${name} 已添加`, "success");
  document.getElementById("newSupCode").value = "";
  document.getElementById("newSupName").value = "";
  document.getElementById("newSupEmail").value = "";
}

export function editSupplier() {
  const row = getSelectedSupplierRow();
  if (!row) {
    showToast("请先选择一个供应商", "info");
    return;
  }
  const supplierName = row.children[2].textContent;
  showToast(`已进入 ${supplierName} 编辑模式`, "info");
}

export function toggleSelectedSupplierStatus() {
  const row = getSelectedSupplierRow();
  if (!row) {
    showToast("请先选择一个供应商", "info");
    return;
  }
  const tag = row.querySelector(".tag");
  const code = row.getAttribute("data-supplier-code") || "-";
  const isEnabled = tag.textContent.trim() === "启用";
  if (isEnabled) {
    tag.textContent = "停用";
    tag.className = "tag disabled";
  } else {
    tag.textContent = "启用";
    tag.className = "tag ok";
  }
  showToast(`供应商 ${code} 状态已切换`, "success");
}

export function initializeSupplierRowClickSelect() {
  const tbody = document.getElementById("supplierBody");
  if (!tbody) {
    return;
  }
  const refreshSelectionStyle = () => {
    tbody.querySelectorAll("tr").forEach((tr) => tr.classList.remove("row-selected"));
    const selected = tbody.querySelector('input[name="supplierRow"]:checked');
    if (selected) {
      selected.closest("tr")?.classList.add("row-selected");
    }
  };
  tbody.addEventListener("click", (event) => {
    const tr = event.target.closest("tr");
    if (!tr) {
      return;
    }
    const radio = tr.querySelector('input[name="supplierRow"]');
    if (!radio) {
      return;
    }
    radio.checked = true;
    refreshSelectionStyle();
  });
  tbody.addEventListener("change", refreshSelectionStyle);
  refreshSelectionStyle();
}
