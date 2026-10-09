# Ahilik Yolu — "Ahlakın Yolu" (dijital demo spesifikasyonu)

İGİAD'ın Ahiliğin 7 ilkesine dayanan aile ticaret kutu oyununun Three.js demosu.
Kaynak: kural kitabı (Haziran 2025) + tanıtım videosu (youtube.com/watch?v=VQYzfQjJEro).

## İlkeler

| id | Ad | Olumsuz | Renk |
|---|---|---|---|
| comert | Cömert | Cimri | #e8742a (turuncu) |
| merhametli | Merhametli | Acımasız | #f5a623 (sarı-turuncu) |
| tokgozlu | Tokgözlü | Açgözlü | #138a8a (petrol) |
| disiplinli | Disiplinli | Düzensiz | #7b3fa0 (mor) |
| adaletli | Adaletli | Haksız | #d0302b (kırmızı) |
| bilgili | Bilgili | Cahil | #5aa832 (yeşil) |
| durust | Dürüst | Yalancı | #2f5fb3 (mavi) |

## Tahta (5x5, [satır][sütun], satır 0 üstte)

```
ANKARA      merhametli  tokgozlu    durust      KIRSEHIR
bilgili     disiplinli  comert      adaletli    bilgili
durust      adaletli    merhametli  tokgozlu    disiplinli
disiplinli  comert      bilgili     durust      comert
KONYA       tokgozlu    merhametli  adaletli    KAYSERI
```

- Her ilkenin tam 3 karesi var (21 kare).
- Şehirler köşede. Her şehir 3 kareye komşu (yatay, dikey, çapraz).
- Çapraz eşler: Ankara↔Kayseri, Kırşehir↔Konya.
- Tahtanın altında 7 ilke için "En İyi Oyuncu Ödülü" alanı var. Her biri 4 rozetle başlar.

## Bileşenler

- **Yol kartı (57):**
  - Her ilkeden 7 kart (49).
  - 4 `ahievran`: joker, her ilkenin yerine geçer.
  - 4 `kargo`: yalnız tur başında, hiçbir hamle yapılmadan kullanılır. Piyon istenen şehre uçar ve sıra biter.
  - Her ilkenin 7 kartından 1'inde tanıtım yazısı var. Kartı kullanan oyuncu yazıyı sesli okursa +1 rozet alır.
- **Ahlak kartı (21):** her ilkeden 2 olumlu kart (14) ve her ilkeden 1 olumsuz kart (7).
- **Ticaret kartı (28):** her şehir için 4 adet 1M, 2 adet 2M ve 1 adet 3M kart.
- **Rozet:** gümüş 1 puan, altın 5 puan. Demo yalnız toplam puanı tutar.

## Kurulum

1. Her oyuncuya 6 yol kartı ve 1 açık ticaret kartı verilir.
2. Piyon, görev şehrinin çaprazındaki şehre konur.
3. Her ödül alanına 4 rozet konur.
4. En küçük oyuncu başlar.

## Tur

0. Oyuncu tur başında elini 6'ya tamamlayabilir (opsiyonel).
1. **Ahlak kartı aç (zorunlu).**
   - Olumlu kart açılırsa o ilkenin açık karelerine +1 rozet konur. Karede rozet varsa birikir.
     Karede piyon varsa rozeti o oyuncu hemen alır. Karede birden çok piyon varsa önce gelen alır.
   - Olumsuz kart açılırsa oyuncu o ilkenin, üzerinde piyon olmayan 3 karesinden birini kapatır.
     Karedeki rozetler kasaya gider. Kartı açan oyuncu 2 rozet öder (rozeti varsa).
2. **Piyonu ilerlet.**
   - Her yol kartı, piyonu 8 komşu kareden ilkesi eşleşen birine götürür.
   - Kapalı kareye girilemez. Piyonlar üst üste durabilir.
   - Girilen karedeki rozetler alınır.
   - Görev şehrine komşu bir kareye gelen oyuncu şehre varmış sayılır. Piyon şehre geçer,
     ticaret kartı kazanılır ve yeni görev çekilir.
     Yeni kart bulunduğu şehre aitse o görev de anında tamamlanır.
     Ticaret tamamlanınca hareket biter.
