@AGENTS.md

# Claude Code'a özel

## Orkestrasyon araçları
- Bağımsız 2+ iş: tek mesajda paralel `Agent` çağrısı. Büyük/çok fazlı iş: `Workflow` (pipeline: uygula → doğrula).
- Kod yazan ajan: `uygulayici` (`.claude/agents/uygulayici.md`), `isolation: "worktree"`.
  Not: worktree ajanı `origin/main`'den dallanır. Push edilmemiş iş tabansa önce kendin
  `git worktree add .wt/<is> -b <is>` aç (`.wt/` → `$(git rev-parse --git-common-dir)/info/exclude`) ve ajana o yolu ver.
  Sandbox yalnız proje dizinine yazdırır: `../` yolu ve docker soketi sandbox dışı ister; ajan brief'ine yaz. Merge sonrası `.wt/` kaldırılır (eslint/qa kopyalarına girmesin).
- Doğrulayan ajan: `dogrulayici` — taze context, yalnız okur ve koşar, düzeltmez.
- Oturum proje kökü dışında başladıysa bu ajan tipleri yüklenmez ("Agent type not found"): `general-purpose` + ilgili `.claude/agents/*.md` metnini prompt başına kopyala.
- Kod arama/haritalama: `Explore`. Ana context'e dosya dökümü getirme, sonuç getir.
- Brief şablonu: `.claude/BRIEF.md`. Her brief kendi başına anlaşılır olmalı; alt ajan bu konuşmayı görmez.

## Bütçe
- Basit bulma: 1 ajan. Karşılaştırma/çok modüllü iş: 2–5 paralel ajan. Daha fazlası Workflow.
- Alt ajan modeli: kod yazan `sonnet`, arama `haiku`. Mimari karar ve son review ana oturumda.

## Mekanik kapılar (prose yetmedi, hook'a taşındı)
- `.claude/hooks/git-kapisi.py`: alt ajanın git yazmasını engeller (`agent_id` varsa).
- `.claude/hooks/ajan-bitince-olc.sh`: her alt ajan bitince değişen dosya sayısını ve `make olc` çıktısını basar.
  Ajan ne derse desin gerçek sayı oradadır.

## Context
- Uzun oturumda karar ve dersleri `AGENTS.md` → "Tekrar eden hatalar" bölümüne ya da vault'a yaz.
- Kullanıcı bir düzeltme yaptıysa ve kalıcıysa aynı turda kurala çevir.
