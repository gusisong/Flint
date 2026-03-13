import { describe, expect, it } from "vitest";
import inboundReview from "../src/main/services/inbound-review";

const { reviewRows } = inboundReview;

describe("inbound-review", () => {
  it("generates real rule tags from worksheet rows", () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["P-001", "零件A", "WUH", "10001", "供应商A", "", "JIS", "DR SUP", "DR SUP", "10002", "", "L", "M", "", 30],
    ];

    const result = reviewRows("case.xlsx", rows);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("供应商编码不一致");
    expect(result[0].tags).toContain("Inbound方式错误");
  });

  it("flags whitelist violation and missing required cells", () => {
    const rows = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"],
      ["", "零件B", "NAN", "10001", "供应商B", "", "LAH", "UNKNOWN", "UNKNOWN", "10001", "", "", "", "", 100],
    ];

    const result = reviewRows("case2.xlsx", rows);

    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain("缺少必填字段");
    expect(result[0].tags).toContain("白名单外组合");
  });
});
