import { describe, expect, it } from "vitest";
import utils from "../src/main/services/domain-utils";

const { sanitizeFileName, extractSupplierCode, makeSubject, toCsvCell } = utils;

describe("domain-utils", () => {
  it("sanitizes invalid file name chars and spaces", () => {
    expect(sanitizeFileName('a:b/c*?"<d>| e.xlsx')).toBe("a_b_c____d___e.xlsx");
  });

  it("extracts supplier code from file name", () => {
    expect(extractSupplierCode("协议_10243_2026.xlsx")).toBe("10243");
  });

  it("generates fallback supplier code when not found", () => {
    const code = extractSupplierCode("协议_abc.xlsx");
    expect(code).toMatch(/^\d{5}$/);
  });

  it("builds subject with optional prefix", () => {
    expect(makeSubject("Q2", "10243")).toBe("Q2零件供货方式确认_10243");
    expect(makeSubject("", "10243")).toBe("零件供货方式确认_10243");
  });

  it("escapes csv cells", () => {
    expect(toCsvCell('a"b')).toBe('"a""b"');
  });
});
