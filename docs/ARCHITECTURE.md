# Ahilik Yolu — Sistem Mimarisi (v5: çevrimiçi + menü + bot seviyeleri)

Durum: **onaylandı (2026-10-10)**. Sunucu: Dokploy üzerinde tek Node konteyneri. Kurallar: kural kitabına göre. Mobil: Capacitor.
Bu belge `SPEC.md` ile birlikte okunur. Kural davranışı SPEC'tedir; burası sistemin parçalarını, aralarındaki sözleşmeleri ve dağıtımı anlatır.

## 1. Hedefler ve sınırlar

**Hedefler**
- Oyun dört modda oynanabilir:
  1. Botlarla (çevrimdışı).
  2. Aynı telefonda (cihazı elden ele vererek).
  3. Arkadaşlarla, **davet koduyla** (çevrimiçi).
  4. Çevrimiçi odada boş koltuklara bot eklenerek (karma).
- Bot zorluğu: **Kolay / Orta / Zor**. Botlar yalnız kendi görebildiği bilgiyle (view) karar verir.
- Kural motoru tektir. `src/game.js` hem tarayıcıda hem sunucuda **aynı dosya** olarak çalışır.
- Çocuk güvenliği:
  - Hesap yok.
  - Serbest sohbet yok, yalnız hazır tepkiler (emote) var.
  - Kişisel veri toplanmaz.
  - Odalar 24 saat sonra silinir.

**Sınırlar (bilinçli olarak yapılmayanlar, YAGNI)**
- Hesap/giriş, arkadaş listesi, eşleştirme (matchmaking), sıralama tablosu, izleyici modu, sohbet, çoklu dil.
- Veritabanı. Oda durumu sunucu belleğinde yaşar, her değişiklikten sonra diske (`/data/rooms/<kod>.json`) anlık görüntü yazılır, oda kapanınca silinir.
- Yatay ölçekleme. Tek konteyner, tek süreç (`ponytail:` tek instance; çok instance gerekirse oda koduna göre yapışkan yönlendirme eklenir).
- Bundler. İstemci build'siz kalır. Sunucunun tek npm bağımlılığı `ws`'dir (WebSocket sunucusu); yalnız `server/package.json` içinde, Docker imajında kurulur.

## 2. Sistem bağlamı

```mermaid
flowchart LR
  subgraph Cihaz["Oyuncu cihazı"]
    PWA["Web istemcisi (PWA)<br/>index.html + src/*.js"]
    APP["iOS / Android uygulaması<br/>Capacitor kabuğu + gömülü web varlıkları"]
    LS[("localStorage<br/>profil · ayarlar · kayıt · oda token")]
  end
  subgraph Dokploy["Dokploy (self-hosted) · ahilik.ssilistre.dev"]
    TR["Traefik<br/>TLS · yönlendirme"]
    NODE["Node 22 konteyneri<br/>server/index.js<br/>statik varlık + /api + /ws"]
    VOL[("Kalıcı birim /data<br/>oda anlık görüntüleri")]
  end
  JSD["cdn.jsdelivr.net<br/>three@0.160.0 (yalnız web)"]
  GH["GitHub<br/>repo · Actions CI"]
  DNS["Cloudflare DNS<br/>ssilistre.dev"]

  PWA -- "HTTPS varlıklar" --> TR
  PWA <-- "WSS /ws/:kod" --> TR
  APP <-- "WSS /ws/:kod" --> TR
  APP -- "POST /api/rooms" --> TR
  TR --> NODE
  NODE --- VOL
  PWA -- import --> JSD
  PWA --- LS
  APP --- LS
  GH -- "main push → Dokploy webhook → docker build" --> NODE
  DNS -. "A/CNAME" .-> TR
```

## 3. Modül haritası

