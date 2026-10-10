# AGENTS.md

Tek kural kaynağı. Tüm kodlama ajanları ve alt ajanlar bunu okur.
Kısa tut (≤200 satır). Kod okunarak bulunabilen bilgiyi buraya yazma.
Her kural: kural + tarihli gerekçe. Gerekçesiz kural silinir.

## Proje
- Amaç: İGİAD'ın "Ahilik Yolu" kutu oyununun mobil + masaüstü tarayıcıda oynanan Three.js demosu (1 insan + botlar).
- Stack: build'siz statik ES modules, three.js 0.160.0 importmap (jsDelivr), testler `node:test`. npm/paket yok.
- Canlı: TODO: henüz yok (GitHub Pages adayı) · repo: github.com/SSilistre-dev/ahilik-yolu
- Bu projeye YABANCI, önerme: bundler (Vite/webpack), npm bağımlılığı, framework (React vb.), OrbitControls.
- Kurallar ve dondurulmuş sözleşme: `SPEC.md`. Sözleşmeyi değiştiren iş önce SPEC'i günceller. Mimari: `docs/ARCHITECTURE.md`.
- Künye: proje **ssilistre.dev** tarafından geliştirilir (README, oyun içi Hakkında, `<meta name="author">`).
  Repoda, commit mesajında ve PR metninde hiçbir yapay zekâ aracının adı, imzası ya da ortak yazar (co-author) satırı geçmez (kullanıcı kararı, 2026-10-10). `test/brand.test.js` zorlar.
  Ajan araç dosyaları yereldir, repoya girmez (`.git/info/exclude`).

## Komutlar (Docker yok; bağımlılık da yok, host'a paket kurma)
- Ayağa kaldır: `python3 -m http.server 8000` (proje kökünden)
- Hızlı ölçüm: `make olc` · Tam kapı (bitti demeden önce): `make qa` → 0 fail
- Tek test: `node --test --test-name-pattern "<ad>" test/`
- UI kontrolü: headless Brave + CDP ile ekran görüntüsü (`--headless=new --remote-debugging-port=<port> --use-angle=swiftshader --enable-unsafe-swiftshader`); `--screenshot` bayrağı takılıyor, CDP `Page.captureScreenshot` kullan. Görüntüler bakılınca silinir.
- Sürüm çıkarken `index.html` importmap'teki `?v=` değerini artır (tarayıcı önbelleği).

## Roller
Bu oturumda alt ajan olarak bir görev metniyle çağrıldıysan "Alt ajan" bölümü bağlayıcıdır.
Kullanıcıyla konuşan ana oturumsan "Ana oturum" bölümü bağlayıcıdır.
Orkestratörün açtığı ayrı bir thread/oturumda (bb, kendi worktree + dal) tek görev yürütüyorsan "görev thread'i"sin:
kendi dalında commit, push, PR serbest ve zorunlu; merge yasak; "Alt ajan" 3–6 geçerli; görevi bütünüyle bitir.

### Alt ajan
<important>
1. Yalnız görev metninde sayılı dosyalara dokun. Dışına çıkman gerekiyorsa DUR, raporla.
2. git yazma yok: commit, checkout, switch, restore, stash, reset, clean, rebase, add -A.
   Okuma serbest: status, diff, log, show, blame. (Hook ile zorlanır.)
3. Alt ajan açma.
4. Paylaşılan kaynağa dokunma: `docker compose up/down/-p/-v`, ortak DB migration/seed,
   ortak `vendor/` veya `node_modules` yeniden kurulumu. Görev sana ayrı DB/port verdiyse onu kullan.
   `docker kill/stop/rm` yalnız kendi `--name` verdiğin konteynere; toplu `docker ps -q | xargs …` yasak.
5. Çalıştırmadığın hiçbir şey için "doğruladım/geçti" yazma. Sayıyı ölçmeden yazma.
6. Belirsizlikte makul varsayımı seç, raporda yaz. Bariz bug'ı "kullanıcı kararı" diye bırakma, düzelt.
</important>

