# Ahilik Yolu – "Ahlakın Yolu"

Ahiliğin 7 ilkesi üzerine kurulu aile ticaret kutu oyununun (İGİAD) tarayıcıda ve mobilde oynanan Three.js demosu.

Tanıtım videosu: https://www.youtube.com/watch?v=VQYzfQjJEro

**Dijital uyarlama: [ssilistre.dev](https://ssilistre.dev)** tarafından tasarlandı ve geliştirildi. Oyun tasarımı ve basılı sanat İGİAD'a aittir (bkz. `assets/LICENSE-ART.md`).

## Çalıştırma

Build adımı ve bağımlılık yok. Herhangi bir statik sunucu yeterli:

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Test

```sh
node --test test/
```

## Yapı

| Dosya | Görev |
|---|---|
| `SPEC.md` | Kurallar, demo kararları, dondurulmuş sözleşme |
| `src/data.js` | Tahta, kartlar, ilkeler (statik) |
| `src/game.js` | Saf kural motoru |
| `src/bot.js` | Basit bot |
| `src/scene.js` | Three.js tahta sahnesi |
| `src/ui.js`, `style.css` | HTML arayüz katmanı |
| `src/main.js` | Entegrasyon |
| `dev/` | Sahne ve UI için fixture önizleme sayfaları |
| `docs/ARCHITECTURE.md` | Sistem mimarisi: çevrimiçi oda sunucusu, protokol, ekran akışı |
| `TASKS.md` | Denetim bulguları ve görev listesi |

Sürüm çıkarken `index.html` içindeki importmap'te `?v=` değerini artırın; aksi halde tarayıcı önbelleği eski modülleri yükleyebilir.

## Künye

- Dijital uyarlama, yazılım ve oyun deneyimi tasarımı: **ssilistre.dev** — https://ssilistre.dev
- Oyun tasarımı: Ahmet Ercan · Yayıncı: İGİAD
- 3B modeller ve sesler: CC0 (KayKit, Kenney, Quaternius), ayrıntı `assets/LICENSES.md`
