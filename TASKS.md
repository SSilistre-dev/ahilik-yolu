# Ahilik Yolu — Görev Listesi

Oluşturma: 2026-10-10 · Taban: `main` @ `ba44e5d` (v13) · Canlı: GitHub Pages (`ssilistre-dev.github.io/ahilik-yolu`)

Kaynaklar:
- Kural kitabı (12 sayfa) ↔ `SPEC.md` ↔ motor/bot satır satır karşılaştırması.
- `ui.js` / `scene.js` / `sw.js` / CSS denetimi (okuyarak; tarayıcı koşusu sandbox nedeniyle yapılamadı).
- Bot-bot simülasyonu: 2000 oyun × 2/3/4/6 oyuncu. Kilitlenme 0, yasadışı hamle 0, kart korunumu bozulmadı.
- `make olc` → 34/34.

MasterFabric: proje `AHI` (MF Sync MCP), AY-xxx → AHI-001…056 aynı sırayla backlog'da.

Öncelik: **P0** oyunu bozar · **P1** kural/UX'te ciddi eksik · **P2** kalite/cila · **P3** içerik/gelecek.
Her görev: dal + PR + ikinci model review + `make qa` 0 fail + JS/CSS değiştiyse `?v=` ve `sw.js` V artışı (AGENTS.md).

---

## P0 — Oyunu bozan hatalar

