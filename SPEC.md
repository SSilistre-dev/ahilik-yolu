# Ahilik Yolu — "Ahlakın Yolu" (dijital demo spesifikasyonu)

İGİAD'ın Ahiliğin 7 ilkesine dayanan aile ticaret kutu oyununun Three.js demosu.
Kaynak: kural kitabı (PDF `Kural Kitabı - Talha temmuz25.pdf`, künye © Haziran 2025) + tanıtım videosu (youtube.com/watch?v=VQYzfQjJEro).

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

0. Tur başında el 6'ya tamamlanır (kural 26, zorunlu; `refill` event'i).
1. **Ahlak kartı aç (zorunlu).**
   - Olumlu kart açılırsa o ilkenin açık karelerine +1 rozet konur. Karede rozet varsa birikir.
     Karede piyon varsa rozeti o oyuncu hemen alır. Karede birden çok piyon varsa önce gelen alır.
   - Olumsuz kart açılırsa oyuncu o ilkenin, üzerinde piyon olmayan 3 karesinden birini kapatır.
     Karedeki rozetler kasaya gider. Kartı açan oyuncu 2 rozet öder (rozeti varsa).
2. **Piyonu ilerlet.**
   - Her yol kartı, piyonu 8 komşu kareden ilkesi eşleşen birine götürür.
   - Kapalı kareye girilemez. Piyonlar üst üste durabilir.
   - Girilen karedeki rozetler alınır.
   - Görev şehrine komşu bir kareye gelen oyuncu şehre `enterCity` aksiyonuyla girer: piyon şehre geçer,
     ticaret kartı kazanılır ve yeni görev çekilir (AHI-004, kural 20; bkz. v6).
     Yeni kart bulunduğu şehre aitse o görev de anında tamamlanır. Ticaret tamamlanınca hareket biter.
   - Oyuncu girmek yerine kartlarıyla yolu uzatıp rozet toplayabilir (kural 3–4). Tur sonunda hâlâ görev şehrine
     komşu karedeyse ticaret otomatik tamamlanır (kitap s.4 "el sonunda").
3. **Tur sonu:** el 6'ya tamamlanır. Yol destesi biterse ıskarta karıştırılır.

### Ara hamleler (yalnız aktif oyuncu yapabilir)

