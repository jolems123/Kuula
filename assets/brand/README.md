# Approved Kuula sources

Canonical sources are `../kuula-logo-dark.png` (primary vertical logo) and
`../kuula-icon-1024.png` (app icon). They are the approved exports from the
repository's `main/assets` directory. Do not regenerate, trace, or recolor them.

`inventory.json` pins both sources by SHA-256. Web, Android and iOS files are
generated derivatives. The previous coin artwork has no remaining runtime refs.

Run `python scripts/rebrand-assets.py` after an approved source update, then run
`npm run check:brand`. Update the pinned hashes only after brand approval.
