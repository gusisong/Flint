<template>
  <div class="view">
    <div class="page-title">
      <span class="material-symbols-outlined">badge</span>
      供应商管理
    </div>

    <div class="toolbar">
      <div class="left-actions">
        <button class="btn primary" type="button" @click="openCreate">新增供应商</button>
        <button class="btn primary" type="button" @click="openEdit">编辑供应商</button>
        <button class="btn danger" type="button" @click="deleteSelected">删除供应商</button>
      </div>
      <div class="right-actions">
        <input
          v-model="queryCode"
          class="toolbar-query"
          type="text"
          placeholder="供应商号查询"
          @input="handleFilterInput"
        >
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>选择</th>
            <th>供应商号</th>
            <th>供应商名称</th>
            <th>邮箱</th>
          </tr>
        </thead>
        <tbody id="supplierBody">
          <tr v-if="filteredItems.length === 0">
            <td colspan="4">暂无供应商数据</td>
          </tr>
          <tr
            v-for="item in filteredItems"
            :key="item.code"
            :class="{ 'row-selected': selectedCode === item.code }"
            :data-supplier-code="item.code"
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
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-bar">
      <span></span>
      <span>共 {{ filteredItems.length }} / {{ allItems.length }} 个供应商</span>
    </div>

    <div v-if="banner" style="margin-top:8px;font-size:12px;color:var(--brand);">{{ banner }}</div>

    <div :class="['modal-overlay', { show: isModalOpen }]" @click.self="isModalOpen = false">
      <div class="modal">
        <h3>
          <span class="material-symbols-outlined">person_add</span>
          {{ modalMode === 'create' ? '新增供应商' : '编辑供应商' }}
        </h3>

        <div class="form-group">
          <label>供应商号</label>
          <input
            id="supplierCode"
            v-model="form.code"
            class="form-input"
            type="text"
            required
            :disabled="modalMode === 'edit'"
          >
        </div>

        <div class="form-group">
          <label>供应商名称</label>
          <input id="supplierName" v-model="form.name" class="form-input" type="text">
        </div>

        <div class="form-group">
          <label>邮箱</label>
          <input id="supplierEmail" v-model="form.email" class="form-input" type="email" required>
        </div>

        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="isModalOpen = false">取消</button>
          <button class="btn primary" type="button" @click="submitModal">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";

const allItems = ref([]);
const selectedCode = ref("");
const queryCode = ref("");
const banner = ref("");

const isModalOpen = ref(false);
const modalMode = ref("create");
const form = reactive({ code: "", name: "", email: "" });

const filteredItems = computed(() => {
  const code = String(queryCode.value || "").trim();
  if (!code) {
    return allItems.value;
  }
  return allItems.value.filter((x) => String(x.code || "").includes(code));
});

const selectedItem = computed(() => allItems.value.find((x) => x.code === selectedCode.value));
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
  allItems.value = Array.isArray(result?.items) ? result.items : [];
  if (!selectedCode.value && allItems.value.length > 0) {
    selectedCode.value = allItems.value[0].code;
  }
  if (selectedCode.value && !allItems.value.some((x) => x.code === selectedCode.value)) {
    selectedCode.value = allItems.value[0]?.code || "";
  }
}

function handleFilterInput() {
  const visibleCodes = new Set(filteredItems.value.map((x) => x.code));
  if (selectedCode.value && !visibleCodes.has(selectedCode.value)) {
    selectedCode.value = filteredItems.value[0]?.code || "";
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
  if (!String(form.code || "").trim()) {
    banner.value = "供应商号为必填项";
    return;
  }
  if (!String(form.email || "").trim()) {
    banner.value = "邮箱为必填项";
    return;
  }
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

async function deleteSelected() {
  if (!selectedItem.value) {
    banner.value = "请先选择一条供应商记录";
    return;
  }
  try {
    if (!window.flintApi?.supplierDelete) {
      banner.value = "Supplier IPC 未就绪";
      return;
    }
    const code = selectedItem.value.code;
    await window.flintApi.supplierDelete(code);
    banner.value = `已删除供应商 ${code}`;
    await refreshList();
    handleFilterInput();
  } catch (error) {
    banner.value = `删除失败：${error?.message || "未知错误"}`;
  }
}

onMounted(async () => {
  await refreshList();
  if (window.flintApi?.onSupplierListUpdated) {
    offSupplierUpdated = window.flintApi.onSupplierListUpdated(async (payload) => {
      allItems.value = Array.isArray(payload?.items) ? payload.items : [];
      if (!selectedCode.value && allItems.value.length > 0) {
        selectedCode.value = allItems.value[0].code;
      }
      handleFilterInput();
    });
  }
});

onBeforeUnmount(() => {
  if (typeof offSupplierUpdated === "function") {
    offSupplierUpdated();
  }
});
</script>