- **Takas:** başka bir oyuncuya teklif; karşı taraf kabul ya da ret eder (v4).
- **Kapalı yolu açma:** o ilkeden 4 kart verilir. Aktif oyuncu 0–4 kart koyar (hangi kartları vereceğini kendi seçer), kalanı koltuk sırasıyla diğer oyunculara sorulur (v4, v6). 4 kart ve olumsuz kart ıskartaya gider.
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
| 0–4 | ×1 (varsayım; kitap tablosu 5'ten başlar, s.5) |
| 5–9 | ×2 |
| 10–14 | ×3 |
| 15–19 | ×4 |
| 20 ve üstü | ×5 |

Eşitlikte önce rozet puanına, sonra ticaret sayısına bakılır.

## Demo kararları

- Build yok, npm yok. Static `index.html` + ES modules.
  three.js `0.160.0` importmap ile `cdn.jsdelivr.net`'ten yüklenir. Proje GitHub Pages'te olduğu gibi çalışır.
- Varsayılan mod 1 insan + 1–3 bot. Eller gizlidir (başkasının elinde yalnız kart sayısı görünür);
  aynı cihazda birden çok insan varsa "Telefonu X'e ver" perdesi çıkar (v4).
- Bot basittir: göreve BFS ile en kısa `move` yapar. Yazıyı okur, takas teklif eder, takas ve yol katkısına cevap verir,
  kapalı yolu açmaya girişir; hamle yoksa `pass` eder (v4, `src/bot.js`).
- Kargo kartı `phase==='ahlak'` ya da `phase==='move'` iken, `movesThisTurn===0` ve `!moveDone` ise oynanır
  (AHI-005, bkz. v6). Ahlak fazında oynanırsa o tur ahlak kartı açılmaz. Ahlak kartı açmak `movesThisTurn`'i artırmaz.
  Kargo görev şehrine uçarsa ticaret tamamlanır.
- Ahi Evran jokeri hareket, yol açma ve takasta her ilke yerine geçer.
- `openRoad {tile, cards}`: aktif oyuncu 0–4 uygun kartını (joker dahil, istediği kombinasyon) koyar. 4'e ulaşmazsa diğer oyunculara
  koltuk sırasıyla sorulur; her biri `contribute {cards}` ile 0..eksik kart verir. Ayrıntı v4 ve v6 bölümlerindedir.
  Ödül 1 kart = 1 rozettir ve havuzdan verilir. Kartsız başlatma ve tur sınırı: AHI-008, v6.
- Ahlak kartıyla konan rozetler kasadan gelir (sınırsız). Ödül havuzu yalnız yol açınca boşalır.
- Şehir kareleri hamle hedefi değildir. Görev şehrine komşu kareye basınca piyon şehre `enterCity` aksiyonuyla geçer
  ya da tur sonunda otomatik geçer (AHI-004, bkz. v6).
- Elin 6'ya tamamlanması tur başında (`refill`, kural 26) ve `endTurn`/`pass` içinde otomatik yapılır. Ayrı `refill` aksiyonu yok.
- Grafik v2'de değişti: basılı ilke görselleri (JPG) ve glTF modeller kullanılır (bkz. v2). Prosedürel CanvasTexture yalnız yedektir.
  Kartlar, el ve log HTML'dir.
- Mobil kuralları (v2 "Mobil bütçe" ile değişti: gölge piyon ve simgelerde açık, animasyon sürerken loop çalışır):
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
  moveDone: false,                 // v4: ticaret bitti, bu turda hareket kalmadı
  pending: null,                   // v4: bekleyen takas teklifi ya da yol katkısı sorusu (aşağıda)
  declined: [],                    // v4: bu turda reddedilen takas teklifleri [{to,want}]
  offersThisTurn: 0, roadTries: 0, // v4: tur içi sayaçlar (bot döngü koruması), endTurn'de 0
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
`{type:'drawAhlak'}` · `{type:'closeTile',tile}` · `{type:'move',card,tile}` · `{type:'kargo',card,city}` · `{type:'readText'}` · `{type:'offerTrade',withPlayer,give,want}` · `{type:'respondTrade',accept,card?}` · `{type:'openRoad',tile,cards}` · `{type:'contribute',cards}` · `{type:'pass'}` · `{type:'endTurn'}` · `{type:'enterCity'}`

`undo` ve `newGame` motor aksiyonu değildir; glue katmanı (`main.js`) işler. Aksiyonların koşulları v4 bölümündedir.

### Event listesi

`game.js`'in ürettiği tüm event tipleri (alanlar `pIdx` dışında tip başına):
`ahlak {pIdx,card,ilke}` · `badgePlaced {tile}` · `badges {pIdx,tile,n}` · `close {pIdx,tile,paid}` · `endgame` · `endTurn {pIdx}` · `kargo {pIdx,city}` · `move {pIdx,card,tile}` · `nearCity {pIdx,city}` · `openRoad {pIdx,tile,contrib}` · `over` · `pass {pIdx}` · `read {pIdx}` · `refill {pIdx,n}` · `roadAsk {tile,ask,need}` · `roadFailed {tile}` · `swap {pIdx,withPlayer,give,want}` · `task {pIdx,card?}` · `text {pIdx}` · `trade {pIdx,card,city,value}` · `tradeDeclined {pIdx,from,want}` · `tradeOffer {from,to,give,want}`

`src/bot.js`: `botAction(state) -> Action`.

`src/scene.js`: `createScene(canvas, { onTileTap(idx) }) -> { render(state, { highlight:[idx] }), dispose() }`.
Animasyon önceki ve yeni state farkından türetilir.

`src/ui.js`: `createUI(root, { onAction(action), onTileHighlight(idxs) }) -> { render(state, legal, events) }`.

`src/main.js` + `index.html`: entegrasyon katmanı. Bu dosyaları yalnız entegratör yazar.

`fixtures/*.json`: elle hazırlanmış state'ler. Scene ve ui engine olmadan bunlarla geliştirilir.

## v2: "gerçek oyun" sözleşmesi (2026-10-09)

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

## v3: UX sözleşmesi (UX denetimi, 2026-10-09)

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
- Görev şehrine girip ticareti tamamlayan oyuncunun o turki hareketi biter (`moveDone`). Kalan kartlarla devam edemez.
  (v6: şehre girmek `enterCity` ile ya da tur sonunda otomatik olur; komşu kareye gelmek hareketi bitirmez.)
- Ahi Evran jokeri kapalı yolu açarken 4 karttan biri yerine sayılır.
- **KARAR (kullanıcı, 2026-10-10, AHI-005, v6):** Kargo Uçağı ahlak kartından önce de oynanır. Kitapçık "sırasının başında, hiçbir hamle
  yapmamış olmalı" diyor; ahlak kartı açılmadan önce oynanırsa o tur ahlak kartı açılmaz. Ahlak kartından sonra, piyon hareket etmeden
  oynanması da sürer. Tasarımcı yanıtı gelirse ayrı issue.

### Kurallar → davranış
- **Oyuncu sayısı:** 2–6 (kitapçık: en iyi 4, 5–6 esnetilmiş kural). `PLAYER_COLORS` 6 renk.
- **Başlayan:** yaşı en küçük oyuncu. `newGame({ players, seed, startIdx = 0 })`. UI başlangıçta sorar.
- **Gizli eller (Kurulum 2. adım):** insan, başka oyuncuların elini görmez; yalnız kart sayısını görür.
  Engine eli state'te tutar, gizlilik UI'nin işidir. `legalActions` başka oyuncunun elindeki kart id'lerini sızdırmaz.
- **Aynı cihazda çok insan (aile oyunu):** `players[].bot=false` olan birden çok oyuncu olabilir.
  Karar sırası bir insandan başka bir insana geçince UI "Telefonu X'e ver" perdesi gösterir; perde kalkmadan el görünmez.
- **Tur başında el tamamlama (kural 26):** sıra bir oyuncuya geçtiğinde, ahlak kartından önce eli 6'ya tamamlanır.
  `n>0` ise event `{type:'refill', pIdx, n}`. Tur sonunda da el 6'ya tamamlanır (3. hamle).
- **Boş ahlak destesi:** deste boşken tur doğrudan `move` fazında başlar (`drawAhlak` yasal değil); `ahlak` event'i `{pIdx, empty:true, text}` taşır, kart yoktur. Event: `ahlak {pIdx,card,ilke,empty?}`.
- **Piyon ilerletme zorunlu:** `endTurn` yalnız `movesThisTurn>0 || moveDone` iken yasaldır.
- **Pas (Pas Geçme Hamlesi):** yalnız `phase==='move'`, `movesThisTurn===0`, `!moveDone` ve yasal hiçbir `move`/`kargo` yokken yasaldır.
  Elin tamamı ıskartaya gider, 6 yeni kart çekilir, sıra biter.
- **Takas (kural 25, Kart Takası Hamlesi):** yalnız aktif oyuncu teklif eder. Karşı taraf kabul ya da ret eder.
  Aktif oyuncu karşının elini görmez: istenen şey kart id'si değil, türdür (`want`: ilke id'si, `'ahievran'` veya `'kargo'`).
  Aynı tur içinde aynı oyuncuya aynı `want` için reddedilmiş teklif tekrarlanamaz (`s.declined`).
