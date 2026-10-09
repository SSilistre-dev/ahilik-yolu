#!/usr/bin/env python3
"""Alt ajanların git yazma komutlarını reddeder. Ana oturum serbesttir.

Gerekçe (2026-09-06, insaatHesabi): paylaşılan ağaçta paralel ajanlardan biri
`git stash`, biri `git reset --hard`, biri `git clean` koştu; üç turda işler
sessizce silindi. Prose yasak üç kez ihlal edildi, mekanik kapı koyunca durdu.

Hook girdisindeki `agent_id` yalnız alt ajan içinden gelen çağrıda bulunur
(Claude Code 2.1.x hook şeması), bu yüzden ana oturumun commit/merge'ü engellenmez.
"""
import json
import re
import sys

YASAK = re.compile(
    r"(?:^|[;&|]|\$\(|`)\s*git\b(?:\s+-(?:[Cc]\s+\S+|\S+))*\s+"
    r"(reset|checkout|switch|restore|stash|clean|revert|rebase|commit|merge|push|am|cherry-pick|add)\b",
    re.MULTILINE,
)

try:
    girdi = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if not girdi.get("agent_id") or girdi.get("tool_name") != "Bash":
    sys.exit(0)

komut = (girdi.get("tool_input") or {}).get("command", "")
eslesme = YASAK.search(komut)
if not eslesme:
    sys.exit(0)

print(
    f"git-kapisi: `git {eslesme.group(1)}` alt ajanlara kapalı. Commit/birleştirme ana oturumun işi.\n"
    "Okuma serbest: status, diff, log, show, blame. Dosyayı kenara koyman gerekiyorsa /tmp'ye kopyala.\n"
    "Değişikliğini olduğu gibi bırak ve raporla.",
    file=sys.stderr,
)
sys.exit(2)
