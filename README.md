# Flint

Flint is a modular desktop platform based on Flet + SQLite.

## Current modules

- `email_sender`: Transport agreement outbound center.
- `inbound_planning_review`: Inbound planning review center.
- `supplier_management`: Supplier CRUD and activation management.
- `system_settings`: SMTP/rule/signature settings center.

## Quick start

1. Create a Python 3.10+ environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Run app:
   - `python main.py`

## Runtime data

Flint creates runtime files under `data/`:

- `data/platform_core.db`
- `data/logs/system.log`
- `data/secret.key`

## Packaging

Use Flet/PyInstaller for executable packaging (to be finalized in later iteration).