- **Kapalı yolu açma (kural 16–17):** aktif oyuncu kendi elinden 0–4 uygun kart koyar (o ilke ya da joker; v6: kartları kendi seçer, kartsız başlatabilir).
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
  - `{type:'openRoad', tile, cards:[cardId]}`: aktif oyuncu, 0–4 uygun kart (v6).
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

## v6: S2 kural uyumu (2026-10-10)

Kullanıcı kararı (2026-10-10): kural kitabına göre uygula. Bu bölüm v1–v5 ile çelişirse v6 geçerlidir.

### Şehre gir (AHI-004, kural 3–4, 20; kitap s.4)
- `nearGoal(p)`: `p.task` var ve piyonun komşu karelerinden biri görev şehrinin karesi.
- `move` komşu kareye girince ticareti tamamlamaz; yalnız `nearCity {pIdx,city}` event'i üretir. Hareket bitmez.
- `{type:'enterCity'}`: `phase==='move'`, `!moveDone` ve `nearGoal` iken yasal; `legalActions`'ta `readText`'ten sonra, `move`'lardan önce gelir.
  Ticaret tamamlanır, yeni görev çekilir (aynı şehirse zincirleme), `moveDone=true`. Sonra yalnız `readText` ve `endTurn` yasaldır.
  Komşu değilken `apply` fırlatır.
- `endTurn`, `pass` ve `kargo` tur kapanmadan önce `!moveDone && nearGoal` ise ticareti otomatik tamamlar.
  Piyon yoldan uzaklaşıp başka karede turu bitirirse teslim olmaz; risk oyuncunundur.