Rapor biçimi (başka biçim yok):
```
DURUM: tamam | kısmi | bloke
DEĞİŞEN: dosya:satır — ne, neden (her dosya bir satır)
KOŞTUĞUM: <komut> → <çıktının karar satırı, ör. "Tests: 50, Failures: 0">
KOŞMADIĞIM: <neyi, neden>
VARSAYIM / RİSK: <kısa>
ANA OTURUMA İSTEK: <kapsam dışı gereken değişiklik varsa>
```

### Ana oturum (orkestratör)
- Üretim kodunu kendin yazma. İşi böl, brief yaz, alt ajana/Workflow'a ver, ölç, birleştir.
  İstisna: 1–2 satırlık mekanik düzeltme.
- Alt ajan raporu bulgu değildir. Testi, grep'i, sayıyı kendin koş.
  (Gerekçe: alt ajanlar bu projelerde ≥9 kez yanlış başarı raporladı.)
- Paralel işte dosya kümesi kesişmemesi yetmez. Docker stack, port, DB, tarayıcı oturumu, geçici dosya adı da bölünür (sandbox'sız `$TMPDIR` thread'ler arasında ortak; betik adı işe özgü olur). Paralel tam test koşuları `mkdir ~/.cache/<proje>-qa.lock` kilidiyle sıralanır (eşzamanlı koşular colima VM'ini düşürdü).
- Oturumu proje kökünde başlat: başka dizinden açılınca projenin hook'ları (git kapısı) ve ajan tanımları yüklenmez.
  Paralel alt ajanlar test koşarken tam kapı koşma (VM OOM, süre eşikli testler düşer); kapı hepsi bitince, birleşik dalda bir kez.
- Silme (`rm -rf`, `find ... -exec rm`) yalnız mutlak yol değişkeniyle ve `cd "$D" || exit 1` korumasıyla; sandbox açık/kapalı kabukta `$TMPDIR` farklıdır, göreli silme proje kökünü boşaltabilir.
- Yeni klasöre yazmadan önce `git -C <hedef> log`/`status` bak; yabancı commit varsa dur (aynı prompt iki oturuma gidip aynı klasöre yazabiliyor).
- Taşıma/yeniden yazımda eski uygulamayı referans konteyner olarak kaldır; aynı tohum veriyle aynı istekleri ikisine at, durum/yönlendirme/gövde farkını ölç.
  İki ajanın da kullandığı ortak modül (sabitler/helper) önce tek commit'te yazılır; worktree'ler o commit'ten açılır.
- Her iş ayrı branch + worktree. Akış: worktree → alt ajan → ölçüm → review → commit → PR → merge main → deploy → canlı doğrulama.
- Commit, push, PR, merge, deploy, ikinci model review'ı ana oturumun işidir.
- Eski branch'e main birleştirilince yalnız çakışan dosyaları değil, tüm `git diff main` kümesini lint/test et (tam kapı); otomatik birleşen dosyada anlamsal çakışma kalır.
- Release/paket öncesi `git pull`. Deploy sonrası gerçek domain'de doğrula; `/health` 200 görmeden bitti deme.
- Bir davranış tek örnekle anlatıldıysa kuralı aynı türdeki TÜM öğelere uygula.
- Bariz mantık hatasını (ör. iptal edilmiş kayıt "yaklaşan" listesinde) karar diye sorma, düzelt.

## Doğrulama ("bitti" tanımı)
- Kapı betiği (`olc`/`qa` ya da yardımcı) çıktıyı `| tail`/`| grep` ile kısıyorsa tarif `set -eo pipefail;` ile başlar (Makefile `.SHELLFLAGS` macOS make 3.81'de yok sayılır); karar satırı çıkış kodundan türer. Kapıyı bir kez bilerek kırmızıya düşürüp dene.
- Tam kapı 0 fail; gerçek sayıyı yaz (`212/212`).
- UI değişikliği: Brave'de tek sekmede ekran görüntüsü al, kendin bak, sonra sil.
- Mantık değişikliği en az bir test bırakır. Test önce kırmızı görülür.
- Testte süre sınırı yerine sorgu/adım sayısı ölçülür; paralel kapı koşuları süreyi 5–10× uzatır. Süre şartsa normalin ≥10 katı.
- Kabul/önizleme test hesabı uygulamanın kendi kayıt yolu ya da seeder'ıyla açılır; DB'ye elle yazılan hesapta rol/varsayılan eksik kalır, sahte 403 görülür.
- Dış servis imza/biçim kuralı (ödeme callback'i, webhook HMAC) resmi SDK kaynağından okunur, belgeden tahmin edilmez; test literal imza dizesiyle sabitlenir (uygulamayı aynalayan test yanlışı kilitler).
- İkinci model review: `codex exec review` (kota yoksa `opencode run -m deepseek/deepseek-v4-pro`). Diff tabanı `git merge-base origin/main HEAD`; düz `git diff main` eski dalda başka PR'ın kodunu "silindi" gösterir.
  `codex exec` stdin'i `< /dev/null` ister (hook: `codex-stdin-kapisi.py`).
  Review bulgusunu kodda doğrula; yanlış pozitifi düzeltme.

## Kod kuralları
- Mevcut helper/pattern/bağımlılığı kullan. Yeni bağımlılık = raporda gerekçe.
- KISS. Tek implementasyonlu interface, fabrika, "ileride lazım" kodu yok.
- Bug'da kök neden: paylaşılan fonksiyonun tüm çağıranlarını grep'le.
- Güven sınırında doğrulama, yetki, CSRF, prepared statement, XSS escape atlanmaz. OWASP Top 10.
- `src/game.js` saf kalır (DOM/three yok, `apply` girdiyi değiştirmez). Scene yalnız state okur.
- Engine `legalActions` aynı türden kartları tekilleştirir; UI kartı id ile değil tür (`kind`) ile eşler.


## Gizli bilgi
- Anahtarlar macOS Keychain'de: `security find-generic-password -s <servis> -w`. Kullanıcıya sormadan önce
  Keychain'e VE proje dizinine (FTP/deploy bilgi dosyası, `.env`) bak.
- Değeri ekrana/loga/commit'e basma. Repo'da yalnız `.env.example` + placeholder.
- Dağıtım (Dokploy) ve DNS erişim bilgisi yereldir (repo dışı ajan dosyası). Repoya, issue'lara ve PR metnine yazılmaz.

## Onay gereken (geri dönüşü olmayan)
Force push · veri/DB silme · prod migration rollback · yeni canlı ortam açma.
Bunlar dışında sorma; port doluysa boş port seç ve söyle.

## Tekrar eden hatalar
<!-- Ajan bir hatayı tekrarlayınca buraya: tarih — hata — doğrusu. En fazla 15 madde; eskiyen hook'a veya teste taşınır. -->
- 2026-10-09 — Ana canvas'ın ebeveyni boyutsuzdu, sahne şerit olarak render edildi — canvas `#stage` (position:fixed; inset:0) içinde durur, scene ResizeObserver'ı ebeveyni ölçer.
- 2026-10-09 — main.js değişti ama `?v=` artırılmadı, tarayıcı eski modülü çalıştırdı (test yanıltıcı) — her JS/CSS değişikliğinden sonra importmap `?v=` artırılır, sonra test edilir.
- 2026-10-09 — Alt ajan commit'i git hook ile engelli; worktree ajanları değişikliği bırakır, ana oturum commit + merge eder.
- 2026-10-09 — `<script type=module src=main.js>` importmap'i atlıyor, main.js versiyonsuz kaldı ve SW eski kopyayı verdi — giriş modülü inline `import "./src/main.js"` ile yüklenir; `?v=` index.html ve `sw.js` V ile birlikte artırılır.
- 2026-10-09 — v10–v12 ve spec doğrudan `main`'e push edildi, PR açılmadı (kullanıcı sordu) — her değişiklik dal + PR + ikinci model review ile gider; `main`'e push = Pages deploy.
- 2026-10-09 — UI test'i `__ahilik.act` ile aksiyonu doğrudan verdi, düğmenin yanlış `legal` indeksini göremedi (review yakaladı) — UI akışı en az bir kez gerçek DOM düğmesine tıklanarak doğrulanır. `codex exec review` bu hesapta model hatası veriyor; yedek `opencode run -m deepseek/deepseek-v4-pro`, diff dosyası proje içinde (`.wt/`) olmalı.
