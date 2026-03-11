from __future__ import annotations

import flet as ft

BG_COLOR = "#f6f7f3"
INK_COLOR = "#0f1720"
MUTED_COLOR = "#5c6670"
CARD_COLOR = "#ffffff"
LINE_COLOR = "#d9e0d8"
BRAND_COLOR = "#0c8f78"
START_COLOR = "#b9dcff"
START_TEXT_COLOR = "#12315f"
OK_COLOR = "#1d8f52"
BAD_COLOR = "#bf3b3b"
BUTTON_WIDTH = 132
BUTTON_HEIGHT = 40


def apply_page_theme(page: ft.Page) -> None:
    page.bgcolor = BG_COLOR
    page.padding = 0
    page.theme = ft.Theme(font_family="Noto Sans SC")


def normal_button_style() -> ft.ButtonStyle:
    return ft.ButtonStyle(
        bgcolor="#e7ece8",
        color="#16212b",
        side=ft.BorderSide(1, LINE_COLOR),
        shape=ft.RoundedRectangleBorder(radius=10),
        padding=ft.Padding.symmetric(horizontal=14, vertical=10),
    )


def start_button_style() -> ft.ButtonStyle:
    return ft.ButtonStyle(
        bgcolor=START_COLOR,
        color=START_TEXT_COLOR,
        shape=ft.RoundedRectangleBorder(radius=10),
        padding=ft.Padding.symmetric(horizontal=14, vertical=10),
    )


def panel(content: ft.Control, expand: bool = True) -> ft.Container:
    return ft.Container(
        content=content,
        bgcolor=CARD_COLOR,
        border=ft.Border.all(1, LINE_COLOR),
        border_radius=16,
        padding=16,
        shadow=ft.BoxShadow(blur_radius=20, color=ft.Colors.with_opacity(0.04, "#000000"), offset=ft.Offset(0, 8)),
        expand=expand,
    )


def table_style() -> dict:
    return {
        "column_spacing": 18,
        "divider_thickness": 1,
        "horizontal_lines": ft.BorderSide(1, "#edf1ed"),
        "heading_row_height": 44,
        "data_row_min_height": 42,
        "data_row_max_height": 54,
        "heading_text_style": ft.TextStyle(size=13, weight=ft.FontWeight.W_600),
    }


def status_chip(text: str, is_ok: bool) -> ft.Container:
    fg = OK_COLOR if is_ok else BAD_COLOR
    bg = "#e6f4ec" if is_ok else "#fae8e8"
    return ft.Container(
        content=ft.Text(text, color=fg, size=12, weight=ft.FontWeight.W_600),
        bgcolor=bg,
        border_radius=999,
        padding=ft.Padding.symmetric(horizontal=10, vertical=4),
    )