```mermaid
flowchart TB
  subgraph Paylasilan["Paylaşılan saf modüller (DOM yok, three yok)"]
    data["src/data.js<br/>tahta, kartlar"]
    game["src/game.js<br/>kural motoru"]
    view["src/view.js (YENİ)<br/>viewFor · eventsFor"]
    bot["src/bot.js<br/>botAction(view, legal, level)"]
    path["src/path.js"]
  end
  subgraph Istemci["İstemci"]
    main["src/main.js<br/>giriş + ekran yönlendirici"]
    sess["src/session.js (YENİ)<br/>LocalSession · OnlineSession"]
    net["src/net.js (YENİ)<br/>WebSocket istemcisi"]
    menu["src/menu.js (YENİ)<br/>ana menü · kurulum · lobi · ayarlar"]
    router["src/router.js (YENİ)<br/>ekran durum makinesi + history"]
    ui["src/ui.js<br/>oyun içi HUD"]
    scene["src/scene.js<br/>three.js tahta"]
    tut["src/tutorial.js"]
    sfx["src/sfx.js"]
    store["src/store.js (YENİ)<br/>localStorage sarmalayıcı"]
  end
  subgraph Sunucu["Sunucu (server/)"]
    index["server/index.js<br/>HTTP: statik + /api, WS upgrade"]
    hub["server/hub.js<br/>oda haritası, soket bağlama,<br/>zamanlayıcı, disk anlık görüntüsü"]
    room["server/room.js<br/>saf Room mantığı (test edilir)"]
  end

  game --> data
  view --> game
  bot --> game
  bot --> view
  path --> data
  sess --> game
  sess --> bot
  sess --> view
  sess --> net
  main --> sess
  main --> menu
  main --> ui
  main --> scene
  ui --> data
  menu --> store
  sess --> store
  index --> hub
  hub --> room
  room --> game
  room --> view
  room --> bot
```

Kurallar:
- `server/room.js` saftır. Saat (`now`) ve rastgelelik (`rand`) parametre olarak gelir. `node:test` ile tarayıcısız ve ağsız test edilir.
- `server/hub.js` ince bir adaptördür: soket, zamanlayıcı ve disk. İçinde oyun mantığı olmaz. `server/index.js` yalnız HTTP yönlendirmesi yapar.
- İstemcide `main.js` motoru doğrudan çağırmaz, yalnız `Session` arayüzünü bilir. İki uygulama vardır (Local, Online); bu yüzden arayüz gerekçelidir.

## 4. Session arayüzü (istemci)

```js
// src/session.js
// İki uygulama: LocalSession (bugünkü main.js davranışı) ve OnlineSession (net.js üzerinden).
session = {
  mode: 'local' | 'online',
  you: seat | null,            // online: kendi koltuğun; local: null (aktif insan)
  act(action),                 // local: apply + bot zamanlayıcı; online: {t:'act'} gönderir
  onUpdate(cb),                // cb({ view, legal, events, meta })
  undo?(),                     // yalnız local
  leave(),
}
meta = { conn: 'ok'|'reconnecting'|'lost', deadline: epochMs|null, seats: [...lobi bilgisi] }
```

- UI ve scene, `state` yerine **view** alır. View, state ile aynı şekildedir; gizli alanların içi boşaltılmıştır (§6). Mevcut UI kodu `hand.length` ve `seed` dışında gizli alana dokunmadığı için değişiklik küçüktür.
- Local modda view, aktif insanın gözünden üretilir. Aynı cihazda çok insan varsa perde mantığı korunur.

## 5. Ağ protokolü v1 (WebSocket, JSON)

Her mesaj `{ v:1, t:<tip>, ... }` biçimindedir. En büyük mesaj 8192 bayttır (`tooBig`). Saniyede en çok 20 mesaj kabul edilir. Aşan bağlantı `error{code:'rate'}` alır ve kapatılır. `hello` bağlantıdan sonra 10 sn içinde gelmezse bağlantı kapatılır. Ayrıntılı sözleşme: `SPEC.md` v5.

**İstemci → sunucu**

