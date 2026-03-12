<template>
  <div class="mail-wrap">
    <div class="toolbar">
      <div class="left-actions">
        <button class="btn accent" type="button" @click="openSendModal">开始发送</button>
        <button class="btn danger" type="button" @click="deleteSelectedRows">删除文件</button>
      </div>
      <div class="right-actions">
        <button class="btn ghost" type="button" @click="toggleHideSent">
          <span class="emoji">{{ hideSent ? '👁' : '🚫' }}</span>
          <span>{{ hideSent ? '显示已发送' : '隐藏已发送' }}</span>
        </button>
        <span class="progress-pill">已发送 {{ successCount }} / {{ rows.length }}</span>
      </div>
    </div>

    <div
      class="dropzone"
      :class="{ 'drag-over': isDragOver }"
      @dragenter.prevent="isDragOver = true"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <span>将待外发文件拖拽到此区域上传（支持分批多次上传）</span>
    </div>

    <table class="mail-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              :checked="allVisibleSelected"
              :indeterminate.prop="indeterminateSelectAll"
              @change="toggleSelectAll"
              aria-label="全选文件"
            >
          </th>
          <th>状态</th>
          <th>文件名</th>
          <th>供应商号</th>
          <th>持久化路径</th>
          <th>邮件标题</th>
          <th>失败原因</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="visibleRows.length === 0">
          <td colspan="7" class="empty-row">暂无文件，请拖拽文件到上方上传区</td>
        </tr>
        <tr v-for="row in visibleRows" :key="row.id">
          <td>
            <input
              type="checkbox"
              :checked="row.selected"
              :aria-label="`选择文件 ${row.fileName}`"
              @change="toggleRow(row.id)"
            >
          </td>
          <td>
            <span class="status-tag" :class="statusClass(row.status)">{{ row.status }}</span>
          </td>
          <td>{{ row.fileName }}</td>
          <td>{{ row.supplierCode }}</td>
          <td>{{ row.storedPath }}</td>
          <td>{{ row.subject || '-' }}</td>
          <td>{{ row.failReason || '-' }}</td>
        </tr>
      </tbody>
    </table>

    <div class="summary">
      <span>成功 {{ successCount }}</span>
      <span>失败 {{ failedCount }}</span>
      <span>待发 {{ pendingCount }}</span>
      <span>共 {{ rows.length }} 条记录</span>
    </div>

    <div v-if="banner" class="banner">{{ banner }}</div>

    <div v-if="isSendModalOpen" class="modal-mask" @click.self="isSendModalOpen = false">
      <div class="modal">
        <h3>发送前确认</h3>
        <label class="modal-label" for="subjectPrefix">标题前缀（可为空）</label>
        <input id="subjectPrefix" v-model="subjectPrefix" class="modal-input" type="text" placeholder="例如：Q2">
        <div class="preview">{{ subjectPreview }}</div>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="isSendModalOpen = false">取消</button>
          <button class="btn accent" type="button" @click="confirmSend">发送</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const MAIL_HIDE_SENT_KEY = "flint.mailHideSent.v2";

const isDragOver = ref(false);
const isSendModalOpen = ref(false);
const subjectPrefix = ref("");
const banner = ref("");
const activeJobId = ref("");

const rows = ref([]);
const hideSent = ref(localStorage.getItem(MAIL_HIDE_SENT_KEY) === "1");

const visibleRows = computed(() => rows.value.filter((x) => !(hideSent.value && x.status === "SUCCESS")));
const successCount = computed(() => rows.value.filter((x) => x.status === "SUCCESS").length);
const failedCount = computed(() => rows.value.filter((x) => x.status === "FAILED").length);
const pendingCount = computed(() => rows.value.filter((x) => x.status === "PENDING").length);

const allVisibleSelected = computed(() => visibleRows.value.length > 0 && visibleRows.value.every((x) => x.selected));
const indeterminateSelectAll = computed(() => !allVisibleSelected.value && visibleRows.value.some((x) => x.selected));

const firstSelected = computed(() => rows.value.find((x) => x.selected));
const subjectPreview = computed(() => {
  const supplierCode = firstSelected.value?.supplierCode || "10243";
  return `${(subjectPrefix.value || "").trim()}零件供货方式确认_${supplierCode}`;
});

let offProgress = null;
let offCompleted = null;

function normalizeTask(task, selectedMap) {
  return {
    id: task.id,
    selected: !!selectedMap.get(task.id),
    status: task.status || "PENDING",
    fileName: task.fileName || "",
    supplierCode: task.supplierCode || "",
    storedPath: task.storedPath || "",
    subject: task.subject || "",
    failReason: task.failReason || "",
  };
}

async function refreshTasks() {
  if (!window.flintApi?.mailGetTasks) {
    banner.value = "Mail IPC 未就绪";
    return;
  }
  const selectedMap = new Map(rows.value.map((x) => [x.id, x.selected]));
  const response = await window.flintApi.mailGetTasks(hideSent.value);
  const tasks = Array.isArray(response?.tasks) ? response.tasks : [];
  rows.value = tasks.map((task) => normalizeTask(task, selectedMap));
}

function statusClass(status) {
  if (status === "SUCCESS") {
    return "ok";
  }
  if (status === "FAILED") {
    return "bad";
  }
  return "pending";
}

