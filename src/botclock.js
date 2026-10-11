// Bot hamle zamanlayıcısı (M09). Duraklatınca bekleyen iş iptal edilir, devamda tam bekleme yeniden başlar.
// DOM yok; zamanlayıcı enjekte edilir (test/pause.test.js).
export function createBotClock({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let task = null, id = null, paused = false;
  const stop = () => { if (id !== null) clearTimer(id); id = null; };
  const arm = () => { id = setTimer(() => { id = null; const t = task; task = null; t.fn(); }, task.ms); };
  return {
    schedule(fn, ms) { stop(); task = { fn, ms }; if (!paused) arm(); },
    pause() { paused = true; stop(); },
    resume() { paused = false; if (task && id === null) arm(); },
    cancel() { stop(); task = null; },
    get pending() { return !!task && !paused; },
    get paused() { return paused; },
  };
}