- Geri Al: `enterCity` geri alınamaz; komşu kareye `move` geri alınabilir (glue).

### Okuma fırsatı (AHI-007, kural 27/3)
- Okuma fırsatı (`pendingText`) yalnız sonraki `move`'da ve tur sonunda kapanır; ara hamleler (takas, yol açma, katkı cevabı, `enterCity`) onu silmez.
  Tek yuva: iki yazılı kartla art arda hareket eden oyuncu ilkini okumadıysa kaybeder.

### Yol açmada serbest kart seçimi (AHI-006, kural 16–17)
- `legalActions`, `openRoad` ve `contribute` için kartları **tür bazında** tüm kombinasyonlarla sunar. Tür: düz ilke kartı, yazılı ilke kartı (`ilke*`), joker.
  Aynı türden kartlar birbirinin yerine geçer; her tür için elin ilk kartları seçilir.
- Her boyutta ilk varyant eski varsayılandır (ilke kartları el sırasıyla, jokerler en sonda); varyantlar boyuta göre artan sıralıdır. `cards` dizisi bu sırayla dizilir.
- `contribute`: `[]` önce, ardından en çok `pending.need` kartlık varyantlar. Aksiyon şekilleri değişmedi; `apply` doğrulaması serbest alt kümeyi zaten kabul eder.
- UI kart seçici gösterir; bot varsayılan (en çok kartlı, ilk) varyantı seçer.

### Kargo ahlak kartından önce (AHI-005, kitap s.5)
- `kargo`, `phase==='ahlak'` iken de yasaldır (`movesThisTurn===0`, `!moveDone`, elde kargo kartı). Ahlak fazında oynanırsa ahlak destesine dokunulmaz,
  o tur ahlak kartı açılmaz ve sıra biter. Ahlak kartı açıldıktan sonra, piyon hareket etmeden oynanması da sürer (`phase==='move'`).
  Olumsuz kart açılıp `close` fazındayken oynanamaz.

### Kartsız yol çağrısı ve tur sınırı (AHI-008, kural 16–17)
- `openRoad {tile, cards:[]}` yasaldır (her kapalı kare için ilk varyant). Kartsız başlatan rozet almaz, kart verenler paylaşır; diğer oyunculara koltuk sırasıyla 4 kart sorulur.
  Hepsi reddederse ya da toplam 4'e ulaşmazsa `roadFailed`, kimse kart kaybetmez.
- Tur başına en çok 2 yol çağrısı: `roadTries < 2` iken `openRoad` yasaldır; `apply` aksi hâlde fırlatır. Kitapta yok; çevrimiçi rahatsız etmeyi önleyen dijital önlemdir (insan ve bot için aynı).

## Bilinçli sapmalar ve notlar (kitap ↔ dijital)

Maddeler AHI-009, AHI-010, AHI-029, AHI-030 ve AHI-008 ile eklenir.

- **Yol çağrısı sınırı (kural 16, s.4).** Kitapta sınır yoktur. Dijitalde aktif oyuncu bir turda en çok 2 yol açma çağrısı yapabilir (`MAX_ROAD_CALLS`). Gerekçe: her çağrı diğer oyunculara soru penceresi açar; sınırsız tekrar çevrimiçi oyunda rahatsız etme yolu olur (AHI-008).
- **Takas koşulu (kural 25, s.4).** Kitap takası "ihtiyacı olan yol kartı yoksa" şartına bağlar. Dijitalde aktif oyuncu `!moveDone` iken,
  ilerleyebiliyor olsa bile takas teklif edebilir. Bilinçli gevşetmedir: "ihtiyaç" öznel, karşı taraf reddedebilir, aynı tur aynı (oyuncu, tür)
  teklifi tekrarlanamaz. Testle sabitlendi: `test/takas-gevsetme.test.js`.
- **Sıra yönü (s.3).** Kitap "sağdan sola" der. Dijitalde koltuk sırası oyuncu listesi sırasıdır (0 → 1 → ... → 0); başlangıç ekranı
  sırayı bu listeyle gösterir. Yön yorumlanmaz (saat yönü mü tersi mi kitapta belirtilmemiş); 2+ insan seçiliyken başlangıç ekranı
  kitaptaki cümleyi hatırlatan tek satır gösterir.
