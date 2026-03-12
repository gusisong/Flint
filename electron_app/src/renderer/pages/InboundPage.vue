<template>
  <div class="inbound-wrap">
    <div class="toolbar">
      <button class="btn accent" type="button" @click="startReview">开始审查</button>
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
    <div v-if="banner" class="banner">{{ banner }}</div>

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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const isDragOver = ref(false);
const uploadedFiles = ref([]);
const reviewRows = ref([]);
const banner = ref("");
const summaryText = ref("共 0 条问题 · 0 个文件");

const displayedFiles = computed(() => uploadedFiles.value.slice(0, 10));
let offReviewCompleted = null;

function updateSummaryWithRows(rows, fileCount) {
  const nextRows = Array.isArray(rows) ? rows : [];
  const nextFileCount = Number(fileCount || uploadedFiles.value.length || 0);
  reviewRows.value = nextRows;
  summaryText.value = `共 ${nextRows.length} 条问题 · ${nextFileCount} 个文件`;
}

async function refreshUploads() {
  if (!window.flintApi?.inboundGetUploads) {
    banner.value = "Inbound IPC 未就绪";
    return;
  }
  const result = await window.flintApi.inboundGetUploads();
  uploadedFiles.value = Array.isArray(result?.files) ? result.files : [];
}

async function refreshLastReview() {
  if (!window.flintApi?.inboundGetLastReview) {
    return;
  }
  const result = await window.flintApi.inboundGetLastReview();
  const review = result?.review;
  if (!review) {
    return;
  }
  updateSummaryWithRows(review.rows, review.summary?.fileCount);
}

async function onDrop(event) {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) {
    return;
  }
  if (!window.flintApi?.inboundUploadFiles) {
    banner.value = "Inbound IPC 未就绪";
    return;
  }

  const descriptors = files.map((file) => ({
    name: file.name,
    path: file.path || "",
    size: file.size,
    lastModified: file.lastModified,
  }));
  await window.flintApi.inboundUploadFiles(descriptors);
  await refreshUploads();
  banner.value = `已上传 ${files.length} 个文件`;
}

async function removeFile(fileId) {
  if (!window.flintApi?.inboundRemoveUpload) {
    banner.value = "Inbound IPC 未就绪";
    return;
  }
  await window.flintApi.inboundRemoveUpload(fileId);
  await refreshUploads();
}

async function exportLog() {
  if (!window.flintApi?.inboundExportCsv) {
    banner.value = "Inbound IPC 未就绪";
    return;
  }
  const result = await window.flintApi.inboundExportCsv(reviewRows.value);
  banner.value = `日志已导出到 ${result?.filePath || "data/logs/"}`;
}

async function startReview() {
  if (uploadedFiles.value.length === 0) {
    summaryText.value = "请先拖拽 Inbound 文件到上传区域";
    return;
  }
  if (!window.flintApi?.inboundStartReview) {
    banner.value = "Inbound IPC 未就绪";
    return;
  }
  const fileIds = uploadedFiles.value.map((x) => x.id);
  await window.flintApi.inboundStartReview(fileIds);
  banner.value = "审查任务已启动";
}

onMounted(async () => {
  await refreshUploads();
  await refreshLastReview();
  if (window.flintApi?.onInboundReviewCompleted) {
    offReviewCompleted = window.flintApi.onInboundReviewCompleted((payload) => {
      updateSummaryWithRows(payload?.rows, payload?.summary?.fileCount);
      banner.value = "审查完成，结果已回填";
    });
  }
});

onBeforeUnmount(() => {
  if (typeof offReviewCompleted === "function") {
    offReviewCompleted();
  }
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

.banner {
  font-size: 12px;
  color: #0c8f78;
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
