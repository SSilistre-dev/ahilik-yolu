# Ahilik Yolu – "Ahlakın Yolu"

Ahiliğin 7 ilkesi üzerine kurulu aile ticaret kutu oyununun (İGİAD) tarayıcıda ve mobilde oynanan Three.js demosu.

Tanıtım videosu: https://www.youtube.com/watch?v=VQYzfQjJEro

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

Sürüm çıkarken `index.html` içindeki importmap'te `?v=` değerini artırın; aksi halde tarayıcı önbelleği eski modülleri yükleyebilir.
