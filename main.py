from __future__ import annotations

import logging
import traceback
from pathlib import Path

import flet as ft

from core.components.ui_theme import (
    BG_COLOR,
    BRAND_COLOR,
    INK_COLOR,
    LINE_COLOR,
    apply_page_theme,
    panel,
)
from core.app_context import build_app_context
from modules.registry import load_modules


def _record_startup_failure(exc: Exception) -> None:
    logs_dir = Path(__file__).resolve().parent / "data" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    error_file = logs_dir / "startup_error.log"
    details = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    error_file.write_text(details, encoding="utf-8")


def _show_startup_error(page: ft.Page, exc: Exception) -> None:
    message = f"应用初始化失败: {exc}"
    dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("启动失败"),
        content=ft.Text(f"{message}\n详细日志已写入 data/logs/startup_error.log"),
        actions=[ft.TextButton("关闭", on_click=lambda _: page.window.destroy())],
        actions_alignment=ft.MainAxisAlignment.END,
    )
    page.open(dialog)


def main(page: ft.Page) -> None:
    page.title = "Flint"
    page.window_min_width = 1100
    page.window_min_height = 760
    apply_page_theme(page)

    icon_file = Path(__file__).resolve().parent / "assets" / "Flint_Icon.png"
    if icon_file.exists() and hasattr(page.window, "icon"):
        page.window.icon = str(icon_file)

    try:
        context = build_app_context()
        modules = load_modules(context)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("flint").exception("App startup failed")
        _record_startup_failure(exc)
        _show_startup_error(page, exc)
        return

    selected_index = 0
    content_container = ft.Container(expand=True, animate_opacity=300)

    nav_items: list[tuple[ft.Container, ft.Icon, ft.Text]] = []

    def update_nav_styles() -> None:
        for idx, (container, icon, text) in enumerate(nav_items):
            is_active = idx == selected_index
            container.gradient = ft.LinearGradient(
                colors=["#0c8f78", "#0da387"],
                begin=ft.Alignment(-1, -1),
                end=ft.Alignment(1, 1),
            ) if is_active else None
            container.bgcolor = "#ffffff" if not is_active else None
            container.border = ft.Border.all(1, "transparent" if is_active else LINE_COLOR)
            container.offset = ft.Offset(0.025, 0) if is_active else ft.Offset(0, 0)
            container.shadow = [
                ft.BoxShadow(
                    blur_radius=24,
                    color=ft.Colors.with_opacity(0.25, "#0c8f78"),
                    offset=ft.Offset(0, 8),
                )
            ] if is_active else []
            icon.color = "#ffffff" if is_active else INK_COLOR
            text.color = "#ffffff" if is_active else INK_COLOR

    outlined_icons = {
        "email_sender": ft.Icons.LOCAL_SHIPPING_OUTLINED,
        "inbound_planning_review": ft.Icons.FACT_CHECK_OUTLINED,
        "supplier_management": ft.Icons.BADGE_OUTLINED,
        "system_settings": ft.Icons.SETTINGS_OUTLINED,
    }

    def build_nav_item(index: int, module_name: str, module_icon: ft.Icons, module_id: str) -> ft.Container:
        icon = ft.Icon(outlined_icons.get(module_id, module_icon), size=18, color=INK_COLOR)
        label = ft.Text(module_name, size=14, color=INK_COLOR)
        item = ft.Container(
            content=ft.Row([icon, label], spacing=10),
            padding=ft.Padding.symmetric(horizontal=14, vertical=12),
            border=ft.Border.all(1, LINE_COLOR),
            border_radius=14,
            bgcolor="#ffffff",
            animate=ft.Animation(200, ft.AnimationCurve.EASE_OUT),
            animate_offset=ft.Animation(200, ft.AnimationCurve.EASE_OUT),
            offset=ft.Offset(0, 0),
            ink=True,
            on_click=lambda _: switch_module(index),
        )
        nav_items.append((item, icon, label))
        return item

    nav_menu = ft.Column(
        controls=[build_nav_item(i, module.get_name(), module.get_icon(), module.module_id) for i, module in enumerate(modules)],
        spacing=10,
        scroll=ft.ScrollMode.AUTO,
    )

    sidebar = ft.Container(
        width=260,
        padding=ft.Padding.symmetric(horizontal=16, vertical=22),
        border=ft.Border.only(right=ft.BorderSide(1, LINE_COLOR)),
        gradient=ft.LinearGradient(
            colors=["#ffffff", "#f2f8f6"],
            begin=ft.Alignment(0, -1),
            end=ft.Alignment(0, 1),
        ),
        content=ft.Column(
            controls=[
                ft.Row(
                    controls=[
                        ft.Image(src=str(icon_file), width=30, height=30)
                        if icon_file.exists()
                        else ft.Icon(ft.Icons.APPS, size=22, color=BRAND_COLOR),
                        ft.Text("Flint", size=30, weight=ft.FontWeight.W_700, color=INK_COLOR),
                    ],
                    spacing=10,
                ),
                nav_menu,
            ],
            spacing=18,
            expand=True,
        ),
    )

    def switch_module(index: int) -> None:
        nonlocal selected_index
        selected_index = index
        update_nav_styles()
        content_container.opacity = 0
        page.update()
        content_container.content = modules[index].build_ui(page)
        content_container.opacity = 1
        page.update()

    def on_window_event(event: ft.WindowEvent) -> None:
        if event.data == "close":
            context.tasks.cancel_all()
            context.tasks.wait_for_all()
            for module in modules:
                module.on_shutdown()
            context.db.close()
            page.window.destroy()

    page.on_window_event = on_window_event

    switch_module(selected_index)

    page.add(
        ft.Stack(
            controls=[
                ft.Container(expand=True, bgcolor=BG_COLOR),
                ft.Container(
                    width=720,
                    height=460,
                    left=-160,
                    top=-220,
                    gradient=ft.RadialGradient(
                        colors=[ft.Colors.with_opacity(0.15, "#0c8f78"), ft.Colors.TRANSPARENT],
                        center=ft.Alignment(-0.8, -0.9),
                        radius=1.0,
                    ),
                ),
                ft.Container(
                    width=620,
                    height=420,
                    right=-120,
                    top=-20,
                    gradient=ft.RadialGradient(
                        colors=[ft.Colors.with_opacity(0.16, "#2e7eeb"), ft.Colors.TRANSPARENT],
                        center=ft.Alignment(0.9, -0.2),
                        radius=1.0,
                    ),
                ),
                ft.Container(
                    padding=20,
                    content=ft.Row(
                        controls=[sidebar, panel(content_container)],
                        expand=True,
                    ),
                    expand=True,
                ),
            ],
            expand=True,
        )
    )


if __name__ == "__main__":
    try:
        ft.run(main, assets_dir="assets")
    except AttributeError:
        ft.app(target=main, assets_dir="assets")
