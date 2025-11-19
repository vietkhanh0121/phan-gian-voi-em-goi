// ===== game.core.base.js — Core (state, DOM, render, reconcile, UI, dealFan, utilities) =====
'use strict';

(function () {
  // --------------------- Small DOM helpers ---------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // --------------------- Sprites & Preload ---------------------
  const FRONT_SRC = (id) => `assets/cards/${id}.png`;
  const BACK_SRC  = 'assets/cards/back.png';

  const SPRITE_CACHE = new Map();
  function preload(src) {
    if (!src || SPRITE_CACHE.has(src)) return;
    const img = new Image();
    img.src = src;
    SPRITE_CACHE.set(src, true);
  }
  function preloadList(list) {
    (list || []).forEach(preload);
  }

  // --------------------- Global-ish tokens ---------------------
  window.roundToken      = window.roundToken      || 0;
  window.selectedId      = window.selectedId      || null;
  window.prevOppStageIds = window.prevOppStageIds || new Set();

  // --------------------- Deck helpers ---------------------
  function buildDeck() {
    const ids = [];
    ['g', 'r', 'y'].forEach((s) => {
      for (let n = 1; n <= 4; n++) ids.push(`${s}${n}`);
    });
    for (let n = 5; n <= 7; n++) ids.push(`k${n}`);
    return ids;
  }

  function metaOf(id) {
    const suit = id[0];
    const no   = id.slice(1);
    return { id, suit, no, text: no, frontSrc: FRONT_SRC(id) };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // --------------------- Sort helpers ---------------------
  const SUIT_ORDER = { g: 0, r: 1, y: 2, k: 3 };

  function sortIdsBySuitNo(ids) {
    return [...(ids || [])].sort((a, b) => {
      const sa = SUIT_ORDER[a?.[0]] ?? 99;
      const sb = SUIT_ORDER[b?.[0]] ?? 99;
      if (sa !== sb) return sa - sb;
      const na = parseInt(String(a || '').slice(1), 10);
      const nb = parseInt(String(b || '').slice(1), 10);
      return na - nb;
    });
  }

  function sortAllHands(hands) {
    return {
      p1: sortIdsBySuitNo(hands?.p1 || []),
      p2: sortIdsBySuitNo(hands?.p2 || []),
    };
  }

  // --------------------- SFX helper ---------------------
  function playSfx(name) {
    if (window.Sfx && typeof window.Sfx.play === 'function') {
      window.Sfx.play(name);
    }
  }

  // --------------------- Card DOM ---------------------
  function createCardEl(meta) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id   = meta.id;
    el.dataset.suit = meta.suit;
    el.dataset.no   = meta.no;

    const front = document.createElement('div');
    front.className = 'face front';
    front.style.backgroundImage = `url("${meta.frontSrc}")`;

    const back = document.createElement('div');
    back.className = 'face back';
    back.style.backgroundImage = `url("${BACK_SRC}")`;

    el.appendChild(front);
    el.appendChild(back);
    return el;
  }

  function ensureCardEl(id) {
    let el = document.querySelector(`.card[data-id="${id}"]`);
    if (el) return el;
    const meta = window.G?.cards?.[id];
    return meta ? createCardEl(meta) : null;
  }

  function getContainers() {
    return {
      hand    : $('#hand'),
      stage   : $('#stage'),
      pile    : $('#pile'),
      ozOpen  : $('#ozOpen'),
      ozHidden: $('#ozHidden'),
      oppHand : $('#oppHand'),
    };
  }

  // ===== Ensure zone class names for animations.js detection =====
  function ensureZoneClasses() {
    const { hand, stage, pile, ozOpen, ozHidden } = getContainers();
    if (hand  && !hand.classList.contains('hand'))   hand.classList.add('hand');
    if (stage && !stage.classList.contains('stage')) stage.classList.add('stage');
    if (pile  && !pile.classList.contains('pile'))   pile.classList.add('pile');

    const needsOpenWrapper = (node) => node && !node.closest('.openZone');

    if (needsOpenWrapper(ozOpen) || needsOpenWrapper(ozHidden)) {
      const commonParent =
        (ozOpen && ozHidden && ozOpen.parentElement === ozHidden.parentElement)
          ? ozOpen.parentElement
          : (ozOpen?.parentElement || ozHidden?.parentElement);

      if (commonParent) {
        commonParent.classList.add('openZone');
      } else {
        const wrap = document.createElement('div');
        wrap.className = 'openZone';
        const anchor = ozOpen || ozHidden;
        if (anchor?.parentElement) {
          anchor.parentElement.insertBefore(wrap, anchor);
          if (ozOpen)   wrap.appendChild(ozOpen);
          if (ozHidden) wrap.appendChild(ozHidden);
        }
      }
    }
  }
  ensureZoneClasses();

  // --------------------- Opp hand (back-only) ---------------------
  function renderOppHandCount(count) {
    const c = $('#oppHand');
    if (!c) return;

    const want = Math.max(0, Number(count || 0));
    const cur  = c.querySelectorAll('.card.backOnly').length;

    // Thêm cho đủ
    for (let i = cur; i < want; i++) {
      const el = document.createElement('div');
      el.className = 'card backOnly';
      const back = document.createElement('div');
      back.className = 'face back';
      el.appendChild(back);
      c.appendChild(el);
    }

    // Bớt nếu dư
    if (cur > want) {
      const all = [...c.querySelectorAll('.card.backOnly')];
      for (let i = 0; i < (cur - want); i++) {
        const last = all.pop();
        if (last) last.remove();
      }
    }
  }

  // --------------------- Hidden sanitizers ---------------------
  function sanitizeCardForZone(el, containerId) {
    if (containerId !== 'ozHidden') {
      el.removeAttribute('data-hidden');
      el.classList.remove('facedown');
      el.style.transform = '';
    }
  }

  function purgeHiddenOutsideOpenZone() {
    $$('.card[data-hidden="1"]').forEach((el) => {
      if (!el.closest('#ozHidden')) {
        el.removeAttribute('data-hidden');
        el.classList.remove('facedown');
        el.style.transform = '';
      }
    });
  }

  // --------------------- Spacer cleanup ---------------------
  function purgeContainerSpacers(container) {
    if (!container) return;
    [...container.childNodes].forEach((node) => {
      if (node.nodeType === 1 && node.classList?.contains('fx-spacer')) {
        try { node.remove(); } catch {}
      } else if (node.nodeType === 3 && !node.textContent.trim()) {
        try { node.remove(); } catch {}
      }
    });
  }

  // --------------------- UI: Turn hint & Buttons ---------------------
  function setTurnHint(txt, cls) {
    const hint = $('#turnHint');
    if (!hint) return;

    hint.textContent = txt || '';
    hint.classList.remove('turn--my', 'turn--opp', 'turn--end');
    if (cls) hint.classList.add(cls);
  }

  function myTurn() {
    const G = window.G;
    return !!G && !G.end && (G.turn === window.myRole);
  }
  window.myTurn = myTurn;

  function setButtonsEnabled() {
    const G = window.G || {};
    const bPlay  = $('#btnPlay');
    const bEnd   = $('#btnEnd');
    const bNew   = $('#btnNew');
    const bGuess = $('#btnGuess');

    const alive  = !!G && !G.end;
    const mine   = alive && myTurn();
    const played = !!G.turnHasCard;

    const canPlay  = mine && !played;
    const canEnd   = mine &&  played;
    const canGuess = mine && !played;

    const setBtn = (btn, can) => {
      if (!btn) return;
      btn.classList.toggle('btn-off', !can);
      if (can) btn.removeAttribute('disabled');
      else btn.setAttribute('disabled', 'disabled');
    };

    setBtn(bPlay,  canPlay);
    setBtn(bEnd,   canEnd);
    setBtn(bGuess, canGuess);

    // Nút New luôn bật
    if (bNew && bNew.hasAttribute('disabled')) {
      bNew.removeAttribute('disabled');
    }
  }

  // Nền zone--turn theo lượt: my / opp
  function setTurnZoneBg(mode) {
    const zone = document.getElementById('turnZone');
    if (!zone) return;

    zone.classList.remove('my-turn', 'opp-turn');

    if (mode === 'my') {
      zone.classList.add('my-turn');
    } else if (mode === 'opp') {
      zone.classList.add('opp-turn');
    }
  }

  // --------------------- Wrapper sang overlays.js ---------------------
  function showVictimOverlay(openId) {
    return window.Overlays?.showVictimOverlay?.(openId);
  }
  function hideVictimOverlay() {
    return window.Overlays?.hideVictimOverlay?.();
  }
  function hideEndOverlay() {
    return window.Overlays?.hideEndOverlay?.();
  }
  function requestShowEndOverlay() {
    return window.Overlays?.requestShowEndOverlay?.();
  }
  function showRevealOverlay(chosenId, hiddenId) {
    return window.Overlays?.showRevealOverlay?.(chosenId, hiddenId);
  }

  // Đảm bảo global cũ vẫn hoạt động
  window.hideEndOverlay        = hideEndOverlay;
  window.requestShowEndOverlay = requestShowEndOverlay;
  window.showRevealOverlay     = showRevealOverlay;
  window.showVictimOverlay     = showVictimOverlay;
  window.hideVictimOverlay     = hideVictimOverlay;

  // --------------------- Update UI by turn ---------------------
  function updateUIByTurn() {
    const G = window.G;

    if (!G) {
      setTurnHint('Host authoritative', 'turn--end');
      setTurnZoneBg(); // clear nền
      setButtonsEnabled();
      return;
    }

    if (G.end) {
      setTurnHint('KẾT THÚC VÁN', 'turn--end');
      setTurnZoneBg(); // hết ván: bỏ nền my/opp

      // Nếu không phải kết thúc bằng Guess (không có flags.reveal) thì gọi End Overlay ngay
      if (!G.flags || !G.flags.reveal) {
        requestShowEndOverlay();
      }
    } else if (myTurn()) {
      setTurnHint('Tới lượt bạn', 'turn--my');
      setTurnZoneBg('my');
    } else {
      setTurnHint('Đợi đối thủ...', 'turn--opp');
      setTurnZoneBg('opp');
      if (window.selectedId) clearSelection();
    }

    setButtonsEnabled();
  }

  // --------------------- Deal fan (hand) ---------------------
  const FAN_CFG = {
    DUR    : 420,
    STAGGER: 60,
    ARC_DEG: 7,
    LIFT_Y : 14,
    ENTER_X: -140,
    EASE   : 'cubic-bezier(.30,0,.00,1)',
  };

  let FAN_TIMERS = [];

  function clearFanTimers() {
    FAN_TIMERS.forEach((id) => clearTimeout(id));
    FAN_TIMERS = [];
  }

  function dealFan(container) {
    if (!container) return;

    clearFanTimers();
    container.classList.add('fanning');

    const cards = [...container.querySelectorAll('.card')];
    if (cards.length === 0) {
      container.classList.remove('fanning');
      return;
    }

    // 🔊 SFX chia bài
    playSfx('card_deal');

    const mid = (cards.length - 1) / 2;

    // Trạng thái initial
    cards.forEach((el, i) => {
      el.style.willChange  = 'transform, opacity';
      el.style.transition  = 'none';
      const ratio = (i - mid) / (mid || 1);
      const r = (FAN_CFG.ARC_DEG * ratio).toFixed(2);
      el.dataset.__fan_r = r;
      el.style.opacity   = '0';
      el.style.transform =
        `translate(${FAN_CFG.ENTER_X}px, ${-FAN_CFG.LIFT_Y}px) rotate(${r}deg)`;
    });

    void container.offsetWidth; // reflow

    cards.forEach((el, i) => {
      const t = setTimeout(() => {
        el.style.transition =
          `transform ${FAN_CFG.DUR}ms ${FAN_CFG.EASE}, opacity ${FAN_CFG.DUR}ms ease-out`;
        el.style.opacity   = '1';
        el.style.transform = 'translate(0,0) rotate(0deg)';

        const cleanup = setTimeout(() => {
          el.style.transition = '';
          el.style.willChange = '';
          delete el.dataset.__fan_r;
          if (!el.classList.contains('selected')) {
            el.style.opacity   = '';
            el.style.transform = '';
          }
        }, FAN_CFG.DUR + 40);
        FAN_TIMERS.push(cleanup);
      }, i * FAN_CFG.STAGGER + (i === 0 ? 20 : 0));

      FAN_TIMERS.push(t);
    });

    const total =
      FAN_CFG.DUR + FAN_CFG.STAGGER * (cards.length - 1) + 100;
    const end = setTimeout(() => {
      container.classList.remove('fanning');
    }, total);
    FAN_TIMERS.push(end);
  }

  // --------------------- HandArc hooks (optional) ---------------------
  function arcOnNewRound() {
    if (window.HandArc) window.HandArc.onNewRound?.($('#hand'));
  }
  function arcOnMyPlay() {
    if (window.HandArc) window.HandArc.onMyPlay?.($('#hand'));
  }
  function arcOnClearSelection() {
    if (window.HandArc) window.HandArc.onClearSelection?.($('#hand'));
  }

  // --------------------- Reconcile & anim helpers ---------------------
  async function fly(el, container, opts) {
    if (typeof window.flyFLIP === 'function') {
      return window.flyFLIP(el, container, opts);
    }
    container.appendChild(el);
    return new Promise((r) => setTimeout(r, opts?.duration ?? 400));
  }

  async function ensureContainerOrder(
    container,
    targetIds,
    { skipAnim = false } = {}
  ) {
    if (!container) return;
    if (window.suppressAnimOnNewRound) skipAnim = true;

    purgeContainerSpacers(container);

    const containerId     = container.id;
    const currentHiddenId = window.G?.C?.hidden?.id || null;
    let effectiveIds      = targetIds;

    if (containerId === 'ozOpen') {
      effectiveIds = window.G?.C?.open ? [window.G.C.open] : [];
    } else if (containerId === 'ozHidden') {
      effectiveIds = window.G?.C?.hidden?.id ? [window.G.C.hidden.id] : [];
    } else {
      effectiveIds = (targetIds || []).filter((id) => id !== currentHiddenId);
    }

    for (const id of (effectiveIds || [])) {
      let el = document.querySelector(`.card[data-id="${id}"]`) || ensureCardEl(id);
      if (!el) continue;

      const appendAndSanitize = () => {
        container.appendChild(el);
        sanitizeCardForZone(el, containerId);
      };

      if (!document.body.contains(el) || !el.parentNode) {
        appendAndSanitize();
        continue;
      }

      if (el.parentElement !== container) {
        // Stage → Pile mới animate
        if (containerId === 'pile') {
          const fromId = el.parentElement?.id || '';
          if (fromId !== 'stage') {
            appendAndSanitize();
            continue;
          }
        }

        if (skipAnim || containerId.startsWith('oz')) {
          appendAndSanitize();
        } else {
          await fly(el, container, { duration: 560 });
          sanitizeCardForZone(el, containerId);
        }
      } else {
        const curIdx = [...container.children].indexOf(el);
        const tgtIdx = effectiveIds.indexOf(id);
        if (curIdx !== tgtIdx) {
          container.insertBefore(el, container.children[tgtIdx] || null);
        }
        sanitizeCardForZone(el, containerId);
      }
    }

    // Remove những lá không còn trong effectiveIds
    [...container.querySelectorAll('.card')].forEach((el) => {
      const id = el.dataset.id;
      if (!(effectiveIds || []).includes(id)) el.remove();
    });

    // Nếu selectedId không còn trong hand → clear
    if (
      containerId === 'hand' &&
      typeof window.selectedId === 'string' &&
      !(effectiveIds || []).includes(window.selectedId)
    ) {
      $$('.card.selected').forEach((c) => c.classList.remove('selected'));
      window.selectedId = null;
    }
  }

  function other(role) {
    return role === 'p1' ? 'p2' : 'p1';
  }

  function updateOpponentStageMarks() {
    const G = window.G;
    if (!G || !window.myRole) return;

    const opp    = other(window.myRole);
    const nowIds = new Set(G.stage[opp] || []);

    for (const id of nowIds) {
      if (!window.prevOppStageIds.has(id)) {
        if (window.Marks?.markOpponentPlay) {
          window.Marks.markOpponentPlay(id);
        }
      }
    }
    window.prevOppStageIds = nowIds;
  }

  async function reconcile(options = {}) {
    if (!window.G) return;

    ensureZoneClasses();

    const skipAnim = !!options.skipAnim;
    const { hand, stage, pile, ozOpen, ozHidden, oppHand } = getContainers();

    [hand, stage, pile, ozOpen, ozHidden, oppHand].forEach(purgeContainerSpacers);

    const myHandSorted = sortIdsBySuitNo(window.G.hands[window.myRole] || []);
    await ensureContainerOrder(hand,  myHandSorted,                         { skipAnim });
    await ensureContainerOrder(stage, window.G.stage[window.myRole],        { skipAnim });
    await ensureContainerOrder(pile,  window.G.stage[other(window.myRole)], { skipAnim });
    await ensureContainerOrder(ozOpen,   [],                                { skipAnim: true });
    await ensureContainerOrder(ozHidden, [],                                { skipAnim: true });

    const oppCount = (window.G.hands?.[other(window.myRole)] || []).length;
    renderOppHandCount(oppCount);
    if (window.HandArc) window.HandArc.apply?.($('#oppHand'));

    const hidId = window.G?.C?.hidden?.id;
    if (hidId) {
      const hiddenEl = $('#ozHidden .card');
      if (hiddenEl) {
        if (window.G.C.hidden.revealed) {
          hiddenEl.classList.remove('facedown');
          hiddenEl.removeAttribute('data-hidden');
          hiddenEl.style.transform = '';
        } else {
          hiddenEl.dataset.hidden = '1';
          hiddenEl.classList.add('facedown');
        }
      }
    }

    updateUIByTurn();
    updateOpponentStageMarks();
  }

  // --------------------- Selection ---------------------
  function clearSelection() {
    $$('.card.selected').forEach((c) => c.classList.remove('selected'));
    window.selectedId = null;
    arcOnClearSelection();
  }

  (function bindHandClick() {
    document.addEventListener('click', (e) => {
      const hand = $('#hand');
      if (!hand) return;

      const G = window.G;
      if (!G || G.end) return;
      if (G.turn !== window.myRole) return;
      if (G.turnHasCard) return;

      const el = e.target.closest('.card');
      if (!el || !el.closest('#hand')) return;

      const id = el.dataset.id;
      if (!G.hands[window.myRole].includes(id)) return;

      // Toggle chọn
      if (window.selectedId === id && el.classList.contains('selected')) {
        el.classList.remove('selected');
        window.selectedId = null;
        return;
      }

      clearSelection();
      el.classList.add('selected');
      window.selectedId = id;

      // 🔊 SFX chọn bài
      playSfx('card_choose');
    });
  })();

  // --------------------- Force DOM order utility ---------------------
  function forceDomOrderIfMismatch(containerSel, targetIds) {
    const c = document.querySelector(containerSel);
    if (!c) return;

    const dom = [...c.querySelectorAll('.card')].map((el) => el.dataset.id);
    if ((dom || []).join(',') === (targetIds || []).join(',')) return;

    const map = new Map();
    dom.forEach((id) => {
      const el = c.querySelector(`.card[data-id="${id}"]`);
      if (el) map.set(id, el);
    });

    c.innerHTML = '';
    (targetIds || []).forEach((id) => {
      const el = map.get(id) || ensureCardEl(id);
      if (el) c.appendChild(el);
    });
  }
  window.forceDomOrderIfMismatch = forceDomOrderIfMismatch;

  // --------------------- Animate pile only for opponent (UI-only) ---------------------
  function animatePileForViewer(playerWhoPlayed) {
    const me =
      typeof window.myRole !== 'undefined'
        ? window.myRole
        : (window.getRole ? window.getRole() : null);

    const pile = document.getElementById('pile');
    if (!me || !pile) return;

    // Nếu người xem KHÔNG phải người vừa đánh → animate pile
    if (me !== playerWhoPlayed) {
      pile.classList.add('animate-pile');
      setTimeout(() => pile.classList.remove('animate-pile'), 550);
    }
  }

  // --------------------- Export to actions layer ---------------------
  window.__CoreBase = {
    FRONT_SRC,
    BACK_SRC,
    preloadList,
    metaOf,
    buildDeck,
    shuffle,
    sortAllHands,
    sortIdsBySuitNo,
    ensureCardEl,
    getContainers,
    purgeHiddenOutsideOpenZone,
    dealFan,
    arcOnNewRound,
    arcOnMyPlay,
    reconcile,
    clearSelection,
    updateUIByTurn,
    hideEndOverlay,     // wrapper → Overlays
    showRevealOverlay,  // wrapper → Overlays
    // Victim overlay (wrapper)
    showVictimOverlay,
    hideVictimOverlay,
    // UI fx
    animatePileForViewer,
  };
})();
