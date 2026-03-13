<template>
  <div class="view">
    <div class="page-title">
      <span class="material-symbols-outlined">fact_check</span>
      Inbound 规划审查
    </div>

    <div class="toolbar">
      <div class="left-actions">
        <button class="btn accent" type="button" @click="startReview">开始审查</button>
      </div>
      <div class="right-actions">
        <button class="btn ghost" type="button" @click="exportLog">导出日志</button>
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
      <span class="material-symbols-outlined">upload_file</span>
      <span>将 Inbound 文件拖拽到此区域上传（支持多文件）</span>
    </div>

    <div class="uploaded-files" :class="{ empty: uploadedFiles.length === 0 }">
      <template v-if="uploadedFiles.length === 0">尚未上传文件</template>
      <template v-else>
        <div>已上传 {{ uploadedFiles.length }} 个文件</div>
        <div class="uploaded-file-list">
          <div v-for="entry in displayedFiles" :key="entry.id" class="uploaded-file-item">
            <span class="uploaded-file-name" :title="entry.fileName">{{ entry.fileName }}</span>
            <button class="uploaded-file-remove" type="button" @click="removeFile(entry.id)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div v-if="uploadedFiles.length > displayedFiles.length">
          其余 {{ uploadedFiles.length - displayedFiles.length }} 个文件已折叠显示
        </div>
      </template>
    </div>

    <div class="table-wrap">
      <table>
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
          <tr v-if="reviewRows.length === 0">
            <td colspan="8">暂无审查结果</td>
          </tr>
          <tr v-for="row in reviewRows" :key="`${row.file}-${row.line}-${row.supplierCode}`">
            <td>{{ row.file }}</td>
            <td>{{ row.line }}</td>
            <td>{{ row.plant }}</td>
            <td>{{ row.supplierCode }}</td>
            <td>{{ row.supplierName }}</td>
            <td>{{ row.partNo }}</td>
            <td>{{ row.partName }}</td>
            <td>
              <div class="issue-tags">
                <span
                  v-for="tag in row.tags"
                  :key="`${row.file}-${row.line}-${tag}`"
                  class="issue-tag"
                  :class="issueTagClass(tag)"
                >
                  {{ tag }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-bar">
      <span></span>
      <span>{{ summaryText }}</span>
    </div>
    <div v-if="banner" style="margin-top:8px;font-size:12px;color:var(--brand);">{{ banner }}</div>
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

function issueTagClass(tag) {
  if (tag === "供应商编码不一致" || tag === "发货点选择错误") {
    return "code";
  }
  if (tag === "Inbound方式错误" || tag === "JIS零件距离>20KM") {
    return "method";
  }
  if (tag === "缺少必填字段") {
    return "required";
  }
  if (tag === "运输距离超限" || tag === ">300KM建议规划VMI") {
    return "distance";
  }
  if (tag === "VMI规则冲突" || tag === "<300KM不建议规划VMI") {
    return "vmi";
  }
  if (tag === "白名单外组合" || tag === "供货方式组合异常") {
    return "whitelist";
  }
  return "whitelist";
}

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

  const descriptors = files.map((file) => {
    const resolvedPath = file.path || window.flintApi?.getPathForFile?.(file) || "";
    return {
      name: file.name,
      path: resolvedPath,
      size: file.size,
      lastModified: file.lastModified,
    };
  });
  const result = await window.flintApi.inboundUploadFiles(descriptors);
  await refreshUploads();
  const importedCount = Number(result?.importedCount || 0);
  const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
  if (skippedCount > 0) {
    banner.value = `已上传 ${importedCount} 个文件，${skippedCount} 个文件路径不可访问`;
    return;
  }
  banner.value = `已上传 ${importedCount} 个文件`;
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
  try {
    const plainRows = reviewRows.value.map((row) => ({
      file: row.file,
      line: row.line,
      plant: row.plant,
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      partNo: row.partNo,
      partName: row.partName,
      tags: Array.isArray(row.tags) ? [...row.tags] : [],
    }));
    const result = await window.flintApi.inboundExportCsv(plainRows);
    if (result?.canceled) {
      banner.value = "已取消导出";
      return;
    }
    banner.value = `日志已导出到 ${result?.filePath || "已选择路径"}`;
  } catch (error) {
    banner.value = `导出失败：${error?.message || "未知错误"}`;
  }
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
  await refreshLastReview();
  banner.value = "审查完成，结果已回填";
}

onMounted(async () => {
  if (window.flintApi?.onInboundReviewCompleted) {
    offReviewCompleted = window.flintApi.onInboundReviewCompleted((payload) => {
      updateSummaryWithRows(payload?.rows, payload?.summary?.fileCount);
      banner.value = "审查完成，结果已回填";
    });
  }
  await refreshUploads();
  await refreshLastReview();
});

onBeforeUnmount(() => {
  if (typeof offReviewCompleted === "function") {
    offReviewCompleted();
  }
});
</script>
