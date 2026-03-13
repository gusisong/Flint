const xlsx = require("xlsx");

const REQUIRED_CELL_INDEXES = [0, 2, 3, 6, 7, 8, 9, 11, 12];

const COVERAGE_ZERO_REQUIRED_MODES = new Set(["MR 3PL", "TS 3PL-VMI", "TS 3PL-CC"]);
const COVERAGE_POSITIVE_FORBIDDEN_MODES = new Set(["DR SUP", "TS SUP-VMI", "TS SUP-CC"]);

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

async function reviewRows(fileName, rows, options = {}) {
  const resolveCoverageBySite =
    typeof options.resolveCoverageBySite === "function"
      ? options.resolveCoverageBySite
      : async () => null;
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
      pushTag(tags, "发货点选择错误");
    }

    const inboundMethod = toUpperText(row[6]);
    const modeText = toUpperText(row[7]);
    const routeText = toUpperText(row[8]);
    const distance = toNumber(row[14]);

    if (inboundMethod === "JIS" && modeText === "DR SUP" && distance !== null && distance > 20) {
      pushTag(tags, "JIS直运距离>20KM");
    }
    if (distance !== null && distance >= 300 && modeText === "MR 3PL") {
      pushTag(tags, ">300KM建议规划VMI");
    }
    if (distance !== null && distance < 300 && modeText === "TS 3PL-VMI") {
      pushTag(tags, "<300KM不建议规划VMI");
    }

    const combo = `${inboundMethod}|${modeText}|${routeText}`;
    if (inboundMethod || modeText || routeText) {
      if (!WHITELIST_COMBOS.has(combo)) {
        pushTag(tags, "供货方式组合异常");
      }
    }

    const site = toText(row[9]);
    const coverage = await resolveCoverageBySite(site);
    if (COVERAGE_ZERO_REQUIRED_MODES.has(modeText) && coverage !== null && coverage === 0) {
      pushTag(tags, "站点尚未承运");
    }
    if (COVERAGE_POSITIVE_FORBIDDEN_MODES.has(modeText) && coverage !== null && coverage > 0) {
      pushTag(tags, "站点已在承运");
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

async function reviewInboundFiles(files, options = {}) {
  const rows = [];

  for (const file of files) {
    const filePath = pickReadablePath(file);
    const fileName = toText(file?.fileName) || "unknown.xlsx";
    if (!filePath) {
      continue;
    }

    const sheetRows = readSheetRows(filePath);
    const reviewedRows = await reviewRows(fileName, sheetRows, options);
    rows.push(...reviewedRows);
  }

  return rows;
}

module.exports = {
  reviewInboundFiles,
  reviewRows,
  readSheetRows,
};
