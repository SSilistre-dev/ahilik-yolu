# Alt ajan brief şablonu

Ana oturum her görevde bunu doldurur. Alt ajan konuşmayı görmez; brief tek başına yeterli olmalı.
Boş bırakılan alan = ajanın uyduracağı alan.

```
GÖREV: <tek cümle, ölçülebilir sonuç>
NEDEN: <iş bağlamı; ajanın doğru varsayım yapması için 1–3 cümle>

ÇALIŞMA YERİ: <worktree mutlak yolu> · branch <ad>
KAYNAKLAR: DB=<test_<key>> · port=<NNNN> · compose projesi=<ad> · geçici dosya öneki=<is>- ($TMPDIR ortak) (başka kaynağa dokunma)

DOKUNABİLECEĞİN DOSYALAR:
- <yol>
- <yol> (yeni)
- <davranışı sabitleyen mevcut testler; `grep -rl <eski-anahtar> test/` ile bul, değişen davranışa göre güncellenir>
DOKUNMA:
- <yol / dizin / ortak config>

KORUNACAK DAVRANIŞ:
- <değişmemesi gereken çıktı/akış; varsa önce bunu sabitleyen test yaz>

KABUL ÖLÇÜTÜ (hepsi koşulup çıktı rapora yazılır):
1. `<tam kapı komutu>` → 0 fail
2. `<hedef test>` → önce kırmızı, sonra yeşil
3. `<statik analiz, yalnız değişen yollar>` → 0 yeni hata
4. <UI ise: Brave'de <URL> ekran görüntüsü, kendin bak, sonra sil>

SINIRLAR: git yazma yok · alt ajan açma yok · paylaşılan kaynak yok · ölçmeden sayı yok.
TAKILIRSAN: 2 farklı deneme sonrası çözemediysen DURUM: bloke yaz, denediğini ve hatanın karar satırını raporla.

RAPOR: AGENTS.md → "Alt ajan" → Rapor biçimi.
```
