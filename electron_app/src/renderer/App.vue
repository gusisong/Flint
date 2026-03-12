<template>
  <div class="shell">
    <aside class="nav">
      <div class="brand">Flint</div>
      <div class="sub">入厂物流规划运营工具平台</div>
      <button
        v-for="item in navItems"
        :key="item.id"
        :class="['nav-btn', { active: currentView === item.id }]"
        type="button"
        @click="currentView = item.id"
      >
        {{ item.label }}
      </button>
    </aside>

    <main class="main">
      <header class="header">
        <h1>{{ activeTitle }}</h1>
        <span class="meta">{{ appMetaText }}</span>
      </header>

      <section class="panel">
        <InboundPage v-if="currentView === 'inbound'" />
        <MailPage v-else-if="currentView === 'mail'" />
        <SupplierPage v-else-if="currentView === 'supplier'" />
        <SettingsPage v-else />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import InboundPage from "./pages/InboundPage.vue";
import MailPage from "./pages/MailPage.vue";
import SupplierPage from "./pages/SupplierPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const navItems = [
  { id: "inbound", label: "Inbound规划审查", title: "Inbound 规划审查" },
  { id: "mail", label: "运输协议外发", title: "运输协议外发" },
  { id: "supplier", label: "供应商管理", title: "供应商管理" },
  { id: "settings", label: "系统设置", title: "系统设置" },
];

const currentView = ref("inbound");
const appMetaText = ref("加载中...");

const activeTitle = computed(() => {
  const active = navItems.find((item) => item.id === currentView.value);
  return active ? active.title : "Flint";
});

onMounted(async () => {
  if (!window.flintApi?.getAppMeta) {
    appMetaText.value = "preload 未就绪";
    return;
  }
  const meta = await window.flintApi.getAppMeta();
  appMetaText.value = `${meta.stack} · ${meta.phase}`;
});
</script>
