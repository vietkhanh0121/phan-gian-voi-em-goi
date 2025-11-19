// ===== condense.js — Hand condense + wiggle (safe with HandArc) =====
(() => {
  'use strict';

  const CONDENSE_DURATION = 400;
  const CONDENSE_EASE     = 'cubic-bezier(.15, 0, 0, 1)';
  const OVERSHOOT_RATIO   = 0.20;

  function isHand(el){
    return el && el.classList && el.classList.contains('hand');
  }

  // Giải phóng transform sau khi animation xong
  function releaseTransform(el){
    if (!el) return;

    if (el.classList.contains('selected')){
      // Nếu đang selected: reset transform rồi bật lại selected
      el.classList.remove('selected');
      el.style.transform = '';
      void el.offsetWidth; // force reflow
      el.classList.add('selected');
    } else {
      el.style.transform = '';
    }
  }

  // ===================================================================
  // 1) placeholderIn — được gọi khi placeholder MỚI XUẤT HIỆN trong Hand
  //    Hiệu ứng: wiggle nhẹ (translate + rotate), tính dx2 giống placeholderOut.
  // ===================================================================
  function placeholderIn(handEl, spacer){
    if (!isHand(handEl)) return;

    const parent = handEl;

    const cards = [...handEl.children].filter(el =>
      el !== spacer &&
      el.classList?.contains('card') &&
      !el.classList.contains('selected')
    );
    if (!cards.length) return;

    // ---- Chụp vị trí "cũ" (KHÔNG có spacer) ----
    const nextSibling = spacer.nextSibling;
    // tạm remove spacer để đo vị trí trước khi có placeholder
    spacer.remove();

    const oldMap = new Map();
    cards.forEach(el => {
      oldMap.set(el, el.getBoundingClientRect());
    });

    // ---- Gắn lại spacer đúng chỗ ----
    if (nextSibling) parent.insertBefore(spacer, nextSibling);
    else parent.appendChild(spacer);

    // ---- Frame tiếp theo: đo vị trí mới & wiggle theo hướng di chuyển ----
    requestAnimationFrame(() => {
      const baseRot  = 6;
      const baseOver = 8;

      cards.forEach((el, i) => {
        const r2  = el.getBoundingClientRect();
        const old = oldMap.get(el);
        if (!old) return;

        const dx2 = old.left - r2.left;
        const dy2 = old.top  - r2.top;

        // Nếu lệch quá nhỏ → bỏ
        if (Math.abs(dx2) < 0.5 && Math.abs(dy2) < 0.5) return;

        const ox = -dx2 * OVERSHOOT_RATIO;
        const oy = -dy2 * OVERSHOOT_RATIO;

        // In: card dịch sang trái (dx2 > 0) => xoay sang phải (âm)
        //     card dịch sang phải (dx2 < 0) => xoay sang trái (dương)
        const rStart = dx2 > 0 ? -baseRot : baseRot;
        const rOver  = dx2 > 0 ?  baseOver : -baseOver;

        const anim = el.animate(
    [
            {
              transform: `translate(${dx2}px, ${dy2}px) rotate(${rStart}deg)`
            },
            {
              transform: `translate(${ox}px, ${oy}px) rotate(${rOver}deg)`,
              offset: 0.72
            },
            {
              transform: 'translate(0px,0px) rotate(0deg)'
            }
          ],
          {
            duration : CONDENSE_DURATION,
            //delay    : i * 35,   // lệch nhau cho cảm giác “dồn” tự nhiên
            easing   : CONDENSE_EASE,
            fill     : 'both',   // giữ cảm giác mượt
            composite: 'add'
          }
        );

        anim.finished.then(() => {
          try { anim.cancel(); } catch(e){}
          releaseTransform(el);
        }).catch(()=>{});
      });
    });
  }

  // ===================================================================
  // 2) placeholderOut — được gọi khi placeholder SẮP BIẾN MẤT trong Hand
  //    Hiệu ứng: condense mạnh (translate + overshoot + rotate)
  // ===================================================================
  function placeholderOut(handEl, spacer){
    if (!isHand(handEl)) {
      if (spacer?.remove) spacer.remove();
      return;
    }

    const remain = [...handEl.children].filter(el =>
      el !== spacer &&
      el.classList?.contains('card') &&
      !el.classList.contains('selected')   // không đụng lá đang chọn
    );
    if (!remain.length){
      spacer?.remove();
      return;
    }

    // ---- Chụp vị trí cũ ----
    const oldMap = new Map();
    remain.forEach(el => oldMap.set(el, el.getBoundingClientRect()));

    // ---- Xóa spacer → Hand thu lại ----
    spacer?.remove();

    // ---- Frame tiếp theo: chạy FLIP + overshoot ----
    requestAnimationFrame(() => {
      const baseRot  = 10;
      const baseOver = 12;

      remain.forEach((el, i) => {
        const r2  = el.getBoundingClientRect();
        const old = oldMap.get(el);
        if (!old) return;

        const dx2 = old.left - r2.left;
        const dy2 = old.top  - r2.top;

        // Nếu lệch quá nhỏ → bỏ
        if (Math.abs(dx2) < 0.5 && Math.abs(dy2) < 0.5) return;

        const ox = -dx2 * OVERSHOOT_RATIO;
        const oy = -dy2 * OVERSHOOT_RATIO;

        // Out: card dịch sang trái (dx2 > 0) → xoay sang trái (dương)
        //      card dịch sang phải (dx2 < 0) → xoay sang phải (âm)
        const rStart = dx2 > 0 ?  baseRot : -baseRot;
        const rOver  = dx2 > 0 ? -baseOver :  baseOver;

        const anim = el.animate(
          [
            {
              transform: `translate(${dx2}px, ${dy2}px) rotate(${rStart}deg)`
            },
            {
              transform: `translate(${ox}px, ${oy}px) rotate(${rOver}deg)`,
              offset: 0.72
            },
            {
              transform: 'translate(0px,0px) rotate(0deg)'
            }
          ],
          {
            duration : CONDENSE_DURATION,
            delay    : i * 35,   // lệch nhau cho cảm giác “dồn” tự nhiên
            easing   : CONDENSE_EASE,
            fill     : 'both',   // giữ cảm giác mượt
            composite: 'add'
          }
        );

        // ✅ Khi animation kết thúc: release quyền điều khiển transform
        anim.finished.then(() => {
          try { anim.cancel(); } catch(e){}
          releaseTransform(el);
        }).catch(()=>{});
      });
    });
  }

  // ===================================================================
  // PUBLIC API
  // ===================================================================
  window.Condense = {
    placeholderIn,
    placeholderOut
  };
})();
