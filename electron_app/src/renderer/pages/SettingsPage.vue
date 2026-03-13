<template>
  <div class="view">
    <div class="page-title">
      <span class="material-symbols-outlined">settings</span>
      系统设置
    </div>

    <div class="toolbar">
      <div class="left-actions">
        <button class="btn primary" type="button" @click="loadConfig">读取配置</button>
      </div>
      <div class="right-actions">
        <button class="btn ghost" type="button" @click="checkUpdateNow">立即检查更新</button>
        <button class="btn ghost" type="button" @click="saveConfig">保存配置</button>
      </div>
    </div>

    <div style="flex:1;overflow-y:auto;margin-top:14px;">
      <div class="form-section-title">
        <span class="material-symbols-outlined">mail</span>
        SMTP 设置
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>SMTP Host</label>
          <input v-model="form.smtpHost" class="form-input" type="text">
        </div>
        <div class="form-group">
          <label>SMTP Port</label>
          <input v-model.number="form.smtpPort" class="form-input" type="number" min="1" max="65535">
        </div>
        <div class="form-group">
          <label>用户名</label>
          <input v-model="form.smtpUser" class="form-input" type="text">
        </div>
        <div class="form-group">
          <label>密码</label>
          <div class="password-wrap">
            <input
              v-model="form.smtpPassword"
              class="form-input"
              :type="showPassword ? 'text' : 'password'"
            >
            <button class="password-toggle" type="button" @click="showPassword = !showPassword">
              <span class="material-symbols-outlined">{{ showPassword ? 'visibility' : 'visibility_off' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="form-section-title">
        <span class="material-symbols-outlined">rule</span>
        规则与签名
      </div>
      <div class="form-group">
        <label>发件人名称</label>
        <input v-model="form.senderName" class="form-input" type="text">
      </div>
      <div class="form-group">
        <label>发件人地址</label>
        <input v-model="form.senderAddress" class="form-input" type="email">
      </div>
      <div class="form-group">
        <label>签名文本</label>
        <textarea v-model="form.signature" class="form-input" rows="4"></textarea>
      </div>

      <div class="form-section-title">
        <span class="material-symbols-outlined">system_update</span>
        OTA 更新
      </div>
      <div class="form-group">
        <label>Manifest URL（OneDrive 公开只读链接）</label>
        <input v-model="form.otaManifestUrl" class="form-input" type="text" placeholder="https://.../stable-manifest.json">
      </div>
      <div class="form-group" style="font-size:12px;color:var(--muted);line-height:1.5;">
        当前版本：{{ updateStatus.currentVersion || 'unknown' }}<br>
        最新版本：{{ updateStatus.latestVersion || '-' }}
      </div>
    </div>

    <div class="summary-bar">
      <div class="stat">
        <span><span class="dot gray"></span> 最后更新 {{ form.updatedAt || '-' }}</span>
      </div>
      <span>{{ banner || '配置就绪' }}</span>
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
  otaManifestUrl: "",
  updatedAt: "",
});

const banner = ref("");
const showPassword = ref(false);
const updateStatus = reactive({
  currentVersion: "",
  latestVersion: "",
  hasUpdate: false,
});

function applyConfig(config = {}) {
  form.smtpHost = config.smtpHost || "";
  form.smtpPort = Number(config.smtpPort || 587);
  form.smtpUser = config.smtpUser || "";
  form.smtpPassword = config.smtpPassword || "";
  form.senderName = config.senderName || "";
  form.senderAddress = config.senderAddress || "";
  form.signature = config.signature || "";
  form.otaManifestUrl = config.otaManifestUrl || "";
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
    otaManifestUrl: form.otaManifestUrl,
  };

  const result = await window.flintApi.settingsSave(payload);
  applyConfig(result?.config || {});
  banner.value = "配置已保存";
}

async function checkUpdateNow() {
  if (!window.flintApi?.checkForUpdate) {
    banner.value = "Update IPC 未就绪";
    return;
  }

  const result = await window.flintApi.checkForUpdate(form.otaManifestUrl);
  updateStatus.currentVersion = result?.currentVersion || "";
  updateStatus.latestVersion = result?.latestVersion || "";
  updateStatus.hasUpdate = !!result?.hasUpdate;

  if (result?.hasUpdate) {
    banner.value = `检测到新版本 ${result.latestVersion}`;
    const ok = window.confirm(
      `检测到新版本 ${result.latestVersion}（当前 ${result.currentVersion}）\n\n${result.notes || "是否立即下载并安装？"}`,
    );
    if (ok && window.flintApi?.downloadAndInstallUpdate) {
      await window.flintApi.downloadAndInstallUpdate({
        version: result.latestVersion,
        installerUrl: result.installerUrl,
        sha256: result.sha256,
      });
    }
    return;
  }

  banner.value = result?.reason ? `检查完成：${result.reason}` : "当前已是最新版本";
}

onMounted(async () => {
  await loadConfig();
});
</script>