3. **Tur sonu:** el 6'ya tamamlanır. Yol destesi biterse ıskarta karıştırılır.

### Ara hamleler (yalnız aktif oyuncu yapabilir)

- **Takas:** başka bir oyuncuyla 1'e 1 kart değişimi.
- **Kapalı yolu açma:** o ilkeden 4 kart verilir (ortaklaşa da olur). 4 kart ve olumsuz kart ıskartaya gider.
  Ödül rozetleri, verilen kart sayısına göre paylaştırılır.
- **Pas:** oyuncu tüm elini atar, 6 yeni kart çeker ve sırası biter.

## Oyunun sonu

Oyun şu 3 durumdan biri olunca bitme aşamasına girer:
- Ahlak destesinin son kartı açılır.
- Ödül havuzlarının hepsi boşalır.
- Ticaret destesinin son kartı alınır.

Tur, ilk oyuncuya kadar tamamlanır.

## Puanlama

Kazanç = tamamlanan ticaretlerin toplam parası × çarpan.

| Rozet puanı | Çarpan |
|---|---|
| 0–4 | ×1 (varsayım) |
| 5–9 | ×2 |
| 10–14 | ×3 |
| 15–19 | ×4 |
| 20 ve üstü | ×5 |

Eşitlikte önce rozet puanına, sonra ticaret sayısına bakılır.

## Demo kararları (Fable 5.1 ile tartışıldı)

- Build yok, npm yok. Static `index.html` + ES modules.
  three.js `0.160.0` importmap ile `cdn.jsdelivr.net`'ten yüklenir. Proje GitHub Pages'te olduğu gibi çalışır.
- Varsayılan mod 1 insan + 1–3 bot. Eller açık; "cihazı ver" ekranı yok.
- Bot aptal: göreve BFS ile en kısa `move` yapar, yoksa `pass` eder.
  Bot takas, yol açma ve okuma yapmaz.
- Kargo kartı yalnız `phase==='move' && movesThisTurn===0` iken oynanır.
  Ahlak kartı açmak hamle sayılmaz. Kargo görev şehrine uçarsa ticaret tamamlanır.
- Ahi Evran jokeri hareket, yol açma ve takasta her ilke yerine geçer.
- `openRoad {tile}` aksiyonunun katkılarını engine deterministik hesaplar.
  Önce aktif oyuncunun eşleşen kartları (joker dahil) alınır. Kalanı koltuk sırasıyla diğer oyunculardan tamamlanır.
  Tam 4 kartta durulur. Aktif oyuncu en az 1 kart vermelidir.
  Ödül 1 kart = 1 rozettir ve havuzdan verilir.
- Ahlak kartıyla konan rozetler kasadan gelir (sınırsız). Ödül havuzu yalnız yol açınca boşalır.
- Şehir kareleri hamle hedefi değildir. Görev şehrine komşu kareye basılınca piyon otomatik olarak şehre geçer.
- Elin 6'ya tamamlanması `endTurn` ve `pass` içinde otomatik yapılır. Ayrı `refill` aksiyonu yok.
- Grafik prosedüreldir: 7 ilke için CanvasTexture kullanılır. Bitmap ve PDF varlık kullanılmaz.
  Kartlar, el ve log HTML'dir. 3B sahnede yalnız tahta, piyonlar, rozetler ve kapalı kare engelleri var.
- Mobil kuralları:
  - OrbitControls yok. Kamera sabit eğik açılı.
  - Tap ile drag, 8px eşiğiyle ayrılır.
  - Canvas'ta `touch-action:none` kullanılır.
  - Render talep üzerine yapılır; sürekli loop yok.
  - Gölge yok, `MeshLambertMaterial` kullanılır, DPR en çok 1.5.

## Sözleşme (dondurulmuş)

Statik veriler `src/data.js` içinde: `ILKELER`, `ILKE_IDS`, `CITIES`, `BOARD`, `neighbors`, `CARDS`, `HAND_SIZE`, `AWARD_START`, `PLAYER_COLORS`.
Kartlara her yerde `cardId` ile başvurulur.

