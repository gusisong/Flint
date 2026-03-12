# demo_modular

This directory contains the modularized demo split from ui/frontend_demo.html.

## Structure

- index.html: App shell, navigation, shared modals/toast.
- pages/: Page fragments by module.
- styles/main.css: Shared visual system and component styles.
- scripts/core/: Common UI behavior and shared helpers.
- scripts/modules/: Business module logic (inbound/mail/supplier/table).
- scripts/app.js: Bootstrap and page assembly.

## Open

Open index.html in a browser with local file support for ES modules and page fetch, or use a static server.
