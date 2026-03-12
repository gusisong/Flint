<template>
  <div class="settings-wrap">
    <h3>系统设置</h3>

    <div class="form-grid">
      <label class="field">
        <span>SMTP Host</span>
        <input v-model="form.smtpHost" type="text">
      </label>

      <label class="field">
        <span>SMTP Port</span>
        <input v-model.number="form.smtpPort" type="number" min="1" max="65535">
      </label>

      <label class="field">
        <span>SMTP User</span>
        <input v-model="form.smtpUser" type="text">
      </label>

      <label class="field">
        <span>SMTP Password</span>
        <input v-model="form.smtpPassword" type="password">
      </label>

      <label class="field">
        <span>发件人名称</span>
        <input v-model="form.senderName" type="text">
      </label>

      <label class="field">
        <span>发件人地址</span>
        <input v-model="form.senderAddress" type="email">
      </label>
    </div>

    <label class="field block">
      <span>邮件签名</span>
      <textarea v-model="form.signature" rows="4"></textarea>
    </label>

    <div class="actions">
      <button class="btn ghost" type="button" @click="loadConfig">重新加载</button>
      <button class="btn accent" type="button" @click="saveConfig">保存配置</button>
    </div>

    <div class="meta">
      <span>最后更新：{{ form.updatedAt || '-' }}</span>
      <span v-if="banner" class="banner">{{ banner }}</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";

const form = reactive({
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  senderName: "",
  senderAddress: "",
  signature: "",
  updatedAt: "",
});

const banner = ref("");

function applyConfig(config = {}) {
  form.smtpHost = config.smtpHost || "";
  form.smtpPort = Number(config.smtpPort || 587);
  form.smtpUser = config.smtpUser || "";
  form.smtpPassword = config.smtpPassword || "";
  form.senderName = config.senderName || "";
  form.senderAddress = config.senderAddress || "";
  form.signature = config.signature || "";
  form.updatedAt = config.updatedAt || "";
}

async function loadConfig() {
  if (!window.flintApi?.settingsGet) {
    banner.value = "Settings IPC 未就绪";
    return;
  }
  const result = await window.flintApi.settingsGet();
  applyConfig(result?.config || {});
  banner.value = "配置已加载";
}

async function saveConfig() {
  if (!window.flintApi?.settingsSave) {
    banner.value = "Settings IPC 未就绪";
    return;
  }
  const payload = {
    smtpHost: form.smtpHost,
    smtpPort: form.smtpPort,
    smtpUser: form.smtpUser,
    smtpPassword: form.smtpPassword,
    senderName: form.senderName,
    senderAddress: form.senderAddress,
    signature: form.signature,
  };

  const result = await window.flintApi.settingsSave(payload);
  applyConfig(result?.config || {});
  banner.value = "配置已保存";
}

onMounted(async () => {
  await loadConfig();
});
</script>

<style scoped>
.settings-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #5c6670;
}

.field input,
.field textarea {
  border: 1px solid #d9e0d8;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.field.block {
  max-width: 100%;
}

.actions {
  display: flex;
  gap: 10px;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}

.btn.accent {
  background: #ddeaf8;
  color: #1a3e66;
  font-weight: 600;
}

.btn.ghost {
  border: 1px solid #d9e0d8;
  background: #eef2ee;
  color: #2c3e36;
}

.meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #5c6670;
}

.banner {
  color: #0c8f78;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
