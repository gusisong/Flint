const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function normalizeVersion(input) {
  return String(input || "0.0.0").replace(/^v/i, "").trim();
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split(".").map((x) => Number.parseInt(x, 10) || 0);
  const right = normalizeVersion(b).split(".").map((x) => Number.parseInt(x, 10) || 0);
  const size = Math.max(left.length, right.length);
  for (let idx = 0; idx < size; idx += 1) {
    const l = left[idx] || 0;
    const r = right[idx] || 0;
    if (l > r) {
      return 1;
    }
    if (l < r) {
      return -1;
    }
  }
  return 0;
}

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Manifest request failed: HTTP ${response.status}`);
  }

  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Manifest is not valid JSON");
  }
}

async function checkForUpdate({ manifestUrl, currentVersion }) {
  const manifest = await fetchManifest(manifestUrl);
  const latestVersion = normalizeVersion(manifest.version);
  if (!latestVersion) {
    throw new Error("Manifest missing version");
  }
  const installerUrl = String(manifest.installerUrl || "").trim();
  const sha256 = String(manifest.sha256 || "").trim().toLowerCase();
  if (!installerUrl || !sha256) {
    throw new Error("Manifest missing installerUrl or sha256");
  }

  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  return {
    hasUpdate,
    currentVersion: normalizeVersion(currentVersion),
    latestVersion,
    installerUrl,
    sha256,
    notes: String(manifest.notes || ""),
    pubDate: String(manifest.pubDate || ""),
  };
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Installer request failed: HTTP ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(filePath, data);
}

async function getFileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  return await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadAndVerifyUpdate({ installerUrl, expectedSha256, saveDir, version }) {
  const fileName = `Flint-Setup-${normalizeVersion(version)}.exe`;
  const filePath = path.join(saveDir, fileName);
  await fsp.mkdir(saveDir, { recursive: true });
  await downloadToFile(installerUrl, filePath);
  const actualSha256 = await getFileSha256(filePath);
  const expected = String(expectedSha256 || "").toLowerCase();
  if (actualSha256 !== expected) {
    throw new Error(`SHA256 mismatch: expected ${expected}, got ${actualSha256}`);
  }
  return { filePath, sha256: actualSha256 };
}

module.exports = {
  checkForUpdate,
  downloadAndVerifyUpdate,
  compareVersions,
};
