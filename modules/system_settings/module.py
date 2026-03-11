from __future__ import annotations

import flet as ft

from core.components.ui_theme import BUTTON_HEIGHT, BUTTON_WIDTH, LINE_COLOR, MUTED_COLOR, normal_button_style, panel
from modules.base_module import BaseModule


class SystemSettingsModule(BaseModule):
    module_id = "system_settings"

    def __init__(self, context) -> None:
        super().__init__(context)
        self._page: ft.Page | None = None
        self._status_text = ft.Text("就绪")

        self._smtp_host = ft.TextField(label="SMTP Host")
        self._smtp_port = ft.TextField(label="SMTP Port")
        self._smtp_tls = ft.Checkbox(label="启用 TLS", value=True)
        self._smtp_user = ft.TextField(label="SMTP 用户名")
        self._smtp_password = ft.TextField(label="SMTP 密码（留空表示不修改）", password=True, can_reveal_password=True)
        self._smtp_dry_run = ft.Checkbox(label="Dry Run", value=True)

        self._regex_field = ft.TextField(label="附件匹配正则")
        self._signature_field = ft.TextField(label="签名文本", multiline=True, min_lines=3, max_lines=6)

    def get_name(self) -> str:
        return "系统设置"

    def get_icon(self) -> ft.Icons:
        return ft.Icons.SETTINGS

    def _button_style(self) -> ft.ButtonStyle:
        return normal_button_style()

    def build_ui(self, page: ft.Page) -> ft.Control:
        self._page = page
        self._load_settings(refresh_view=False)

        left_actions = ft.Row(
            controls=[
                ft.Button("读取配置", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._button_style(), on_click=lambda _: self._load_settings()),
            ],
            wrap=True,
        )
        right_actions = ft.Row(
            controls=[
                ft.Button("保存配置", width=BUTTON_WIDTH, height=BUTTON_HEIGHT, style=self._button_style(), on_click=lambda _: self._save_settings()),
            ],
            alignment=ft.MainAxisAlignment.END,
        )

        self._status_text.color = MUTED_COLOR
        return panel(
            ft.Column(
                controls=[
                    ft.Row([left_actions, ft.Container(expand=True), right_actions], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    self._status_text,
                    ft.Text("SMTP 设置", weight=ft.FontWeight.W_600),
                    ft.ResponsiveRow(
                        controls=[
                            ft.Container(self._smtp_host, col={"sm": 12, "md": 6}),
                            ft.Container(self._smtp_port, col={"sm": 12, "md": 3}),
                            ft.Container(self._smtp_tls, col={"sm": 12, "md": 3}),
                            ft.Container(self._smtp_user, col={"sm": 12, "md": 6}),
                            ft.Container(self._smtp_password, col={"sm": 12, "md": 6}),
                            ft.Container(self._smtp_dry_run, col={"sm": 12, "md": 4}),
                        ]
                    ),
                    ft.Divider(color=LINE_COLOR),
                    ft.Text("规则与签名", weight=ft.FontWeight.W_600),
                    self._regex_field,
                    self._signature_field,
                ],
                expand=True,
                scroll=ft.ScrollMode.AUTO,
            )
        )

    def _load_settings(self, refresh_view: bool = True) -> None:
        smtp_settings = self.context.config.get_system_config(
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

        self._smtp_host.value = str(smtp_settings.get("host", ""))
        self._smtp_port.value = str(smtp_settings.get("port", 587))
        self._smtp_tls.value = bool(smtp_settings.get("use_tls", True))
        self._smtp_user.value = str(smtp_settings.get("username", ""))
        self._smtp_password.value = ""
        self._smtp_dry_run.value = bool(smtp_settings.get("dry_run", True))

        self._regex_field.value = str(
            self.context.config.get_module_config("email_sender", "supplier_regex", r"_(\d{5})_[^/]+$")
        )
        self._signature_field.value = str(self.context.config.get_system_config("signature_text", ""))
        self._status_text.value = "配置已加载"
        if refresh_view:
            self._safe_update()

    def _save_settings(self) -> None:
        current = self.context.config.get_system_config("smtp_settings", {})
        encrypted_password = current.get("password_encrypted", "")

        new_password = self._smtp_password.value.strip()
        if new_password:
            encrypted_password = self.context.security.encrypt_text(new_password)

        try:
            port = int(self._smtp_port.value.strip())
        except ValueError:
            self._status_text.value = "保存失败：SMTP Port 必须为数字"
            self._safe_update()
            return

        smtp_settings = {
            "host": self._smtp_host.value.strip(),
            "port": port,
            "use_tls": bool(self._smtp_tls.value),
            "username": self._smtp_user.value.strip(),
            "password_encrypted": encrypted_password,
            "dry_run": bool(self._smtp_dry_run.value),
        }

        self.context.config.set_system_config("smtp_settings", smtp_settings)
        self.context.config.set_module_config("email_sender", "supplier_regex", self._regex_field.value.strip())
        self.context.config.set_system_config("signature_text", self._signature_field.value)
        self._status_text.value = "配置已保存"
        self._safe_update()

    def _safe_update(self) -> None:
        if self._page:
            self._page.update()
