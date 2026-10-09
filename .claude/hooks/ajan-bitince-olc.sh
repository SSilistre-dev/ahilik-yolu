#!/usr/bin/env bash
# Alt ajan bitince ucuz ölçüm basar; ajanın iddiası yerine gerçek sayı görünür.
# Gerekçe (2026-09-06, insaatHesabi): 7 ajan ölçülebilir iddiayı ölçmeden raporladı, 7'si de yanlıştı.
# Engellemez, yalnız basar. Ağır test burada koşmaz; o ana oturumun bitirme kapısı.
# Projeye özel hızlı ölçüm için Makefile'a `olc` hedefi ekle (≤30 sn: kural sayacı, php -l, tsc --noEmit vb.).
cat >/dev/null
cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0
out="değişen dosya: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
if grep -qE '^olc:' Makefile 2>/dev/null; then
  out="$out | olc: $(make -s olc 2>&1 | tail -3 | tr '\n' ' ')"
fi
echo "[ajan-bitti ölçümü] $out"
exit 0
