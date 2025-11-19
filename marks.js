// ===== marks.js — Secret Mark Board (tạm thời bền, chỉ mất khi overwrite hoặc reset) =====
'use strict';

(function(){
  const SUITS = [
    { key:'g', label:'G', cls:'g', nums:[1,2,3,4] },      // xanh
    { key:'r', label:'R', cls:'r', nums:[1,2,3,4] },      // đỏ
    { key:'y', label:'Y', cls:'y', nums:[1,2,3,4] },      // vàng
    { key:'k', label:'K', cls:'k', nums:[5,6,7,null] },   // đen (5–7, ô cuối trống)
  ];

  // ===== State (local-only) =====
  // perm: dấu vĩnh viễn
  const perm = { green:new Set(), purple:new Set(), white:new Set() };
  // temp: id -> 'purple' | 'guess' | 'slash' (giữ tạm thời bền, không auto-clear)
  const temp = new Map();

  const idOf   = (suit, num) => (suit && num ? `${suit}${num}` : null);
  const cellId = (suit, num) => `mb-${suit}${num ?? 'empty'}`;
  const el     = (id) => document.getElementById(id);

  // ===== Render grid (4 cột suit, số tăng dần từ trên xuống) =====
  function renderInitialGrid(){
    const host = el('markBoard');
    if (!host) return;
    host.innerHTML = '';

    // Row-major: g r y k
    // Row1: g1 r1 y1 k5 | Row2: g2 r2 y2 k6 | Row3: g3 r3 y3 k7 | Row4: g4 r4 y4 k(empty)
    for (let row = 0; row < 4; row++){
      const rowMap = [
        ['g', row+1],
        ['r', row+1],
        ['y', row+1],
        ['k', [5,6,7,null][row]]
      ];
      rowMap.forEach(([suit, num])=>{
        const cell = document.createElement('div');
        cell.className = 'mb-cell';
        cell.id = cellId(suit, num);

        const badge = document.createElement('div');
        badge.className = `mb-badge ${suit} ${num ? '' : 'empty'}`;
        badge.textContent = num ? String(num) : '';
        cell.appendChild(badge);

        const marks = document.createElement('div');
        marks.className = 'mb-marks';
        cell.appendChild(marks);

        if (num){
          // Click cycle:
          // none → temp 'purple' (x tím)
          //      → temp 'guess'  (? trắng)
          //      → temp 'slash'  (/ đỏ)
          //      → none
          cell.addEventListener('click', ()=>{
            const id = idOf(suit, num);
            // Không cho ghi đè khi đã có dấu vĩnh viễn xanh / trắng
            if (perm.green.has(id) || perm.white.has(id)) return;

            // 🔊 SFX: click để mark / đổi mark
            if (window.Sound) Sound.play('mark');

            const cur = temp.get(id);
            if (!cur && !perm.purple.has(id)){
              temp.set(id, 'purple');
            } else if (cur === 'purple'){
              temp.set(id, 'guess');
            } else if (cur === 'guess'){
              temp.set(id, 'slash');
            } else if (cur === 'slash'){
              temp.delete(id);
            }
            applyAllMarks();
          });
        } else {
          cell.style.cursor = 'default';
        }

        host.appendChild(cell);
      });
    }
    applyAllMarks();
  }

  // ===== Helpers =====
  function drawMark(id, html){
    const suit = id[0];
    const num  = parseInt(id.slice(1), 10);
    const cell = el(cellId(suit, num));
    if (!cell) return;
    const box = cell.querySelector('.mb-marks');
    if (!box) return;
    box.innerHTML = html;
  }

  function clearVisuals(){
    document.querySelectorAll('.mb-marks').forEach(m => m.innerHTML = '');
  }

  // ===== Re-render marks theo ưu tiên =====
  // Ưu tiên: green > purple (perm) > white (perm) > temp ('purple' | 'guess' | 'slash')
  function applyAllMarks(){
    clearVisuals();

    // green
    perm.green.forEach(id => drawMark(id, `<span class="mark green">x</span>`));

    // purple (perm) — không ghi đè green
    perm.purple.forEach(id => {
      if (!perm.green.has(id)){
        drawMark(id, `<span class="mark purple">x</span>`);
      }
    });

    // white (perm) — icon death (render span trống, sprite do CSS lo)
    perm.white.forEach(id => {
      if (!perm.green.has(id) && !perm.purple.has(id)){
        drawMark(id, `<span class="mark white"></span>`);
      }
    });

    // temp — chỉ vẽ nếu chưa bị ghi đè bởi perm.* ở trên
    temp.forEach((state, id) => {
      if (perm.green.has(id) || perm.purple.has(id) || perm.white.has(id)){
        // đã bị overwrite -> xoá temp cho id đó
        temp.delete(id);
        return;
      }
      if (state === 'purple'){
        drawMark(id, `<span class="mark purple temp">x</span>`);
      } else if (state === 'guess'){
        // mark.guess = dấu ? trắng tạm
        drawMark(id, `<span class="mark guess temp">?</span>`);
      } else if (state === 'slash'){
        // mark.slash = dấu "/" màu đỏ (màu do CSS .mark.slash lo)
        drawMark(id, `<span class="mark slash temp">!</span>`);
      }
    });
  }

  // ===== Clear hiệu ứng "played" (dùng khi END TURN) =====
  function clearPlayed(){
    document.querySelectorAll('.mb-cell.played').forEach(cell => {
      cell.classList.remove('played');
    });
  }

  function clearAll(){
    perm.green.clear();
    perm.purple.clear();
    perm.white.clear();
    temp.clear();                 // XÓA toàn bộ tạm thời khi reset ván
    clearVisuals();
  }

  // ===== Public API =====
  window.Marks = {
    init(){ renderInitialGrid(); },
    reset(){
      clearAll();
      renderInitialGrid();
    },

    applyDeal({ myHandIds = [], openId = null } = {}){
      // Đánh dấu vĩnh viễn: xanh = bài của mình, trắng = lá mở
      myHandIds.forEach(id => perm.green.add(id));
      if (openId) perm.white.add(openId);

      // Render lại toàn bộ mark (perm + temp)
      applyAllMarks(); // KHÔNG đụng temp -> temp vẫn giữ

      // Cho mark trắng (lá open) lắc ~3s khi bắt đầu ván
      const board = document.getElementById('markBoard');
      if (!board) return;

      const whites = board.querySelectorAll('.mark.white');
      whites.forEach(markEl => {
        markEl.classList.add('just-appeared');
        setTimeout(() => {
          markEl.classList.remove('just-appeared');
        }, 2000);
      });
    },

    markOpponentPlay(id){
      if (!id) return;

      // Chỉ coi là "mark đối thủ" nếu ô đó KHÔNG phải bài của mình (green)
      // và KHÔNG phải lá open (white).
      let isOppMark = false;
      if (!perm.green.has(id) && !perm.white.has(id)){
        perm.purple.add(id);
        isOppMark = true;
      }

      // Xoá mọi temp trên ô đó rồi vẽ lại
      temp.delete(id);
      applyAllMarks();

      // Nếu KHÔNG phải opp mark (tức là id thuộc perm.green hoặc perm.white)
      // thì KHÔNG wiggle.
      if (!isOppMark) return;

      // 🔊 SFX: mark đối thủ (lúc x tím vĩnh viễn xuất hiện)
      if (window.Sound) Sound.play('mark');

      // Hiệu ứng wiggle ~3s cho ô của đối thủ
      const suit = id[0];
      const num  = parseInt(id.slice(1), 10);
      const cell = el(cellId(suit, num));
      if (cell){
        cell.classList.remove('played');
        void cell.offsetWidth;     // restart animation
        cell.classList.add('played');

        setTimeout(() => {
          cell.classList.remove('played');
        }, 3000);
      }
    },

    // Cho chỗ khác gọi để tắt wiggle ngay (đã dùng trong hostEnd / guestEndLocal)
    clearPlayed,
  };
})();