| t | alanlar | kim | açıklama |
|---|---|---|---|
| `hello` | `token?`, `name`, `avatar` | herkes | Bağlanınca ilk mesaj. Token varsa aynı koltuğa döner. |
| `ready` | `on:bool` | insan | Lobide hazır olma. |
| `addBot` | `level:'easy'\|'medium'\|'hard'` | host | Boş koltuğa bot ekler. |
| `setBot` | `seat`, `level` | host | Botun seviyesini değiştirir. |
| `removeSeat` | `seat` | host | Botu çıkarır ya da insanı atar (kick, `kicked`). Host kendini atamaz. |
| `setOptions` | `turnSeconds:0\|30\|60\|120`, `startSeat:'random'\|0..5` | host | Oda ayarları. Sunucu yaş bilmez: "yaşı küçük başlar" kuralı lobide host'a bırakılır, varsayılan rastgele. |
| `start` | – | host | En az 2 koltuk dolu ve tüm insanlar hazırsa oyunu başlatır. |
| `act` | `action`, `base:version` | actor | Oyun aksiyonu. `base` eskiyse reddedilir. `undo` kabul edilmez. |
| `emote` | `id` (hazır listeden) | oyuncu | Hazır tepki; serbest metin yok. |
| `rematch` | – | oyuncu | Oyun bitince tekrar oynama oyu. |
| `leave` | – | oyuncu | Odadan bilerek çıkış; lobide koltuk kalkar (sonrakiler kayar), oyunda koltuk kalıcı Orta bot olur. |
| `ping` | – | herkes | 25 sn'de bir. |

**Sunucu → istemci**

| t | alanlar | açıklama |
|---|---|---|
| `welcome` | `code`, `you:{seat, token}` | Katılma ve lobide koltuk kayması sonrası (etkilenen insanlara yeni `welcome` gider). Token istemcide `localStorage['ahilik.room.'+code]` içinde saklanır; başka mesajda ve URL'de bulunmaz. |
| `lobby` | `seats:[{seat,name,avatar,bot,level,ready,online,host}]`, `options`, `phase:'lobby'\|'game'\|'over'` | Lobi her değiştiğinde gönderilir. |
| `game` | `version`, `gameId`, `view`, `legal`, `events`, `deadline`, `now`, `seats`, `rematch` | Her aksiyondan sonra koltuk başına ayrı hazırlanır. `legal` yalnız sırası gelen koltuğa dolu. `deadline`: zamanlayıcı epoch ms ya da `null`; `now`: sunucu saati; `seats`: herkese açık künye `{seat,name,avatar,bot,level,online,takeover}`; `rematch`: `phase:'over'`'da `{votes,need}`. |
| `emote` | `seat`, `id` | Tepki yayını. |
| `error` | `code`, `msg` | Kodlar: `stale`, `illegal`, `notYourTurn`, `notHost`, `full`, `started`, `notFound`, `rate`, `tooBig`, `badMsg`, `badName`, `version`, `kicked`, `replaced`, `expired`. Bağlantıyı kapatanlar: `full`, `started`, `notFound`, `rate`, `tooBig`, `version`, `kicked`, `replaced`, `expired`. |
| `pong` | – | `ping` cevabı. |

```mermaid
sequenceDiagram
  autonumber
  actor A as Ayşe (host)
  actor B as Burak
  participant W as server/index.js
  participant R as hub + Room(K7M2QX)
  A->>W: POST /api/rooms
  W->>R: hub.create() → kod
  W-->>A: {code:"K7M2QX"}
  A->>R: WS /ws/K7M2QX · hello{name}
  R-->>A: welcome{seat:0, token} · lobby
  A-->>B: Paylaş: ahilik.ssilistre.dev/?oda=K7M2QX
  B->>R: WS · hello{name}
  R-->>A: lobby (2 koltuk)
  R-->>B: welcome{seat:1} · lobby
  A->>R: addBot{level:"hard"}
  B->>R: ready{on:true}
  A->>R: start
  R->>R: newGame(seed=crypto) · version=1
  R-->>A: game{view(seat0), legal, deadline}
  R-->>B: game{view(seat1), legal:[]}
  A->>R: act{drawAhlak, base:1}
  R->>R: apply · version=2 · persist
  R-->>A: game{v2}
  R-->>B: game{v2}
  Note over R: Botun sırası: setTimeout(+700 ms) → room.tick(now) → botAction(viewFor(bot)) → apply
```

