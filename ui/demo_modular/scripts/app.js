import {
  closeModal,
  initNavigation,
  initPasswordToggle,
  initThemeToggle,
  openModal,
  showToast,
} from "./core/ui.js";
import { enhanceAllTables } from "./modules/table.js";
import {
  initializeSupplierRowClickSelect,
  addSupplier,
  editSupplier,
  toggleSelectedSupplierStatus,
} from "./modules/supplier.js";
import {
  initializeInboundModule,
  removeInboundFile,
  simulateReview,
} from "./modules/inbound.js";
import {
  confirmSendMails,
  deleteSelectedMailRows,
  initializeMailModule,
  openSendMailModal,
  toggleHideSent,
  toggleMailRowSelect,
} from "./modules/mail.js";

async function loadPageFragment(name) {
  const response = await fetch(`./pages/${name}.html`);
  if (!response.ok) {
    throw new Error(`Failed to load page fragment: ${name}`);
  }
  return response.text();
}

async function mountPages() {
  const names = ["inbound", "mail", "supplier", "settings"];
  const chunks = await Promise.all(names.map((name) => loadPageFragment(name)));
  const container = document.getElementById("mainViews");
  container.innerHTML = chunks.join("\n");
}

function setupDropzone(elementId, onFilesDropped) {
  const zone = document.getElementById(elementId);
  if (!zone) {
    return;
  }
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });
  zone.addEventListener("dragenter", () => zone.classList.add("drag-over"));
  zone.addEventListener("dragover", () => zone.classList.add("drag-over"));
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (event) => {
    zone.classList.remove("drag-over");
    const files = Array.from(event.dataTransfer?.files || []);
    onFilesDropped(files);
  });
}

function exposeGlobalActions() {
  window.showToast = showToast;
  window.openModal = openModal;
  window.closeModal = closeModal;

  window.addSupplier = addSupplier;
  window.editSupplier = editSupplier;
  window.toggleSelectedSupplierStatus = toggleSelectedSupplierStatus;

  window.simulateReview = simulateReview;
  window.removeInboundFile = removeInboundFile;

  window.openSendMailModal = openSendMailModal;
  window.confirmSendMails = confirmSendMails;
  window.toggleHideSent = toggleHideSent;
  window.deleteSelectedMailRows = deleteSelectedMailRows;
  window.toggleMailRowSelect = toggleMailRowSelect;
}

async function bootstrap() {
  await mountPages();
  exposeGlobalActions();

  initNavigation();
  initThemeToggle();
  initPasswordToggle();

  initializeSupplierRowClickSelect();
  initializeMailModule(setupDropzone);
  initializeInboundModule(setupDropzone);

  ["dragover", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
    });
  });

  enhanceAllTables();
}

bootstrap().catch((error) => {
  console.error(error);
  showToast(`模块化Demo初始化失败: ${error.message}`, "error");
});
