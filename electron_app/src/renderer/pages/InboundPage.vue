<template>
  <div class="inbound-wrap">
    <div class="toolbar">
      <button class="btn accent" type="button" @click="simulateReview">开始审查</button>
      <button class="btn ghost" type="button" @click="exportLog">导出日志</button>
    </div>

    <div
      class="dropzone"
      :class="{ 'drag-over': isDragOver }"
      @dragenter.prevent="isDragOver = true"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="onDrop"
    >
      <span>将 Inbound 文件拖拽到此区域上传（支持多文件）</span>
    </div>

    <div class="uploaded-files" :class="{ empty: uploadedFiles.length === 0 }">
      <template v-if="uploadedFiles.length === 0">尚未上传文件</template>
      <template v-else>
        <div>已上传 {{ uploadedFiles.length }} 个文件</div>
        <div class="uploaded-list">
          <div v-for="entry in displayedFiles" :key="entry.id" class="uploaded-item">
            <span class="uploaded-name" :title="entry.fileName">{{ entry.fileName }}</span>
            <button class="remove-btn" type="button" @click="removeFile(entry.id)">x</button>
          </div>
        </div>
        <div v-if="uploadedFiles.length > displayedFiles.length">
          其余 {{ uploadedFiles.length - displayedFiles.length }} 个文件已折叠显示
        </div>
      </template>
    </div>

    <div class="summary">{{ summaryText }}</div>

    <table class="result-table">
      <thead>
        <tr>
          <th>文件</th>
          <th>行号</th>
          <th>工厂</th>
          <th>供应商号</th>
          <th>供应商名称</th>
          <th>零件号</th>
          <th>零件名称</th>
          <th>问题</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in reviewRows" :key="`${row.file}-${row.line}-${row.supplierCode}`">
          <td>{{ row.file }}</td>
          <td>{{ row.line }}</td>
          <td>{{ row.plant }}</td>
          <td>{{ row.supplierCode }}</td>
          <td>{{ row.supplierName }}</td>
          <td>{{ row.partNo }}</td>
          <td>{{ row.partName }}</td>
          <td>
            <span v-for="tag in row.tags" :key="tag" class="issue-tag">{{ tag }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

const INBOUND_UPLOAD_KEY = "flint.inboundUploads.v1";

const isDragOver = ref(false);
const uploadedFiles = ref([]);
const reviewRows = ref([]);
const summaryText = ref("共 0 条问题 · 0 个文件");

const displayedFiles = computed(() => uploadedFiles.value.slice(0, 10));

function persistQueue() {
  localStorage.setItem(INBOUND_UPLOAD_KEY, JSON.stringify(uploadedFiles.value));
}

function restoreQueue() {
  const raw = localStorage.getItem(INBOUND_UPLOAD_KEY);
  if (!raw) {
    uploadedFiles.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    uploadedFiles.value = Array.isArray(parsed) ? parsed : [];
  } catch {
    uploadedFiles.value = [];
  }
}

function onDrop(event) {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) {
    return;
  }
  const now = Date.now();
  const incoming = files.map((file, idx) => ({
    id: `inbound_${now}_${idx}`,
    fileName: file.name,
  }));
  uploadedFiles.value = [...uploadedFiles.value, ...incoming];
  persistQueue();
}

function removeFile(fileId) {
  uploadedFiles.value = uploadedFiles.value.filter((entry) => entry.id !== fileId);
  persistQueue();
}

function exportLog() {
  summaryText.value = "日志已导出到 data/logs/";
}

function simulateReview() {
  if (uploadedFiles.value.length === 0) {
    summaryText.value = "请先拖拽 Inbound 文件到上传区域";
    return;
  }
  reviewRows.value = [
    {
      file: "Inbound_W12.xlsx",
      line: 54,
      plant: "WUH",
      supplierCode: "10243",
      supplierName: "ACME Corp",
      partNo: "P-A1021",
      partName: "前桥总成",
      tags: ["供应商编码不一致", "Inbound方式错误"],
    },
    {
      file: "Inbound_W13.xlsx",
      line: 12,
      plant: "NAN",
      supplierCode: "11502",
      supplierName: "东方精密",
      partNo: "P-C4412",
      partName: "稳定杆",
      tags: ["缺少必填字段"],
    },
  ];
  summaryText.value = `共 ${reviewRows.value.length} 条问题 · ${uploadedFiles.value.length} 个文件`;
}

onMounted(() => {
  restoreQueue();
});
</script>

<style scoped>
.inbound-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  gap: 10px;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
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

.dropzone {
  border: 1.5px dashed #d9e0d8;
  border-radius: 12px;
  padding: 14px;
  color: #5c6670;
  background: #f5f8f4;
}

.dropzone.drag-over {
  border-color: #0c8f78;
  background: #e8f5f1;
  color: #0c8f78;
}

.uploaded-files {
  border: 1px solid #d9e0d8;
  border-radius: 10px;
  background: #f3f6f2;
  padding: 8px 10px;
  font-size: 11px;
  color: #5c6670;
}

.uploaded-files.empty {
  opacity: 0.85;
}

.uploaded-list {
  display: grid;
  gap: 4px;
  margin-top: 4px;
}

.uploaded-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.uploaded-name {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.remove-btn {
  border: none;
  background: transparent;
  color: #5c6670;
  cursor: pointer;
  font-size: 12px;
}

.summary {
  font-size: 12px;
  color: #5c6670;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.result-table th,
.result-table td {
  border-bottom: 1px solid #d9e0d8;
  text-align: left;
  padding: 8px;
}

.issue-tag {
  display: inline-block;
  margin-right: 6px;
  margin-bottom: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f5f1;
  color: #0b6f5e;
  font-size: 11px;
}
</style>