## 6. Gizli bilgi: `viewFor` ve `eventsFor` (`src/view.js`)

Sunucu otoriterdir. İstemci hiçbir zaman tam state görmez.

`viewFor(state, seat)` state'in derin kopyasını alır ve şunları yapar:

| Alan | View'da |
|---|---|
| `seed`, `rng` | `seed` → opak `gameId` (oda üretir, oyun başına rastgele 12 karakter `[a-z2-9]`; `viewFor(state, seat, gameId)`), `rng` → `0` |
| `players[i].hand` (i ≠ seat) | aynı uzunlukta `null` dizisi |
| `decks.yol`, `decks.ahlak`, `decks.ticaret` | aynı uzunlukta `null` dizisi (sıra gizli) |
| `decks.yolDiscard`, `decks.ahlakDiscard` | açık (masada görünür) |
| `players[i].task` | açık (ticaret kartı kurulumda açık dağıtılır) |
| `pending.trade.give` | yalnız `from` ve `to` için açık, diğerlerine `null` |
| `pending.road.offers[].cards` | açık (masaya konan kartlar) |

`seat = null` view'ı izleyici view'ıdır: hiçbir el görünmez.

`eventsFor(events, seat)` şunları yapar:
- `swap` event'indeki `give`/`want` kart id'leri yalnız iki tarafa açıktır, diğerlerine `null` gider.
- `refill` yalnız sayı taşır (zaten öyle).
- `task` event'indeki yeni görev kartı açıktır.

**Test şartı (değişmez):** Fuzz testi 500 rastgele oyunun her adımında, koltuğun kendi eli dışındaki hiçbir yol kartı id'sinin ve hiçbir deste sırasının `JSON.stringify(viewFor(...))` ve `eventsFor(...)` içinde geçmediğini doğrular.

Botlar da `viewFor(state, botSeat)` + `legalActions(state)` ile karar verir. "Zor" bot hile yapamaz.

## 7. Oda yaşam döngüsü

```mermaid
stateDiagram-v2
  [*] --> lobby: POST /api/rooms
  lobby --> lobby: hello · ready · addBot · removeSeat · setOptions
  lobby --> game: start (≥2 koltuk, insanlar hazır)
  game --> game: act · bot alarmı · süre aşımı
  game --> over: phase==='over'
  over --> game: rematch (insanların çoğu oy verdi) · yeni seed, aynı koltuklar
  lobby --> [*]: 24 sa boşta · alarm → storage.deleteAll
  over --> [*]: 24 sa boşta
  lobby --> [*]: hiç insan katılmadı · 1 sa
  game --> [*]: 24 sa hiç bağlantı yok
```

**Zamanlayıcılar.** Oda başına tek `setTimeout` vardır, en yakın son tarihe kurulur (`hub`). Saf `room.tick(now)` vadesi gelen işleri döner:

| Olay | Süre | Ne olur |
|---|---|---|
| Bot sırası | 700 ms (ahlak sonrası 1200 ms) | `botAction(viewFor(bot), legal, level)` uygulanır. |
| Tur süresi (`turnSeconds>0`) | 30/60/120 sn | Süre dolunca o oyuncu için **Orta** bot bir aksiyon oynar. Log satırı: "süre doldu, otomatik oynandı". |
| Cevap süresi (takas/yol katkısı) | 20 sn | Otomatik ret ya da `contribute []`. |
| Kopan bağlantı (oyunda) | 30 sn tolerans | Koltuk `takeover:true` olur, Orta bot oynar. Oyuncu token ile dönünce geri alır. |
| Kopan bağlantı (lobide) | 30 sn tolerans | Koltuk düşer; host ise devredilir. |
| Boşta oda | 24 sa | Bellekten ve diskten silinir. |
| Hiç insan katılmamış oda | 1 sa | Silinir (terk edilmiş `POST /api/rooms` çağrıları depoyu doldurmasın). |

