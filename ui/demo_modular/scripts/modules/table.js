const TABLE_WIDTH_KEY = "flint.tableWidths.v1";

function getTableWidthStore() {
  const raw = localStorage.getItem(TABLE_WIDTH_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTableWidth(tableId, colIndex, width) {
  const store = getTableWidthStore();
  if (!store[tableId]) {
    store[tableId] = {};
  }
  store[tableId][colIndex] = width;
  localStorage.setItem(TABLE_WIDTH_KEY, JSON.stringify(store));
}

function applyStoredWidths(table) {
  const tableId = table.id;
  if (!tableId) {
    return;
  }
  const store = getTableWidthStore();
  const widths = store[tableId] || {};
  const headers = table.querySelectorAll("thead th");
  Object.keys(widths).forEach((idx) => {
    const th = headers[Number(idx)];
    if (th) {
      th.style.width = `${widths[idx]}px`;
      table.style.tableLayout = "fixed";
    }
  });
}

function attachColumnResizers(table) {
  const headers = table.querySelectorAll("thead th");
  headers.forEach((th, idx) => {
    if (th.querySelector(".col-resizer")) {
      return;
    }
    th.style.position = "relative";
    const resizer = document.createElement("span");
    resizer.className = "col-resizer";
    resizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = th.offsetWidth;
      const onMove = (moveEvent) => {
        const nextWidth = Math.max(70, startWidth + (moveEvent.clientX - startX));
        th.style.width = `${nextWidth}px`;
        table.style.tableLayout = "fixed";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveTableWidth(table.id, idx, Math.round(th.getBoundingClientRect().width));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    th.appendChild(resizer);
  });
}

export function enhanceAllTables() {
  document.querySelectorAll(".table-wrap table").forEach((table) => {
    if (!table.id) {
      return;
    }
    applyStoredWidths(table);
    attachColumnResizers(table);
  });
}