- **Bitiş koşulları, ölçüm (bilgi).** Bot oyunlarında (2000 oyun/oyuncu sayısı, hepsi bot, `startIdx = seed % n`) bitişi ilk tetikleyen:

  | Oyuncu | Ahlak destesi | Ticaret destesi | Ödül havuzu |
  |---|---|---|---|
  | 2 | 1981 | 19 | 0 |
  | 3 | 1951 | 49 | 0 |
  | 4 | 1918 | 82 | 0 |
  | 5 | 1846 | 154 | 0 |
  | 6 | 1767 | 230 | 3 |

  "Ödül havuzları boşaldı" koşulu doğru çalışır (`test/game.test.js`, "all awards empty") ama pratikte nadirdir; kural kitabıyla aynıdır,
  değiştirilmez. İnsanlı oyunda oran farklı olabilir, ölçülmedi.
- **Rozet kasası (kural 29, s.2).** Kutuda 36 gümüş ve 16 altın rozet vardır. Dijitalde kasa sınırsızdır; kitap tükenme için kural koymadığından
  modellenmez (puan yalnız toplam rozet sayısıdır, gümüş/altın gösterimdir). Bot simülasyonunda (2000 oyun/oyuncu sayısı, 5'li yığınlar altına
  çevrilmiş varsayımıyla) eşzamanlı en çok rozet:

  | Oyuncu | Gümüş (ödül alanı hariç) | Altın | Gümüş (ödül alanı dahil) |
  |---|---|---|---|
  | 2 | 31 | 8 | 59 |
  | 3 | 34 | 8 | 62 |
  | 4 | 37 | 10 | 62 |
  | 5 | 39 | 10 | 66 |
  | 6 | 44 | 11 | 65 |

  Altın 16 sınırının altında kalır; gümüş sınırı (36) 4+ oyuncuda aşar, yani fiziksel kutu da bu oyunlarda sınırı zorlar.
  Varsayım: ödül alanı rozetleri gümüştür.

## v5: Çevrimiçi sözleşme (2026-10-10)

Kaynak: `docs/ARCHITECTURE.md` (onaylı). Bu bölüm v1–v4 ile çelişirse v5 geçerlidir. Kural davranışı değişmez; v5 yalnız "kim neyi görür" ve "oyun makineler arasında nasıl taşınır" sözleşmesidir.

### Modlar ve otorite
- Dört mod: botlarla (yerel), aynı telefonda (yerel), arkadaşlarla (çevrimiçi), çevrimiçi odada botlu (karma).
- Çevrimiçi modda **sunucu otoriterdir**: tam `state` yalnız sunucudadır. İstemci `view` alır, `act` yollar. İstemci kendi başına `apply` çağırmaz.
- `src/game.js` tarayıcıda ve sunucuda aynı dosyadır; `apply` girdiyi değiştirmez ve fırlatırsa state değişmez.

### View
```js
viewFor(state, seat, gameId) -> view   // seat: 0..5 ya da null (izleyici)
eventsFor(events, seat) -> events      // seat'e gösterilebilir event'ler
```
`view`, `state` ile aynı şekildedir; gizli alanlar boşaltılmıştır:

| Alan | View'da |
|---|---|
| `seed` | silinir; yerine `gameId` (oyun başına rastgele 12 karakter, `[a-z2-9]`) |
| `rng` | `0` |
| `players[i].hand`, `i !== seat` | aynı uzunlukta `null` dizisi |
| `decks.yol`, `decks.ahlak`, `decks.ticaret` | aynı uzunlukta `null` dizisi |
| `decks.yolDiscard`, `decks.ahlakDiscard` | açık |
| `players[i].task`, `players[i].trades` | açık |
| `pending.trade.give` | yalnız `from` ve `to` için açık, diğerlerinde `null` |
| `pending.road.offers[].cards` | açık |

`eventsFor`: `swap` event'indeki `give`/`want` kart kimlikleri yalnız iki tarafa açık, diğerlerine `null`; `refill` yalnız sayı taşır; `task` event'indeki yeni görev açıktır.
Değişmez test şartı: rastgele oyunun her adımında, bir koltuğun kendi eli dışındaki hiçbir yol kartı kimliği ve hiçbir deste sırası `JSON.stringify(view)` ve `JSON.stringify(eventsFor(...))` içinde geçmez.

