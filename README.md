# Flint

Flint is now delivered as an Electron + Vue desktop application.

## Current status

- Runtime stack: Electron + Vue 3 + Vite.
- Old Python runtime has been removed from this repository.
- Core modules are available in Electron renderer + main-process IPC:
  - Inbound planning review
  - Transport agreement outbound (Mail)
  - Supplier management
  - System settings

## Project structure

- Main app: `electron_app/`
- Design baseline demo (kept for UI reference):
  - `ui/frontend_demo.html`
  - `ui/demo_modular/`

## Local development quick start

1. Install Node.js LTS.
2. Open terminal and enter `electron_app/`.
3. Install dependencies:
   - `npm install`
4. Start dev mode:
   - `npm run dev`

If PowerShell policy blocks `npm.ps1`, use:

- `npm.cmd install`
- `npm.cmd run dev`

## Validation commands

- Run tests: `npm test`
- Build renderer: `npm run build:renderer`

## Runtime data

During development/runtime, app data is stored under Electron userData `data/` folder:

- `mail_tasks.json`
- `inbound_uploads.json`
- `inbound_last_review.json`
- `suppliers.json`
- `settings.json`
- `logs/`

## Notes

- Repository may be ahead of remote when network is unstable; this does not affect local development.
- Use `ui/` demos as visual/interaction references only, not runtime entry points.
