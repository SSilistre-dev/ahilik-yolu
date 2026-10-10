.PHONY: olc qa sim

# Fast gate (<30s): syntax check every module + rules tests.
olc:
	set -eo pipefail; for f in src/*.js; do node --check $$f; done; node --test test/ 2>&1 | tail -8

# Full gate. No browser e2e yet; UI is checked manually via headless Brave + CDP (see AGENTS.md).
qa: olc

# Bot tournament (not part of the gate). Override: make sim SIM_ARGS="--games 3008 --levels medium"
SIM_ARGS ?= --games 2000 --players 4 --levels medium --seed 1
sim:
	set -eo pipefail; node test/sim.mjs $(SIM_ARGS)
