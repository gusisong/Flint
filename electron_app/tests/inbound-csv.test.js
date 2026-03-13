import { describe, expect, it } from "vitest";
import inboundCsv from "../src/main/services/inbound-csv";

const { buildInboundCsvContent } = inboundCsv;

describe("inbound-csv", () => {
  it("adds UTF-8 BOM and keeps Chinese text", () => {
    const content = buildInboundCsvContent([
      {
        file: "测试.xlsx",
        line: 2,
        plant: "1300",
        supplierCode: "10001",
        supplierName: "供应商A",
        partNo: "P-001",
        partName: "零件A",
        tags: ["JIS零件距离>20KM"],
      },
    ]);

    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain("供应商A");
    expect(content).toContain("JIS零件距离>20KM");
  });
});
