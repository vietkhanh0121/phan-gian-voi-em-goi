// ===== guess.js — Guess Overlay (chọn lá, Compare overlay xử lý reveal) =====
'use strict';

(function(){
  // Providers from core
  let getState, getRole, isHostFn, FRONT_SRC, buildDeck, reconcile, hostNewGame, guestNew, Net, dealFan;

  // Local state
  let guessSelectedId = null;

  // Tiny DOM helpers
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

  function allDeckIds(){ return (typeof buildDeck === 'function') ? buildDeck() : []; }

  // Build candidate list: exclude my hand, both stages, and ozOpen
  function buildGuessCandidates(){
    const G = getState?.(); if (!G) return [];
    const me = getRole?.();
    const exclude = new Set();

    (G.hands?.[me] || []).forEach(id => exclude.add(id));
    (G.stage?.p1 || []).forEach(id => exclude.add(id));
    (G.stage?.p2 || []).forEach(id => exclude.add(id));
    if (G.C?.open) exclude.add(G.C.open);

    return allDeckIds().filter(id => !exclude.has(id));
  }


  // Render the candidate grid (UI-only cards, không dùng data-id thật)
  function renderGuessGrid(){
    const listEl = $('#guessList');
    if (!listEl) return;

    guessSelectedId = null;
    const cfm = $('#btnGuessConfirm');
    if (cfm){
      cfm.classList.add('btn-off');
      cfm.setAttribute('disabled','disabled');
    }

    const ids = buildGuessCandidates();
    listEl.innerHTML = '';

    if (ids.length === 0){
      const p = document.createElement('p');
      p.textContent = 'Không còn lá nào để đoán.';
      p.style.margin = '8px 0';
      listEl.appendChild(p);
      return;
    }

    ids.forEach((id, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      // UI-only flags: KHÔNG set data-id thật
      card.setAttribute('data-ui', 'guess');
      card.setAttribute('data-candidate', id);

      const face = document.createElement('div');
      face.className = 'face front';
      face.style.backgroundImage = `url("${FRONT_SRC(id)}")`;
      card.appendChild(face);

      if (idx === 0) card.style.marginLeft = '0';

      // ===== Click: toggle chọn / bỏ chọn như Hand =====
card.addEventListener('click', () => {
  const thisId = card.getAttribute('data-candidate');
  const isAlreadySelected = card.classList.contains('selected');

  // Bỏ selected trên tất cả card trước
  $$('.card.selected', listEl).forEach(el => el.classList.remove('selected'));

  if (isAlreadySelected){
    // Nhấn lại chính lá đang chọn → bỏ chọn
    guessSelectedId = null;
    if (cfm){
      cfm.classList.add('btn-off');
      cfm.setAttribute('disabled','disabled');
    }
  } else {
    // 🔊 SFX: chọn lá mới trong Guess overlay
    if (window.Sound && typeof Sound.play === 'function') {
      Sound.play('choose');           // dùng key 'choose' trong sound.js
    }

    // Chọn lá mới
    card.classList.add('selected');
    guessSelectedId = thisId;
    if (cfm){
      cfm.classList.remove('btn-off');
      cfm.removeAttribute('disabled');
    }
  }
});

      listEl.appendChild(card);
    });

    // Optional: give it a nice fan-in animation
    if (typeof dealFan === 'function') dealFan(listEl);
  }

  function canOpenOverlay(){
    const G = getState?.(); const me = getRole?.();
    if (!G || !me) return false;
    if (G.end) return false;
    if (G.turn !== me) return false;
    if (G.turnHasCard) return false;
    return true;
  }

  function openOverlay(){
    if (!canOpenOverlay()) return;

    // Mark as visible để nếu host kết thúc ván ngay thì End Overlay đợi
    window.__GuessOverlayVisible = true;

    // Ensure body section visible
    $('#guessBody')?.classList.remove('hidden');

    // 1) (đã bỏ) Preview hidden card
    // renderHiddenPreview();

    // 2) Build candidate grid
    renderGuessGrid();

    const ov = $('#guessOverlay');
    ov?.classList.add('show');
    ov?.setAttribute('aria-hidden','false');
  }

  function closeOverlay(){
    const ov = $('#guessOverlay');
    ov?.classList.remove('show');
    ov?.setAttribute('aria-hidden','true');
    guessSelectedId = null;

    const cfm = $('#btnGuessConfirm');
    if (cfm){
      cfm.classList.add('btn-off');
      cfm.setAttribute('disabled','disabled');
    }

    window.__GuessOverlayVisible = false;

    // Nếu round đã end trong lúc overlay đang mở thì cho End Overlay hiện lại
    if (window.G?.end) {
      try { window.requestShowEndOverlay?.(); } catch {}
    }
  }

  // ===== Confirm Guess: Guess Overlay tắt ngay, Compare overlay xử lý reveal =====
  async function onConfirmGuess(){
    const G = getState?.(); const me = getRole?.();
    if (!G || !me || !guessSelectedId) return;

    const chosenId = guessSelectedId;

    // 1) TẮT Guess Overlay NGAY LẬP TỨC
    closeOverlay();

    // 2) Host resolve ngay, guest gửi intent cho host
    if (isHostFn?.()){
      if (typeof window.hostResolveGuess === 'function'){
        try { await window.hostResolveGuess(me, chosenId); } catch {}
      }
    } else if (Net && typeof Net.send === 'function'){
      Net.send('intent', { kind:'GUESS', id: chosenId, from: me });
    }

    // 3D flip + so sánh 2 lá & gọi End Overlay
    // sẽ do showRevealOverlay (ở base/actions) xử lý cho CẢ 2 người chơi
    // → Compare overlay chỉ xuất hiện sau khi Guess Overlay đã biến mất.
  }

  // Public API
  window.Guess = {
    init(provider){
      getState    = provider.getState;
      getRole     = provider.getRole;
      isHostFn    = provider.isHostFn;
      FRONT_SRC   = provider.FRONT_SRC;
      buildDeck   = provider.buildDeck;
      reconcile   = provider.reconcile;
      hostNewGame = provider.hostNewGame;
      guestNew    = provider.guestNew;
      Net         = provider.Net;
      dealFan     = provider.dealFan;

      // Wire UI
      $('#btnGuess')?.addEventListener('click', () => window.Guess.open());
      $('#guessClose')?.addEventListener('click', closeOverlay);
      $('#btnGuessCancel')?.addEventListener('click', closeOverlay);
      $('#guessOverlay')?.addEventListener('click', e=>{
        if (e.target === $('#guessOverlay')) closeOverlay();
      });
      $('#btnGuessConfirm')?.addEventListener('click', onConfirmGuess);
    },
    open: openOverlay,
    close: closeOverlay
  };
})();
