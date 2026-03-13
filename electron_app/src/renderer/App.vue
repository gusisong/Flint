<template>
  <div class="app-shell">
    <div class="window-controls">
      <button class="window-control-btn" type="button" aria-label="最小化" @click="minimizeWindow">
        <span class="material-symbols-outlined">remove</span>
      </button>
      <button class="window-control-btn" type="button" aria-label="最大化" @click="toggleMaximizeWindow">
        <span class="material-symbols-outlined">{{ isMaximized ? 'filter_none' : 'crop_square' }}</span>
      </button>
      <button class="window-control-btn close" type="button" aria-label="关闭" @click="closeWindow">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div class="shell-inner">
      <aside class="nav">
        <div class="brand-row">
          <div class="brand">
            <img src="/Flint_Icon.png" alt="Flint Icon">
            <span>Flint</span>
          </div>
          <button class="theme-toggle" type="button" title="切换主题" @click="toggleTheme">
            <span class="material-symbols-outlined">{{ themeIcon }}</span>
          </button>
        </div>
        <div class="sub">入厂物流规划运营工具平台</div>
        <div class="menu">
          <button
            v-for="item in navItems"
            :key="item.id"
            :class="{ active: currentView === item.id }"
            type="button"
            @click="currentView = item.id"
          >
            <span class="material-symbols-outlined">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </div>
        <button
          class="nav-settings-btn"
          :class="{ active: currentView === 'settings' }"
          type="button"
          @click="currentView = 'settings'"
        >
          <span class="material-symbols-outlined">settings</span>
          <span>系统设置</span>
        </button>
        <div class="nav-footer">
          <span>Stable · {{ appVersion }}</span>
          <span>{{ appMetaText }}</span>
        </div>
      </aside>

      <main class="main">
        <section class="panel">
          <InboundPage v-if="currentView === 'inbound'" />
          <MailPage v-else-if="currentView === 'mail'" />
          <SupplierPage v-else-if="currentView === 'supplier'" />
          <SettingsPage v-else />
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import InboundPage from "./pages/InboundPage.vue";
import MailPage from "./pages/MailPage.vue";
import SupplierPage from "./pages/SupplierPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const navItems = [
  { id: "inbound", label: "Inbound规划审查", icon: "fact_check" },
  { id: "mail", label: "运输协议外发", icon: "local_shipping" },
  { id: "supplier", label: "供应商管理", icon: "badge" },
];

const currentView = ref("inbound");
const appMetaText = ref("加载中...");
const appVersion = ref("0.1.0");
const isMaximized = ref(false);
const theme = ref(localStorage.getItem("flint.theme") || "light");
const TABLE_WIDTH_STORAGE_KEY = "flint.tableWidthMap.v1";

let offWindowMaximize = null;
let tableObserver = null;
let tableEnhanceTimer = null;

const themeIcon = computed(() => {
  return theme.value === "dark" ? "light_mode" : "dark_mode";
});

function applyTheme(nextTheme) {
  document.documentElement.setAttribute("data-theme", nextTheme);
  localStorage.setItem("flint.theme", nextTheme);
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  applyTheme(theme.value);
}

async function minimizeWindow() {
  await window.flintApi?.minimizeWindow?.();
}

async function toggleMaximizeWindow() {
  const result = await window.flintApi?.toggleMaximizeWindow?.();
  isMaximized.value = !!result?.maximized;
}

async function closeWindow() {
  await window.flintApi?.closeWindow?.();
}

async function checkForUpdatesAtStartup() {
  if (!window.flintApi?.checkForUpdate || !window.flintApi?.downloadAndInstallUpdate) {
    return;
  }
  const result = await window.flintApi.checkForUpdate();
  if (!result?.hasUpdate) {
    return;
  }

  const ok = window.confirm(
    `检测到新版本 ${result.latestVersion}（当前 ${result.currentVersion}）\n\n${result.notes || "是否立即下载并安装？"}`,
  );
  if (!ok) {
    return;
  }

  await window.flintApi.downloadAndInstallUpdate({
    version: result.latestVersion,
    installerUrl: result.installerUrl,
    sha256: result.sha256,
  });
}

function syncTableWidth(table, colgroup) {
  const cols = Array.from(colgroup.children);
  const sumWidth = cols.reduce((sum, col) => {
    const raw = Number.parseFloat(col.style.width || "0");
    return sum + (Number.isFinite(raw) ? raw : 0);
  }, 0);
  const wrapperWidth = table.closest(".table-wrap")?.clientWidth || 0;
  const finalWidth = Math.max(sumWidth, wrapperWidth);
  table.style.tableLayout = "fixed";
  table.style.width = `${finalWidth}px`;
  table.style.minWidth = "100%";
}

