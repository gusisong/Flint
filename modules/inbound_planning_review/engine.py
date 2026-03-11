from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import openpyxl
import xlrd


@dataclass
class ReviewIssue:
    row_index: int
    messages: list[str]


def load_rows(file_path: Path) -> list[list[Any]]:
    suffix = file_path.suffix.lower()
    if suffix == ".xlsx":
        workbook = openpyxl.load_workbook(file_path, data_only=True)
        sheet = workbook.active
        rows: list[list[Any]] = []
        for row in sheet.iter_rows(values_only=True):
            rows.append(list(row))
        return rows

    if suffix == ".xls":
        workbook = xlrd.open_workbook(file_path)
        sheet = workbook.sheet_by_index(0)
        rows = []
        for idx in range(sheet.nrows):
            rows.append(sheet.row_values(idx))
        return rows

    raise ValueError(f"Unsupported file type: {suffix}")


def to_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def to_float(value: Any) -> float | None:
    text = to_text(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def review_rows(rows: list[list[Any]], config: dict[str, Any]) -> list[ReviewIssue]:
    issues: list[ReviewIssue] = []

    required_columns = config.get("required_columns", [0, 2, 3, 6, 7, 8, 9, 11, 12])
    vmi_types = set(config.get("vmi_types", ["TS Sup-VMI", "TS 3PL-VMI"]))
    no_vmi_lt_300 = config.get("no_vmi_lt_300", "TS 3PL-VMI")
    jis_key = config.get("jis_key", "JIS")
    jis_max_distance = float(config.get("jis_max_distance", 20))
    long_distance_threshold = float(config.get("long_distance_threshold", 300))

    valid_triplets = {
        tuple(item)
        for item in config.get(
            "valid_triplets",
            [
                ["JIS", "TS Sup-VMI", "MilkRun"],
                ["JIS", "TS 3PL-VMI", "MilkRun"],
            ],
        )
    }

    for row_idx, row in enumerate(rows, start=1):
        if row_idx == 1:
            continue

        row_messages: list[str] = []

        for col in required_columns:
            value = to_text(row[col] if col < len(row) else "")
            if not value:
                row_messages.append("缺少必填值")
                break

        d_val = to_text(row[3] if len(row) > 3 else "")
        j_val = to_text(row[9] if len(row) > 9 else "")
        if d_val and j_val and d_val != j_val[:5]:
            row_messages.append("发货地编码与供应商号不一致")

        h_val = to_text(row[7] if len(row) > 7 else "")
        o_val = to_float(row[14] if len(row) > 14 else "")
        if o_val is not None and o_val >= long_distance_threshold and h_val not in vmi_types:
            row_messages.append("运输距离大于300公里，未规划带VMI")

        if o_val is not None and o_val < long_distance_threshold and h_val == no_vmi_lt_300:
            row_messages.append("运输距离小于300公里，规划带VMI")

        g_val = to_text(row[6] if len(row) > 6 else "")
        if g_val == jis_key and o_val is not None and o_val > jis_max_distance:
            row_messages.append("JIS零件供货距离大于20公里")

        i_val = to_text(row[8] if len(row) > 8 else "")
        if (g_val, h_val, i_val) not in valid_triplets:
            row_messages.append("Inbound方式填写错误")

        if row_messages:
            issues.append(ReviewIssue(row_index=row_idx, messages=row_messages))

    return issues
