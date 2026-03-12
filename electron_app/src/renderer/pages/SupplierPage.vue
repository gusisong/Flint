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
      </div>
      <div class="right-actions">
        <button class="btn cta" type="button" @click="toggleEnabled">切换启用</button>
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
            <th>状态</th>
          </tr>
        </thead>
        <tbody id="supplierBody">
          <tr v-if="items.length === 0">
            <td colspan="5">暂无供应商数据</td>
          </tr>
          <tr
            v-for="item in items"
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
            <td>
              <span class="tag" :class="item.enabled ? 'ok' : 'disabled'">{{ item.enabled ? '启用' : '停用' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-bar">
      <div class="stat">
        <span><span class="dot green"></span> 启用 {{ enabledCount }}</span>
        <span><span class="dot gray"></span> 停用 {{ disabledCount }}</span>
      </div>
      <span>共 {{ items.length }} 个供应商</span>
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
            :disabled="modalMode === 'edit'"
          >
        </div>

        <div class="form-group">
          <label>供应商名称</label>
          <input id="supplierName" v-model="form.name" class="form-input" type="text">
        </div>

        <div class="form-group">
          <label>邮箱</label>
          <input id="supplierEmail" v-model="form.email" class="form-input" type="email">
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

const items = ref([]);
const selectedCode = ref("");
const banner = ref("");

const isModalOpen = ref(false);
const modalMode = ref("create");
const form = reactive({ code: "", name: "", email: "" });

const selectedItem = computed(() => items.value.find((x) => x.code === selectedCode.value));
const enabledCount = computed(() => items.value.filter((x) => x.enabled).length);
const disabledCount = computed(() => items.value.filter((x) => !x.enabled).length);
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