function readTableWidthStore() {
  try {
    const raw = localStorage.getItem(TABLE_WIDTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTableWidthStore(nextStore) {
  try {
    localStorage.setItem(TABLE_WIDTH_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // Ignore quota/storage errors to avoid breaking UI interaction.
  }
}

function getTableStorageKey(table) {
  const headRow = table.tHead?.rows?.[0];
  const headers = Array.from(headRow?.cells || []).map((th) => (th.textContent || "").trim());
  return `${currentView.value}::${headers.join("|")}`;
}

function saveTableWidths(storageKey, colgroup) {
  if (!storageKey || !colgroup) {
    return;
  }
  const widths = Array.from(colgroup.children)
    .map((col) => Number.parseFloat(col.style.width || "0"))
    .map((width) => (Number.isFinite(width) ? Math.round(width) : 0));
  const store = readTableWidthStore();
  store[storageKey] = widths;
  writeTableWidthStore(store);
}

function applyStoredTableWidths(storageKey, colgroup, columnCount) {
  const store = readTableWidthStore();
  const stored = store?.[storageKey];
  if (!Array.isArray(stored) || stored.length !== columnCount) {
    return false;
  }

  stored.forEach((width, idx) => {
    const normalized = Math.max(72, Math.min(Number(width) || 72, 480));
    colgroup.children[idx].style.width = `${normalized}px`;
  });
  return true;
}

function computeColumnWidths(table, columnCount) {
  const headerCells = Array.from(table.tHead?.rows?.[0]?.cells || []);
  const bodyRows = Array.from(table.tBodies?.[0]?.rows || []);
  const widths = [];

  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    let maxWidth = (headerCells[colIndex]?.scrollWidth || 0) + 24;
    for (const row of bodyRows) {
      const cell = row.cells?.[colIndex];
      if (!cell) {
        continue;
      }
      maxWidth = Math.max(maxWidth, cell.scrollWidth + 18);
    }
    if (colIndex === 0 && maxWidth < 56) {
      maxWidth = 56;
    }
    widths.push(Math.min(Math.max(maxWidth, 72), 360));
  }

  return widths;
}

function enhanceTable(table) {
  const headRow = table.tHead?.rows?.[0];
  if (!headRow) {
    return;
  }

  const headers = Array.from(headRow.cells);
  const columnCount = headers.length;
  if (columnCount === 0) {
    return;
  }

  if (table.dataset.colCount !== String(columnCount)) {
    table.dataset.colCount = String(columnCount);
    table.dataset.autoSized = "0";
    table.dataset.userResized = "0";
  }

  let colgroup = table.querySelector("colgroup[data-resizable='1']");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    colgroup.dataset.resizable = "1";
    table.insertBefore(colgroup, table.firstChild);
  }

  while (colgroup.children.length < columnCount) {
    colgroup.appendChild(document.createElement("col"));
  }
  while (colgroup.children.length > columnCount) {
    colgroup.removeChild(colgroup.lastChild);
  }

  const storageKey = getTableStorageKey(table);

  if (table.dataset.userResized !== "1") {
    const restored = applyStoredTableWidths(storageKey, colgroup, columnCount);
    if (!restored) {
      if (table.dataset.autoSized !== "1") {
        const widths = computeColumnWidths(table, columnCount);
        widths.forEach((width, idx) => {
          colgroup.children[idx].style.width = `${Math.round(width)}px`;
        });
        table.dataset.autoSized = "1";
      }
    } else {
      table.dataset.autoSized = "1";
    }
  }

  headers.forEach((th, idx) => {
    let resizer = th.querySelector(":scope > .col-resizer");
    if (resizer) {
      return;
    }

    resizer = document.createElement("span");
    resizer.className = "col-resizer";
    th.appendChild(resizer);

    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      table.dataset.userResized = "1";
      const col = colgroup.children[idx];
      const startX = event.clientX;
      const startWidth = Number.parseFloat(col.style.width || `${th.getBoundingClientRect().width}`);

      const onMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(72, Math.round(startWidth + delta));
        col.style.width = `${nextWidth}px`;
        syncTableWidth(table, colgroup);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        saveTableWidths(storageKey, colgroup);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  });

  syncTableWidth(table, colgroup);
}

function enhanceTables() {
  const tables = document.querySelectorAll(".table-wrap table");
  tables.forEach((table) => {
    enhanceTable(table);
  });
}

function scheduleEnhanceTables() {
  if (tableEnhanceTimer) {
    clearTimeout(tableEnhanceTimer);
  }
  tableEnhanceTimer = setTimeout(() => {
    enhanceTables();
  }, 0);
}

onMounted(async () => {
  applyTheme(theme.value);

  if (window.flintApi?.isWindowMaximized) {
    const state = await window.flintApi.isWindowMaximized();
    isMaximized.value = !!state?.maximized;
  }
  if (window.flintApi?.onWindowMaximizedChanged) {
    offWindowMaximize = window.flintApi.onWindowMaximizedChanged((payload) => {
      isMaximized.value = !!payload?.maximized;
    });
  }

  if (!window.flintApi?.getAppMeta) {
    appMetaText.value = "preload 未就绪";
    return;
  }

  const meta = await window.flintApi.getAppMeta();
  appMetaText.value = `${meta.stack} · ${meta.phase}`;
  appVersion.value = meta.version || appVersion.value;

  await checkForUpdatesAtStartup();

  await nextTick();
  scheduleEnhanceTables();
  const panel = document.querySelector(".panel");
  if (panel) {
    tableObserver = new MutationObserver(() => {
      scheduleEnhanceTables();
    });
    tableObserver.observe(panel, {
      childList: true,
      subtree: true,
    });
  }
});

watch(currentView, async () => {
  await nextTick();
  scheduleEnhanceTables();
});

onBeforeUnmount(() => {
  if (typeof offWindowMaximize === "function") {
    offWindowMaximize();
  }
  if (tableObserver) {
    tableObserver.disconnect();
    tableObserver = null;
  }
  if (tableEnhanceTimer) {
    clearTimeout(tableEnhanceTimer);
    tableEnhanceTimer = null;
  }
});
</script>
