#!/usr/bin/env python3
"""`codex exec`'i stdin kapatılmadan çalıştıran Bash komutlarını reddeder.

Gerekçe (insaatHesabi): `codex exec` stdin açıksa "Reading additional input from
stdin..." deyip sessizce asılır. 2026-10-01'de 4 paralel ajan 20-26 dk asıldı,
kural AGENTS.md'ye yazıldı; 2026-10-02'de ana oturum aynı hatayı yaptı ve review
30 dk zaman aşımına düştü. Prose iki kez yetmedi, mekanik kapı.

Ana oturum ve alt ajan için geçerlidir. `< /dev/null`, `</dev/null` ya da
`echo ... | codex exec` biçimi geçer.
"""
import json
import re
import sys

# Ters tırnak komut başı sayılmaz: PR/commit metnindeki `codex exec` yazısı yanlış alarm veriyordu.
CODEX = re.compile(r"(?:^|[;&|(]|\$\()\s*codex\s+exec\b", re.MULTILINE)
STDIN_KAPALI = re.compile(r"<\s*/dev/null|\|\s*codex\s+exec\b")

try:
    girdi = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if girdi.get("tool_name") != "Bash":
    sys.exit(0)

komut = (girdi.get("tool_input") or {}).get("command", "")
if not CODEX.search(komut) or STDIN_KAPALI.search(komut):
    sys.exit(0)

print(
    "codex-stdin-kapisi: `codex exec` stdin açıkken sessizce asılır.\n"
    "Komutun sonuna `< /dev/null` ekle (ör. `codex exec review --base main < /dev/null`).",
    file=sys.stderr,
)
sys.exit(2)
