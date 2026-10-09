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