**Kalıcılık.** Her başarılı mutasyondan sonra `/data/rooms/<kod>.json` atomik olarak yazılır (geçici dosya + `rename`). Snapshot `{lobby, state, version, log(son 200), deadlines}` içerir. Konteyner yeniden başlarsa açılışta diskteki odalar yüklenir; istemciler token ile aynı koltuğa döner. Yeniden dağıtım (deploy) en çok birkaç saniyelik kopma yaratır.

**Eşzamanlılık.** Node tek iş parçacıklıdır ve oda mesajları sırayla işlenir. `act.base !== version` ise `error{stale}` döner ve istemci son `game` mesajıyla yeniden senkronlanır.

## 8. Davet kodu

- Alfabe: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 karakter; 0, O, 1, I, L yok). Uzunluk 6, yani 887 503 681 kombinasyon.
- Kodu `POST /api/rooms` üretir. Oda haritasında varsa yeni kod denenir (en çok 5 deneme).
- Rate limit: IP başına dakikada 10 oda (bellek içi token bucket; IP, Traefik'in `X-Forwarded-For` başlığından okunur).
- Paylaşım: Web Share API ve panoya kopyalama. Link: `https://ahilik.ssilistre.dev/?oda=K7M2QX`. Link açılınca katılma ekranı kodu otomatik doldurur.
- Koda katılmak için kod yeterlidir; şifre yoktur. Kod bilinmeden odaya girilemez. Oyun başladıktan sonra yeni insan katılamaz; yalnız token sahibi geri dönebilir.

## 9. Bot seviyeleri

İmza: `botAction(view, legal, level)`. Saf ve deterministiktir; rastgelelik yalnız `view.gameId`, `view.turn`, `view.movesThisTurn`, `view.offersThisTurn`, `view.roadTries` ve `legal.length` değerlerinden türetilir; aynı view aynı kararı verir.

| Seviye | Davranış | Hedef (sim, 4p, koltuk döndürmeli, 2000 oyun) |
|---|---|---|
| Kolay | %60 ilerleyen hamle, kalanı rastgele yasal hamle. Takas teklif etmez, yol açmaz. Gelen takası %50 kabul eder. Yazıyı %70 okur. | Orta'ya karşı kazanma ≤ %20 |
| Orta | Bugünkü bot v4 (BFS + basit takas/yol) | Referans |
| Zor | Rozet ekonomisi (çarpan eşikleri), liderin yolunu kapatma, kargo zamanlaması, yol açma değeri, bir adımlık ileri bakış | Orta'ya karşı kazanma ≥ %40 (4 oyuncuda adil pay %25) |

Bekleme süresi seviyeden bağımsızdır (700 ms). Hızı ayarlardan oyuncu seçer.

## 10. Ekran akışı (menü / UX)

```mermaid
flowchart TD
  Boot([Açılış]) --> Splash["Yükleniyor<br/>logo + ilerleme"]
  Splash --> Deep{"?oda= linki?"}
  Deep -- evet --> Join
  Deep -- hayır --> First{"İlk açılış?"}
  First -- evet --> Profile["Profil: adın + karakterin"]
  First -- hayır --> Menu
  Profile --> Menu["ANA MENÜ<br/>Devam Et* · Botlarla Oyna · Arkadaşlarla Oyna<br/>Aynı Telefonda · Nasıl Oynanır? · Ayarlar"]
  Menu --> BotSetup["Botlarla Oyna<br/>bot sayısı 1–5 · her bota Kolay/Orta/Zor<br/>kim başlar"]
  Menu --> Friends["Arkadaşlarla Oyna"]
  Friends --> Create["Oda Kur"] --> Lobby
  Friends --> Join["Koda Katıl<br/>6 harfli kod"] --> Lobby["LOBİ<br/>büyük kod + Paylaş · koltuklar<br/>host: bot ekle/seviye, at, ayarlar, Başlat<br/>misafir: Hazırım"]
  Menu --> Local["Aynı Telefonda<br/>2–6 isim · kim başlar"]
  Menu --> HowTo["Nasıl Oynanır?<br/>8 resimli kart + interaktif eğitim"]
  Menu --> Settings["Ayarlar<br/>ses · müzik · titreşim · bot hızı<br/>yazı boyutu · animasyon · eğitim · kaydı sil"]
  BotSetup --> Game
  Local --> Game
  Lobby --> Game["OYUN<br/>HUD · tahta · el · süre halkası · tepkiler"]
  Game --> Pause["Duraklat<br/>Devam · Kurallar · Ayarlar · Oyundan Çık"]
  Pause --> Game
  Pause -->|onaylı| Menu
  Game --> End["OYUN SONU<br/>kürsü · çarpan açıklaması · istatistik<br/>Tekrar Oyna · Ana Menü"]
  End -->|online: rematch oylaması| Game
  End --> Menu
```

- Yönlendirme `history.pushState` ile yapılır. Android geri tuşu bir önceki ekrana döner. Oyundayken geri tuşu Duraklat menüsünü açar.
- Ekranlar HTML/CSS'tir (`src/menu.js`), tahta arka planda bulanık durur. `src/ui.js` yalnız oyun içi katmandır.

## 11. Dağıtım

```mermaid
flowchart LR
  Dev["dal + PR"] --> CI["GitHub Actions<br/>node --test · docker build"]
  CI -->|main'e merge| Hook["Dokploy webhook"]
  Hook --> Build["docker build (Dockerfile)"]
  Build --> Prod["Uygulama: ahilik.ssilistre.dev<br/>Traefik TLS · /data birimi"]
  Prod --> Smoke["Dağıtım sonrası smoke testi<br/>GET / 200 · /api/health 200 · WS hello"]
  Pages["GitHub Pages (eski)"] -.->|"geçiş sonrası yönlendirme"| Prod
```

- **İmaj:** kökte `Dockerfile` (node:22-alpine). `server/package.json` içindeki `ws` kurulur (`npm ci --omit=dev`). Web varlıkları imaja kopyalanır; `.dockerignore` `test/`, `docs/`, `.wt/`, `assets-src/`, `*.pdf`, `dev/` dizinlerini dışarıda bırakır.
- **Statik sunum:** `server/index.js` yalnız beyaz listedeki yolları sunar (`index.html`, `style.css`, `sw.js`, `manifest.webmanifest`, `src/`, `assets/`). Dizin gezintisi ve `..` reddedilir. `?v=` sorgusu yok sayılır, `Cache-Control` ayarlanır.
- **Dokploy:** "Application" türü, GitHub kaynağı, `main` dalı, Dockerfile build, otomatik deploy. Kalıcı birim `/data`. Alan adı `ahilik.ssilistre.dev` (Let's Encrypt). Panel ve API anahtarı bilgisi yalnız yerel geliştirici notlarındadır, repoya ve issue'lara yazılmaz.
- **DNS:** Cloudflare `ssilistre.dev` bölgesinde `ahilik` kaydı Dokploy sunucusuna gider (proxy kapalı ya da WebSocket destekli açık).
- **Yerel geliştirme:** `docker compose up` → `http://localhost:8080` (port doluysa başka port seçilir). Saf modül testleri host'ta `node --test` ile koşar (bağımlılık yok). `ws` gerektiren sunucu testleri konteynerde koşar: `docker compose run --rm server npm test`.
- **Service worker:** yalnız GET varlıklarını önbelleğe alır. `/api/*` ve `/ws/*` istekleri SW'yi atlar.

## 12. Güvenlik ve gizlilik

| Tehdit | Önlem |
|---|---|
| Başkasının koltuğundan aksiyon | Koltuk WS bağlantısına bağlıdır (soket nesnesinde tutulur). `act` yalnız `actor(state)===seat` ise işlenir. |
| Token çalınması | Token 128 bit rastgele (`crypto.randomUUID`), yalnız o odada ve yalnız oda yaşadıkça geçerli. HTTPS/WSS zorunlu. |
| Gizli el veya deste sızıntısı | `viewFor`/`eventsFor` + fuzz testi (§6). Seed istemciye gitmez. |
| Geçersiz aksiyon | Motor `apply` doğrular ve fırlatır, sunucu yakalar → `error{illegal}`. State değişmez. |
| Kaba isim | 1–16 karakter, NFC, kontrol karakteri yok, küçük yasaklı kelime listesi (TR). İsim her yerde `textContent` ya da `esc` ile basılır. |
| DoS | `ws` `maxPayload` 8 KB, mesaj sıklığı ≤ 20/sn, IP başına oda oluşturma limiti, oda başına ≤ 6 bağlantı, toplam oda üst sınırı (varsayılan 500). |
| Origin | WS upgrade'de `Origin` beyaz listesi: prod domain, localhost ve Capacitor origin'leri (`capacitor://localhost`, `https://localhost`). |
| Kişisel veri | Toplanmaz. Ad yalnız oda ömrü boyunca sunucuda durur. Gizlilik notu "Ayarlar → Hakkında" altında. |

## 13. Test stratejisi

| Katman | Araç | Kapı |
|---|---|---|
| Motor, view, bot, room | `node:test` (`test/*.test.js`) | `make olc` |
| Sürüm senkronu, fixture şeması | `node:test` | `make olc` |
| Bot seviyeleri ve denge | `make sim` (`test/sim.mjs`) | PR'a tablo eklenir, kapıda değil |
| Sunucu protokolü | `test/online.smoke.mjs`: `docker compose up` + Node global `WebSocket`, 2 insan + 2 bot tam oyun | `make qa` |
| UI | Playwright tek dosya, host Brave (`E2E_BROWSER_PATH`). Tek oyunculu tam tur + 2 sekmeli çevrimiçi lobi | `make qa` |
| Prod | Dağıtım sonrası smoke testi | CI |

## 14. Mobil (iOS / Android)

- **Kabuk:** Capacitor, `mobile/` klasöründe ayrı `package.json` ile (web oyunu build'siz kalır).
- **Uygulama paketi:** web varlıkları `mobile/www/` dizinine bir betikle kopyalanır. three.js CDN yerine uygulama içine gömülü (`vendor/three@0.160.0/`) importmap'le yüklenir; tek oyunculu mod uçak modunda çalışır.
- **Çevrimiçi mod:** `wss://ahilik.ssilistre.dev` adresine bağlanır. Sunucu Capacitor origin'lerini kabul eder.
- **Native:**
  - Haptik (`@capacitor/haptics`).
  - Android geri tuşu (`@capacitor/app` → yönlendirici).
  - Durum çubuğu ve safe-area.
  - Davet derin linki: `https://ahilik.ssilistre.dev/?oda=KOD`, iOS Universal Links ve Android App Links ile uygulamayı açar. Domain'de `/.well-known/apple-app-site-association` ve `/.well-known/assetlinks.json` sunulur.
- **Kimlik:** bundle id `dev.ssilistre.ahilikyolu`. Mağaza adı "Ahilik Yolu". Geliştirici ssilistre.dev.
- **Mağaza:** yaş sınırı 4+, veri toplanmaz (gizlilik etiketi "Data Not Collected"), gizlilik politikası URL'si `https://ahilik.ssilistre.dev/gizlilik`.
- **Sıra:** telefon işleri en son sprinttedir (S10).
