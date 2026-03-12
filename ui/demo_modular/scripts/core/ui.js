export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "check_circle", error: "error", info: "info" };
  toast.innerHTML = `<span class="material-symbols-outlined">${icons[type] || "info"}</span>${message}`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

export function openModal(id) {
  const modal = document.getElementById(`${id}Modal`);
  if (modal) {
    modal.classList.add("show");
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("show");
  }
}

export function initNavigation() {
  const tabs = document.querySelectorAll(".menu button");
  const views = document.querySelectorAll(".view");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      tab.classList.add("active");
      views.forEach((v) => v.classList.add("hidden"));
      document.getElementById(tab.dataset.target)?.classList.remove("hidden");
    });
  });
}

export function initThemeToggle() {
  const themeToggle = document.getElementById("themeToggle");
  const themeIcon = document.getElementById("themeIcon");
  if (!themeToggle || !themeIcon) {
    return;
  }
  themeToggle.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    themeIcon.textContent = isDark ? "dark_mode" : "light_mode";
  });
}

export function initPasswordToggle() {
  document.querySelectorAll(".password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector(".form-input");
      const icon = btn.querySelector(".material-symbols-outlined");
      if (!input || !icon) {
        return;
      }
      if (input.type === "password") {
        input.type = "text";
        icon.textContent = "visibility";
      } else {
        input.type = "password";
        icon.textContent = "visibility_off";
      }
    });
  });
}
