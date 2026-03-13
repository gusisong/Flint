const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const COVERAGE_CSV_FILE_NAME = "NetworkTransportCoverage.csv";

function buildCoverageSignature(stat) {
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
}

async function checkCoverageCsvUpdate({
  sharedDir,
  lastSignature = "",
  fileName = COVERAGE_CSV_FILE_NAME,
}) {
  const normalizedDir = String(sharedDir || "").trim();
  if (!normalizedDir) {
    return {
      hasCandidate: false,
      needsUpdate: false,
      reason: "oneDriveCoverageDir 未配置",
    };
  }

  const csvPath = path.join(normalizedDir, fileName);
  try {
    await fsp.access(csvPath, fs.constants.R_OK);
  } catch {
    return {
      hasCandidate: false,
      needsUpdate: false,
      reason: `未在共享目录找到 ${fileName}`,
      filePath: csvPath,
    };
  }

  const stat = await fsp.stat(csvPath);
  const signature = buildCoverageSignature(stat);
  return {
    hasCandidate: true,
    needsUpdate: signature !== String(lastSignature || ""),
    filePath: csvPath,
    fileName,
    signature,
    size: stat.size,
    modifiedAt: new Date(stat.mtimeMs).toISOString(),
  };
}

function getDefaultCoverageSeedCandidates() {
  return [path.join(os.homedir(), "Downloads", COVERAGE_CSV_FILE_NAME)];
}

module.exports = {
  COVERAGE_CSV_FILE_NAME,
  checkCoverageCsvUpdate,
  getDefaultCoverageSeedCandidates,
};
