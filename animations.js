// ===== animations.js (IIFE, expose flyFLIP & flip3D, debug off) =====
(() => {
  'use strict';

  const EASE = 'cubic-bezier(.43,.28,0,1.19)';
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---- rect helpers ----
  function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ---- spacer (layout holder) ----
  function makeSpacerLike(el) {
    const s = document.createElement('div');
    s.className = 'fx-spacer';
    const cs = getComputedStyle(el);
    s.style.width  = cs.width;
    s.style.height = cs.height;
    s.style.flex   = cs.flex || '0 0 auto';
    s.style.margin = cs.margin;
    s.style.padding = '0';
    s.style.border = '0';
    s.style.background = 'transparent';
    return s;
  }

  function removeSpacer2Frames(spacer) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { spacer.remove(); } catch {}
    }));
    setTimeout(() => { if (spacer?.isConnected) spacer.remove(); }, 600);
  }

  // ---- FX layer (normalize styles) ----
  function getFxLayer() {
    const host = document.getElementById('viewport') || document.body;
    let layer = document.getElementById('fxLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'fxLayer';
      host.appendChild(layer);
    } else if (layer.parentElement !== host) {
      host.appendChild(layer);
    }

    const cssZ = getComputedStyle(document.documentElement).getPropertyValue('--z-fx').trim();
    const zIndex = cssZ || '9500';
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = zIndex;
    layer.style.transform = 'none';
    layer.style.contain = 'layout paint';
    return layer;
  }

  // ---- zone helpers ----
  function zoneIdOf(el) {
    if (!el) return '';
    return el.closest('.hand') ? 'hand'
      : el.closest('.stage') ? 'stage'
      : el.closest('.pile') ? 'pile'
      : el.closest('.openZone') ? 'open'
      : '';
  }

  function isCrossZone(fromEl, toContainer) {
    const fromId = zoneIdOf(fromEl);
    const toId = (toContainer && toContainer.id) || '';
    return fromId && toId && fromId !== toId;
  }

    // ---- overlay flight (cross-zone, tilt + condense hooks) ----
  async function flyOverLayer(fromEl, toContainer, { duration = 340 } = {}) {
    if (!fromEl || !toContainer) return;
    if (!fromEl.isConnected || !fromEl.parentNode) {
      toContainer.appendChild(fromEl);
      return;
    }

    const parent  = fromEl.parentNode;
    const spacer  = makeSpacerLike(fromEl);
    parent.insertBefore(spacer, fromEl);

    // 🔹 Khi placeholder VỪA xuất hiện trong hand → wiggle nhẹ
    if (window.Condense && parent.classList.contains('hand')) {
      try { window.Condense.placeholderIn(parent, spacer); } catch {}
    }

    const startRect = fromEl.getBoundingClientRect();
    const tmpSlot   = makeSpacerLike(fromEl);
    tmpSlot.style.visibility = 'hidden';
    toContainer.appendChild(tmpSlot);
    const endRect = tmpSlot.getBoundingClientRect();

    const fx = getFxLayer();
    const clone = fromEl.cloneNode(true);
    fromEl.style.visibility = 'hidden';
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${startRect.left}px`,
      top: `${startRect.top}px`,
      margin: '0',
      transform: 'translate(0,0) scale(1)',
      willChange: 'transform',
      zIndex: '1',
      boxShadow: 'var(--shadowMd, 8px 8px 0 rgba(0,0,0,.50))'
    });
    fx.appendChild(clone);

    const dx = endRect.left - startRect.left;
    const dy = endRect.top  - startRect.top;

    // Góc nghiêng nhẹ theo hướng bay
    const baseTilt = 20; // có thể tune
    let tilt;
    if (Math.abs(dx) >= Math.abs(dy)) {
      tilt = dx >= 0 ? baseTilt : -baseTilt;
    } else {
      tilt = dy >= 0 ? baseTilt : -baseTilt;
    }

    const anim = clone.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx * 0.6}px,${dy * 0.6}px) scale(1.03) rotate(${tilt}deg)`,
          opacity: 0.98,
          offset: 0.55
        },
        {
          transform: `translate(${dx}px,${dy}px) scale(1) rotate(0deg)`,
          opacity: 0.95
        }
      ],
      {
        duration,
        easing: 'cubic-bezier(.30,0,.20,1)',
        fill: 'forwards'
      }
    );
    await anim.finished;

    toContainer.appendChild(fromEl);
    fromEl.style.visibility = '';
    clone.remove();
    tmpSlot.remove();

    // 🔹 Khi placeholder BIẾN MẤT trong hand → condense mạnh
    if (window.Condense && parent.classList.contains('hand')) {
      try {
        window.Condense.placeholderOut(parent, spacer);
      } catch {
        // fallback nếu có lỗi
        removeSpacer2Frames(spacer);
      }
    } else {
      removeSpacer2Frames(spacer);
    }

    fromEl.style.animation = 'settle .25s ease';
    setTimeout(() => { if (fromEl) fromEl.style.animation = ''; }, 130);
  }

  // ---- FLIP in-zone ----
  async function flyFLIP(cardEl, toContainer, { duration = 260 } = {}) {
    if (!cardEl || !toContainer) return;

    // Cross-zone → dùng overlay flight (đã gắn condense ở trên)
    if (isCrossZone(cardEl, toContainer)) {
      if (!cardEl.isConnected || !cardEl.parentNode) {
        toContainer.appendChild(cardEl);
        return;
      }
      await flyOverLayer(cardEl, toContainer, { duration });
      return;
    }

    // Cùng zone nhưng khác container → FLIP thường
    if (cardEl.parentElement === toContainer) return;

    const parent = cardEl.parentNode;
    const spacer = makeSpacerLike(cardEl);
    parent.insertBefore(spacer, cardEl);

    const first = rectCenter(cardEl);
    toContainer.appendChild(cardEl);
    await new Promise(r => requestAnimationFrame(()=>r()));
    const last = rectCenter(cardEl);
    const dx = first.x - last.x;
    const dy = first.y - last.y;

    cardEl.style.willChange = 'transform, box-shadow';
    cardEl.style.zIndex = '5';
    cardEl.style.transform = `translate(${dx}px, ${dy}px)`;
    cardEl.getBoundingClientRect();

    const anim = cardEl.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)` },
        { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) scale(1.15)`, offset: 0.65 },
        { transform: 'translate(0,0) scale(1.0)' }
      ],
      { duration, easing: EASE, fill: 'forwards' }
    );
    await anim.finished;

    cardEl.style.transform = '';
    cardEl.style.willChange = '';
    cardEl.style.zIndex = '';
    removeSpacer2Frames(spacer);
    cardEl.style.animation = 'settle .25s ease';
    setTimeout(() => { cardEl.style.animation = ''; }, 260);
  }

  // ---- 3D flip (transition-based, đơn giản, hợp browser cũ) ----
  async function flip3D(card, { duration = 1200 } = {}) {
    if (!card) return;

    const wasFaceDown = card.classList.contains('facedown');
    const startDeg = wasFaceDown ? 180 : 0;
    const endDeg   = wasFaceDown ? 0   : 180;

    card.style.willChange = 'transform';
    card.style.transition = 'none';

    // Set vị trí bắt đầu
    card.style.transform = `rotateY(${startDeg}deg)`;
    card.getBoundingClientRect(); // force reflow

    // Áp transition
    card.style.transition = `transform ${duration}ms cubic-bezier(.33,0,.33,1)`;

    // Kick animation frame sau
    requestAnimationFrame(() => {
      card.style.transform = `rotateY(${endDeg}deg)`;
    });

    // Chờ animation xong
    await new Promise(resolve => {
      setTimeout(() => {
        card.style.transition = '';
        card.style.willChange = '';

        if (wasFaceDown) {
          card.classList.remove('facedown'); // mở ra
        } else {
          card.classList.add('facedown');    // úp lại
        }

        card.style.transform = 'rotateY(0deg)';
        resolve();
      }, duration + 40);
    });

    // “settle” nhẹ
    card.style.animation = 'settle .25s ease';
    setTimeout(() => { card.style.animation = ''; }, 130);
  }

  window.flyFLIP = flyFLIP;
  window.flip3D = flip3D;
})();
