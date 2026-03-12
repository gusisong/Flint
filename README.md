# Flint

Flint is currently in a gradual migration phase from Python + Flet to Electron + Vue.

## Demo references

- Legacy single-file UI baseline: `ui/frontend_demo.html`
- Modular UI demo baseline: `ui/demo_modular/index.html`

The modular demo is the preferred reference for future formal development architecture.

## Migration status

- Current stable runtime: Python + Flet (legacy implementation).
- New formal-development skeleton: `electron_app/` (Electron + Vue).
- Migration strategy: gradual replacement module by module.

## Latest progress (2026-03-12)

- Demo split is completed: `ui/demo_modular/` now contains pages/styles/scripts modular structure.
- Electron skeleton is created in `electron_app/` with main/preload/renderer page shells.
- Inbound (module 1) and Mail (module 2) have interactive renderer-side migration prototypes.
- Mail migration behavior for this wave:
   - Send simulation uses random success/failure.
   - Delete action removes selected rows only.
- Local smoke test result:
   - `npm install` succeeded in `electron_app/`.
   - `npm run dev` started Vite + Electron successfully.

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

## Electron skeleton quick start

1. Enter `electron_app/`.
2. Install dependencies:
   - `npm install`
3. Start development mode:
   - `npm run dev`

## Cross-PC handoff quick start

1. Clone repository and checkout `main`.
2. Install Node.js LTS (recommended via `winget install OpenJS.NodeJS.LTS -e`).
3. Open project root `Flint/` and then enter `electron_app/`.
4. Run:
   - `npm install`
   - `npm run dev`
5. Continue migration in priority order:
   - Mail IPC bridge (`main/preload/renderer`)
   - Supplier page migration

## Runtime data

Flint creates runtime files under `data/`:

- `data/platform_core.db`
- `data/logs/system.log`
- `data/secret.key`

## Packaging

Use Flet/PyInstaller for executable packaging (to be finalized in later iteration).
