from __future__ import annotations

import flet as ft

from core.components.ui_theme import (
    BUTTON_HEIGHT,
    BUTTON_WIDTH,
    MUTED_COLOR,
    normal_button_style,
    panel,
    status_chip,
    table_style,
)
from modules.base_module import BaseModule


class SupplierManagementModule(BaseModule):
    module_id = "supplier_management"

    def __init__(self, context) -> None:
        super().__init__(context)
        self._page: ft.Page | None = None
        self._selected_supplier: str | None = None
        self._status_text = ft.Text("就绪")
        self._table = ft.DataTable(columns=[], rows=[])

    def get_name(self) -> str:
        return "供应商管理"

    def get_icon(self) -> ft.Icons:
        return ft.Icons.BADGE

    def _button_style(self) -> ft.ButtonStyle:
        return normal_button_style()

    def build_ui(self, page: ft.Page) -> ft.Control:
        self._page = page
        self._table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("供应商编码")),
                ft.DataColumn(ft.Text("供应商名称")),
                ft.DataColumn(ft.Text("邮箱")),
                ft.DataColumn(ft.Text("状态")),
            ],
            rows=[],
            expand=True,
            **table_style(),
        )

        left_actions = ft.Row(
            controls=[
                ft.Button("新增供应商", style=self._button_style(), width=BUTTON_WIDTH, height=BUTTON_HEIGHT, on_click=lambda _: self._open_editor()),
                ft.Button("编辑供应商", style=self._button_style(), width=BUTTON_WIDTH, height=BUTTON_HEIGHT, on_click=lambda _: self._edit_selected()),
                ft.Button("刷新列表", style=self._button_style(), width=BUTTON_WIDTH, height=BUTTON_HEIGHT, on_click=lambda _: self._refresh_suppliers()),
            ],
            wrap=True,
        )
        right_actions = ft.Row(
            controls=[
                ft.Button("切换启用", style=self._button_style(), width=BUTTON_WIDTH, height=BUTTON_HEIGHT, on_click=lambda _: self._toggle_active()),
            ],
            alignment=ft.MainAxisAlignment.END,
        )

        self._refresh_suppliers()
        self._status_text.color = MUTED_COLOR
        return panel(
            ft.Column(
                controls=[
                    ft.Row(
                        [left_actions, ft.Container(expand=True), right_actions],
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                    ),
                    self._status_text,
                    ft.Container(content=self._table, expand=True),
                ],
                expand=True,
            )
        )

    def _open_editor(self, supplier_code: str = "", supplier_name: str = "", emails: str = "", is_active: bool = True) -> None:
        if not self._page:
            return

        code_field = ft.TextField(label="供应商编码", value=supplier_code)
        name_field = ft.TextField(label="供应商名称", value=supplier_name)
        email_field = ft.TextField(label="邮箱（分号分隔）", value=emails)
        active_check = ft.Checkbox(label="启用", value=is_active)

        def on_save(_: ft.ControlEvent) -> None:
            code = code_field.value.strip()
            if not code:
                self._status_text.value = "保存失败：供应商编码不能为空"
                self._safe_update()
                return

            existing = self.context.db.query_one("SELECT supplier_code FROM suppliers WHERE supplier_code = ?", (code,))
            if existing:
                self.context.db.execute(
                    """
                    UPDATE suppliers
                    SET supplier_name = ?, emails = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE supplier_code = ?
                    """,
                    (name_field.value.strip(), email_field.value.strip(), 1 if active_check.value else 0, code),
                )
            else:
                self.context.db.execute(
                    """
                    INSERT INTO suppliers(supplier_code, supplier_name, emails, is_active)
                    VALUES(?, ?, ?, ?)
                    """,
                    (code, name_field.value.strip(), email_field.value.strip(), 1 if active_check.value else 0),
                )

            self._selected_supplier = code
            self._status_text.value = f"保存成功：{code}"
            self._refresh_suppliers()
            self._page.close(dialog)
            self._safe_update()

        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("供应商编辑"),
            content=ft.Column([code_field, name_field, email_field, active_check], tight=True, width=420),
            actions=[
                ft.TextButton("取消", on_click=lambda _: self._page.close(dialog)),
                ft.Button("保存", on_click=on_save),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        self._page.open(dialog)

    def _edit_selected(self) -> None:
        if not self._selected_supplier:
            self._status_text.value = "请先选择供应商"
            self._safe_update()
            return

        row = self.context.db.query_one(
            "SELECT supplier_code, supplier_name, emails, is_active FROM suppliers WHERE supplier_code = ?",
            (self._selected_supplier,),
        )
        if row is None:
            self._status_text.value = "供应商不存在，已刷新"
            self._refresh_suppliers()
            self._safe_update()
            return

        self._open_editor(
            supplier_code=row["supplier_code"] or "",
            supplier_name=row["supplier_name"] or "",
            emails=row["emails"] or "",
            is_active=bool(row["is_active"]),
        )

    def _toggle_active(self) -> None:
        if not self._selected_supplier:
            self._status_text.value = "请先选择供应商"
            self._safe_update()
            return

        row = self.context.db.query_one("SELECT is_active FROM suppliers WHERE supplier_code = ?", (self._selected_supplier,))
        if row is None:
            self._status_text.value = "供应商不存在，已刷新"
            self._refresh_suppliers()
            self._safe_update()
            return

        new_active = 0 if int(row["is_active"]) == 1 else 1
        self.context.db.execute(
            "UPDATE suppliers SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE supplier_code = ?",
            (new_active, self._selected_supplier),
        )
        status = "启用" if new_active == 1 else "停用"
        self._status_text.value = f"状态已更新：{self._selected_supplier} -> {status}"
        self._refresh_suppliers()
        self._safe_update()

    def _refresh_suppliers(self) -> None:
        rows = self.context.db.query_all(
            "SELECT supplier_code, supplier_name, emails, is_active FROM suppliers ORDER BY supplier_code ASC"
        )
        table_rows = [
            ft.DataRow(
                cells=[
                    ft.DataCell(
                        ft.TextButton(
                            row["supplier_code"],
                            on_click=lambda _, code=row["supplier_code"]: self._select_supplier(code),
                        )
                    ),
                    ft.DataCell(ft.Text(row["supplier_name"] or "")),
                    ft.DataCell(ft.Text(row["emails"] or "")),
                    ft.DataCell(status_chip("启用" if int(row["is_active"]) == 1 else "停用", int(row["is_active"]) == 1)),
                ]
            )
            for row in rows
        ]
        if not table_rows:
            table_rows = [
                ft.DataRow(
                    cells=[
                        ft.DataCell(ft.Text("10243")),
                        ft.DataCell(ft.Text("ACME")),
                        ft.DataCell(ft.Text("a@example.com")),
                        ft.DataCell(status_chip("启用", True)),
                    ]
                )
            ]
        self._table.rows = table_rows

    def _select_supplier(self, supplier_code: str) -> None:
        self._selected_supplier = supplier_code
        self._status_text.value = f"已选择供应商：{supplier_code}"
        self._safe_update()

    def _safe_update(self) -> None:
        if self._page:
            self._page.update()