```js
state = {
  seed, rng,                       // rng: mulberry32 internal uint32
  phase: 'ahlak'|'close'|'move'|'over',
  turn, active, startIdx,          // turn counter, active player idx, first player idx
  endgame: false,                  // end triggered; game ends when turn wraps to startIdx
  movesThisTurn: 0,
  pendingClose: null,              // ilke id while phase==='close'
  tiles: [25]{ idx, r, c, kind:'city'|'ilke', ilke, city, closed:false, closedBy:null, badges:0, occupants:[pIdx] }, // occupants ordered by arrival
  awards: { [ilke]: 4 },
  players: [{ name, color, bot, pos /*tile idx*/, hand:[cardId], task /*ticaret cardId|null*/, trades:[cardId], badges:0, pendingText:null /*cardId*/ }],
  decks: { yol:[], yolDiscard:[], ahlak:[], ahlakDiscard:[], ticaret:[] },
}
```

`src/game.js` saf modüldür; DOM ve three kullanmaz. `apply` girdiyi değiştirmez (`structuredClone`).
- `newGame({ players:[{name,bot}], seed }) -> state`
- `legalActions(state) -> Action[]`
- `apply(state, action) -> { state, events }`. Her event `{ type, text, ...detay }` şeklindedir; `text` Türkçe log satırıdır.
- `score(state) -> [{ pIdx, money, badges, mult, total, rank }]` (rank'e göre sıralı)

Aksiyonlar:
`{type:'drawAhlak'}` · `{type:'closeTile',tile}` · `{type:'move',card,tile}` · `{type:'kargo',card,city}` · `{type:'readText'}` · `{type:'trade',withPlayer,give,want}` · `{type:'openRoad',tile}` · `{type:'pass'}` · `{type:'endTurn'}`

`src/bot.js`: `botAction(state) -> Action`.

`src/scene.js`: `createScene(canvas, { onTileTap(idx) }) -> { render(state, { highlight:[idx] }), dispose() }`.
Animasyon önceki ve yeni state farkından türetilir.

`src/ui.js`: `createUI(root, { onAction(action), onTileHighlight(idxs) }) -> { render(state, legal, events) }`.

`src/main.js` + `index.html`: entegrasyon katmanı. Bu dosyaları yalnız entegratör yazar.

`fixtures/*.json`: elle hazırlanmış state'ler. Scene ve ui engine olmadan bunlarla geliştirilir.

## v2: "gerçek oyun" sözleşmesi (Fable 5.1 ile tartışıldı, 2026-10-09)

- **Sanat yönü:** Anadolu kervan dioraması.
  - İlke kareleri taş adacıklardır. Üst yüzde basılı ilke karakteri (`assets/cards/ilke-<ilke>.jpg`) durur, yanında ilkeyi simgeleyen bir 3D obje bulunur.
  - Şehirlerde simge yapılar var: Ankara Kalesi, Kırşehir türbesi, Konya kubbesi, Kayseri kümbeti.
  - Piyonlar KayKit tüccar karakterleridir, idle ve walk animasyonları var.
  - Rozetler KayKit gümüş/altın paralarıdır.
- **Asset'ler:** yalnız CC0 (KayKit, Kenney, Quaternius) ve İGİAD basılı sanatı.
  - Ham indirmeler `assets-src/` altında tutulur ve repoya girmez.
  - Kullanılan dosyalar `assets/models/`, `assets/cards/` ve `assets/sfx/` altındadır.
  - Lisanslar `assets/LICENSES.md` ve `assets/LICENSE-ART.md` dosyalarında.
- **Mobil bütçe:**
  - İlk yük ≤ 6 MB (modeller ≤ 3 MB, kart görselleri ≤ 2.5 MB).
  - ≤ 120k üçgen, ≤ 60 draw call. Tekrarlayan objeler InstancedMesh veya merge ile çizilir.
  - Gölge yalnız piyonlarda ve simge yapılarda, shadow map 1024. DPR en çok 1.5.
  - Render talep üzerine yapılır; animasyon sürerken loop çalışır.
- **Model yüklenemezse** manifestteki `fallback` primitifi çizilir. Oyun hiçbir zaman bloklanmaz.
- **Kart UI HTML/CSS'tir:** kart yüzü basılı görseldir, el yelpaze düzenindedir, ahlak kartı flip animasyonuyla açılır.

### API eklemeleri

- `src/assets.js` (sahibi scene):
  `export const MODELS = { key: { url, scale, rotation:[x,y,z], offset:[x,y,z], fallback:'box'|'cylinder'|'cone'|'sphere' } }`
  ve `export const CARD_ART = (cardId) => url`.
- `src/scene.js`:
  ```
  createScene(canvas, { onTileTap, onProgress(p) }) -> {
    ready: Promise,
    render(state, { highlight:[idx], focus: idx|null }),
    projectTile(idx) -> { x, y },   // CSS px, viewport koordinatı
    dispose()
  }
  ```
  `focus` verilirse kamera o kareye yumuşak pan ve zoom yapar; null ise tüm tahta görünür.
- `src/ui.js`: mevcut API korunur. Eklenen metodlar:
  - `setLoading(p)`: 0..1 arası ilerleme, 1 olunca yükleme ekranı gizlenir.
  - `flyCoins({ x, y }, pIdx, n)`: ekran noktasından oyuncu çipine para uçurur.
  - Ahlak reveal'ı ui kendisi oynatır; `events` içinde `type:'ahlak'` görünce başlar.
- `src/sfx.js` (sahibi glue): `createSfx() -> { unlock(), play(name) }`.
  `name` değerleri: `click`, `card`, `coin`, `step`, `close`, `open`, `trade`, `win`.
  İlk kullanıcı dokunuşunda `unlock()` çağrılır (iOS).
- `src/main.js` (glue), event → efekt eşlemesi:
  - `badges` → `flyCoins(projectTile(tile), pIdx, n)` + `coin` sesi
  - `move` → `step` sesi
  - `ahlak` → `card` sesi
  - `close` → `close` sesi
  - `openRoad` → `open` sesi
  - `trade` → `trade` sesi
  - `over` → `win` sesi
  - Aktif insan oyuncunun piyonu `focus` olarak verilir.

## v3: UX sözleşmesi (Fable 5.1 UX denetimi, 2026-10-09)

Hedef: 7 yaşındaki bir çocuk "nereye gideceğim, şimdi ne yapacağım" sorusunu sormadan oynayabilmeli.

- **`src/path.js`** (sahibi glue, saf modül, yalnız `./data.js` import eder):
  `pathTo(state, pIdx) -> [tileIdx]`. Piyonun bulunduğu yerden görev şehrine komşu bir kareye giden en kısa yolu verir.
  Yalnız açık ilke kareleri üzerinden ve 8 yönde arar; eldeki kartlara bakmaz. Başlangıç karesi dahil değildir.
  Yol yoksa `[]` döner. `goalTile(state, pIdx)` görev şehrinin kare indeksini (yoksa null) döner.
- **Scene** `render(state, { highlight, goal, path })`:
  - `goal`: şehir karesi. Üstünde nabız atan bayrak ve halka çizilir.
  - `path`: yol kareleri ince, sıcak renkli bir izle gösterilir; highlight'tan zayıf, ondan ayırt edilebilir.
  - `focus` kaldırıldı (gelirse yok sayılır). Kamera her zaman bütün tahtayı gösterir.
  - `setInsets({ top, bottom })` (CSS px): tahta HUD ile dock arasındaki görünür alana sığdırılır, değişince kamera yumuşakça uyum sağlar.
- **UI** `createUI(root, { onAction, onTileHighlight, onLayout })`:
  - `onLayout({ top, bottom })`: HUD alt kenarını ve dock üst kenarını, viewport'a göre CSS px olarak bildirir. Ölçü değiştikçe çağrılır (ResizeObserver).
  - `tapTile`: önce kare. Seçili kart yokken parlayan kareye dokunulursa o kareye uyan kart oynanır. Önce ilke kartı, joker en son kullanılır.
  - `legal` içinde `{type:'undo'}` varsa "Geri Al" butonu gösterilir. Bu aksiyonu glue ekler ve kendisi işler.
  - `setHint(text|null)` yok; ipucunu UI, state ve legal'den kendisi türetir.
  - "Turu Bitir" butonu, oynanacak hamle varken ikincil görünür; hamle kalmayınca birincil olur ve nabız atar.
  - Aynı anda tek toast gösterilir. Hedef bandı ("Hedef: Kayseri · 2M" ve şehir görseli) üstte durur.
- **Glue** (`main.js`, `index.html`, `path.js`, `manifest.webmanifest`, `sw.js`, `assets/icons/`):
  - `pathTo` ve `goalTile` sonucunu yalnız insan oyuncu için scene'e verir.
  - `onLayout` değerini `scene.setInsets` ile sahneye geçirir.
  - Titreşim, undo yığını ve bot hızlandırma (bot sırasında dokununca sıradaki aksiyon hemen gelir) glue'dadır.
  - PWA: manifest ve service worker. Başlangıç ekranı hemen gelir; yükleme çubuğu yalnız "Oyuna Başla"dan sonra, sahne hazır değilse görünür.
  - Yatay modda "Telefonu dik tut" uyarısı gösterilir.

## v4: Kural kitabıyla birebir (2026-10-09)

Kaynak: `Kural Kitabı - Talha temmuz25.pdf` (12 sayfa). Bu bölüm "Demo kararları" ile çelişirse v4 geçerlidir.
Kural numaraları kitapçığın "Oyun Kuralları ve İstisnai Durumlar" listesindeki numaralardır.

### Kullanıcı kararları (2026-10-09)
- Görev şehrine varıp ticareti tamamlayan oyuncunun o turki hareketi biter (`moveDone`). Kalan kartlarla devam edemez.
- Ahi Evran jokeri kapalı yolu açarken 4 karttan biri yerine sayılır.
- **AÇIK SORU (oyun yazarına sorulacak):** Kargo Uçağı ahlak kartından önce mi oynanır?
  Kitapçık "sırasının başında, hiçbir hamle yapmamış olmalı" diyor; ahlak kartı açmak da 1. hamle sayılıyor.
  Cevap gelene kadar mevcut davranış kalır: ahlak kartından sonra, piyon hareket etmeden.

### Kurallar → davranış
- **Oyuncu sayısı:** 2–6 (kitapçık: en iyi 4, 5–6 esnetilmiş kural). `PLAYER_COLORS` 6 renk.
- **Başlayan:** yaşı en küçük oyuncu. `newGame({ players, seed, startIdx = 0 })`. UI başlangıçta sorar.
- **Gizli eller (Kurulum 2. adım):** insan, başka oyuncuların elini görmez; yalnız kart sayısını görür.
  Engine eli state'te tutar, gizlilik UI'nin işidir. `legalActions` başka oyuncunun elindeki kart id'lerini sızdırmaz.
- **Aynı cihazda çok insan (aile oyunu):** `players[].bot=false` olan birden çok oyuncu olabilir.
  Karar sırası bir insandan başka bir insana geçince UI "Telefonu X'e ver" perdesi gösterir; perde kalkmadan el görünmez.
- **Tur başında el tamamlama (kural 26):** sıra bir oyuncuya geçtiğinde, ahlak kartından önce eli 6'ya tamamlanır.
  `n>0` ise event `{type:'refill', pIdx, n}`. Tur sonunda da el 6'ya tamamlanır (3. hamle).
- **Piyon ilerletme zorunlu:** `endTurn` yalnız `movesThisTurn>0 || moveDone` iken yasaldır.
- **Pas (Pas Geçme Hamlesi):** yalnız `phase==='move'`, `movesThisTurn===0`, `!moveDone` ve yasal hiçbir `move`/`kargo` yokken yasaldır.
  Elin tamamı ıskartaya gider, 6 yeni kart çekilir, sıra biter.
- **Takas (kural 25, Kart Takası Hamlesi):** yalnız aktif oyuncu teklif eder. Karşı taraf kabul ya da ret eder.
  Aktif oyuncu karşının elini görmez: istenen şey kart id'si değil, türdür (`want`: ilke id'si, `'ahievran'` veya `'kargo'`).
  Aynı tur içinde aynı oyuncuya aynı `want` için reddedilmiş teklif tekrarlanamaz (`s.declined`).
