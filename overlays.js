// ===== overlays.js — Victim / Result / Compare overlays & buttons =====
'use strict';

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  // Lấy FRONT_SRC / BACK_SRC từ __CoreBase nếu đã có, fallback nếu chưa
  function getSpriteFns() {
    const base = window.__CoreBase || {};
    const FRONT_SRC =
      base.FRONT_SRC || ((id) => `assets/cards/${id}.png`);
    const BACK_SRC =
      base.BACK_SRC  || 'assets/cards/back.png';
    return { FRONT_SRC, BACK_SRC };
  }

  // SFX helper riêng cho overlay
  function playSfx(name) {
    if (window.Sfx && typeof window.Sfx.play === 'function') {
      window.Sfx.play(name);
    }
  }

  // ===== Victim Overlay (Nạn nhân / cOpen) =====
  const victimOverlay   = $('#victimOverlay');
  const victimCardEl    = $('#victimCard');
  const victimCardFront = victimCardEl ? victimCardEl.querySelector('.front') : null;
  const victimCardBack  = victimCardEl ? victimCardEl.querySelector('.back')  : null;
  const victimBlood     = $('#victimBlood'); // có thể null

  function showVictimOverlay(openId) {
    if (!victimOverlay || !victimCardEl || !openId) {
      console.warn('[VictimOverlay] Missing overlay/card or openId');
      return;
    }

    const { FRONT_SRC } = getSpriteFns();
    const src = FRONT_SRC(openId);

    // Xoá mọi split-half cũ
    victimCardEl.querySelectorAll('.split-half').forEach((n) => n.remove());

    // Ẩn front/back gốc (card template)
    if (victimCardFront) victimCardFront.style.display = 'none';
    if (victimCardBack)  victimCardBack.style.display  = 'none';

    // Tạo 2 nửa
    const topHalf = document.createElement('div');
    topHalf.className = 'split-half half-left';
    topHalf.style.backgroundImage = `url(${src})`;
    topHalf.style.transform = 'translate(0,0) rotate(0deg)';

    const botHalf = document.createElement('div');
    botHalf.className = 'split-half half-right';
    botHalf.style.backgroundImage = `url(${src})`;
    botHalf.style.transform = 'translate(0,0) rotate(0deg)';

    // Reset máu
    if (victimBlood) {
      victimBlood.style.opacity    = '0';
      victimBlood.style.transform  = 'translate(-50%, -50%) scale(0.9)';
      victimBlood.style.transition = 'none';
    }

    // Append
    victimCardEl.appendChild(topHalf);
    victimCardEl.appendChild(botHalf);

    // SHOW overlay
    victimOverlay.classList.add('show');
    void victimCardEl.offsetWidth; // force reflow

    // Step 1: máu hiện
    setTimeout(() => {
      if (window.Sound && typeof window.Sound.play === 'function') {
        window.Sound.play('slash');
      }
      if (victimBlood) {
        victimBlood.style.transition =
          'opacity 220ms ease-out, transform 220ms ease-out';
        victimBlood.style.opacity   = '1';
        victimBlood.style.transform = 'translate(-50%, -50%) scale(1.1)';
      }
    }, 250);

    // Step 2: 2 nửa tách ra
    setTimeout(() => {
      topHalf.style.transform = 'translate(-14px, -8px) rotate(-6deg)';
      botHalf.style.transform = 'translate(14px, 8px) rotate(6deg)';
    }, 100);

    // Step 3: auto-dismiss sau ~2s
    setTimeout(() => {
      hideVictimOverlay();
    }, 2000);
  }

  function hideVictimOverlay() {
    if (!victimOverlay) return;
    victimOverlay.classList.remove('show');

    if (victimCardEl) {
      victimCardEl.querySelectorAll('.split-half').forEach((n) => n.remove());
      if (victimCardFront) victimCardFront.style.display = '';
      if (victimCardBack)  victimCardBack.style.display  = '';
    }

    if (victimBlood) {
      victimBlood.style.transition = '';
      victimBlood.style.opacity    = '0';
      victimBlood.style.transform  = 'translate(-50%, -50%) scale(0.9)';
    }
  }

  // ===== Result Overlay =====
  function hideEndOverlay() {
    const ov = $('#resultOverlay');
    if (!ov) return;
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  }

  function showEndOverlay() {
    const G  = window.G;
    const ov = $('#resultOverlay');
    if (!ov || !G || !G.end) return;

    const { FRONT_SRC, BACK_SRC } = getSpriteFns();
    const banner   = $('#endBanner');
    const isWinner = (G.winner === window.myRole);

    // Đánh dấu người thua để CSS bật backdrop-filter
    if (!isWinner) ov.classList.add('is-loser');
    else           ov.classList.remove('is-loser');

    if (banner) {
      banner.classList.add('result');
      banner.style.backgroundImage = isWinner
        ? 'url("assets/ui/victory.png")'
        : 'url("assets/ui/defeat.png")';
    }

    // 🔊 SFX thắng / thua
    playSfx(isWinner ? 'victory' : 'defeat');

    // Hidden card preview: chỉ mặt trước
    const hiddenId = G?.C?.hidden?.id;
    const card     = $('#endHiddenCard');
    if (card) {
      const front = card.querySelector('.front');
      const back  = card.querySelector('.back');

      if (front) {
        front.style.backgroundImage = hiddenId
          ? `url("${FRONT_SRC(hiddenId)}")`
          : 'none';
      }
      if (back) {
        back.style.backgroundImage = `url("${BACK_SRC}")`;
      }

      card.classList.remove('facedown');
      card.style.pointerEvents = 'none';
      card.classList.add('no-interact');
    }

    ov.setAttribute('aria-hidden', 'false');
    ov.classList.add('show');
  }

  function requestShowEndOverlay() {
    // Nếu Guess overlay đang mở thì chờ nó đóng
    if (window.__GuessOverlayVisible) return;
    showEndOverlay();
  }

  // Setup nút trong Result overlay
  (function setupEndOverlayHandlers() {
    $('#endBtnClose')?.addEventListener('click', () => {
      playSfx('btn_click');
      hideEndOverlay();
    });

    $('#btnResultNew')?.addEventListener('click', async () => {
      playSfx('btn_click');

      if (window.isHost && typeof window.hostNewGame === 'function') {
        await window.hostNewGame();
      } else if (!window.isHost && typeof window.guestNew === 'function') {
        await window.guestNew();
      }

      hideEndOverlay();
    });
  })();

  // ===== Compare Overlay (Guess vs cHidden) =====
  async function showRevealOverlay(chosenId, hiddenId) {
    const ov = $('#compareOverlay');

    // Fallback: nếu thiếu overlay → gọi End Overlay luôn
    if (!ov) {
      requestShowEndOverlay?.();
      return;
    }

    const { FRONT_SRC, BACK_SRC } = getSpriteFns();
    const guessCard  = $('#compareGuessCard');
    const hiddenCard = $('#compareHiddenCard');

    // Lá đoán
    if (guessCard) {
      const front = guessCard.querySelector('.front');
      const back  = guessCard.querySelector('.back');
      if (front) {
        front.style.backgroundImage = chosenId
          ? `url("${FRONT_SRC(chosenId)}")`
          : 'none';
      }
      if (back) {
        back.style.backgroundImage = `url("${BACK_SRC}")`;
      }
      guessCard.classList.remove('facedown');
    }

    // Lá ẩn (bắt đầu úp)
    if (hiddenCard) {
      const front = hiddenCard.querySelector('.front');
      const back  = hiddenCard.querySelector('.back');
      if (front) {
        front.style.backgroundImage = hiddenId
          ? `url("${FRONT_SRC(hiddenId)}")`
          : 'none';
      }
      if (back) {
        back.style.backgroundImage = `url("${BACK_SRC}")`;
      }
      hiddenCard.classList.add('facedown');
      hiddenCard.style.transform = '';
    }

    // Show overlay
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
    window.__CompareOverlayVisible = true;

    // Flip 3D lá ẩn
    if (hiddenCard && typeof window.flip3D === 'function') {
      if (window.Sound && typeof window.Sound.play === 'function') {
        window.Sound.play('flip');
      }
      try {
        await window.flip3D(hiddenCard, { duration: 450 });
      } catch {
        // ignore
      }
      hiddenCard.classList.remove('facedown');
    }

    // Đợi thêm ~2s → tổng ~3s
    await new Promise((r) => setTimeout(r, 2000));

    // Ẩn Compare overlay, gọi End Overlay
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
    window.__CompareOverlayVisible = false;

    requestShowEndOverlay?.();
  }

  // ===== Xuất ra global & namespace Overlays =====
  window.Overlays = {
    showVictimOverlay,
    hideVictimOverlay,
    showEndOverlay,
    hideEndOverlay,
    requestShowEndOverlay,
    showRevealOverlay,
  };

  // Back-compat cho code cũ
  window.showVictimOverlay     = showVictimOverlay;
  window.hideVictimOverlay     = hideVictimOverlay;
  window.hideEndOverlay        = hideEndOverlay;
  window.requestShowEndOverlay = requestShowEndOverlay;
  window.showRevealOverlay     = showRevealOverlay;
})();
