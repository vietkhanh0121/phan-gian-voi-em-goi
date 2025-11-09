// ===== Animation helpers (FLIP + Flip3D) — luôn bay trên các zone khi đổi zone =====
const EASE = 'cubic-bezier(.43,.28,0,1.19)';

function rectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function makeSpacerLike(el) {
  const s = document.createElement('div');
  const cs = getComputedStyle(el);
  s.style.width = cs.width;
  s.style.height = cs.height;
  s.style.flex = cs.flex || '0 0 auto';
  s.style.margin = cs.margin;
  return s;
}

// Tạo/lấy lớp hiệu ứng luôn nằm trên mọi zone (trên OpenZone/Hand/Stage/Pile, dưới Controls)
function getFxLayer() {
  let layer = document.getElementById('fxLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fxLayer';
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '9000'; // dưới Controls (9999), trên mọi zone
    document.body.appendChild(layer);
  }
  return layer;
}

// Clone bay trong layer trên cùng (đảm bảo không bị “lọt dưới” Hand/OpenZone)
async function flyOverLayer(fromEl, toContainer, { duration = 680 } = {}) {
  // Nếu thẻ chưa trong DOM → gắn thẳng
  if (!fromEl.isConnected || !fromEl.parentNode) {
    toContainer.appendChild(fromEl);
    return;
  }

  const spacer = makeSpacerLike(fromEl);
  fromEl.parentNode.insertBefore(spacer, fromEl);

  const startRect = fromEl.getBoundingClientRect();
  const tmpSlot = makeSpacerLike(fromEl);
  toContainer.appendChild(tmpSlot);
  const endRect = tmpSlot.getBoundingClientRect();

  const fx = getFxLayer();
  const clone = fromEl.cloneNode(true);
  fromEl.style.visibility = 'hidden';

  clone.style.position = 'fixed';
  clone.style.left = `${startRect.left}px`;
  clone.style.top = `${startRect.top}px`;
  clone.style.margin = '0';
  clone.style.transform = 'translate(0,0) scale(1)';
  clone.style.willChange = 'transform';
  clone.style.zIndex = '1';
  fx.appendChild(clone);

  const dx = endRect.left - startRect.left;
  const dy = endRect.top - startRect.top;

  const anim = clone.animate(
    [
      { transform: `translate(0px, 0px) rotate(0deg) scale(1)` },
      { transform: `translate(${dx * 0.9}px, ${dy * 0.9}px) rotate(6deg) scale(1.15)`, offset: 0.65 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(1.0)` }
    ],
    { duration, easing: EASE, fill: 'forwards' }
  );

  await anim.finished;

  toContainer.appendChild(fromEl);
  fromEl.style.visibility = '';
  clone.remove();
  tmpSlot.remove();
  spacer.remove();

  fromEl.style.animation = 'settle .25s ease';
  setTimeout(() => { if (fromEl) fromEl.style.animation = ''; }, 260);
}

// Xác định zone gốc
function zoneIdOf(el) {
  if (!el) return '';
  return el.closest('.hand') ? 'hand'
    : el.closest('.stage') ? 'stage'
    : el.closest('.pile') ? 'pile'
    : el.closest('.openZone') ? 'open'
    : '';
}

// Nếu di chuyển giữa HAI zone khác nhau → bay qua fxLayer
function isCrossZone(fromEl, toContainer) {
  const fromId = zoneIdOf(fromEl);
  const toId = (toContainer && toContainer.id) || '';
  return fromId && toId && fromId !== toId;
}

// Move with FLIP (mặc định). Nếu khác zone → dùng layer. An toàn khi thẻ chưa có parent.
async function flyFLIP(cardEl, toContainer, { duration = 680 } = {}) {
  if (!cardEl || !toContainer) return;

  // Chuyến bay giữa các zone khác nhau → bay qua overlay (luôn trên các zone)
  if (isCrossZone(cardEl, toContainer)) {
    if (!cardEl.isConnected || !cardEl.parentNode) {
      toContainer.appendChild(cardEl);
      return;
    }
    await flyOverLayer(cardEl, toContainer, { duration });
    return;
  }

  // Cùng zone:
  if (cardEl.parentElement === toContainer) return;

  if (!cardEl.isConnected || !cardEl.parentNode) {
    toContainer.appendChild(cardEl);
    return;
  }

  const parent = cardEl.parentNode;
  const spacer = makeSpacerLike(cardEl);

  try {
    parent.insertBefore(spacer, cardEl);
  } catch {
    toContainer.appendChild(cardEl);
    return;
  }

  const first = rectCenter(cardEl);
  toContainer.appendChild(cardEl);
  const last = rectCenter(cardEl);
  const dx = first.x - last.x;
  const dy = first.y - last.y;

  cardEl.style.willChange = 'transform, box-shadow';
  cardEl.style.zIndex = 5001;
  cardEl.style.transform = `translate(${dx}px, ${dy}px)`;
  cardEl.getBoundingClientRect(); // force layout

  const anim = cardEl.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)` },
      { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) rotate(6deg) scale(1.15)`, offset: 0.65 },
      { transform: 'translate(0,0) rotate(0deg) scale(1.0)' }
    ],
    { duration, easing: EASE, fill: 'forwards' }
  );

  await anim.finished;

  cardEl.style.transform = '';
  cardEl.style.willChange = '';
  cardEl.style.zIndex = '';
  spacer.remove();

  cardEl.style.animation = 'settle .25s ease';
  setTimeout(() => { cardEl.style.animation = ''; }, 260);
}

// ===== Fixed flip3D for facedown -> face-up order =====
async function flip3D(card, { duration = 420 } = {}) {
  const front = card.querySelector('.front');
  const back  = card.querySelector('.back');

  // nhỏ delay để chắc chắn DOM đã ổn định
  await new Promise(r => setTimeout(r, 60));

  const wasFaceDown = card.classList.contains('facedown');

  if (wasFaceDown) {
    // ĐANG ÚP: bắt đầu từ 180deg (đang thấy "mặt ?"), lật 180→360.
    // Ở nửa đường (270deg) thì bỏ .facedown để sau khi kết thúc về 0deg sẽ thấy mặt số.
    const anim = card.animate(
      [
        { transform: 'rotateY(180deg)' },
        { transform: 'rotateY(270deg)', offset: 0.5 },
        { transform: 'rotateY(360deg)' }
      ],
      { duration, easing: 'cubic-bezier(.33,0,.33,1)', fill: 'forwards' }
    );

    // Gỡ facedown đúng lúc "qua lưng"
    setTimeout(() => {
      card.classList.remove('facedown');
    }, duration * 0.5);

    await anim.finished;
    // Chuẩn hóa transform về 0 để tránh tích lũy
    card.style.transform = 'rotateY(0)';
  } else {
    // KHÔNG ÚP: lật 0→180 và (tùy bài) có thể swap nội dung (nếu bạn cần)
    const anim = card.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: 'rotateY(90deg)', offset: 0.5 },
        { transform: 'rotateY(180deg)' }
      ],
      { duration, easing: 'cubic-bezier(.33,0,.33,1)', fill: 'forwards' }
    );

    // Với bài không úp, nếu muốn swap nội dung 2 mặt ở giữa flip:
    setTimeout(() => {
      // Hiện tại game dùng số ở mặt trước cố định, nên có thể bỏ qua swap.
      // Nếu cần swap: 
      // const ftxt = front.textContent;
      // front.textContent = back.textContent;
      // back.textContent  = ftxt;
    }, duration * 0.5);

    await anim.finished;
    card.style.transform = 'rotateY(0)';
  }

  // settle nhún nhẹ
  card.style.animation = 'settle .25s ease';
  setTimeout(() => { card.style.animation = ''; }, 260);
}
