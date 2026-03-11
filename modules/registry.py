from __future__ import annotations

from core.app_context import AppContext
from modules.base_module import BaseModule
from modules.email_sender.module import EmailSenderModule
from modules.inbound_planning_review.module import InboundPlanningReviewModule
from modules.supplier_management.module import SupplierManagementModule
from modules.system_settings.module import SystemSettingsModule


def load_modules(context: AppContext) -> list[BaseModule]:
    modules: list[BaseModule] = [
        EmailSenderModule(context),
        InboundPlanningReviewModule(context),
        SupplierManagementModule(context),
        SystemSettingsModule(context),
    ]
    for module in modules:
        module.on_load()
    return modules