- **Kapalı yolu açma (kural 16–17):** aktif oyuncu kendi elinden 1–4 uygun kart koyar (o ilke ya da joker).
  4'e ulaşmazsa diğer oyunculara koltuk sırasıyla (aktiften sonraki ilk oyuncudan başlayarak) sorulur. Her biri 0..eksik kadar kart verir.
  Toplam 4 olunca yol açılır: 4 kart ve olumsuz ahlak kartı ıskartaya gider, herkes verdiği kart sayısı kadar ödül rozeti alır.
  Herkese sorulduğu hâlde 4 olmazsa yol açılmaz, kimse kart kaybetmez (event `roadFailed`).
- **Rozet (kural 29):** `p.badges` toplam puandır. UI bunu altın = `floor(b/5)`, gümüş = `b%5` olarak gösterir.
- **Beraberlik:** önce rozet, sonra ticaret sayısı. Hepsi eşitse iki oyuncu da kazanır: `score` aynı `rank` verir.
- Değişmeyen ve doğrulanmış: ahlak kartı (olumlu, olumsuz, kapalı kareye rozet konmaz, karedeki ilk gelen alır), komşu 8 yön, hareket sınırı yok,
  piyonlar üst üste durabilir, zincirleme ticaret (kural 22), 3 bitiş koşulu ve turun ilk oyuncuya kadar tamamlanması, yazıyı okuma +1, ×2..×5.

