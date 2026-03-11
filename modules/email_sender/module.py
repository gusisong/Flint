from __future__ import annotations

import json
import re
import smtplib
import threading
from email.message import EmailMessage
from pathlib import Path

import flet as ft

from core.components.ui_theme import (
    BUTTON_HEIGHT,
    BUTTON_WIDTH,
    MUTED_COLOR,
    normal_button_style,
    panel,
    start_button_style,
    status_chip,
    table_style,
)
from modules.base_module import BaseModule
from modules.email_sender.rate_limiter import RateLimiter


class EmailSenderModule(BaseModule):
    module_id = "email_sender"

    def __init__(self, context) -> None:
        super().__init__(context)
        self._page: ft.Page | None = None
        self._tasks_table = ft.DataTable(columns=[], rows=[])
        self._status_text = ft.Text("Ready")
        self._filter_dropdown = ft.Dropdown(
            label="Status",
            options=[
                ft.dropdown.Option("ALL"),
                ft.dropdown.Option("PENDING"),
                ft.dropdown.Option("SUCCESS"),
                ft.dropdown.Option("FAILED"),
            ],
            value="ALL",
            width=180,
        )
        self._filter_dropdown.on_change = lambda _: self._on_filter_change()

    def get_name(self) -> str:
        return "运输协议外发"

    def get_icon(self) -> ft.Icons:
        return ft.Icons.LOCAL_SHIPPING

    def _start_button_style(self) -> ft.ButtonStyle:
        return start_button_style()

    def _normal_button_style(self) -> ft.ButtonStyle:
        return normal_button_style()

    def on_load(self) -> None:
        regex = self.context.config.get_module_config(self.module_id, "supplier_regex")
        if not regex:
            self.context.config.set_module_config(self.module_id, "supplier_regex", r"_(\d{5})_[^/]+$")

        smtp_settings = self.context.config.get_system_config("smtp_settings")
        if not smtp_settings:
            self.context.config.set_system_config(
                "smtp_settings",
                {
                    "host": "",
                    "port": 587,
                    "use_tls": True,
                    "username": "",
                    "password_encrypted": "",
                    "dry_run": True,
                },
            )

    def build_ui(self, page: ft.Page) -> ft.Control:
        self._page = page
        self._tasks_table = ft.DataTable(
            columns=[
                ft.DataColumn(ft.Text("状态")),
                ft.DataColumn(ft.Text("项目")),
                ft.DataColumn(ft.Text("供应商")),
                ft.DataColumn(ft.Text("附件数")),
                ft.DataColumn(ft.Text("失败原因")),
            ],
            rows=[],
            **table_style(),
        )

        left_actions = ft.Row(
            controls=[
                ft.Button(
                    "扫描工作区",
                    width=BUTTON_WIDTH,
                    height=BUTTON_HEIGHT,
                    style=self._normal_button_style(),
                    on_click=lambda _: self._scan_workspace(),
                ),
                ft.Button(
                    "开始发送",
                    on_click=lambda _: self._start_sending(),
                    style=self._start_button_style(),
                    width=BUTTON_WIDTH,
                    height=BUTTON_HEIGHT,
                ),
                self._filter_dropdown,
            ],
            wrap=True,
        )
        right_actions = ft.Row(
            controls=[
                ft.Button(
                    "重试失败",
                    width=BUTTON_WIDTH,
                    height=BUTTON_HEIGHT,
                    style=self._normal_button_style(),
                    on_click=lambda _: self._retry_failed(),
                )
            ],
            alignment=ft.MainAxisAlignment.END,
        )

        controls = ft.Column(
            controls=[
                ft.Row([left_actions, ft.Container(expand=True), right_actions], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                self._status_text,
                ft.Container(content=self._tasks_table, expand=True),
            ],
            expand=True,
        )
        self._status_text.color = MUTED_COLOR
        self._refresh_tasks()
        return panel(controls)

    def _scan_workspace(self) -> None:
        workspace = self.context.paths.root
        regex_pattern = self.context.config.get_module_config(self.module_id, "supplier_regex")
        try:
            pattern = re.compile(regex_pattern)
        except re.error as exc:
            self._status_text.value = f"匹配正则无效: {exc}"
            self._refresh_view()
            return

        added = 0
        for file_path in workspace.rglob("*"):
            if file_path.is_dir() or "data" in file_path.parts:
                continue
            if file_path.suffix.lower() not in {".pdf", ".xlsx", ".xls", ".docx", ".txt"}:
                continue

            match = pattern.search(file_path.as_posix())
            if not match:
                continue

            supplier_code = match.group(1)
            attachments_json = json.dumps([str(file_path)], ensure_ascii=False)
            existing = self.context.db.query_one(
                "SELECT task_id FROM email_tasks WHERE supplier_code = ? AND attachments = ?",
                (supplier_code, attachments_json),
            )
            if existing:
                continue

            supplier = self.context.db.query_one(
                "SELECT emails FROM suppliers WHERE supplier_code = ? AND is_active = 1",
                (supplier_code,),
            )

            status = "PENDING"
            error_msg = ""
            if not supplier or not supplier["emails"]:
                status = "FAILED"
                error_msg = "未找到邮箱映射"

            self.context.db.execute(
                """
                INSERT INTO email_tasks(project_name, supplier_code, attachments, status, error_msg)
                VALUES(?, ?, ?, ?, ?)
                """,
                (
                    file_path.parent.name,
                    supplier_code,
                    attachments_json,
                    status,
                    error_msg,
                ),
            )
            added += 1

        self._status_text.value = f"扫描完成，新增任务 {added} 条"
        self._refresh_tasks()
        self._refresh_view()

    def _start_sending(self) -> None:
        task_id = self.context.tasks.submit(self.module_id, self._send_pending_tasks)
        self._status_text.value = f"发送任务已启动: {task_id[:8]}"
        self._refresh_tasks()
        self._refresh_view()

    def _send_pending_tasks(self, local_stop_event: threading.Event) -> None:
        limiter = RateLimiter()
        pending_tasks = self.context.db.query_all(
            "SELECT task_id, supplier_code, attachments, retry_count FROM email_tasks WHERE status = 'PENDING'"
        )
        smtp_settings = self.context.config.get_system_config("smtp_settings", {})
        dry_run = smtp_settings.get("dry_run", True)

        smtp_client = None
        try:
            if not dry_run:
                smtp_client = self._build_smtp_client(smtp_settings)

            for row in pending_tasks:
                if self.context.tasks.global_stop_event.is_set() or local_stop_event.is_set():
                    return

                self.context.db.execute(
                    "UPDATE email_tasks SET status = 'SENDING', update_time = CURRENT_TIMESTAMP WHERE task_id = ?",
                    (row["task_id"],),
                )

                try:
                    limiter.before_send()
                    if dry_run:
                        limiter.on_success()
                    else:
                        self._send_single_email(smtp_client, row["supplier_code"], row["attachments"])
                        limiter.on_success()

                    self.context.db.execute(
                        "UPDATE email_tasks SET status = 'SUCCESS', error_msg = '', update_time = CURRENT_TIMESTAMP WHERE task_id = ?",
                        (row["task_id"],),
                    )
                except smtplib.SMTPResponseException as smtp_exc:
                    if smtp_exc.smtp_code == 421:
                        limiter.on_421()
                    else:
                        limiter.on_generic_error()
                    self._mark_failed(row["task_id"], row["retry_count"], str(smtp_exc))
                except Exception as exc:  # noqa: BLE001
                    limiter.on_generic_error()
                    self._mark_failed(row["task_id"], row["retry_count"], str(exc))
        finally:
            if smtp_client:
                smtp_client.quit()

    def _build_smtp_client(self, settings: dict) -> smtplib.SMTP:
        host = settings["host"]
        port = int(settings["port"])
        username = settings["username"]
        encrypted_password = settings["password_encrypted"]
        password = self.context.security.decrypt_text(encrypted_password)

        client = smtplib.SMTP(host, port, timeout=30)
        if settings.get("use_tls", True):
            client.starttls()
        client.login(username, password)
        return client

    def _send_single_email(self, smtp_client: smtplib.SMTP, supplier_code: str, attachments_raw: str) -> None:
        supplier = self.context.db.query_one(
            "SELECT emails FROM suppliers WHERE supplier_code = ?",
            (supplier_code,),
        )
        if not supplier or not supplier["emails"]:
            raise RuntimeError("Supplier email not found")

        settings = self.context.config.get_system_config("smtp_settings", {})
        sender = settings.get("username", "")
        recipients = [email.strip() for email in supplier["emails"].split(";") if email.strip()]

        message = EmailMessage()
        message["Subject"] = "Flint Auto Mail"
        message["From"] = sender
        message["To"] = ",".join(recipients)
        message.set_content("Please check the attachments.")

        for attachment in json.loads(attachments_raw):
            path = Path(attachment)
            if not path.exists():
                continue
            payload = path.read_bytes()
            message.add_attachment(
                payload,
                maintype="application",
                subtype="octet-stream",
                filename=path.name,
            )

        smtp_client.send_message(message)

    def _mark_failed(self, task_id: int, retry_count: int, error_msg: str) -> None:
        new_retry = retry_count + 1
        status = "PENDING" if new_retry < 3 else "FAILED"
        self.context.db.execute(
            """
            UPDATE email_tasks
            SET status = ?, retry_count = ?, error_msg = ?, update_time = CURRENT_TIMESTAMP
            WHERE task_id = ?
            """,
            (status, new_retry, error_msg[:500], task_id),
        )

    def _retry_failed(self) -> None:
        affected = self.context.db.execute(
            "UPDATE email_tasks SET status = 'PENDING', retry_count = 0, error_msg = '' WHERE status = 'FAILED'"
        )
        self._status_text.value = f"已重置失败任务 {affected} 条"
        self._refresh_tasks()
        self._refresh_view()

    def _refresh_tasks(self) -> None:
        status = self._filter_dropdown.value or "ALL"
        sql = "SELECT status, project_name, supplier_code, attachments, error_msg FROM email_tasks"
        params = ()
        if status != "ALL":
            sql += " WHERE status = ?"
            params = (status,)
        sql += " ORDER BY task_id DESC LIMIT 200"

        rows = self.context.db.query_all(sql, params)
        table_rows = [
            ft.DataRow(
                cells=[
                    ft.DataCell(status_chip(row["status"], row["status"] == "SUCCESS")),
                    ft.DataCell(ft.Text(row["project_name"] or "")),
                    ft.DataCell(ft.Text(row["supplier_code"] or "")),
                    ft.DataCell(ft.Text(str(len(json.loads(row["attachments"]))))),
                    ft.DataCell(ft.Text(row["error_msg"] or "")),
                ]
            )
            for row in rows
        ]
        if not table_rows:
            table_rows = [
                ft.DataRow(
                    cells=[
                        ft.DataCell(status_chip("SUCCESS", True)),
                        ft.DataCell(ft.Text("Q2_AP_Review")),
                        ft.DataCell(ft.Text("10243")),
                        ft.DataCell(ft.Text("2")),
                        ft.DataCell(ft.Text("-")),
                    ]
                ),
                ft.DataRow(
                    cells=[
                        ft.DataCell(status_chip("FAILED", False)),
                        ft.DataCell(ft.Text("Q2_AP_Review")),
                        ft.DataCell(ft.Text("10876")),
                        ft.DataCell(ft.Text("3")),
                        ft.DataCell(ft.Text("SMTP 421 限流")),
                    ]
                ),
            ]
        self._tasks_table.rows = table_rows

    def _on_filter_change(self) -> None:
        self._refresh_tasks()
        self._refresh_view()

    def _refresh_view(self) -> None:
        if self._page:
            self._page.update()
