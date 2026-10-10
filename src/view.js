// Gizli bilgi süzgeci (ARCHITECTURE.md §6). Saf modül: DOM yok, three yok, import yok.
// Sunucu otoriterdir; istemci ve botlar tam state yerine yalnız bu çıktıyı görür.
const hide = (list) => list.map(() => null);

// seat: koltuk numarası ya da null (izleyici: hiçbir el görünmez). gameId: oyun başına opak dize.
export function viewFor(state, seat, gameId = 'local') {
  const v = structuredClone(state);
  delete v.seed;                 // deste sırasını türetmeye yarar
  v.gameId = gameId;
  v.rng = 0;
  v.players.forEach((p, i) => { if (i !== seat) p.hand = hide(p.hand); });
  for (const k of ['yol', 'ahlak', 'ticaret']) v.decks[k] = hide(v.decks[k]); // uzunluk açık, sıra gizli
  const pd = v.pending;
  if (pd?.kind === 'trade' && seat !== pd.from && seat !== pd.to) pd.give = null;
  return v;
}

// Olay listesini koltuk için süzer. Gizli kart kimlikleri taşıyan olaylar: swap ve tradeOffer.
export function eventsFor(events, seat) {
  return events.map((e) => {
    if (e.type === 'swap' && seat !== e.pIdx && seat !== e.withPlayer) return { ...e, give: null, want: null };
    if (e.type === 'tradeOffer' && seat !== e.from && seat !== e.to) return { ...e, give: null };
    return e;
  });
}
