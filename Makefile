.PHONY: olc qa sim

JS := $(wildcard src/*.js server/*.js test/*.js test/*.mjs)

# Hızlı kapı (<30 sn): her JS dosyasının sözdizimi + node:test paketi. Karar satırı çıkış kodundan gelir.
olc:
	set -eo pipefail; for f in $(JS); do node --check $$f; done; node --test test/ 2>&1 | tail -8

# Tam kapı: sözdizimi + tüm testler (TAP, gerçek sayı) + varsa e2e. Tek satır özet basar: "QA: 41/41 test geçti".
qa:
	set -eo pipefail; for f in $(JS); do node --check $$f; done; \
	out=$$(mktemp "$${TMPDIR:-/tmp}/qa.XXXXXX"); trap 'rm -f "$$out"' EXIT; \
	VIEW_FUZZ_GAMES=500 node --test --test-reporter=tap test/ > "$$out" 2>&1 || { grep -E "^(not ok|# (tests|pass|fail))" "$$out" | head -40; echo "QA KIRMIZI"; exit 1; }; \
	tests=$$(sed -n "s/^# tests //p" "$$out"); pass=$$(sed -n "s/^# pass //p" "$$out"); \
	if [ -z "$$tests" ] || [ "$$tests" -eq 0 ] || [ "$$pass" != "$$tests" ]; then echo "QA KIRMIZI: $$pass/$$tests"; exit 1; fi; \
	echo "QA: $$pass/$$tests test geçti"; \
	$(if $(wildcard test/e2e.mjs),$(MAKE) --no-print-directory e2e,:)

# Bot tournament (not part of the gate). Override: make sim SIM_ARGS="--games 3000 --levels medium"
SIM_ARGS ?= --games 2000 --players 4 --levels medium --seed 1
sim:
	set -eo pipefail; node test/sim.mjs $(SIM_ARGS)
