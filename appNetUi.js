// ===== appNetUi.js — global, non-module =====
'use strict';

// Các nút UI
const btnPlay  = document.getElementById('btnPlay');
const btnEnd   = document.getElementById('btnEnd');
const btnNew   = document.getElementById('btnNew');
const btnGuess = document.getElementById('btnGuess');

// PLAY
btnPlay?.addEventListener('click', async () => {
  if (window.isHost) {
    await window.hostPlay();
  } else {
    await window.guestPlay();
  }
});

// END
btnEnd?.addEventListener('click', async () => {
  if (window.isHost) {
    await window.hostEnd();
  } else {
    // cập nhật local trước để UI đổi lượt ngay
    await window.guestEndLocal();
    // gửi intent cho host
    if (window.Net) Net.send('intent', { kind:'END' });
  }
});

// NEW
btnNew?.addEventListener('click', async () => {
  if (window.isHost) {
    await window.hostNewGame();
  } else {
    await window.guestNew();
  }
});

// GUESS (nếu có module Guess)
btnGuess?.addEventListener('click', async () => {
  if (!window.G || window.G.end) return;
  if (!window.myTurn()) return;
  if (window.G.turnHasCard) return;
  if (window.Guess?.open) window.Guess.open();
});


// ================================================
//  Sprite Button Press Effect (GLOBAL)
// ================================================
function pressSpriteBtn(btn){
  btn.classList.add('is-pressed');
  setTimeout(()=> btn.classList.remove('is-pressed'), 40);
}

document.querySelectorAll('.spriteBtn').forEach(btn=>{
  btn.addEventListener('click', () => pressSpriteBtn(btn));
});

// Bảo đảm UI trạng thái đúng khi trang vừa load (nếu Net chưa sẵn)
document.addEventListener('DOMContentLoaded', () => {
  if (window.updateUIByTurn) updateUIByTurn();
});

// ===== Result Overlay: New Game button (delegation) =====
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#btnResultNew');
  if (!btn) return;
  if (typeof window.hideResultOverlay === 'function') hideResultOverlay();

  // Ưu tiên các API hiện có
  if (typeof window.hostNewGame === 'function' && window.isHost){
    window.hostNewGame(); 
    return;
  }
  if (typeof window.guestNew === 'function' && !window.isHost){
    window.guestNew();
    return;
  }

  // Fallback: click bất kỳ .btn--new sẵn có trong UI
  const spriteNew = document.querySelector('.btn--new');
  if (spriteNew) spriteNew.click();
});
