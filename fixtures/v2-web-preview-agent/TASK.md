# v2 web preview agent fixture

Minimal workspace for validating web creation + preview harness tools.

## Task

Create a minimal web page with:

- `index.html`
- `style.css`
- `script.js`

Then verify the files exist on disk, start a local preview server, and return the localhost URL.

Do not claim success until `verify_files_exist` and `start_preview_server` confirm it.
