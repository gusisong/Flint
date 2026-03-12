<template>
  <div class="supplier-wrap">
    <div class="toolbar">
      <button class="btn accent" type="button" @click="openCreate">新增供应商</button>
      <button class="btn ghost" type="button" @click="openEdit">编辑供应商</button>
      <button class="btn ghost" type="button" @click="toggleEnabled">切换启用</button>
    </div>

    <table class="supplier-table">
      <thead>
        <tr>
          <th></th>
          <th>供应商号</th>
          <th>供应商名称</th>
          <th>邮箱</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="items.length === 0">
          <td colspan="5" class="empty-row">暂无供应商数据</td>
        </tr>
        <tr
          v-for="item in items"
          :key="item.code"
          :class="{ selected: selectedCode === item.code }"
          @click="selectedCode = item.code"
        >
          <td>
            <input
              type="radio"
              name="supplier-selected"
              :checked="selectedCode === item.code"
              @change="selectedCode = item.code"
            >
          </td>
          <td>{{ item.code }}</td>
          <td>{{ item.name }}</td>
          <td>{{ item.email }}</td>
          <td>
            <span class="status-tag" :class="item.enabled ? 'on' : 'off'">
              {{ item.enabled ? '启用' : '停用' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="banner" class="banner">{{ banner }}</div>

    <div v-if="isModalOpen" class="modal-mask" @click.self="isModalOpen = false">
      <div class="modal">
        <h3>{{ modalMode === 'create' ? '新增供应商' : '编辑供应商' }}</h3>

        <label class="modal-label" for="supplierCode">供应商号</label>
        <input
          id="supplierCode"
          v-model="form.code"
          class="modal-input"
          type="text"
          :disabled="modalMode === 'edit'"
        >

        <label class="modal-label" for="supplierName">供应商名称</label>
        <input id="supplierName" v-model="form.name" class="modal-input" type="text">

        <label class="modal-label" for="supplierEmail">邮箱</label>
        <input id="supplierEmail" v-model="form.email" class="modal-input" type="email">

        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="isModalOpen = false">取消</button>
          <button class="btn accent" type="button" @click="submitModal">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

const items = ref([]);
const selectedCode = ref("");
const banner = ref("");

const isModalOpen = ref(false);
const modalMode = ref("create");
const form = reactive({ code: "", name: "", email: "" });

const selectedItem = computed(() => items.value.find((x) => x.code === selectedCode.value));
let offSupplierUpdated = null;

function resetForm() {
  form.code = "";
  form.name = "";
  form.email = "";
}

async function refreshList() {
  if (!window.flintApi?.supplierGetList) {
    banner.value = "Supplier IPC 未就绪";
    return;
  }
  const result = await window.flintApi.supplierGetList();
  items.value = Array.isArray(result?.items) ? result.items : [];
  if (!selectedCode.value && items.value.length > 0) {
    selectedCode.value = items.value[0].code;
  }
  if (selectedCode.value && !items.value.some((x) => x.code === selectedCode.value)) {
    selectedCode.value = items.value[0]?.code || "";
  }
}

function openCreate() {
  modalMode.value = "create";
  resetForm();
  isModalOpen.value = true;
}

function openEdit() {
  if (!selectedItem.value) {
    banner.value = "请先选择一条供应商记录";
    return;
  }
  modalMode.value = "edit";
  form.code = selectedItem.value.code;
  form.name = selectedItem.value.name;
  form.email = selectedItem.value.email;
  isModalOpen.value = true;
}

async function submitModal() {
  try {
    if (modalMode.value === "create") {
      await window.flintApi.supplierCreate({ code: form.code, name: form.name, email: form.email });
      banner.value = `已新增供应商 ${form.code}`;
    } else {
      await window.flintApi.supplierUpdate({ code: form.code, name: form.name, email: form.email });
      banner.value = `已更新供应商 ${form.code}`;
    }
    isModalOpen.value = false;
    await refreshList();
    selectedCode.value = form.code;
  } catch (error) {
    banner.value = `保存失败：${error?.message || "未知错误"}`;
  }
}

async function toggleEnabled() {
  if (!selectedItem.value) {
    banner.value = "请先选择一条供应商记录";
    return;
  }
  const nextEnabled = !selectedItem.value.enabled;
  try {
    await window.flintApi.supplierUpdateStatus(selectedItem.value.code, nextEnabled);
    banner.value = `${selectedItem.value.code} 已${nextEnabled ? "启用" : "停用"}`;
    await refreshList();
  } catch (error) {
    banner.value = `更新失败：${error?.message || "未知错误"}`;
  }
}

onMounted(async () => {
  await refreshList();
  if (window.flintApi?.onSupplierListUpdated) {
    offSupplierUpdated = window.flintApi.onSupplierListUpdated(async (payload) => {
      items.value = Array.isArray(payload?.items) ? payload.items : [];
      if (!selectedCode.value && items.value.length > 0) {
        selectedCode.value = items.value[0].code;
      }
    });
  }
});

onBeforeUnmount(() => {
  if (typeof offSupplierUpdated === "function") {
    offSupplierUpdated();
  }
});
</script>

<style scoped>
.supplier-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
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

.supplier-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.supplier-table th,
.supplier-table td {
  border-bottom: 1px solid #d9e0d8;
  text-align: left;
  padding: 8px;
}

.empty-row {
  color: #5c6670;
}

.selected {
  background: #f5f8f4;
}

.status-tag {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}

.status-tag.on {
  background: rgba(29, 143, 82, 0.18);
  color: #1d8f52;
}

.status-tag.off {
  background: rgba(191, 59, 59, 0.18);
  color: #bf3b3b;
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
  margin-bottom: 10px;
  border: 1px solid #d9e0d8;
  border-radius: 8px;
  padding: 8px 10px;
}

.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
