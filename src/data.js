// Static game data shared by engine, scene and ui. Frozen contract: do not change shapes.

export const ILKELER = {
  comert:     { name: 'Cömert',     neg: 'Cimri',    color: '#e8742a', text: 'Cömert insan paylaşmanın bereketine inanır. Paylaşınca hiçbir şey azalmaz. Sevgi, bilgi ve iyilik paylaştıkça çoğalır. Paylaşan herkes zenginleşir.' },
  merhametli: { name: 'Merhametli', neg: 'Acımasız', color: '#f5a623', text: 'Merhametli insan kimseye zarar vermez. Kırıcı sözlerden, kötü davranışlardan uzak durur. Çünkü kalp kırmanın yanlış olduğunu bilir ve bunu yapmaz.' },
  tokgozlu:   { name: 'Tokgözlü',   neg: 'Açgözlü',  color: '#138a8a', text: 'Tokgözlü insan, sahip olduklarıyla mutlu olur. Elindekiler için şükreder ve daha fazlasını istemez.' },
  disiplinli: { name: 'Disiplinli', neg: 'Düzensiz', color: '#7b3fa0', text: 'Disiplinli insan kendine söz verir, tutar. Zor olsa da pes etmez. Düzenlidir, işini zamanında yapar. Canı istemese bile sorumluluğunu yerine getirir.' },
  adaletli:   { name: 'Adaletli',   neg: 'Haksızlık Eden', color: '#d0302b', text: 'Adaletli insan herkese eşit davranır. En iyi arkadaşı bile haksızsa “Dur bakalım! Bu yaptığın doğru değil.” der. Tanımadığı biri bile haklıysa “Ben senin tarafındayım.” diyerek ona destek olur.' },
  bilgili:    { name: 'Bilgili',    neg: 'Cahil',    color: '#5aa832', text: 'Bilgili insan öğrendiklerini kullanır. Sadece okumakla kalmaz, dener ve uygular. Merak eder, araştırır, yeni şeyler öğrenmekten mutlu olur.' },
  durust:     { name: 'Dürüst',     neg: 'Yalancı',  color: '#2f5fb3', text: 'Dürüst insan, ne olursa olsun doğruyu söyler ve gerçeği savunur. Kendi zararına bile olsa yalan söylemez, gerçeği gizlemez.' },
};
export const ILKE_IDS = Object.keys(ILKELER);

export const CITIES = {
  ankara:   { name: 'Ankara',   tile: 0,  opposite: 'kayseri' },
  kirsehir: { name: 'Kırşehir', tile: 4,  opposite: 'konya' },
  konya:    { name: 'Konya',    tile: 20, opposite: 'kirsehir' },
  kayseri:  { name: 'Kayseri',  tile: 24, opposite: 'ankara' },
};

// 5x5 board, tile index = r*5 + c, row 0 at top (Ankara top-left).
const LAYOUT = [
  'ankara',     'merhametli', 'tokgozlu',   'durust',     'kirsehir',
  'bilgili',    'disiplinli', 'comert',     'adaletli',   'bilgili',
  'durust',     'adaletli',   'merhametli', 'tokgozlu',   'disiplinli',
  'disiplinli', 'comert',     'bilgili',    'durust',     'comert',
  'konya',      'tokgozlu',   'merhametli', 'adaletli',   'kayseri',
];
export const BOARD = LAYOUT.map((id, i) => ({
  idx: i, r: Math.floor(i / 5), c: i % 5,
  kind: CITIES[id] ? 'city' : 'ilke',
  ilke: CITIES[id] ? null : id,
  city: CITIES[id] ? id : null,
}));

export function neighbors(idx) {
  const r = Math.floor(idx / 5), c = idx % 5, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if ((dr || dc) && rr >= 0 && rr < 5 && cc >= 0 && cc < 5) out.push(rr * 5 + cc);
  }
  return out;
}

// Cards: static table, referenced by id everywhere (hands, decks).
// yol: 7 per ilke (first one has text), 4 ahievran (joker), 4 kargo.
// ahlak: 2 positive + 1 negative per ilke. ticaret: per city 4x1M, 2x2M, 1x3M.
export const CARDS = {};
for (const ilke of ILKE_IDS) {
  for (let i = 0; i < 7; i++) CARDS[`yol-${ilke}-${i}`] = { id: `yol-${ilke}-${i}`, type: 'yol', ilke, hasText: i === 0 };
  for (let i = 0; i < 2; i++) CARDS[`ahlak-${ilke}-${i}`] = { id: `ahlak-${ilke}-${i}`, type: 'ahlak', ilke, negative: false };
  CARDS[`ahlak-${ilke}-neg`] = { id: `ahlak-${ilke}-neg`, type: 'ahlak', ilke, negative: true };
}
for (let i = 0; i < 4; i++) {
  CARDS[`yol-ahievran-${i}`] = { id: `yol-ahievran-${i}`, type: 'yol', ilke: null, joker: true };
  CARDS[`yol-kargo-${i}`] = { id: `yol-kargo-${i}`, type: 'yol', ilke: null, kargo: true };
}
for (const city of Object.keys(CITIES)) {
  [1, 1, 1, 1, 2, 2, 3].forEach((value, i) => {
    CARDS[`ticaret-${city}-${i}`] = { id: `ticaret-${city}-${i}`, type: 'ticaret', city, value };
  });
}

export const HAND_SIZE = 6;
export const AWARD_START = 4;
export const PLAYER_COLORS = ['#d0302b', '#2f5fb3', '#5aa832', '#f5c518', '#e0479e', '#8a5a2b'];

// Karakterler (M04). model: MODELS anahtarı (assets.js); portre 2B: renk diski + glyph.
export const AVATARS = [
  { id: 'rogue_hooded', name: 'Kervancı', model: 'pawn0', color: '#d0302b', glyph: '🐪' },
  { id: 'knight', name: 'Yiğit', model: 'pawn1', color: '#2f5fb3', glyph: '🛡️' },
  { id: 'barbarian', name: 'Pehlivan', model: 'pawn2', color: '#5aa832', glyph: '💪' },
  { id: 'mage', name: 'Bilge', model: 'pawn3', color: '#f5c518', glyph: '📜' },
];
export const AVATAR_IDS = AVATARS.map(a => a.id);
export const NAME_MAX = 16;

// Oyuncu adı: NFC, boşluk teke iner, kontrol/sıfır genişlik/bidi karakterleri silinir, 16 kod noktası; boşsa null.
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u2069\u061C\uFEFF]/gu, '').trim();
  return s ? [...s].slice(0, NAME_MAX).join('').trim() : null;
}

// n koltuk için karakter listesi: `first` ilk, sonrası varsayılan sırayla (n karakterden fazlaysa başa sarar).
export function assignAvatars(n, first) {
  const order = AVATAR_IDS.includes(first) ? [first, ...AVATAR_IDS.filter(x => x !== first)] : AVATAR_IDS;
  return Array.from({ length: n }, (_, i) => order[i % order.length]);
}
