from __future__ import annotations

from abc import ABC, abstractmethod

import flet as ft

from core.app_context import AppContext


class BaseModule(ABC):
    module_id: str

    def __init__(self, context: AppContext) -> None:
        self.context = context

    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    def get_icon(self) -> ft.Icons:
        pass

    @abstractmethod
    def build_ui(self, page: ft.Page) -> ft.Control:
        pass

    def on_load(self) -> None:
        """Optional lifecycle hook for startup initialization."""

    def on_shutdown(self) -> None:
        """Optional lifecycle hook for graceful shutdown."""
