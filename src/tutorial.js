// Çocuk dostu giriş: amaç kartları (intro), ilk turda canlı ipuçları (coach marks) ve "Nasıl Oynanır?" sayfası.
// ui.js sürer: tutorial.update(state, legal, events, els) her render'da çağrılır. DOM'u root içine kendisi ekler.
import { ILKELER, CARDS, CITIES } from './data.js';
import { store, KEYS } from './store.js';

const readFlags = () => store.get(KEYS.flags, {}, d => d && typeof d === 'object');
const readDone = () => readFlags().tutorialDone === true;
const writeDone = v => store.set(KEYS.flags, { ...readFlags(), tutorialDone: !!v });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const TEXT = {
  draw: 'Önce <b>Ahlak Kartı Aç</b> düğmesine dokun.',
  result: 'Bu ilkenin karelerine <b>rozet</b> kondu!',
  close: 'Bir kareyi kapatman gerek: <b>parlayan karelerden birine dokun.</b>',
  hand: '<b>Bir yol kartı seç.</b>',
  board: '<b>Parlayan kare</b> = gidebileceğin yer. <b>Altın noktalar</b> hedefe giden en kısa yol. <b>Bayrak</b> = hedef şehrin.',
  after: 'Harika! Kartın bitene kadar ilerleyebilirsin. Sonra <b>Turu Bitir</b>.',
  noMove: 'Hamle kalmadı. <b>Turu Bitir</b>\'e dokun.',
  noPass: 'Hareket edecek kartın yok. <b>Takas</b> dene ya da <b>Pas</b> de.',
  bots: 'Şimdi rakipler oynuyor. Ekrana dokunarak hızlandırabilirsin.',
};

// Örnek kart için hangi insanın verisi kullanılır (AHI-017): telefon bir insandaysa o; tek insanda hep o;
// çok insanda telefon kimsede değilse null (jenerik örnek, hiçbir elden kart alınmaz).
export function viewerPlayer(st, viewer) {
  const p = viewer != null ? st.players[viewer] : null;
  if (p && !p.bot) return p;
  const hs = st.players.filter(q => !q.bot);
  return hs.length === 1 ? hs[0] : null;
}

