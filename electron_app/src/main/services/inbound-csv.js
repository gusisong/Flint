const { toCsvCell } = require("./domain-utils");

function buildInboundCsvContent(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const header = ["文件", "行号", "工厂", "供应商号", "供应商名称", "零件号", "零件名称", "问题标签"];
  const lines = [header.map(toCsvCell).join(",")];

  for (const row of safeRows) {
    lines.push(
      [
        row.file,
        row.line,
        row.plant,
        row.supplierCode,
        row.supplierName,
        row.partNo,
        row.partName,
        Array.isArray(row.tags) ? row.tags.join("|") : "",
      ]
        .map(toCsvCell)
        .join(","),
    );
  }

  // UTF-8 BOM for Excel on Windows to display Chinese correctly.
  return `\uFEFF${lines.join("\n")}\n`;
}

module.exports = {
  buildInboundCsvContent,
};
