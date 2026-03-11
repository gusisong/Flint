from __future__ import annotations

from unittest import TestCase

from modules.inbound_planning_review.engine import review_rows


class TestInboundEngine(TestCase):
    def test_review_rows_allows_whitelisted_triplet(self) -> None:
        config = {
            "required_columns": [0, 2, 3, 6, 7, 8, 9, 11, 12],
            "vmi_types": ["TS Sup-VMI", "TS 3PL-VMI"],
            "no_vmi_lt_300": "TS 3PL-VMI",
            "jis_key": "JIS",
            "jis_max_distance": 20,
            "long_distance_threshold": 300,
            "valid_triplets": [["LAH", "DR 3PL", "ENG"]],
        }

        header = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
        row = [
            "A1", "", "C1", "ABCDE", "", "", "LAH", "DR 3PL", "ENG", "ABCDE-01", "", "L1", "M1", "", "",
        ]

        issues = review_rows([header, row], config)
        if issues:
            self.assertNotIn("Inbound方式填写错误", issues[0].messages)

    def test_review_rows_flags_multiple_issues(self) -> None:
        config = {
            "required_columns": [0, 2, 3, 6, 7, 8, 9, 11, 12],
            "vmi_types": ["TS Sup-VMI", "TS 3PL-VMI"],
            "no_vmi_lt_300": "TS 3PL-VMI",
            "jis_key": "JIS",
            "jis_max_distance": 20,
            "long_distance_threshold": 300,
            "valid_triplets": [["JIS", "TS Sup-VMI", "MilkRun"]],
        }

        header = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
        row = [
            "A1", "", "C1", "D1234", "", "", "JIS", "TS 3PL", "WrongRoute", "J9999", "", "L1", "M1", "", 500,
        ]
        rows = [header, row]

        issues = review_rows(rows, config)
        self.assertEqual(len(issues), 1)
        messages = issues[0].messages
        self.assertIn("发货地编码与供应商号不一致", messages)
        self.assertIn("运输距离大于300公里，未规划带VMI", messages)
        self.assertIn("JIS零件供货距离大于20公里", messages)
        self.assertIn("Inbound方式填写错误", messages)

    def test_review_rows_required_field_missing(self) -> None:
        config = {
            "required_columns": [0, 2],
            "vmi_types": ["TS Sup-VMI", "TS 3PL-VMI"],
            "no_vmi_lt_300": "TS 3PL-VMI",
            "jis_key": "JIS",
            "jis_max_distance": 20,
            "long_distance_threshold": 300,
            "valid_triplets": [["JIS", "TS Sup-VMI", "MilkRun"]],
        }

        rows = [["A", "B", "C"], ["v1", "", ""]]
        issues = review_rows(rows, config)

        self.assertEqual(len(issues), 1)
        self.assertIn("缺少必填值", issues[0].messages)