### AY-001 · 5–6 oyuncuda piyon modelleri kayboluyor
- **Kanıt:** `src/scene.js:318`. Model `loaded['pawn' + (i % 4)]` ile seçiliyor. Satır 330 aynı `g.scene` objesini `body.add` ile ekliyor. Three.js'te bir obje tek ebeveynde durur. 5. oyuncu 1.'nin, 6. oyuncu 2.'nin modelini alır, 1. ve 2. oyuncuda yalnız disk kalır. Aynı sahnede iki `AnimationMixer` çalışır. Yeni oyunda piyonlar yeniden yaratılırsa aynı sorun tekrar eder.
- **Çözüm:** Her piyon için `SkeletonUtils.clone(g.scene)` kullan (three/addons, importmap'e eklenir). Skinned mesh birleştirmesi klonun üzerinde yapılır.
- **Kabul:** 6 oyunculu oyunda 6 karakter görünür, hepsi idle animasyonu oynar. İkinci "Yeni Oyun"dan sonra da görünür. Ekran görüntüsüyle doğrulanır.

### AY-002 · Bot hatası ya da WebGL/CDN hatası oyunu sessizce donduruyor
- **Kanıt:**
  - `main.js:73-77`: `apply` hatası `console.error` ile yutuluyor. Bot ise timer yeniden kurulmadığı için oyun donuyor.
  - `main.js:107`: `botAction` try dışında, hata unhandled kalıyor.
  - `main.js:30`: WebGL yoksa `createScene` fırlatıyor ve ekran sonsuza kadar "Yükleniyor…" diyor.
  - `index.html:67`: jsDelivr erişilemezse (ilk açılış offline, okul ağı filtresi) `three` import'u patlıyor, mesaj yok.
- **Çözüm:**
  - Bot yolu: `try { botAction + apply } catch` → `legalActions` içinden `pass`/`endTurn`/ilk yasal aksiyona düş, hatayı logla.
  - Giriş: modül yüklemesini dinamik `import()` + `.catch` ile sar. Hata ekranı: "Bağlantı/grafik hatası" + "Yeniden dene".
- **Kabul:** `botAction` zorla fırlatıldığında oyun ilerler (birim test, `bot.js`'yi saran fonksiyonla). Ağ kapalı ilk açılışta hata ekranı görünür.

### AY-003 · Tahta vurgusu (highlight) render sonrası kayboluyor
- **Kanıt:** `main.js:116` her `update()` çağrısında `highlight = []` yapıyor. `ui.js:98` ise anahtar (`lastHl`) değişmediyse `onTileHighlight` çağırmıyor. Örnek: "Okudum" (`readText`) sonrası seçili kartın parlayan kareleri söner.
- **Çözüm:** `main.js:116` satırını sil. Vurgunun tek sahibi UI olur.
- **Kabul:** Kart seçiliyken `readText` yapılınca halkalar kalır. Gerçek DOM tıklamasıyla doğrulanır.

---

## P1 — Kural uyumu (kitapçık ↔ motor)

### AY-010 · Görev şehrine komşu kareye basınca hareket zorla bitiyor
- **Kitap:** Kural 3 kart sınırı koymaz. Kural 4: "Daha fazla rozet toplamak için yolunu uzatabilir." s.3: ticaret "el sonunda" şehre gelene verilir.
- **Kod:** `game.js:267`. Komşu kareye girince anında `deliver` çalışır ve `moveDone=true` olur. Koşarak doğrulandı.
- **Etki:** Kural 4'teki strateji ("yolu uzatıp rozet topla") oyunda yok. Bot E3 de bu yüzden anlamsız.
- **Çözüm (öneri):** Komşu kareye gelince teslim etme. Oyuncu "Şehre gir" aksiyonunu seçer ya da turu bitirir; ikisi de teslimi tetikler. Turun sonunda hâlâ komşu karede olan da teslim eder. SPEC v4'teki "kullanıcı kararı" ile çelişir. **Önce kullanıcı onayı al, sonra SPEC'i güncelle.**
- **Kabul:** Motor testi: oyuncu komşu kareye basar, bir hamle daha yapar, rozet toplar, tur sonunda teslim eder. Bot bu seçeneği kullanır.

### AY-011 · Kargo kartının zamanı (açık soru, oyun yazarına)
- **Kitap s.5:** "Sırasının henüz başında ve hiçbir hamle yapmamış." s.3'e göre ahlak kartı açmak 1. hamledir.
- **Kod:** `game.js:136, 272`. Kargo ahlak kartından sonra oynanabiliyor.
- **İş:** Ahmet Ercan / İGİAD'a sor. Cevap "ahlaktan önce" ise kargo `phase==='ahlak'` içinde yasal olur, ahlak kartı o tur açılmaz. Test + SPEC güncellemesi.

### AY-012 · Yol açmada kart seçimi serbest olmalı
- **Kod:** `game.js:27, 158, 179`. Yalnız `cards.slice(0,n)` ön ekleri sunuluyor: önce ilke kartları, joker en son. Oyuncu "jokeri ver, ilke kartını sakla" ya da "yazılı kartı (`hasText`) sakla" diyemiyor.
- **Çözüm:** `openRoad`/`contribute` aksiyonu kart listesini zaten alıyor. `legalActions` kombinasyonları tür bazında (ilke, ilke*, joker) tekilleştirerek üretir. UI kart seçtirir.
- **Kabul:** "1 joker + 1 ilke" elinde joker tek başına verilebilir (test).

### AY-013 · Okuma (+1 rozet) fırsatı ara hamlede kayboluyor
- **Kod:** `game.js:211`. `openRoad` ve `pass` gibi her aksiyon `pendingText`'i siliyor; yalnız `readText`/`offerTrade` muaf.
- **Çözüm:** `pendingText` yalnız sonraki `move` ve `endTurn`'de temizlenir.
- **Kabul:** Yazılı kartla hareket → yol açma → `readText` hâlâ yasal (test).

### AY-014 · Aktif oyuncu kartsız yol açma başlatabilmeli (kitapta yasak yok)
- **Kod:** `game.js:315`, en az 1 kart isteniyor. Kitaptaki örnekte diğerleri "Ben!" diyerek katılıyor.
- **İş:** Kural yorumu. Kullanıcıya sor. Evetse 0 kartla başlatma yasal olur, `roadTries` korunur.

### AY-015 · Takas her zaman açık; kitap "ihtiyacı olan kart yoksa" diyor (DÜŞÜK)
- Kod gevşek (`game.js:170-175`). Kural sıkılaştırılmayacaksa SPEC'e "bilinçli gevşetme" diye yaz.

### AY-016 · Sıra yönü: kitap "sağdan sola"
- Motor artan indeksle ilerliyor. UI koltuk düzeni (çip sırası) saat yönünün tersini göstermeli ya da SPEC'e not düşülmeli. Görsel karar.

### AY-017 · SPEC temizliği
- v1 "Demo kararları" bölümünde v4 ile çelişen satırlar var: 53 (opsiyonel tamamlama), 104-105 (bot takas yapmaz), 109-111 (eski `openRoad {tile}`), 116 (bitmap yok).
- Sözleşme gövdesine `moveDone`, `offersThisTurn`, `roadTries`, `pending`, `declined` eklenecek.
- Kaynak tarihi düzeltilecek: "Haziran 2025" → "Temmuz 2025".
- AGENTS.md "Canlı: TODO" → Pages URL.

---

## P1 — Oyun deneyimi (UX / çocuk hedefi)

### AY-020 · "Son tur" uyarısı yok
- UI'da `endgame` hiç kullanılmıyor (grep boş). Bitiş tetiklenince tur ilk oyuncuya kadar sürer, çocuk oyunun neden devam ettiğini anlamaz.
- **Çözüm:** `endgame` event'inde büyük banner ("Son tur! Ahlak destesi bitti"). HUD'da kalan oyuncu sayısı.

### AY-021 · Boş ahlak destesi yolu kırılgan
- Simülasyon: 4+ oyuncuda oyun başına ~2,9 kez boş desteden çekim oluyor.
- `ui.js:499` bu durumu engine metnindeki `/boş/` regex'iyle ayırıyor. `main.js:87` yine kart sesi çalıyor. Tutorial 2,4 sn bekliyor.
- **Çözüm:** Motor deste boşken `drawAhlak` aşamasını atlasın ya da event'e `empty:true` koysun. UI `!ev.card` ile ayırsın. Motor testi + UI kontrolü.

### AY-022 · Geçersiz dokunuşa geri bildirim yok
- `tapTile` false dönüyor, kimse bakmıyor (`main.js:31`). Çocuk "bozuk" sanar.
- **Çözüm:** Kare sallanması + kısa titreşim + tek toast ("Bu kareye bu kartla gidemezsin").

### AY-023 · Kaydet / devam et
- Sayfa kapanınca oyun kayboluyor. State saf JSON.
- **Çözüm:** Her `update` sonunda `localStorage` içine `{v, state}` yaz (try/catch). Başlangıç ekranında "Devam et" düğmesi. Sürüm uyuşmazsa kaydı sil.
- **Kabul:** Oyun ortasında yenile → aynı state, aynı el.

### AY-024 · Yeni oyunda UI ve sahne durumu sıfırlanmıyor
- `ui.js:69-72, 488`: `log`, `lastAhlakId`, `handOpen`, `rv`, `lastHl` sıfırlanmıyor. Yeni oyunda eski ahlak kartı görünüyor.
- `scene.js:524-545`: `first=false` kaldığı için eski piyon konumlarından hop animasyonu oynuyor.
- **Çözüm:** `state.seed` değişince ikisi de reset.

### AY-025 · Çok insanlı oyunda gizlilik sızıntıları
- `ui.js:182-185`: bot sırasında önceki insanın eli ekranda kalıyor.
- `tutorial.js:121`: intro, perde inmeden ilk insanın kartını gösteriyor.
- **Çözüm:** İnsan turu bitince `viewer=null` ve el kapalı. Perde gerektiğinde tutorial perdeden sonra açılır.

### AY-026 · Okunabilirlik ve dokunma hedefleri (7 yaş hedefi)
- Yazılar 11–13 px. Taban 15–16 px olmalı.
- 44 px altındaki hedefler: `.ay-round` 40/36, `.ay-handle` 28, `.bx` 36 (`style.css:46, 60, 252, 259`).
- Yatay uyarısı masaüstünde kısa pencereyi de kilitliyor (`index.html:34`). `(pointer:coarse)` eklenecek.
- `toUpperCase()` Türkçe "i" harfini bozuyor (`ui.js:138, 202, 280`). `toLocaleUpperCase('tr')` kullanılacak.

### AY-027 · Oyun sonu ekranı
- 3+ berabere durumunda "hepsi de kazandı" yanlış olabiliyor (`ui.js:284`).
- **Ekle:** Tamamlanan şehirler, ticaret sayısı (eşitlik bozucu), rozet → çarpan açıklaması ("12 rozet = ×3"), "Aynı oyuncularla tekrar" düğmesi (`ui.js:553` adları sıfırlıyor).

### AY-028 · iOS sessiz modda ses yok
- WebAudio, sessiz anahtarına uyuyor (`sfx.js`).
- **Çözüm:** Unlock anında kısa sessiz `<audio>` çalarak "playback" oturumuna geç. Ayrıca `sfx.js:23-27` fetch hatasında `null` önbelleğe alınmasın, yeniden denensin.

---

## P2 — Bot / yapay zekâ

### AY-030 · Bot zorluk seviyeleri
- Şu anki bot tek seviye ve açgözlü. Kurulumda seçilecek seviyeler:
  - **Kolay:** rastgele yasal ilerleme, takas yok.
  - **Normal:** mevcut bot.
  - **Zor:** AY-031..034.
- `botAction(state, level)`. Glue kurulumdan geçirir.

### AY-031 · Rozet ekonomisi farkındalığı
- `bot.js:54` karedeki rozeti 0.1 ağırlıkla yalnız eşitlik bozucu olarak kullanıyor.
- Zor bot, çarpan eşiklerine (5/10/15/20) yakınken rozetli kareye sapar: `değer = para × Δçarpan`.
- AY-010 gelirse komşu kareden dolaşma kararı da buraya girer.

### AY-032 · Kare kapatmada rakibi engelleme
- `bot.js:46-49` yalnız kendinden uzak kareyi seçiyor. Zor bot lider oyuncunun `pathTo` yolundaki kareyi kapatır.

### AY-033 · Görev yokken anlamsız davranış
- Ticaret destesi bitince `r.cur=Infinity` oluyor, bot boşuna `ahievran` istiyor (`bot.js:62`). Rozet toplamaya geçmeli.

### AY-034 · Kargo kullanımı
- `bot.js:53` eşiği `cur>3`, bu 5x5 tahtada neredeyse hiç sağlanmıyor.
- `bot.js:73` hedef olmayan şehre uçabiliyor.
- **Kural:** Kargo yalnız hedefe uçar ya da tıkalıyken en yakın hedef şehre gider.

### AY-035 · Simülasyon aracını repoya al
- `test/sim.mjs` (CLI): N oyun, koltuk kazanma oranı, bitiş nedeni, ortalama tur, aksiyon sayıları.
- `make sim`, kapıya girmez. Bot değişikliklerinde önce/sonra tablosu PR'a eklenir.

---

## P2 — Denge (game design ölçümleri)

Simülasyon (bot v4, 2000 oyun her biri):

| Oyuncu | Ort. tur | Kişi başı tur | Koltuk kazanma | Bitiş nedeni |
|---|---|---|---|---|
| 2 | 22 | 11 | 48 / 52 % | ahlak %99 |
| 3 | 21 | 7 | 31,6 / 34,3 / 34,3 % | ahlak %97 |
| 4 | 24 | 6 | **20,9** / 25,9 / 25,5 / **28,3** % | ahlak %95 |
| 6 | 24 | **4** | 16,7 … 14,4 % | ahlak %89 |

### AY-040 · İlk oyuncu dezavantajı (4p: %20,9, son koltuk %28,3)
- Herkes eşit tur oynuyor, buna rağmen fark var. Olası neden: erken koltuklar olumsuz kart cezasını daha çok ödüyor. Sonraki koltuklar, öncekilerin açtığı olumlu kartın rozetini topluyor.
- **İş:**
  1. Sim'e "koltuk başı rozet kaynağı" kırılımını ekle.
  2. Neden doğrulanırsa kural motoru değişmez (kitap kuralı). Yazara rapor edilir. Dijital "ilk oyuncu bonusu" ancak onayla eklenir.

### AY-041 · Oyun uzunluğu 21 ahlak kartına kilitli
- 6 oyuncuda kişi başı yalnız 4 tur oynanıyor, ortalama para 5,3M. Kitapla tutarlı, ama 5–6 oyuncu "esnetilmiş kural".
- **Öneri:** "Uzun oyun" seçeneği (ahlak ıskartası bir kez karıştırılır). Varsayılan kapalı, yazara sorulur.

### AY-042 · Ödül havuzu bitişi pratikte hiç tetiklenmiyor (6p'de 3/2000)
- Bilgi olarak SPEC'e not düşülür. Değişiklik yok.

### AY-043 · Fiziksel rozet sınırı (36 gümüş + 16 altın) modellenmemiş
- Kasa sınırsız. Simde oyuncu başı rozet ortalaması 6–10, sınıra yaklaşılmıyor. **Karar: yapma (YAGNI).** SPEC'e gerekçe yaz.

---

## P2 — Performans / sahne

### AY-050 · "On-demand render" aslında sürekli döngü
- Piyon mixer'ı nedeniyle idle 15 fps, bayrak varken 30 fps. rAF her vsync'te uyanıyor (`scene.js:464, 498, 506`). Mobilde pil yer.
- **Çözüm:** Idle animasyonu yalnız aktif piyonda oynat. 5 sn hareketsizlikte döngüyü durdur.
- **Kabul:** Bekleme anında Performance panelinde rAF yok.

### AY-051 · Draw call ve üçgen bütçesini ölç
- `scene.info()` var ama hiç koşulmadı. Tahmin 45–55 draw call + gölge pass'i; bütçe ≤60.
- **İş:** CDP ile 6 oyunculu sahnede ölç, SPEC'e yaz. Aşıyorsa gölge haritası `autoUpdate=false` (`scene.js:124`).

### AY-052 · WebGL context kaybı
- `webglcontextlost`/`restored` dinleyicisi yok. Arka plandan dönünce tahta boş kalabilir.
- **Çözüm:** `preventDefault` + restore'da yeniden kur.

### AY-053 · Dispose
- `scene.js:532`: piyon kaldırılınca geometri/materyal dispose edilmiyor. Yeni oyunlarda küçük sızıntı. AY-024 ile birlikte yapılır.

### AY-054 · Kart görselleri retina'da bulanık
- Görseller 198×360. Reveal ve okuma kartında `srcset` ile 2x sürüm.
- Kart bütçesi 2,4 / 2,5 MB, sınırda. 2x sürümler lazy yüklenir, precache'e girmez.

---

## P2 — PWA / dağıtım

### AY-060 · Offline için varlıklar precache değil
- `sw.js:3-6` yalnız kabuğu ve JS'yi önbelleğe alıyor. Modeller, kartlar, sesler ve CDN three runtime'da önbelleğe giriyor. Görülmemiş kartlar offline'da kırık çıkar.
- **Çözüm:** İlk açılıştan sonra `requestIdleCallback` içinde tüm varlık listesini `cache.addAll` ile ayrı, sürümsüz `assets` cache'ine indir. CDN three'yi de precache'e al.

### AY-061 · Ağ önceliğinde zaman aşımı yok, her sürüm 5 MB yeniden iniyor
- `sw.js:13-23` networkFirst zaman aşımsız, zayıf ağda sayfa asılı kalıyor. 3 sn sonra önbelleğe düşmeli.
- `sw.js:3, 11`: `V` artınca tüm cache siliniyor. Varlık cache'i sürümden ayrılacak (AY-060).
- `sw.js:11`: `c.put` `waitUntil` dışında, yazım yarım kalabilir.

### AY-062 · `?v=` / `V` senkronu elle (12 yer)
- AGENTS.md'de iki kez tekrar eden hata. Prose yetmiyor, kapıya taşınacak.
- **Çözüm:** `test/version.test.js`: `index.html` içindeki tüm `?v=N` değerleri ve `sw.js` V aynı olmalı. `olc` içinde koşar.

### AY-063 · "Yeni sürüm hazır" bildirimi
- SW güncellenince açık sayfaya toast + "Yenile" düğmesi gösterilir. Oyun ortasında otomatik yenileme yapılmaz (AY-023 ile kayıt korunur).

### AY-064 · Prod'da debug ve dev sayfaları
- `main.js:150`: `window.__ahilik` prodda açık. `state` tüm elleri gösteriyor, `act` her aksiyonu veriyor. Yalnız `?debug` ya da localhost'ta aç.
- `dev/*.html` Pages'te yayında ve aynı origin'e tutorial bayrağı yazıyor. Pages'ten çıkarılacak ya da bayrak anahtarı ayrılacak.

### AY-065 · CSP ve SRI
- `<meta http-equiv="Content-Security-Policy">`: `script-src 'self' cdn.jsdelivr.net` + inline importmap/modül için hash.
- importmap `integrity` alanıyla three için SRI.

---

## P2 — Erişilebilirlik

### AY-070 · Klavyeyle oynanabilirlik
- Kareler yalnız 3B tap ile seçilebiliyor (`scene.js:562-578`). Masaüstünde klavye ve ekran okuyucu oynayamaz.
- **Çözüm:** Kart seçilince yasal hedefler UI'da düğme listesi olarak da çıkar ("Merhametli karesi – 2 rozet"). Ok tuşu + Enter.

### AY-071 · Odak ve duyurular
- `:focus-visible` stili yok.
- `aria-live` yok: ipucu pill'i ve toast sesli okunmuyor.
- Modallarda `role="dialog"`, `aria-modal` ve odak tuzağı yok (tutorial hariç).

### AY-072 · Hareket azaltma
- Sahnedeki hop ve kamera animasyonları `prefers-reduced-motion`'a bakmıyor (CSS bakıyor).

---

## P2 — Test ve kapı

### AY-080 · `make qa` gerçek bir kapı değil
- Şu an yalnız `olc` koşuyor. Eklenecek: AY-062 sürüm testi, fixture testi, Playwright smoke testi.

### AY-081 · Fixture şema testi
- 5 fixture'dan yalnız `start.json` testte. Hepsini `legalActions` + `score` içinden geçiren bir test eklenecek. Şema kayarsa yakalanır.

### AY-082 · Playwright smoke testi (tek dosya, npm projesi değil)
- Host Brave `E2E_BROWSER_PATH` ile kullanılır, Playwright tarayıcı indirmez.
- Akış: başla → ahlak aç → gerçek DOM kart tıklaması → kare → turu bitir → bot turu → 3 tur. Konsol hatası = fail.
- Koşu bitince `node_modules`, `test-results` ve ekran görüntüleri silinir (global kural).
- Sandbox notu: yerel port için `sandbox.network.allowLocalBinding: true` gerekiyor.

### AY-083 · Kenar durum testleri
- Boş ahlak destesi (AY-021).
- Yol destesi ve ıskarta ikisi de boş (elde eksik kart).
- Üç şehir komşusu da kapalı + kargo yok (sürekli pas).
- Görev yokken bot (AY-033).
- 6 oyunculu tam oyun.

---

## P3 — İçerik / gelecek (onay sonrası)

- **AY-090 · Ahilik içeriği:**
  - Okuma kartında ilke metni sesli okunur (TTS `speechSynthesis` tr-TR; native, bağımlılık yok).
  - Oyun sonunda "bugün öğrendiğin ilkeler" ekranı. Kitapçık s.7-9'daki Ahi Evran ve 7 ilke metni.
- **AY-091 · Müzik:** CC0 bağlama/ney döngüsü, ayrı ses düğmesi. Bütçeye etkisi ölçülür (≤300 KB).
- **AY-092 · Ayarlar:** Bot hızı, yazı boyutu, ses seviyesi, renk körü kontrastı.
- **AY-093 · Dağıtma animasyonu:** Tur başı el tamamlamada kartlar desteden uçar (şu an yalnız toast).
- **AY-094 · Çevrimiçi çok oyunculu:** Motor saf ve deterministik, ağ için uygun. **YAGNI: talep gelene kadar yapma.**

---

## Bakım / hijyen

- **AY-100 · Eski worktree'ler:** ajan worktree dizininde 5 eski worktree (28 MB) ve birleşmiş dallar var (`rules-1to1`, `docs-pr-rule`, `worktree-agent-*`).
  - `git worktree remove` + `git branch -d`, uzak dallar da silinir.
  - Birleşmemiş commit yoksa silinir (`git branch --no-merged main` ile önce kontrol).
- **AY-101 · Lisans:** Basılı sanat İGİAD'a ait ve repo public. Yazılı kullanım izni netleştirilip `assets/LICENSE-ART.md` dosyasına tarih ve kişi yazılacak.
- **AY-102 · AGENTS.md:** "Canlı" satırı (AY-017). Simülasyon komutu (AY-035) "Komutlar" bölümüne.

---

## Kullanıcıya / yazara sorulacaklar

1. AY-010: Komşu karede durmadan yola devam edip rozet toplamak serbest mi? (Kitaba göre evet. SPEC v4 kararı tersi.)
2. AY-011: Kargo ahlak kartından önce mi oynanır?
3. AY-014: Aktif oyuncu kartsız yol açma çağrısı yapabilir mi?
4. AY-041: 5–6 oyuncuda "uzun oyun" seçeneği eklensin mi?
5. AY-101: Basılı sanat için public yayın izni yazılı mı?

## Önerilen sıra

1. **Sprint 1:** AY-001, 002, 003, 021, 024, 062, 081 (hatalar ve kapı).
2. **Sprint 2:** AY-010…014 (sorulara cevap gelince), 020, 022, 023, 025, 026.
3. **Sprint 3:** AY-030…035 bot + sim, AY-040 denge raporu.
4. **Sprint 4:** AY-050…065 performans ve PWA, AY-070…072, AY-082.
5. **Sonra:** P3.
