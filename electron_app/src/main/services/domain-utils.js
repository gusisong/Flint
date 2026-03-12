function sanitizeFileName(name) {
  return String(name || "unknown")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function extractSupplierCode(fileName) {
  const match = String(fileName || "").match(/_(\d{5})_/);
  if (match) {
    return match[1];
  }
  return String(Math.floor(10000 + Math.random() * 90000));
}

function makeSubject(prefix, supplierCode) {
  return `${String(prefix || "").trim()}零件供货方式确认_${supplierCode}`;
}

function toCsvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

module.exports = {
  sanitizeFileName,
  extractSupplierCode,
  makeSubject,
  toCsvCell,
};
