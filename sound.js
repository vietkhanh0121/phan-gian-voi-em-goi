// ===== sound.js — Simple SFX Manager for Card Game =====
(() => {
  'use strict';

  const SOUND_PATHS = {
    deal:       'assets/sounds/card_deal.ogg',
    victory:    'assets/sounds/victory.ogg',
    defeat:     'assets/sounds/defeat.ogg',
    choose:     'assets/sounds/card_choose.ogg',
    click:      'assets/sounds/btn_click.ogg',
    fly:        'assets/sounds/card_fly.ogg',
    mark:       'assets/sounds/mark_click.ogg',
    slash:      'assets/sounds/slash.ogg',
    flip:  'assets/sounds/card_flip.ogg'
  };

  const audioCache = new Map();      // key → Audio()
  const lastPlay   = new Map();      // key → timestamp
  const COOLDOWN   = 40;             // ms — tránh spam

  // =====================================================================
  // 1) Preload tất cả âm thanh
  // =====================================================================
  function preloadSounds(){
    Object.entries(SOUND_PATHS).forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audioCache.set(key, audio);
    });
  }

  // =====================================================================
  // 2) Play âm thanh (clone để overlap)
  // =====================================================================
  function play(key){
    const now = performance.now();

    // Cooldown tránh spam 0.1s
    const last = lastPlay.get(key) || 0;
    if (now - last < COOLDOWN) return;
    lastPlay.set(key, now);

    const src = SOUND_PATHS[key];
    if (!src) return;

    // Clone để chơi nhiều âm cùng lúc
    const audio = new Audio(src);
    audio.volume = 1.0;
    audio.play().catch(()=>{});
  }

  // =====================================================================
  // 3) Gắn cho UI button sprite tự play click
  // =====================================================================
  function autoBindSpriteButtons(){
    document.addEventListener('click', e => {
      const btn = e.target.closest('.spriteBtn');
      if (btn && !btn.classList.contains('btn-off')) {
        play('click');
      }
    });
  }

  // =====================================================================
  // PUBLIC API
  // =====================================================================
  // PUBLIC API: Sound (gốc) + Sfx (adapter cho game)
  window.Sound = {
    preload: preloadSounds,
    play,
  };

  // Adapter để các file khác gọi Sfx.play('card_deal') vẫn chạy được
  window.Sfx = {
    play(name){
      // map alias → key thật
      const aliasMap = {
        card_deal   : 'deal',
        card_choose : 'choose',
        card_fly    : 'fly',
        btn_click   : 'click',
        victory     : 'victory',
        defeat      : 'defeat',
      };

      const key = aliasMap[name] || name; // cho phép gọi trực tiếp 'deal' luôn
      play(key);
    }
  };

  // =====================================================================
  // INIT (sau DOMContentLoaded)
  // =====================================================================
  document.addEventListener('DOMContentLoaded', () => {
    preloadSounds();
    autoBindSpriteButtons();
  });

})();
