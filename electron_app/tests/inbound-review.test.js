import { describe, expect, it } from "vitest";
import inboundReview from "../src/main/services/inbound-review";

const { reviewRows } = inboundReview;

describe("inbound-review", () => {
  it("generates real rule tags from worksheet rows", async () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["P-001", "零件A", "WUH", "10001", "供应商A", "", "JIS", "DR SUP", "DR SUP", "10002", "", "L", "M", "", 30],
    ];

    const result = await reviewRows("case.xlsx", rows);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("发货点选择错误");
    expect(result[0].tags).toContain("JIS直运距离>20KM");
  });

  it("flags whitelist violation and missing required cells", async () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["", "零件B", "NAN", "10001", "供应商B", "", "LAH", "UNKNOWN", "UNKNOWN", "10001", "", "", "", "", 100],
    ];

    const result = await reviewRows("case2.xlsx", rows);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("缺少必填字段");
    expect(result[0].tags).toContain("供货方式组合异常");
  });

  it("flags site not covered when 3PL modes require coverage", async () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["P-003", "零件C", "WUH", "10001", "供应商C", "", "LAH", "MR 3PL", "CFF-LAH", "S100", "", "L", "M", "", 120],
    ];

    const result = await reviewRows("case3.xlsx", rows, {
      resolveCoverageBySite: async (site) => (site === "S100" ? 0 : null),
    });

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("站点尚未承运");
  });

  it("flags site already covered when SUP modes expect no coverage", async () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["P-004", "零件D", "WUH", "10001", "供应商D", "", "JIT", "DR SUP", "DR SUP", "S200", "", "L", "M", "", 80],
    ];

    const result = await reviewRows("case4.xlsx", rows, {
      resolveCoverageBySite: async (site) => (site === "S200" ? 20 : null),
    });

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("站点已在承运");
  });
});
