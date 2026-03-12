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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import InboundPage from "./pages/InboundPage.vue";
import MailPage from "./pages/MailPage.vue";
import SupplierPage from "./pages/SupplierPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const navItems = [
  { id: "inbound", label: "Inbound规划审查", icon: "fact_check" },
  { id: "mail", label: "运输协议外发", icon: "local_shipping" },
  { id: "supplier", label: "供应商管理", icon: "badge" },
  { id: "settings", label: "系统设置", icon: "settings" },
];

const currentView = ref("inbound");
const appMetaText = ref("加载中...");
const appVersion = ref("0.1.0");
const isMaximized = ref(false);
const theme = ref(localStorage.getItem("flint.theme") || "light");

let offWindowMaximize = null;

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
});

onBeforeUnmount(() => {
  if (typeof offWindowMaximize === "function") {
    offWindowMaximize();
  }
});
</script>
