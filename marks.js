// marks.js — Secret Mark Board (local-only)
// - 4 cột ứng với suits theo thứ tự: xanh(g) → đỏ(r) → vàng(y) → đen(k)
// - Badge chỉ hiển thị SỐ (không g/r/y/k)
// - Đánh dấu vĩnh viễn: xanh (myHand), trắng (C.open), tím (đối phương PLAY)
// - Đánh dấu tạm thời (local, click cycle): none → 'x' tím → '?' trắng → none
// - Khi đối phương PLAY một id, nếu đang có dấu tạm ở ô đó → xoá dấu tạm

(function(){
  const $ = s => document.querySelector(s);

  // Suits & values
  const SUITS = ['g','r','y','k'];           // xanh → đỏ → vàng → đen
  const VALUES = {
    g: [1,2,3,4],                            // hiển thị số 1..4
    r: [1,2,3,4],
    y: [1,2,3,4],
    k: [5,6,7,null],                         // cột đen có 3 lá (5,6,7) + 1 ô trống
  };

  // State (local-only)
  const state = {
    permGreen: new Set(),   // myHand ids (x xanh) — vĩnh viễn đến hết ván
    permWhite: new Set(),   // C.open id (x trắng) — vĩnh viễn đến hết ván
    permPurple: new Set(),  // opponent PLAY ids (x tím) — vĩnh viễn đến hết ván
    temp: Object.create(null), // { id: 'opp' | 'guess' } — tạm thời (local)
    mounted: false,
  };

  // ===== Utilities =====
  const idOf = (suit, val) => (val == null ? null : `${suit}${val}`);
  const hasAnyPerm = (id) =>
    state.permGreen.has(id) || state.permWhite.has(id) || state.permPurple.has(id);

  // ===== Mount / Host container right under header =====
  function ensureHostBox(){
    let host = document.getElementById('markBoardHost');
    const header = $('.appHeader');
    if (!host){
      host = document.createElement('div');
      host.id = 'markBoardHost';
    }
    if (header && header.parentNode) {
      const parent = header.parentNode;
      if (host.parentNode !== parent) {
        if (header.nextSibling) parent.insertBefore(host, header.nextSibling);
        else parent.appendChild(host);
      }
    }
    return host;
  }

  // ===== Render one cell
  function renderCell(suit, val){
    const cell = document.createElement('div');
    cell.className = 'mb-cell';

    // Badge: chỉ số — không hiển thị chữ suit
    const badge = document.createElement('div');
    badge.className = 'mb-badge';
    if (val == null){
      badge.classList.add('empty');
      badge.textContent = '';
    } else {
      badge.classList.add(suit);      // dùng màu theo CSS (.mb-badge.g/.r/.y/.k)
      badge.textContent = String(val);
    }
    cell.appendChild(badge);

    // Marks: vùng chứa các dấu
    const marks = document.createElement('div');
    marks.className = 'mb-marks';
    cell.appendChild(marks);

    // Nếu là ô hợp lệ có id
    const id = idOf(suit, val);
    if (id){
      cell.dataset.id = id;

      // Click cycle (tạm thời): none → 'opp'(x tím) → 'guess'('?') → none
      cell.addEventListener('click', ()=>{
        // Không cho click nếu đã có dấu vĩnh viễn
        if (hasAnyPerm(id)) return;

        const cur = state.temp[id] || null;
        if (cur === null) {
          state.temp[id] = 'opp';     // x tím
        } else if (cur === 'opp') {
          state.temp[id] = 'guess';   // ? trắng
        } else {
          delete state.temp[id];      // none
        }
        // Re-render marks in this cell only
        paintMarksForCell(cell, id);
      });

      // Lần đầu vẽ marks cho cell này
      paintMarksForCell(cell, id);
    }

    return cell;
  }

  // ===== Paint marks for a single cell by id into provided cell element
  function paintMarksForCell(cell, id){
    const marks = cell.querySelector('.mb-marks');
    if (!marks) return;
    marks.innerHTML = '';

    // Ưu tiên hiển thị dấu VĨNH VIỄN trước, không chồng tạm lên
    if (state.permGreen.has(id)) {
      const m = document.createElement('span');
      m.className = 'mark green';
      m.textContent = 'x';
      marks.appendChild(m);
      return;
    }
    if (state.permWhite.has(id)) {
      const m = document.createElement('span');
      m.className = 'mark white';
      m.textContent = '☠️';
      marks.appendChild(m);
      return;
    }
    if (state.permPurple.has(id)) {
      const m = document.createElement('span');
      m.className = 'mark purple';
      m.textContent = 'x';
      marks.appendChild(m);
      return;
    }

    // Không có vĩnh viễn → có thể hiển thị tạm thời (nếu có)
    const t = state.temp[id];
    if (t === 'opp') {
      const m = document.createElement('span');
      m.className = 'mark purple';
      m.textContent = 'x';
      marks.appendChild(m);
    } else if (t === 'guess') {
      const m = document.createElement('span');
      m.className = 'mark white';
      m.textContent = '?';
      marks.appendChild(m);
    }
  }

  // ===== Build full board (4x4) with column-per-suit
  function buildBoard(){
    const board = document.createElement('div');
    board.className = 'markBoard';

    // LƯU Ý: để grid 4 cột đúng theo suit, ta đẩy theo thứ tự hàng → cột:
    // for each row (4 hàng), for each suit (4 cột)
    for (let row = 0; row < 4; row++){
      for (const suit of SUITS){
        const vals = VALUES[suit];
        const val = vals[row] ?? null;    // row-th value of this suit
        const cell = renderCell(suit, val);
        board.appendChild(cell);
      }
    }
    return board;
  }

  function renderAll(){
    const host = ensureHostBox();
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(buildBoard());
  }

  // ===== Public API =====
  const Marks = {
    init(){
      renderAll();
      state.mounted = true;
    },
    reset(){
      state.permGreen.clear();
      state.permWhite.clear();
      state.permPurple.clear();
      state.temp = Object.create(null);
      renderAll();
    },
    // Áp dụng khi chia bài đầu ván (local): myHandIds (x xanh), openId (x trắng)
    applyDeal({ myHandIds = [], openId = null } = {}){
      for (const id of myHandIds) state.permGreen.add(id);
      if (openId) state.permWhite.add(openId);
      renderAll();
    },
    // Khi đối phương PLAY (Hand -> Stage của họ): đánh dấu x tím (vĩnh viễn),
    // nếu ô đang có dấu tạm thời → xoá dấu tạm.
    markOpponentPlay(id){
      if (!id) return;
      if (!state.permGreen.has(id) && !state.permWhite.has(id)) {
        state.permPurple.add(id);
      }
      if (state.temp[id]) delete state.temp[id];

      // Repaint chỉ cell này nếu đang mounted
      if (state.mounted){
        const cell = document.querySelector(`.mb-cell[data-id="${id}"]`);
        if (cell) paintMarksForCell(cell, id);
      }
    }
  };

  window.Marks = Marks;
})();
