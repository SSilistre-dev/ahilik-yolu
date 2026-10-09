.PHONY: olc qa

# Fast gate (<30s): syntax check every module + rules tests.
olc:
	set -eo pipefail; for f in src/*.js; do node --check $$f; done; node --test test/ 2>&1 | tail -8

# Full gate. No browser e2e yet; UI is checked manually via headless Brave + CDP (see AGENTS.md).
qa: olc
