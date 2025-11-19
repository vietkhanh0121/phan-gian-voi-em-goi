// ===== handArc.js — Arc layout via CSS variables =====
(function(){
  const CFG = {
    spreadDeg: 16,   // góc xoay tối đa ở mép
    liftPx: 10       // nhô lên tối đa ở mép
  };

  function apply(container){
    if (!container) return;
    const cards = [...container.querySelectorAll('.card')];
    const n = cards.length;
    if (!n) return;

    container.dataset.arc = '1'; // bật CSS arc
    const mid = (n - 1) / 2;

    cards.forEach((el, i) => {
      // Nếu lá đang selected, không cưỡng bức arc (để selected override)
      if (el.classList.contains('selected')) return;

      const t = (i - mid) / (mid || 1); // -1..0..+1
      const rot  = t * CFG.spreadDeg;
      const lift = Math.abs(t) * CFG.liftPx;

      // set CSS variables (không set transform trực tiếp)
      el.style.setProperty('--rot',  rot.toFixed(2) + 'deg');
      el.style.setProperty('--lift', lift.toFixed(2) + 'px');
    });
  }

  // Sau khi deal/fan xong ở đầu ván/đầu game
  function onNewRound(container){
    apply(container);
  }

  // Ngay sau khi CHÍNH MÌNH vừa PLAY (Hand giảm 1 lá)
  function onMyPlay(container){
    apply(container);
  }

  // Nếu bỏ chọn 1 lá → gọi lại để arc “khép” đều
  function onClearSelection(container){
    apply(container);
  }

  window.HandArc = { apply, onNewRound, onMyPlay, onClearSelection, _cfg: CFG };
})();
