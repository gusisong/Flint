const xlsx = require("xlsx");

const REQUIRED_CELL_INDEXES = [0, 2, 3, 6, 7, 8, 9, 11, 12];

const WHITELIST_COMBOS = new Set(
  [
    "LAH|DR 3PL|ENG",
    "JIS|DR SUP|DR SUP",
    "JIT|DR SUP|DR SUP",
    "LAH|DR SUP|DR SUP",
    "JIT|MR 3PL|CFF-JIT",
    "LAH|MR 3PL|CFF-LAH",
    "LAH|TS 3PL-CC|CFF-LAH",
    "LAH|TS SUP-CC|DR SUP",
    "JIT|TS 3PL-VMI|AHKCC",
    "JIT|TS 3PL-VMI|CSKCC",
    "JIT|TS 3PL-VMI|ENGKCC",
    "JIT|TS 3PL-VMI|FJKCC",
    "JIT|TS 3PL-VMI|GDKCC",
    "JIT|TS 3PL-VMI|GZKCC",
    "JIT|TS 3PL-VMI|HBKCC",
    "JIT|TS 3PL-VMI|JSKCC",
    "JIT|TS 3PL-VMI|NCKCC",
    "JIT|TS 3PL-VMI|NEKCC",
    "JIT|TS 3PL-VMI|SHKCC",
    "JIT|TS 3PL-VMI|ZJKCC",
    "LAH|TS 3PL-VMI|AHKCC",
    "LAH|TS 3PL-VMI|CSKCC",
    "LAH|TS 3PL-VMI|ENGKCC",
    "LAH|TS 3PL-VMI|FJKCC",
    "LAH|TS 3PL-VMI|GDKCC",
    "LAH|TS 3PL-VMI|GZKCC",
    "LAH|TS 3PL-VMI|HBKCC",
    "LAH|TS 3PL-VMI|JSKCC",
    "LAH|TS 3PL-VMI|NCKCC",
    "LAH|TS 3PL-VMI|NEKCC",
    "LAH|TS 3PL-VMI|SHKCC",
    "LAH|TS 3PL-VMI|ZJKCC",
    "JIS|TS SUP-VMI|TS SUP-VMI",
    "JIT|TS SUP-VMI|TS SUP-VMI",
    "LAH|TS SUP-VMI|TS SUP-VMI",
  ].map((x) => x.toUpperCase()),
);

function toText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function toUpperText(value) {
  return toText(value).toUpperCase();
}

function toNumber(value) {
  const text = toText(value).replace(/,/g, "");
  if (!text) {
    return null;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function pushTag(tags, tag) {
  if (!tags.includes(tag)) {
    tags.push(tag);
  }
}

function pickReadablePath(file) {
  const candidates = [file?.storedPath, file?.originalPath].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      return require("node:fs").existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function reviewRows(fileName, rows) {
  const issues = [];

  for (let idx = 1; idx < rows.length; idx += 1) {
    const row = Array.isArray(rows[idx]) ? rows[idx] : [];
    const tags = [];

    const hasRequiredMissing = REQUIRED_CELL_INDEXES.some((cellIndex) => !toText(row[cellIndex]));
    if (hasRequiredMissing) {
      pushTag(tags, "缺少必填字段");
    }

    const supplierCode = toText(row[3]);
    const supplierCodeJ = toText(row[9]);
    const d5 = supplierCode.slice(0, 5);
    const j5 = supplierCodeJ.slice(0, 5);
    if (d5 && j5 && d5 !== j5) {
      pushTag(tags, "供应商编码不一致");
    }

    const inboundMethod = toUpperText(row[6]);
    const modeText = toUpperText(row[7]);
    const routeText = toUpperText(row[8]);
    const distance = toNumber(row[14]);

    if (inboundMethod === "JIS" && distance !== null && distance > 20) {
      pushTag(tags, "Inbound方式错误");
    }
    if (distance !== null && distance >= 300 && modeText !== "VMI") {
      pushTag(tags, "运输距离超限");
    }
    if (distance !== null && distance < 300 && modeText === "TS 3PL-VMI") {
      pushTag(tags, "VMI规则冲突");
    }

    const combo = `${inboundMethod}|${modeText}|${routeText}`;
    if (inboundMethod || modeText || routeText) {
      if (!WHITELIST_COMBOS.has(combo)) {
        pushTag(tags, "白名单外组合");
      }
    }

    if (tags.length === 0) {
      continue;
    }

    issues.push({
      file: fileName,
      line: idx + 1,
      plant: toText(row[2]),
      supplierCode,
      supplierName: toText(row[4]),
      partNo: toText(row[0]),
      partName: toText(row[1]),
      tags,
    });
  }

  return issues;
}

function readSheetRows(filePath) {
  const workbook = xlsx.readFile(filePath, { raw: false, cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
}

async function reviewInboundFiles(files) {
  const rows = [];

  for (const file of files) {
    const filePath = pickReadablePath(file);
    const fileName = toText(file?.fileName) || "unknown.xlsx";
    if (!filePath) {
      rows.push({
        file: fileName,
        line: 0,
        plant: "",
        supplierCode: "",
        supplierName: "",
        partNo: "",
        partName: "",
        tags: ["缺少必填字段"],
      });
      continue;
    }

    const sheetRows = readSheetRows(filePath);
    rows.push(...reviewRows(fileName, sheetRows));
  }

  return rows;
}

module.exports = {
  reviewInboundFiles,
  reviewRows,
  readSheetRows,
};