### Sözleşme değişiklikleri
```js
state += {
  pending: null
    | { kind:'trade', from, to, give /*cardId*/, want /*kind*/ }
    | { kind:'road', tile, ilke, offers:[{ pIdx, cards:[cardId] }], ask /*pIdx sorulan*/, need /*eksik kart*/ },
  declined: [{ to, want }],   // bu turda reddedilen teklifler; tur sonunda sıfırlanır
}
```
- `export function actor(state) -> pIdx`: şu an karar vermesi gereken oyuncu.
  `pending.trade` için `to`, `pending.road` için `ask`, aksi hâlde `active`.
- `legalActions(state)` her zaman `actor`'ın aksiyonlarını döner. `pending` varken yalnız cevap aksiyonları döner.
- Kaldırılan aksiyon: `{type:'trade',withPlayer,give,want}`. (`trade` event'i ticaret tamamlama olarak kalır.)
- Yeni aksiyonlar:
  - `{type:'offerTrade', withPlayer, give, want}`: aktif oyuncu; `move` fazı, `!moveDone`.
  - `{type:'respondTrade', accept:true, card}` / `{type:'respondTrade', accept:false}`: `pending.to`.
    `card`, `want` türünde olmalı. Kabulde event `swap`, retde event `tradeDeclined {pIdx:to, from, want}`.
  - `{type:'openRoad', tile, cards:[cardId]}`: aktif oyuncu, 1–4 uygun kart.
  - `{type:'contribute', cards:[cardId]}`: `pending.ask`; `[]` = katılmıyorum. Uygun ve en çok `need` kart.
- Yeni event'ler: `refill {pIdx,n}`, `tradeOffer {from,to,give,want}`, `tradeDeclined`, `roadAsk {tile,ask,need}`, `roadFailed {tile}`.
  `openRoad` event'inin `contrib` alanı `[{pIdx, cards}]` olarak kalır.
- `botAction(state)`, `actor(state)` için karar verir:
  - takas teklifine ve yol katkısına cevap verir;
  - aktifken: yazıyı okur; ilerleyemiyorsa yolundaki eksik tür için takas teklif eder (verilen kart yoluna yaramayan kart olmalı);
  - kapalı yolu en az 2 kartla açmaya girişir; hamle yoksa pas.
  - Takas kabul: aldığı kart istediği kart kadar işine yarıyorsa ya da istenen kart yolunda gerekmiyorsa kabul eder.
  - Yol katkısı: rozet kazandırdığı için, kendi bir sonraki adımına gereken kart hariç verir.
- Glue: bot zamanlayıcısı `players[actor(state)].bot` ile karar verir. Undo yalnız `move` için ve yalnız `pending` yokken.
- Uygulamada eklenen alanlar: `offersThisTurn` ve `roadTries` (tur içi sayaçlar, `endTurn`'de 0; bot en çok 2 teklif, 1 yol denemesi yapar).
  `refill` event'i tur sonunda da çıkar. `game.js` ayrıca `WANT_KINDS` (9 tür) ve `wantKind(cardId)` export eder.
  Kendi türünü isteyen takas teklifi yasal değildir.
