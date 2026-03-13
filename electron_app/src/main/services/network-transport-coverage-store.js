const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const xlsx = require("xlsx");
const initSqlJs = require("sql.js/dist/sql-wasm.js");
const SQL_WASM_PATH = require.resolve("sql.js/dist/sql-wasm.wasm");

let sqlModulePromise = null;

function normalizeSite(value) {
  return String(value || "").trim();
}

function normalizeCoverage(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/%$/, "");
  if (!text) {
    return null;
  }
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function readCsvRows(csvPath) {
  const workbook = xlsx.readFile(csvPath, { raw: false, cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });
}

function getSiteField(record) {
  if (!record || typeof record !== "object") {
    return "";
  }
  return normalizeSite(record.Site || record.site || record.SITE || "");
}

function getCoverageField(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  return normalizeCoverage(record.Coverage ?? record.coverage ?? record.COVERAGE);
}

function toCoverageRows(records) {
  const rows = [];
  let skipped = 0;

  for (const record of records) {
    const site = getSiteField(record);
    const coverage = getCoverageField(record);
    if (!site || coverage === null) {
      skipped += 1;
      continue;
    }
    rows.push({ site, coverage });
  }

  return { rows, skipped };
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (file) => {
        if (file === "sql-wasm.wasm") {
          return SQL_WASM_PATH;
        }
        return require.resolve(`sql.js/dist/${file}`);
      },
    });
  }
  return sqlModulePromise;
}

class NetworkTransportCoverageStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    if (this.db) {
      return;
    }

    const SQL = await getSqlModule();
    let seed = null;
    if (fs.existsSync(this.dbPath)) {
      seed = await fsp.readFile(this.dbPath);
    }
    this.db = seed ? new SQL.Database(new Uint8Array(seed)) : new SQL.Database();
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        key TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS network_transport_coverage (
        site TEXT PRIMARY KEY,
        coverage REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.run(
      `
      INSERT INTO schema_version (key, version, updated_at)
      VALUES ('flint_core', 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        version = excluded.version,
        updated_at = excluded.updated_at;
      `,
      [new Date().toISOString()],
    );
    await this.flush();
  }

  async flush() {
    if (!this.db) {
      return;
    }
    const bytes = this.db.export();
    await fsp.mkdir(path.dirname(this.dbPath), { recursive: true });
    await fsp.writeFile(this.dbPath, Buffer.from(bytes));
  }

  async getRowCount() {
    await this.init();
    const result = this.db.exec("SELECT COUNT(1) AS count FROM network_transport_coverage;");
    const count = result?.[0]?.values?.[0]?.[0] || 0;
    return Number(count) || 0;
  }

  async upsertRows(rows) {
    await this.init();
    if (!rows.length) {
      return { upserted: 0 };
    }

    this.db.run("BEGIN TRANSACTION;");
    try {
      const stmt = this.db.prepare(`
        INSERT INTO network_transport_coverage (site, coverage, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(site) DO UPDATE SET
          coverage = excluded.coverage,
          updated_at = excluded.updated_at;
      `);
      const now = new Date().toISOString();
      for (const row of rows) {
        stmt.run([row.site, row.coverage, now]);
      }
      stmt.free();
      this.db.run("COMMIT;");
    } catch (error) {
      this.db.run("ROLLBACK;");
      throw error;
    }

    await this.flush();
    return { upserted: rows.length };
  }

  async importFromCsv(csvPath) {
    await this.init();
    if (!csvPath || !fs.existsSync(csvPath)) {
      throw new Error("CSV 文件不存在");
    }

    const records = readCsvRows(csvPath);
    const { rows, skipped } = toCoverageRows(records);
    const result = await this.upsertRows(rows);

    return {
      csvPath,
      parsed: records.length,
      upserted: result.upserted,
      skipped,
      finishedAt: new Date().toISOString(),
    };
  }

  async getCoverageBySite(site) {
    await this.init();
    const normalizedSite = normalizeSite(site);
    if (!normalizedSite) {
      return null;
    }
    const stmt = this.db.prepare(
      "SELECT coverage FROM network_transport_coverage WHERE site = ? LIMIT 1;",
    );
    stmt.bind([normalizedSite]);
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    const coverage = Number(row.coverage);
    return Number.isFinite(coverage) ? coverage : null;
  }

  async close() {
    if (!this.db) {
      return;
    }
    await this.flush();
    this.db.close();
    this.db = null;
  }
}

module.exports = {
  NetworkTransportCoverageStore,
};