### Bot imzası
`botAction(view, legal, level) -> Action`. `level`: `'easy' | 'medium' | 'hard'`. Bot yalnız kendi koltuğunun `view`'ını ve `legal` listesini görür; `legal`'i çağıran taraf tam state'ten `legalActions(state)` ile üretir. Bot saf ve deterministiktir: rastgelelik yalnız `view.gameId`, `view.turn`, `view.movesThisTurn`, `view.offersThisTurn`, `view.roadTries` ve `legal.length` değerlerinden türetilir. Aynı view aynı kararı verir (yerel ve sunucu oturumunda aynı).

### Koltuk, token, host
- Koltuk numarası `players[]` indeksidir (0–5). Lobide koltuklar sıkışık dizidir; bir koltuk kalkınca sonrakiler kayar ve etkilenen insanlara yeni `welcome` gider.
- İlk bağlanan insan host'tur. Host ayrılırsa en küçük numaralı çevrimiçi insana devredilir.
- Token: 32 onaltılık karakter (128 bit), yalnız o odada geçerli. İstemci `localStorage['ahilik.room.'+kod]` içinde saklar. Token hiçbir `lobby`/`game`/`emote` mesajında bulunmaz ve URL'ye konmaz.
- Aynı token ile ikinci bağlantı gelirse eski bağlantı `error{code:'replaced'}` ile kapatılır.
- Ad: NFC normalleştirilmiş, kırpılmış, 1–16 karakter, kontrol karakteri yok, yasaklı kelime listesi yok. Aynı ad ikinciye `" (2)"` ekiyle verilir (16 karaktere kırpılarak). `avatar`: 0–7 tamsayı.

### Protokol v1 (WebSocket, JSON, `/ws/<KOD>`)
Her mesaj `{ v:1, t:<tip>, ... }`. UTF-8 gövde en çok 8192 bayt; bağlantı başına saniyede en çok 20 mesaj. Aşan bağlantı `error{code:'rate'}` alır ve kapatılır. `hello` bağlantıdan sonra 10 sn içinde gelmezse bağlantı kapatılır.

İstemci → sunucu:

| t | alanlar | kim | koşul |
|---|---|---|---|
| `hello` | `token?`, `name`, `avatar` | herkes | İlk mesaj. Token varsa aynı koltuğa döner. |
| `ready` | `on:bool` | insan | Lobi. Host için yok sayılır (host her zaman hazır). |
| `addBot` | `level` | host | Lobi, boş koltuk var. Adı sunucu verir. |
| `setBot` | `seat`, `level` | host | Lobi, o koltuk bot. |
| `removeSeat` | `seat` | host | Lobi. Bot çıkar, insan atılır. Host kendini atamaz. |
| `setOptions` | `turnSeconds:0\|30\|60\|120`, `startSeat:'random'\|0..5` | host | Lobi. |
| `start` | – | host | ≥2 koltuk, tüm insanlar hazır. |
| `act` | `action`, `base:int` | actor | `phase:'game'`. `base` güncel `version` olmalı. `undo` kabul edilmez. |
| `emote` | `id` | oyuncu | `id` ∈ `selam, aferin, olsun, tesekkurler, hadi, dusunuyorum`. Koltuk başına 2 sn'de 1. |
| `rematch` | – | oyuncu | `phase:'over'`. |
| `leave` | – | oyuncu | Lobide koltuk kalkar; oyunda koltuk kalıcı Orta bot olur. |
| `ping` | – | herkes | 25 sn'de bir. |

Sunucu → istemci:

| t | alanlar | açıklama |
|---|---|---|
| `welcome` | `code`, `you:{seat, token}` | Katılma ve koltuk kayması sonrası. |
| `lobby` | `seats:[{seat,name,avatar,bot,level,ready,online,host}]`, `options`, `phase` | Lobi her değiştiğinde herkese. |
| `game` | `version`, `gameId`, `view`, `legal`, `events`, `deadline`, `now`, `seats`, `rematch` | Her aksiyondan sonra koltuk başına ayrı. `legal` yalnız sırası gelen koltuğa dolu, diğerlerine `[]`. `deadline`: sıradaki zamanlayıcının epoch ms değeri ya da `null`. `now`: sunucu saati (istemci farkı hesaplar). `seats`: herkese açık künye `{seat,name,avatar,bot,level,online,takeover}`. `rematch`: yalnız `phase:'over'`'da `{votes:[seat], need:int}`. |
| `emote` | `seat`, `id` | Herkese. |
| `error` | `code`, `msg` | Aşağıdaki kodlar. `msg` Türkçe, çocuğa gösterilebilir. |
| `pong` | – | `ping` cevabı. |

