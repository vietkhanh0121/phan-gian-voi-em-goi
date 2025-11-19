/* ===== preload.js — Overlay đúng 1 lần, preload silent về sau (sprites + SFX) ===== */
(function () {
  let ONCE_DONE = false;            // chặn overlay lần 2
  let overlayEl = null;

  const OVERLAY_ID = 'preloadOverlay';
  const BAR_ID     = 'preloadBar';
  const TEXT_ID    = 'preloadText';

  /* =========================
     1) BUILD DECK IDS
     ========================= */
  function buildAllIds() {
    const ids = [];
    ['g', 'r', 'y'].forEach(s => { for (let n = 1; n <= 4; n++) ids.push(`${s}${n}`); });
    for (let n = 5; n <= 7; n++) ids.push(`k${n}`);
    return ids;
  }

  /* =========================
     2) IMAGE MANIFEST (SPRITES)
     ========================= */
  function buildImageManifest() {
    const FRONT_SRC = id => `assets/cards/${id}.png`;
    const BACK_SRC  = `assets/cards/back.png`;

    const fronts = buildAllIds().map(FRONT_SRC);

    // UI buttons / status / overlays… (chỉnh path theo project của bạn)
    const uiSprites = [
      'assets/ui/button.png',
      'assets/ui/button_off.png',

      'assets/ui/death_icon.png',
      'assets/ui/btn_close.png',
      'assets/ui/logo_game.png',
      'assets/ui/blood.png',

      'assets/ui/victory.png',
      'assets/ui/defeat.png',
    ];

    // Zone / turn / background sprites
    const zoneSprites = [
      'assets/zones/hand_zone.png',
      'assets/zones/my_turn_bg.png',
      'assets/zones/footer_bg.png',
      'assets/zones/opp_turn_zone.png',
      'assets/zones/my_turn_zone.png',
      'assets/zones/controls.png',
      'assets/zones/hand_zone.png',
      'assets/zones/appHeader.png',
    ];

    // Overlay-specific sprites (victim / guess / result / compare…)
    /*const overlaySprites = [
      'assets/overlays/guess_bg.png',
      'assets/overlays/victim_card_bg.png',
      'assets/overlays/victim_blood.png',
      'assets/overlays/result_bg.png',
      'assets/overlays/compare_bg.png',
    ];*/

    // Cho phép inject thêm sprite từ ngoài
    const injected = Array.isArray(window.EXTRA_PRELOAD_ASSETS)
      ? window.EXTRA_PRELOAD_ASSETS
      : [];

    return Array.from(new Set([
      BACK_SRC,
      ...fronts,
      ...uiSprites,
      ...zoneSprites,
      ...injected,
    ]));
  }

  /* =========================
     3) SFX MANIFEST (AUDIO)
     ========================= */
  function buildSfxManifest() {
    // Các SFX tên trùng với key đang dùng trong code:
    // card_deal, card_fly, card_choose, btn_click, victory, defeat, slash, flip
    // Nếu path khác, chỉnh lại cho đúng.
    const defaults = [
      'assets/sounds/card_deal.ogg',
      'assets/sounds/card_fly.ogg',
      'assets/sounds/card_choose.ogg',
      'assets/sounds/btn_click.ogg',
      'assets/sounds/victory.ogg',
      'assets/sounds/defeat.ogg',
      'assets/sounds/mark_click.ogg',
      'assets/sounds/slash.ogg',
      'assets/sounds/card_flip.ogg',
    ];

    const injected = Array.isArray(window.EXTRA_PRELOAD_SFX)
      ? window.EXTRA_PRELOAD_SFX
      : [];

    return Array.from(new Set([...defaults, ...injected]));
  }

  /* =========================
     4) OVERLAY UI
     ========================= */
  function ensureOverlay() {
    if (overlayEl) return overlayEl;

    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.innerHTML = `
        <div class="preloadBox">
          <div class="preloadTitle">Đang tải đồ hoạ & âm thanh…</div>
          <div class="preloadTrack"><div id="${BAR_ID}"></div></div>
          <div id="${TEXT_ID}">0%</div>
        </div>
      `;
      document.body.appendChild(el);
    }
    overlayEl = el;
    return el;
  }

  function setProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = document.getElementById(BAR_ID);
    const txt = document.getElementById(TEXT_ID);
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = pct + '%';
  }

  /* =========================
     5) LOW-LEVEL PRELOADERS
     ========================= */
  function _preloadImages(urls, onTick) {
    return Promise.all(
      (urls || []).map(src => new Promise(res => {
        if (!src) return res();
        const img = new Image();
        img.onload = img.onerror = () => {
          onTick && onTick();
          res();
        };
        img.src = src;
      }))
    );
  }

  function _preloadAudio(urls, onTick) {
    return Promise.all(
      (urls || []).map(src => new Promise(res => {
        if (!src) return res();

        const audio = new Audio();
        const finalize = () => {
          onTick && onTick();
          res();
        };

        audio.addEventListener('canplaythrough', finalize, { once: true });
        audio.addEventListener('error',          finalize, { once: true });

        audio.preload = 'auto';
        audio.src = src;

        // Một số browser cần gọi load() thủ công
        try { audio.load(); } catch (e) {}
      }))
    );
  }

  /* =========================
     6) PUBLIC: readyOnce (có overlay)
     ========================= */
  async function readyOnce() {
    if (ONCE_DONE) return;

    const overlay = ensureOverlay();
    overlay.classList.add('show');
    setProgress(0, 1);

    const imgManifest = buildImageManifest();
    const sfxManifest = buildSfxManifest();

    const total = imgManifest.length + sfxManifest.length;
    let done = 0;
    const tick = () => setProgress(++done, total || 1);

    // Preload song song: sprites + sfx
    await Promise.all([
      _preloadImages(imgManifest, tick),
      _preloadAudio(sfxManifest, tick),
    ]);

    // Ẩn overlay
    overlay.classList.add('fade');
    await new Promise(r => setTimeout(r, 180));
    overlay.remove();
    overlayEl = null;
    ONCE_DONE = true;
  }

  /* =========================
     7) PUBLIC: preloadList (silent)
     - Dùng cho preload thêm images về sau, không hiện overlay.
     - Nếu muốn preload SFX thêm, dùng EXTRA_PRELOAD_SFX trước khi readyOnce.
     ========================= */
  async function preloadList(urls) {
    if (!urls || !urls.length) return;
    await _preloadImages(urls); // không đụng overlay, không progress
  }

  window.GfxPreload = { readyOnce, preloadList };
})();
