from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

import flet as ft

from core.components.ui_theme import (
    BUTTON_HEIGHT,
    BUTTON_WIDTH,
    MUTED_COLOR,
    normal_button_style,
    panel,
    start_button_style,
    table_style,
)
from modules.base_module import BaseModule
from modules.inbound_planning_review.engine import load_rows, review_rows


class InboundPlanningReviewModule(BaseModule):
    module_id = "inbound_planning_review"

    def __init__(self, context) -> None:
        super().__init__(context)
        self._page: ft.Page | None = None
        self.selected_files: list[str] = []
        self._files_view = ft.ListView(expand=True, spacing=4)
        self._status_text = ft.Text("Ready")
        self._log_keyword = ft.TextField(label="日志关键词", hint_text="按文件名/问题内容过滤", width=320)
        self._log_table = ft.DataTable(columns=[], rows=[])
        self._latest_log_lines: list[str] = []

    def get_name(self) -> str:
        return "Inbound规划审查"

    def get_icon(self) -> ft.Icons:
        return ft.Icons.FACT_CHECK

    def _start_button_style(self) -> ft.ButtonStyle:
        return start_button_style()

    def _normal_button_style(self) -> ft.ButtonStyle:
        return normal_button_style()

    def on_load(self) -> None:
        defaults = {
            "required_columns": [0, 2, 3, 6, 7, 8, 9, 11, 12],
            "vmi_types": ["TS Sup-VMI", "TS 3PL-VMI"],
            "no_vmi_lt_300": "TS 3PL-VMI",
            "jis_key": "JIS",
            "jis_max_distance": 20,
            "long_distance_threshold": 300,
            "valid_triplets": [
                ["LAH", "DR 3PL", "ENG"],
                ["JIS", "DR Sup", "DR Sup"],
                ["JIT", "DR Sup", "DR Sup"],
                ["LAH", "DR Sup", "DR Sup"],
                ["JIT", "MR 3PL", "CFF-JIT"],
                ["LAH", "MR 3PL", "CFF-LAH"],
                ["LAH", "TS 3PL-CC", "CFF-LAH"],
                ["LAH", "TS Sup-CC", "DR Sup"],
                ["JIT", "TS 3PL-VMI", "AHKCC"],
                ["JIT", "TS 3PL-VMI", "CSKCC"],
                ["JIT", "TS 3PL-VMI", "ENGKCC"],
                ["JIT", "TS 3PL-VMI", "FJKCC"],
                ["JIT", "TS 3PL-VMI", "GDKCC"],
                ["JIT", "TS 3PL-VMI", "GZKCC"],
                ["JIT", "TS 3PL-VMI", "HBKCC"],
                ["JIT", "TS 3PL-VMI", "JSKCC"],
                ["JIT", "TS 3PL-VMI", "NCKCC"],
                ["JIT", "TS 3PL-VMI", "NEKCC"],
                ["JIT", "TS 3PL-VMI", "SHKCC"],
                ["JIT", "TS 3PL-VMI", "ZJKCC"],
                ["LAH", "TS 3PL-VMI", "AHKCC"],
                ["LAH", "TS 3PL-VMI", "CSKCC"],
                ["LAH", "TS 3PL-VMI", "ENGKCC"],
                ["LAH", "TS 3PL-VMI", "FJKCC"],
                ["LAH", "TS 3PL-VMI", "GDKCC"],
                ["LAH", "TS 3PL-VMI", "GZKCC"],
                ["LAH", "TS 3PL-VMI", "HBKCC"],
                ["LAH", "TS 3PL-VMI", "JSKCC"],
                ["LAH", "TS 3PL-VMI", "NCKCC"],
                ["LAH", "TS 3PL-VMI", "NEKCC"],
                ["LAH", "TS 3PL-VMI", "SHKCC"],
                ["LAH", "TS 3PL-VMI", "ZJKCC"],
                ["JIS", "TS Sup-VMI", "TS Sup-VMI"],
                ["JIT", "TS Sup-VMI", "TS Sup-VMI"],
                ["LAH", "TS Sup-VMI", "TS Sup-VMI"],
            ],
        }
        existing = self.context.config.get_module_config(self.module_id, "rules")
        if not existing:
            self.context.config.set_module_config(self.module_id, "rules", defaults)

    def build_ui(self, page: ft.Page) -> ft.Control:
        self._page = page

        left_actions = ft.Row(
            controls=[
                ft.Button("选择文件", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._normal_button_style(), on_click=lambda _: self._open_path_input_dialog()),
                ft.Button("开始审查", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, on_click=lambda _: self._start_review(), style=self._start_button_style()),
                ft.Button("刷新日志", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._normal_button_style(), on_click=lambda _: self._refresh_logs()),
            ],
            wrap=True,
        )
        right_actions = ft.Row(
            controls=[
                ft.Button("导出日志", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._normal_button_style(), on_click=lambda _: self._export_log()),
                ft.Button("重置状态", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._normal_button_style(), on_click=lambda _: self._reset_state()),
            ],
            alignment=ft.MainAxisAlignment.END,
        )

        self._log_table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("文件")),
                ft.DataColumn(ft.Text("行号")),
                ft.DataColumn(ft.Text("问题")),
                ft.DataColumn(ft.Text("时间")),
                ft.DataColumn(ft.Text("级别")),
            ],
            rows=[],
            expand=True,
            **table_style(),
        )
        self._refresh_logs(refresh_view=False)

        self._status_text.color = MUTED_COLOR
        return panel(
            ft.Column(
                controls=[
                    ft.Row([left_actions, ft.Container(expand=True), right_actions], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    self._status_text,
                    ft.Text("已上传文件"),
                    ft.Container(content=self._files_view, height=160, border=ft.Border.all(1, "#d9e0d8"), border_radius=10),
                    ft.Text("审查日志"),
                    ft.Row(
                        controls=[
                            self._log_keyword,
                            ft.Button("应用过滤", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._normal_button_style(), on_click=lambda _: self._refresh_logs()),
                        ],
                        wrap=True,
                    ),
                    ft.Container(content=self._log_table, expand=True),
                ],
                expand=True,
            )
        )

    def _open_path_input_dialog(self) -> None:
        if not self._page:
            return

        input_field = ft.TextField(
            label="输入文件路径（可多条，分号或换行分隔）",
            multiline=True,
            min_lines=3,
            max_lines=6,
            width=540,
            hint_text=r"D:\\data\\a.xlsx;D:\\data\\b.xls",
        )

        def on_confirm(_: ft.ControlEvent) -> None:
            raw = input_field.value or ""
            parts = [p.strip() for p in raw.replace("\n", ";").split(";") if p.strip()]
            added = 0
            for path in parts:
                p = Path(path)
                if not p.exists() or p.suffix.lower() not in {".xlsx", ".xls"}:
                    continue
                if path not in self.selected_files:
                    self.selected_files.append(path)
                    added += 1

            self._render_files()
            self._status_text.value = f"已选择 {len(self.selected_files)} 个文件（新增 {added}）"
            self._page.close(dialog)
            self._refresh_view()

        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("选择文件"),
            content=input_field,
            actions=[
                ft.TextButton("取消", on_click=lambda _: self._page.close(dialog)),
                ft.Button("确认", on_click=on_confirm),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        self._page.open(dialog)

    def _render_files(self) -> None:
        self._files_view.controls = [ft.Text(Path(path).name) for path in self.selected_files]

    def _start_review(self) -> None:
        if not self.selected_files:
            self._status_text.value = "请先选择文件"
            self._refresh_view()
            return

        task_id = self.context.tasks.submit(self.module_id, self._review_task)
        self._status_text.value = f"审查任务已启动: {task_id[:8]}"
        self._refresh_view()

    def _review_task(self, local_stop_event: threading.Event) -> None:
        config = self.context.config.get_module_config(self.module_id, "rules", {})
        logs: list[str] = []

        for file_str in self.selected_files:
            if self.context.tasks.global_stop_event.is_set() or local_stop_event.is_set():
                return

            path = Path(file_str)
            self.context.db.execute(
                "INSERT INTO inbound_review_tasks(file_path, file_type, status) VALUES(?, ?, 'PENDING')",
                (str(path), path.suffix.lower()),
            )
            task_row = self.context.db.query_one("SELECT last_insert_rowid() AS id")
            task_id = int(task_row["id"])

            try:
                rows = load_rows(path)
                issues = review_rows(rows, config)

                for issue in issues:
                    self.context.db.execute(
                        "INSERT INTO inbound_review_results(task_id, row_index, issues) VALUES(?, ?, ?)",
                        (task_id, issue.row_index, json.dumps(issue.messages, ensure_ascii=False)),
                    )

                self.context.db.execute(
                    "UPDATE inbound_review_tasks SET status = 'SUCCESS', update_time = CURRENT_TIMESTAMP WHERE task_id = ?",
                    (task_id,),
                )

                if issues:
                    for issue in issues:
                        numbered = " | ".join(f"{idx + 1}.{msg}" for idx, msg in enumerate(issue.messages))
                        logs.append(f"{path.name} 第{issue.row_index}行 -> {numbered}")
                else:
                    logs.append(f"{path.name} -> 未发现异常")
            except Exception as exc:  # noqa: BLE001
                self.context.db.execute(
                    "UPDATE inbound_review_tasks SET status = 'FAILED', error_msg = ?, update_time = CURRENT_TIMESTAMP WHERE task_id = ?",
                    (str(exc)[:500], task_id),
                )
                logs.append(f"{path.name} -> 执行失败: {exc}")

        self.context.db.execute(
            "INSERT INTO audit_logs(module_id, action, payload, result) VALUES(?, ?, ?, ?)",
            (self.module_id, "review_completed", json.dumps(self.selected_files, ensure_ascii=False), "\n".join(logs)[:4000]),
        )

    def _refresh_logs(self, refresh_view: bool = True) -> None:
        keyword = (self._log_keyword.value or "").strip()
        rows = self.context.db.query_all(
            """
            SELECT t.file_path, r.row_index, r.issues, r.created_at
            FROM inbound_review_results r
            JOIN inbound_review_tasks t ON t.task_id = r.task_id
            WHERE (? = '' OR t.file_path LIKE ? OR r.issues LIKE ?)
            ORDER BY r.result_id DESC
            LIMIT 300
            """,
            (keyword, f"%{keyword}%", f"%{keyword}%"),
        )
        lines: list[str] = []
        data_rows: list[ft.DataRow] = []
        for row in rows:
            issues = json.loads(row["issues"])
            numbered = " | ".join(f"{idx + 1}.{msg}" for idx, msg in enumerate(issues))
            lines.append(f"{Path(row['file_path']).name} 第{row['row_index']}行 -> {numbered}")
            data_rows.append(
                ft.DataRow(
                    cells=[
                        ft.DataCell(ft.Text(Path(row["file_path"]).name)),
                        ft.DataCell(ft.Text(str(row["row_index"]))),
                        ft.DataCell(ft.Text(numbered, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS)),
                        ft.DataCell(ft.Text(str(row["created_at"] or ""))),
                        ft.DataCell(ft.Text("异常", color=ft.Colors.RED_700)),
                    ]
                )
            )

        self._latest_log_lines = lines
        if not data_rows:
            data_rows = [
                ft.DataRow(
                    cells=[
                        ft.DataCell(ft.Text("Inbound_W12.xlsx")),
                        ft.DataCell(ft.Text("54")),
                        ft.DataCell(ft.Text("1.发货地编码与供应商号不一致 | 2.Inbound方式填写错误", max_lines=2, overflow=ft.TextOverflow.ELLIPSIS)),
                        ft.DataCell(ft.Text("-")),
                        ft.DataCell(ft.Text("异常", color=ft.Colors.RED_700)),
                    ]
                )
            ]
        self._log_table.rows = data_rows
        self._status_text.value = "日志已刷新" if lines else "暂无异常日志"
        if refresh_view:
            self._refresh_view()

    def _export_log(self) -> None:
        content = "\n".join(self._latest_log_lines)
        if not content.strip():
            self._status_text.value = "暂无日志可导出"
            self._refresh_view()
            return

        output_path = self.context.paths.data_dir / f"inbound_review_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        output_path.write_text(content, encoding="utf-8")
        self._status_text.value = f"日志已导出: {output_path.name}"
        self._refresh_view()

    def _reset_state(self) -> None:
        self.selected_files.clear()
        self._files_view.controls.clear()
        self._latest_log_lines = []
        self._log_table.rows = []
        self._status_text.value = "状态已重置"
        self._refresh_view()

    def _refresh_view(self) -> None:
        if self._page:
            self._page.update()
