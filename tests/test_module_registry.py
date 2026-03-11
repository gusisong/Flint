from __future__ import annotations

from unittest import TestCase

from modules.registry import load_modules


class FakeConfig:
    def __init__(self) -> None:
        self.system: dict[str, object] = {}
        self.module: dict[tuple[str, str], object] = {}

    def get_system_config(self, key: str, default=None):
        return self.system.get(key, default)

    def set_system_config(self, key: str, value) -> None:
        self.system[key] = value

    def get_module_config(self, module_id: str, key: str, default=None):
        return self.module.get((module_id, key), default)

    def set_module_config(self, module_id: str, key: str, value) -> None:
        self.module[(module_id, key)] = value


class DummyContext:
    def __init__(self) -> None:
        self.config = FakeConfig()


class TestModuleRegistry(TestCase):
    def test_load_modules_registers_four_pages(self) -> None:
        context = DummyContext()
        modules = load_modules(context)

        names = [module.get_name() for module in modules]

        self.assertEqual(len(modules), 4)
        self.assertEqual(
            names,
            ["运输协议外发", "Inbound规划审查", "供应商管理", "系统设置"],
        )

    def test_load_modules_initializes_default_configs(self) -> None:
        context = DummyContext()
        load_modules(context)

        self.assertIn("smtp_settings", context.config.system)
        self.assertIn(("email_sender", "supplier_regex"), context.config.module)
        self.assertIn(("inbound_planning_review", "rules"), context.config.module)