Hata kodları: `stale` (base eski), `illegal`, `notYourTurn`, `notHost`, `full`, `started`, `notFound`, `rate`, `tooBig`, `badMsg`, `badName`, `version` (protokol `v` desteklenmiyor), `kicked`, `replaced`, `expired`. Bağlantıyı kapatanlar: `full`, `started`, `notFound`, `rate`, `tooBig`, `version`, `kicked`, `replaced`, `expired`. `stale` sonrası sunucu güncel `game` mesajını ayrıca yollar.

### Oda yaşam döngüsü ve zamanlayıcılar
`lobby -> game -> over -> (rematch) game`, her aşamadan 24 saat hareketsizlikle silinir. Hareket: insandan gelen `ping` dışı mesaj, bağlanma, kopma. Hiç insan katılmamış oda 1 saat sonra silinir.

| Olay | Süre | Sonuç |
|---|---|---|
| Bot sırası | 700 ms; ahlak kartı sonrası 1200 ms | `botAction(viewFor(state, seat), legalActions(state), level)` uygulanır. |
| Tur süresi (`turnSeconds>0`) | 30/60/120 sn | Çevrimiçi insan süre aşarsa o turun kalanını Orta bot oynar; log: "süre doldu, otomatik oynandı". |
| Cevap süresi (takas/yol katkısı) | 20 sn | Takas reddedilir; yol katkısı `[]`. |
| Kopan bağlantı (oyunda) | 30 sn | Koltuk `takeover:true` olur, Orta bot oynar; oyuncu token ile dönünce `takeover:false`. |
| Kopan bağlantı (lobide) | 30 sn | Koltuk düşer; host ise devredilir. |
| Hiç insan çevrimiçi değil | – | Bot ve süre zamanlayıcıları durur; biri bağlanınca sürer. |
| Rematch | – | `votes*2 > çevrimiçi insan sayısı` ise yeni tohumla aynı koltuklar; başlayan koltuk bir kayar; `version` 1'e, `gameId` yenilenir. |

Sürüm: her başarılı `act` `version`'ı 1 artırır; oyun başında 1'dir. Sunucu aynı anda tek aksiyon işler.

### Session arayüzü (istemci)
```js
session = { mode:'local'|'online', you:seat|null, act(action), onUpdate(cb), undo?(), leave() }
// cb({ view, legal, events, meta:{ conn:'ok'|'reconnecting'|'lost', deadline:epochMs|null, seats } })
```
UI ve sahne `state` yerine `view` alır.

### Davet kodu
Alfabe `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 karakter), uzunluk 6 (887 503 681 kombinasyon). Giriş büyük/küçük harf duyarsızdır, boşluklar atılır. Link `https://ahilik.ssilistre.dev/?oda=KOD`. Oyun başladıktan sonra yalnız token sahibi katılabilir.

### HTTP
`POST /api/rooms` -> `201 {code}` (IP başına dakikada 10; aşımda `429 {error:'rate'}`; kod çakışması 5 denemede çözülmezse ya da toplam oda üst sınırı (500) dolduysa `503 {error:'busy'}`), `GET /api/rooms/<KOD>` -> `200 {exists, phase, humans, capacity, joinable}` (kod biçimi geçersizse `400 {error:'badCode'}`, dakikada 60 sorguyu aşınca `429`), `GET /api/health` -> `200 {ok:true, ...}` (N20 `startedAt`, N22 süreç metriği alanlarını ekler; istemciler yalnız `ok` alanına bağlanır). Tüm cevaplar `cache-control: no-store`. İstemci IP'si ters vekilin `X-Forwarded-For` başlığındaki en sağdaki girdidir (yalnız hız sınırı için, bellekte).

### v5 kural kararları

Kullanıcı kararı (2026-10-10): şu üç kural kural kitabına göre uygulandı; ayrıntı ve koşullar "v6: S2 kural uyumu" bölümündedir (AHI-004, AHI-005, AHI-008).
Kalan madde planlanandır.

- **Uzun oyun seçeneği (AHI-028, planlanan):** 5–6 oyuncuda isteğe bağlı "uzun oyun" ayarı; **varsayılan kapalı**. Ayrıntı (hangi sayılar değişir) AHI-028 ile bu bölüme eklenir; çevrimiçi odada `setOptions` ile host seçer, bunun için `options` alanı o issue'da genişler.