export function createTutorial(root, { art, url }) {
  let done = readDone(), coach = !done, introOpen = false, helpOpen = false;
  let seed = null, hadMove = false, quiet = 0, resultUntil = 0, step = null, poll = 0, timer = 0;
  let S = null; // son { st, legal, els }
  const img = (src, cls = '') => `<img class="${cls}" src="${src}" alt="" decoding="async" draggable="false">`;
  const coin = '<i class="ay-coin"></i>';
  const ilkeName = id => ILKELER[id]?.name ?? '';

  // ---------- Coach marks ----------
  const ch = document.createElement('div');
  ch.className = 'ay-coach'; ch.hidden = true;
  ch.innerHTML = '<i class="ay-dim"></i><i class="ay-dim"></i><i class="ay-dim"></i><i class="ay-dim"></i><div class="ay-spot"></div><div class="ay-bub"><div class="bt"></div><button class="bx" type="button">Rehberi kapat</button></div>';
  root.append(ch);
  const dims = [...ch.querySelectorAll('.ay-dim')], spot = ch.querySelector('.ay-spot'), bub = ch.querySelector('.ay-bub'), bt = ch.querySelector('.bt');
  ch.querySelector('.bx').addEventListener('click', () => finish());

  function finish() {
    coach = false; done = true; writeDone(true); clearTimeout(timer); refresh();
  }

  function derive() {
    if (!S || !coach || introOpen || helpOpen) return null;
    const { st, legal } = S, has = t => legal.some(a => a.type === t);
    if (st.phase === 'over' || S.els.blocked?.()) return null;
    if (st.players[st.active].bot) return hadMove ? 'bots' : null;
    if (has('readText') && st.players[st.active].pendingText) return null;
    if (st.phase === 'ahlak') return has('drawAhlak') ? 'draw' : null;
    if (Date.now() < quiet) return null; // ahlak reveal animasyonu bitsin
    if (st.phase === 'close') return 'close';
    hadMove = true;
    if (!legal.some(a => a.type === 'move' || a.type === 'kargo' || a.type === 'enterCity')) return has('endTurn') ? 'noMove' : has('pass') ? 'noPass' : null;
    if (st.movesThisTurn > 0) return 'after';
    if (S.els.selected()) return 'board';
    if (resultUntil > Date.now()) return 'result';
    return 'hand';
  }

  const R = el => { const r = el?.getBoundingClientRect(); return r && r.width ? r : null; };
  // Hedef dikdörtgen (viewport px) + baloncuk yeri.
  function target(name) {
    const { els } = S, H = innerHeight;
    if (name === 'draw') return R(els.acts.querySelector('[data-a="draw"]'));
    if (name === 'after' || name === 'noMove' || name === 'noPass') return R(els.acts.querySelector('[data-a="end"]') ?? els.acts.querySelector('[data-a="pass"]'));
    if (name === 'hand') { const r = R(els.fan); return r && { left: r.left, right: r.right, top: r.top + 18, bottom: Math.min(r.bottom, H), width: r.width, height: Math.min(r.bottom, H) - r.top - 18 }; }
    if (name === 'board' || name === 'close') {
      const hb = els.hud.getBoundingClientRect().bottom + 6, dr = els.dock.getBoundingClientRect(), desk = innerWidth > 900;
      const right = desk ? dr.left : innerWidth, bottom = desk ? H : dr.top;
      return { left: 6, right: right - 6, top: hb, bottom: bottom - 4, width: right - 12, height: bottom - hb - 4 };
    }
    return null; // result / bots: yüzen baloncuk
  }

  function place() {
    if (!S || !step) return;
    const { els } = S, desk = innerWidth > 900, W = desk ? els.dock.getBoundingClientRect().left : innerWidth, H = innerHeight;
    const r = target(step), floating = !r, inside = step === 'board' || step === 'close';
    const dim = step === 'board' || step === 'close' ? .5 : .62;
    spot.hidden = floating; dims.forEach(d => { d.hidden = floating; });
    if (r) {
      const o = ch.getBoundingClientRect(), pad = inside ? 0 : 6;
      const L = r.left - pad - o.left, T = r.top - pad - o.top, Wd = r.width + pad * 2, Hd = r.height + pad * 2;
      Object.assign(spot.style, { left: `${L}px`, top: `${T}px`, width: `${Wd}px`, height: `${Hd}px`, borderRadius: inside ? '18px' : '16px' });
      // Dört şerit: spot'un dışını karartır, içi (hedef) açık kalır. box-shadow yayılımı yerine, hafif ve tıklamaya kapalı.
      const box = [`left:0;top:0;width:100%;height:${T}px`, `left:0;top:${T + Hd}px;width:100%;bottom:0`, `left:0;top:${T}px;width:${L}px;height:${Hd}px`, `left:${L + Wd}px;top:${T}px;right:0;height:${Hd}px`];
      dims.forEach((d, i) => { d.style.cssText = `${box[i]};background:rgba(10,6,2,${dim})`; });
    }
    const bw = Math.min(W - 24, 300);
    bub.style.width = `${bw}px`;
    const bh = bub.offsetHeight, cx = r ? (r.left + r.right) / 2 : W / 2;
    const left = Math.max(12, Math.min(cx - bw / 2, W - bw - 12));
    let top, dir = '';
    if (floating) top = els.hud.getBoundingClientRect().bottom + 44;
    else if (inside) top = bh > r.height * .4 && r.bottom + bh + 16 < H ? r.bottom + 8 : r.bottom - bh - 10; // kareleri örtmesin: dar ekranda dock üstüne, değilse tahta altındaki boş zemine
    else if ((r.top + r.bottom) / 2 < H / 2) { top = r.bottom + 18; dir = 'up'; }
    else { top = r.top - bh - 18; dir = 'dn'; }
    top = Math.max(8, Math.min(top, H - bh - 8));
    bub.className = `ay-bub ${dir}`;
    bub.style.left = `${left}px`; bub.style.top = `${top}px`;
    bub.style.setProperty('--ax', `${Math.max(20, Math.min(cx - left, bw - 20))}px`);
  }

  function refresh() {
    const prev = step;
    step = derive();
    if (prev === 'bots' && step !== 'bots' && coach) { finish(); return; }
    ch.hidden = !step;
    if (!step) { clearInterval(poll); poll = 0; return; }
    if (step === 'bots' && prev !== 'bots') { clearTimeout(timer); timer = setTimeout(finish, 6000); }
    if (step !== prev) {
      bt.innerHTML = TEXT[step];
      if (!reduced()) bub.animate([{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 250, easing: 'ease-out' });
    }
    place();
    if (!poll) poll = setInterval(place, 350); // ponytail: sabit aralıkla yeniden konumla; layout olayı dinlemeye gerek yok
  }
  addEventListener('resize', () => step && place());

  // ---------- Amaç kartları (intro) ----------
  function slides(st, viewer) {
    const hp = viewerPlayer(st, viewer), tid = hp?.task, tc = tid ? CARDS[tid] : null, city = tc?.city ?? 'ankara';
    const yol = hp?.hand.find(id => CARDS[id]?.type === 'yol' && CARDS[id].ilke) ?? 'yol-comert-1', il = CARDS[yol].ilke;
    const fig = (src, cls, cap) => `<figure>${img(src, cls)}<figcaption>${cap}</figcaption></figure>`;
    return [
      { t: 'Sen bir tüccarsın!', p: 'Amacın: <b>görev kartındaki şehre git</b>, ticaret yap, para kazan.',
        a: `${fig(tid ? art(tid) : url('ticaret-ankara-2'), 'note', 'Görev kartın')}<span class="arr">➜</span>${fig(url(`city-${city}`), 'sq', CITIES[city].name)}` },
      { t: 'Yollar 7 ilkeyle döşeli', p: 'Elindeki yol kartı hangi ilkeyse, <b>piyonun o renkteki komşu kareye</b> gider.',
        a: `${fig(art(yol), 'tall', `Yol kartı: ${ilkeName(il)}`)}<span class="arr">➜</span><figure class="til" style="--c:${ILKELER[il].color}">${img(url(`ilke-${il}`), 'sq')}<figcaption>${ilkeName(il)} karesi</figcaption></figure>` },
      { t: 'Her turda 3 adım', p: 'Önce kart aç, sonra kartlarınla ilerle, sonra turu bitir.',
        a: `<figure class="st"><b>1</b>${img(url('ahlak-back'), 'sq s')}<figcaption>Ahlak kartı aç</figcaption></figure>
            <figure class="st"><b>2</b>${img(art(yol), 'tall s')}<figcaption>Kartlarınla ilerle</figcaption></figure>
            <figure class="st"><b>3</b><span class="ay-btn primary mock"><span class="ico">➜</span>Turu Bitir</span><figcaption>Sıra rakibe geçer</figcaption></figure>` },
      { t: 'Yolda rozet topla!', p: 'Oyun sonunda rozetler paranı <b>2, 3, 4, 5 katına</b> çıkarır. <b>En çok parası olan kazanır.</b>',
        a: `<div class="mult"><span class="big">${coin}</span>${[['5', 2], ['10', 3], ['15', 4], ['20', 5]].map(([n, m]) => `<span class="m"><small>${n} rozet</small><b>×${m}</b></span>`).join('')}</div>` },
    ];
  }

  function openIntro() {
    if (introOpen || !S) return;
    const list = slides(S.st, S.els.viewer?.()); let i = 0;
    introOpen = true; refresh();
    const el = document.createElement('div');
    el.className = 'ay-tut ay-p'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Oyunun amacı');
    el.innerHTML = '<div class="tt-card"><div class="tt-art"></div><h2></h2><p></p><div class="ay-dots"></div><div class="tt-btns"><button class="ay-btn" data-t="skip">Atla</button><button class="ay-btn primary big" data-t="next"></button></div></div>';
    const q = s => el.querySelector(s);
    const close = () => { el.remove(); introOpen = false; refresh(); };
    const show = (n, anim = true) => {
      i = Math.max(0, Math.min(n, list.length - 1));
      const s = list[i], last = i === list.length - 1;
      q('.tt-art').innerHTML = s.a; q('h2').textContent = s.t; q('p').innerHTML = s.p;
      q('.ay-dots').innerHTML = list.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('');
      q('[data-t=next]').textContent = last ? 'Hadi oynayalım!' : 'İleri';
      q('[data-t=skip]').hidden = last;
      if (anim && !reduced()) q('.tt-card').animate([{ opacity: .3, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'skip' || (i === list.length - 1)) close(); else show(i + 1);
    });
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) { if (dx < 0 && i < list.length - 1) show(i + 1); else if (dx > 0) show(i - 1); }
    }, { passive: true });
    show(0, false);
    root.append(el);
  }

  // ---------- "Nasıl Oynanır?" ----------
  const MULT = [['0–4', 1], ['5–9', 2], ['10–14', 3], ['15–19', 4], ['20+', 5]];
  const sec = (h, imgs, p) => `<section><h3>${h}</h3><div class="hs-art">${imgs}</div><p>${p}</p></section>`;
  function openHelp() {
    if (helpOpen) return;
    helpOpen = true; refresh();
    const t = S && viewerPlayer(S.st, S.els.viewer?.())?.task, city = t ? CARDS[t].city : 'ankara';
    const el = document.createElement('div');
    el.className = 'ay-tut ay-p help'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Nasıl Oynanır?');
    el.innerHTML = `<div class="tt-sheet"><div class="ay-sheethead"><b>Nasıl Oynanır?</b><button class="ay-btn sm" data-t="x">Kapat</button></div>
      <div class="hs-body">
      ${sec('🎯 Amaç', `${img(t ? art(t) : url('ticaret-ankara-2'))}${img(url(`city-${city}`))}`, 'Sen bir tüccarsın. <b>Görev kartındaki şehre</b> git, ticaret yap, para kazan. Şehre komşu kareye varınca <b>Şehre Gir</b> ile ticareti tamamla ya da yola devam edip rozet topla. Turu komşu karede bitirirsen ticaret kendiliğinden tamamlanır ve yeni görev gelir.')}
      ${sec('🔁 Tur sırası', `${img(url('ahlak-back'))}${img(url('yol-comert'))}`, 'Turun başında elin <b>6 karta tamamlanır</b>. <b>1)</b> Ahlak kartı aç. <b>2)</b> Yol kartlarınla ilerle (en az bir adım atmalısın). <b>3)</b> Turu bitir.')}
      ${sec('👥 2–6 oyuncu', `${img(url('logo'))}`, 'Oyun 2 ile 6 kişiyle oynanır. Başlarken <b>yaşı en küçük oyuncu</b> ilk başlar. Aynı telefonda birden çok insan varsa sıra değişince <b>"Telefonu ver"</b> ekranı çıkar.')}
      ${sec('🙈 Gizli el', `${img(url('yol-back'))}`, 'Kartların yalnız sana görünür. Başkalarının elinde <b>kaç kart</b> olduğunu görürsün ama hangi kartlar olduğunu görmezsin.')}
      ${sec('🧭 Hareket', `${img(url('yol-comert'))}${img(url('ilke-comert'))}`, 'Yol kartı hangi ilkeyse, piyonun <b>o ilkenin komşu karesine</b> gider (8 yön). Parlayan kareler gidebileceğin yerlerdir. Altın noktalar hedefe giden en kısa yoldur.')}
      ${sec('🪙 Rozetler', `${img(url('ahlak-comert'))}${img(url('ahlak-comert-neg'))}`, '<b>Olumlu ahlak kartı:</b> o ilkenin karelerine rozet konur, üstüne basan alır. <b>Olumsuz kart:</b> o ilkeden bir kare kapanır, 2 rozet ödersin.')}
      ${sec('🚧 Kapalı yol & yol açma', `${[0, 1, 2, 3].map(() => img(url('yol-adaletli'), 'sm')).join('')}`, 'Kapalı kareye girilemez. Kapalı kareye dokun, aynı ilkeden <b>0–4 kartını</b> seç (kartın yoksa da arkadaşlarına sorabilirsin; turda en çok 2 kez). 4\'e tamamlanmazsa sırayla diğer oyunculara sorulur: <b>ortak olmak isteyen</b> kart verir. Yol açılırsa herkes verdiği her kart için 1 rozet alır. Açılmazsa kimse kart kaybetmez.')}
      ${sec('⇄ Takas', `<span class="ay-btn mock"><span class="ico">⇄</span>Takas</span>`, 'Sırası gelen oyuncu bir rakibe <b>"Sende ... var mı?"</b> diye teklif eder: verdiğin kartı, oyuncuyu ve istediğin kart türünü seç. Rakip <b>kabul eder ya da reddeder</b>. Reddedilen teklif aynı turda tekrarlanamaz.')}
      ${sec('⏭ Pas', `<span class="ay-btn mock"><span class="ico">⏭</span>Pas</span>`, '<b>Pas</b> yalnız hiç hamle yapamıyorsan çıkar: elin atılır, 6 yeni kart çekersin ve sıra biter. Hamlen varsa pas geçemezsin.')}
      ${sec('✈ Kargo & Ahi Evran', `${img(url('yol-kargo'))}${img(url('yol-ahievran'))}`, '<b>Kargo uçağı:</b> turun başında, ahlak kartını açmadan da, hiç ilerlemeden kullan (önce oynarsan o tur ahlak kartı açılmaz); istediğin şehre uçarsın ve sıra biter. <b>Ahi Evran jokeri:</b> her ilkenin yerine geçer.')}
      <section><h3>🏆 Oyun sonu & puan</h3><p>Ahlak destesi biterse, ödül rozetleri tükenirse ya da ticaret destesi biterse oyun biter. <b>Kazanç = paran × rozet çarpanı.</b> En çok kazanan yenir.</p>
        <table class="hs-tab"><tr><th>${coin}Rozet</th>${MULT.map(m => `<td>${m[0]}</td>`).join('')}</tr><tr><th>Çarpan</th>${MULT.map(m => `<td><b>×${m[1]}</b></td>`).join('')}</tr></table></section>
      </div>
      <button class="ay-btn primary big" data-t="replay">Rehberi tekrar oynat</button></div>`;
    const close = () => { el.remove(); helpOpen = false; refresh(); };
    el.addEventListener('click', e => {
      if (e.target === el) return close();
      const b = e.target.closest('[data-t]'); if (!b) return;
      if (b.dataset.t === 'x') close();
      else if (b.dataset.t === 'replay') { close(); replay(); }
    });
    root.append(el);
  }

  function replay() {
    done = false; writeDone(false); coach = true; hadMove = false; resultUntil = quiet = 0; step = null;
    openIntro();
  }

  return {
    openHelp, replay,
    update(st, legal, events, els) {
      S = { st, legal, els };
      if (st.seed !== seed) {
        if (seed !== null && coach) { coach = false; done = true; writeDone(true); } // ilk oyun bitip yenisi başladı
        const first = seed === null; seed = st.seed; hadMove = false; resultUntil = quiet = 0;
        if (first && coach) openIntro();
      }
      for (const ev of events) {
        if (ev.type === 'ahlak' && !ev.empty && coach) {
          quiet = Date.now() + 2400; setTimeout(refresh, 2450);
          if (st.phase === 'move') { resultUntil = quiet + 3200; setTimeout(refresh, 5700); }
        }
      }
      refresh();
    },
  };
}