async function onDrop(event) {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) {
    return;
  }
  if (!window.flintApi?.mailUploadFiles) {
    banner.value = "Mail IPC 未就绪";
    return;
  }

  const descriptors = files.map((file) => ({
    name: file.name,
    path: file.path || "",
    size: file.size,
    lastModified: file.lastModified,
  }));

  const result = await window.flintApi.mailUploadFiles(descriptors);
  const count = Array.isArray(result?.tasks) ? result.tasks.length : files.length;
  await refreshTasks();
  banner.value = `已上传 ${count} 个文件并加入发送队列`;
}

function toggleRow(id) {
  rows.value = rows.value.map((x) => (x.id === id ? { ...x, selected: !x.selected } : x));
}

function toggleSelectAll(event) {
  const checked = !!event.target.checked;
  rows.value = rows.value.map((x) => {
    if (hideSent.value && x.status === "SUCCESS") {
      return x;
    }
    return { ...x, selected: checked };
  });
}

async function toggleHideSent() {
  hideSent.value = !hideSent.value;
  localStorage.setItem(MAIL_HIDE_SENT_KEY, hideSent.value ? "1" : "0");
  await refreshTasks();
}

async function deleteSelectedRows() {
  const selected = rows.value.filter((x) => x.selected);
  if (selected.length === 0) {
    banner.value = "请先选择需要删除的行项目";
    return;
  }
  if (!window.flintApi?.mailDeleteTasks) {
    banner.value = "Mail IPC 未就绪";
    return;
  }

  const result = await window.flintApi.mailDeleteTasks(
    selected.map((x) => x.id),
    true,
  );
  await refreshTasks();
  banner.value = `已删除 ${result?.deletedCount || selected.length} 条记录，并同步删除持久化文件`;
}

function openSendModal() {
  if (!rows.value.some((x) => x.selected)) {
    banner.value = "请先在列表中勾选需要外发的文件";
    return;
  }
  isSendModalOpen.value = true;
}

async function confirmSend() {
  const queue = rows.value.filter((x) => x.selected);
  if (queue.length === 0) {
    isSendModalOpen.value = false;
    banner.value = "未选择待发送文件";
    return;
  }
  if (!window.flintApi?.mailStartSend) {
    banner.value = "Mail IPC 未就绪";
    return;
  }

  isSendModalOpen.value = false;
  const result = await window.flintApi.mailStartSend(
    queue.map((x) => x.id),
    subjectPrefix.value,
  );
  activeJobId.value = String(result?.jobId || "");
  banner.value = `开始队列发送 ${queue.length} 条任务...`;
}

onMounted(async () => {
  await refreshTasks();
  if (window.flintApi?.onMailQueueProgress) {
    offProgress = window.flintApi.onMailQueueProgress(async (payload) => {
      if (activeJobId.value && payload?.jobId !== activeJobId.value) {
        return;
      }
      banner.value = `发送中 ${payload?.sent || 0} / ${payload?.total || 0}`;
      await refreshTasks();
    });
  }
  if (window.flintApi?.onMailQueueCompleted) {
    offCompleted = window.flintApi.onMailQueueCompleted(async (payload) => {
      if (activeJobId.value && payload?.jobId !== activeJobId.value) {
        return;
      }
      banner.value = `队列发送完成：成功 ${payload?.success || 0}，失败 ${payload?.failed || 0}`;
      activeJobId.value = "";
      await refreshTasks();
    });
  }
});

onBeforeUnmount(() => {
  if (typeof offProgress === "function") {
    offProgress();
  }
  if (typeof offCompleted === "function") {
    offCompleted();
  }
});
</script>

<style scoped>
.mail-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.left-actions,
.right-actions {
  display: flex;
  gap: 10px;
  align-items: center;
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

.btn.danger {
  border: 1px solid #eeb3b3;
  background: #f6dada;
  color: #9a2f2f;
  font-weight: 600;
}

.emoji {
  margin-right: 4px;
}

.progress-pill {
  font-size: 12px;
  color: #5c6670;
  background: #eef2ee;
  padding: 6px 10px;
  border-radius: 8px;
}

.dropzone {
  border: 1.5px dashed #d9e0d8;
  border-radius: 12px;
  padding: 14px;
  font-size: 12px;
  color: #5c6670;
  background: #f5f8f4;
}

.dropzone.drag-over {
  border-color: #0c8f78;
  background: #e8f5f1;
  color: #0c8f78;
}

.mail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.mail-table th,
.mail-table td {
  border-bottom: 1px solid #d9e0d8;
  text-align: left;
  padding: 8px;
}

.empty-row {
  color: #5c6670;
}

.status-tag {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}

.status-tag.ok {
  background: rgba(29, 143, 82, 0.18);
  color: #1d8f52;
}

.status-tag.bad {
  background: rgba(191, 59, 59, 0.18);
  color: #bf3b3b;
}

.status-tag.pending {
  background: #ddeaf8;
  color: #1a3e66;
}

.summary {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #5c6670;
}

.banner {
  font-size: 12px;
  color: #0c8f78;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 420px;
  max-width: calc(100vw - 24px);
  padding: 16px;
}

.modal h3 {
  margin: 0 0 10px;
}

.modal-label {
  font-size: 12px;
  color: #5c6670;
}

.modal-input {
  width: 100%;
  margin-top: 6px;
  border: 1px solid #d9e0d8;
  border-radius: 8px;
  padding: 8px 10px;
}

.preview {
  margin-top: 10px;
  font-size: 12px;
  color: #5c6670;
  line-height: 1.5;
}

.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
