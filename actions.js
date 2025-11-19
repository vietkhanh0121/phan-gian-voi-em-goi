// ===== game.core.actions.js — Actions (host/guest, networking, apply state) =====
'use strict';

(function () {
  // Nếu base chưa sẵn sàng thì không làm gì để tránh lỗi
  if (!window.__CoreBase) return;

  // Lightweight selector
  const $ = (sel, root = document) => root.querySelector(sel);

  // Pull shared helpers from base
  const {
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
    hideEndOverlay,
    showRevealOverlay,
    showVictimOverlay,
    // hideVictimOverlay, // hiện tại không dùng nhưng giữ trong __CoreBase
  } = window.__CoreBase;

  // 🔊 SFX helper
  const playSfx = (name) => {
    if (window.Sfx && typeof window.Sfx.play === 'function') {
      window.Sfx.play(name);
    }
  };

  const inDOM = (el) => !!(el && el.parentElement);
  const other = (r) => (r === 'p1' ? 'p2' : 'p1');

  // Flag local: overlay "Nạn nhân" đã show trong ván này hay chưa
  let victimShownThisRound = false;

  // --------------------- Victim + dealFan helper ---------------------
  function runDealFanForMyHand() {
    const { hand } = getContainers();
    if (!hand) return;
    try {
      dealFan(hand);
      if (typeof arcOnNewRound === 'function') {
        arcOnNewRound();
      }
    } catch {
      // bỏ qua lỗi animation nhỏ
    }
  }

  async function showVictimThenDealFan() {
    const openId = window.G?.C?.open;

    // Nếu đã show overlay trong round này, hoặc không có open/overlay, chỉ fan
    if (victimShownThisRound || !openId || typeof showVictimOverlay !== 'function') {
      runDealFanForMyHand();
      return;
    }

    victimShownThisRound = true;

    try {
      const maybe = showVictimOverlay(openId);
      // Nếu overlay trả về Promise → chờ đến khi overlay đóng
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    } catch {
      // ignore error từ overlay
    }

    // Sau khi overlay đóng hẳn mới bắt đầu animation chia bài
    runDealFanForMyHand();
  }

  // --------------------- Host actions ---------------------
  async function hostNewGame() {
    const { hand, stage, pile, ozOpen, ozHidden, oppHand } = getContainers();
    [hand, stage, pile, ozOpen, ozHidden, oppHand].forEach(
      (c) => c && (c.innerHTML = '')
    );

    // Reset chọn
    clearSelection?.();

    window.suppressAnimOnNewRound = true;
    purgeHiddenOutsideOpenZone?.();
    hideEndOverlay?.();

    // Reset vòng
    window.G = null;
    window.roundToken = (window.roundToken || 0) + 1;
    window.selectedId = null;
    window.prevOppStageIds = new Set();
    window.lastTurnSeen = null;
    window.lastEndSeen = false;

    victimShownThisRound = false;

    if (window.Marks) {
      window.Marks.reset?.();
    }

    // Chia bài
    const deck = shuffle(buildDeck());
    const open = deck.shift();
    const hidden = deck.shift();

    const starter = Math.random() < 0.5 ? 'p1' : 'p2';
    const handStart = deck.splice(0, 7);
    const handFollow = deck.splice(0, 6);

    const cards = {};
    [open, hidden, ...handStart, ...handFollow].forEach((id) => {
      cards[id] = metaOf(id);
    });

    preloadList([
      BACK_SRC,
      ...Object.values(cards).map((m) => m.frontSrc),
    ]);

    let hands = {
      p1: starter === 'p1' ? handStart : handFollow,
      p2: starter === 'p2' ? handStart : handFollow,
    };
    hands = sortAllHands(hands);

    window.G = {
      turn: starter,
      end: false,
      turnHasCard: false,
      hands,
      stage: { p1: [], p2: [] },
      C: { open, hidden: { id: hidden, revealed: false } },
      cards,
      flags: { newRound: true },
      version: Date.now(),
    };

    // Marks cho host
    if (window.Marks) {
      const myHandIds = window.G.hands[window.myRole] || [];
      const openId = window.G.C.open;
      window.Marks.applyDeal?.({ myHandIds, openId });
    }

    await reconcile({ skipAnim: true });
    updateUIByTurn?.();

    // Host: show Victim overlay (Promise-based) rồi mới chia bài cho tay mình
    showVictimThenDealFan();

    if (window.Net) {
      window.Net.broadcast(window.G);
    }
    if (window.G.flags) window.G.flags.newRound = false;

    queueMicrotask(() => {
      window.suppressAnimOnNewRound = false;
    });
  }
  window.hostNewGame = hostNewGame;

  async function hostPlay(bypassTurn = false) {
    const G = window.G;
    if (!G || G.end) return;
    if (!bypassTurn && G.turn !== window.myRole) return;
    if (G.turnHasCard) return;

    const me = G.turn;
    if (!window.selectedId || !G.hands[me]?.includes(window.selectedId)) return;

    // Move state
    G.hands[me] = G.hands[me].filter((x) => x !== window.selectedId);
    G.stage[me].push(window.selectedId);
    G.turnHasCard = true;
    G.version = Date.now();

    const isOpponentPlayOnHost = bypassTurn && G.turn !== window.myRole;

    // Host tự play (không phải xử lý intent từ client) → animate lá bay
    if (!isOpponentPlayOnHost) {
      const el = document.querySelector(`.card[data-id="${window.selectedId}"]`);
      if (inDOM(el)) {
        playSfx('card_fly');
        await window.flyFLIP?.(el, $('#stage'), { duration: 280 });
      }
    }

    clearSelection?.();
    await reconcile();

    if (!isOpponentPlayOnHost && window.HandArc) {
      arcOnMyPlay?.();
    }

    if (window.Net) {
      window.Net.broadcast(G);
    }
  }
  window.hostPlay = hostPlay;

  async function hostEnd(bypassTurn = false) {
    const G = window.G;
    if (!G || G.end) return;
    if (!bypassTurn && G.turn !== window.myRole) return;
    if (!G.turnHasCard) return;

    const me = G.turn;
    const opp = other(me);
    const id = G.stage[me][G.stage[me].length - 1];
    if (!id) return;

    G.stage[me] = G.stage[me].filter((x) => x !== id);
    G.stage[opp].push(id);

    const el = document.querySelector(`.card[data-id="${id}"]`);
    if (inDOM(el)) {
      playSfx('card_fly');
      await window.flyFLIP?.(el, $('#pile'), { duration: 280 });
    }

    G.turn = opp;
    G.turnHasCard = false;
    G.version = Date.now();

    clearSelection?.();
    await reconcile();

    // Sau khi lá bài của MÌNH bay từ stage → pile, tắt hiệu ứng wiggle mark
    if (window.Marks && typeof window.Marks.clearPlayed === 'function') {
      window.Marks.clearPlayed();
    }

    if (window.Net) {
      window.Net.broadcast(G);
    }
  }
  window.hostEnd = hostEnd;

  // --------------------- Guess resolve (WIN/LOSE + Compare overlay sync) ---------------------
  async function hostResolveGuess(guesserPid, chosenId) {
    const G = window.G;
    if (!G || G.end) return;

    const hiddenId = G?.C?.hidden?.id;
    if (!hiddenId || !chosenId) return;

    // Cập nhật state: lật & kết thúc ván
    G.C.hidden.revealed = true;

    const correct = String(chosenId) === String(hiddenId);
    const winner = correct ? guesserPid : other(guesserPid);

    G.end = true;
    G.winner = winner;
    G.turnHasCard = false;
    G.flags = G.flags || {};
    G.flags.reveal = true;       // đánh dấu ván kết thúc bằng Guess
    G.flags.chosenId = chosenId; // nhớ lá đoán
    G.version = Date.now();

    try {
      await reconcile({ skipAnim: true });
      updateUIByTurn?.();
    } catch {
      // ignore reconcile error
    }

    // Broadcast state như cũ
    if (window.Net) {
      window.Net.broadcast(G);
      // Gửi thêm message "reveal" để Guest show Compare overlay NGAY
      if (typeof window.Net.send === 'function') {
        window.Net.send('reveal', { chosenId, hiddenId });
      }
    }

    // Host cũng show Compare overlay ngay lập tức
    if (typeof showRevealOverlay === 'function') {
      try {
        await showRevealOverlay(chosenId, hiddenId);
      } catch {
        // ignore overlay error
      }
    }
  }
  window.hostResolveGuess = hostResolveGuess;

  // --------------------- Guest intents (optimistic) ---------------------
  async function guestPlay() {
    const G = window.G;
    if (!G) return;
    if (G.turn !== window.myRole || G.turnHasCard) return;
    if (!window.selectedId) return;

    const idToSend = window.selectedId;
    const el = ensureCardEl(idToSend);

    if (el) {
      el.classList.remove('selected');
      playSfx('card_fly');
      await window.flyFLIP?.(el, $('#stage'), { duration: 450 });
    }

    if (G) G.turnHasCard = true;

    clearSelection?.();
    if (window.HandArc) {
      arcOnMyPlay?.();
    }
    updateUIByTurn?.();

    if (window.Net) {
      window.Net.send('intent', { kind: 'PLAY', id: idToSend });
    }
  }
  window.guestPlay = guestPlay;

  async function guestEndLocal() {
    const G = window.G;
    if (!G) return;
    if (G.turn !== window.myRole) return;
    if (!G.turnHasCard) return;

    const stageEl = $('#stage');
    const list = stageEl ? [...stageEl.querySelectorAll('.card')] : [];
    const last = list[list.length - 1];

    if (last) {
      playSfx('card_fly');
      await window.flyFLIP?.(last, $('#pile'), { duration: 280 });
    }

    G.turnHasCard = false;
    G.turn = other(window.myRole);
    G.version = Date.now();

    // Khi client của mình vừa End, tắt hiệu ứng wiggle mark (nếu đang bật)
    if (window.Marks && typeof window.Marks.clearPlayed === 'function') {
      window.Marks.clearPlayed();
    }

    updateUIByTurn?.();
  }
  window.guestEndLocal = guestEndLocal;

  function guestNew() {
    if (window.Net) {
      window.Net.send('intent', { kind: 'NEW' });
    }
  }
  window.guestNew = guestNew;

  // --------------------- Apply incoming state ---------------------
  async function applyIncomingState(incoming) {
    if (incoming?.cards) {
      const srcs = Object.values(incoming.cards).map((m) => FRONT_SRC(m.id));
      preloadList([BACK_SRC, ...srcs]);
    }

    if (incoming?.hands) {
      incoming.hands = sortAllHands(incoming.hands);
    }

    // Nếu là newRound hoặc ván chưa end -> luôn ẩn End Overlay
    if ((incoming?.flags?.newRound || !incoming?.end) && typeof hideEndOverlay === 'function') {
      try {
        hideEndOverlay();
      } catch {
        // ignore
      }
    }

    // ===== New round =====
    if (incoming?.flags?.newRound) {
      window.suppressAnimOnNewRound = true;
      purgeHiddenOutsideOpenZone?.();

      window.G = incoming;
      window.roundToken = (window.roundToken || 0) + 1;
      window.selectedId = null;
      clearSelection?.();

      window.prevOppStageIds = new Set();
      window.lastTurnSeen = null;
      window.lastEndSeen = false;

      victimShownThisRound = false;

      if (window.Marks && window.myRole) {
        window.Marks.reset?.();
        const myHandIds = window.G.hands[window.myRole] || [];
        const openId = window.G.C.open;
        window.Marks.applyDeal?.({ myHandIds, openId });
      }

      await reconcile({ skipAnim: true });

      // Ép DOM order tay bài nếu cần
      if (window.myRole) {
        const wantSorted = sortIdsBySuitNo(window.G.hands[window.myRole] || []);
        window.forceDomOrderIfMismatch &&
          window.forceDomOrderIfMismatch('#hand', wantSorted);
      }

      // Guest (và host nếu nhận state lại) cũng dùng cùng 1 helper
      showVictimThenDealFan();

      queueMicrotask(() => {
        window.suppressAnimOnNewRound = false;
      });

      clearSelection?.();
      updateUIByTurn?.();
      return;
    }

    // ===== Bình thường (không newRound) =====
    window.G = incoming;
    await reconcile();

    clearSelection?.();
    updateUIByTurn?.();

    // Chỉ auto show End Overlay nếu KHÔNG phải ván kết thúc bằng Guess (flags.reveal)
    if (
      window.G &&
      window.G.end &&
      (!window.G.flags || !window.G.flags.reveal) &&
      typeof window.requestShowEndOverlay === 'function'
    ) {
      try {
        window.requestShowEndOverlay();
      } catch {
        // ignore
      }
    }
  }
  window.applyIncomingState = applyIncomingState;

  // --------------------- Networking glue ---------------------
  let bufferedState = null;

  if (window.Net) {
    window.Net.onMessage(async (msg) => {
      if (!msg || !msg.type) return;

      // Client gửi intent → Host xử lý
      if (msg.type === 'intent' && window.isHost) {
        const { kind, id, from } = msg.payload || {};

        if (kind === 'PLAY') {
          window.selectedId = id;
          await hostPlay(true);
        }
        if (kind === 'END') {
          await hostEnd(true);
        }
        if (kind === 'NEW') {
          await hostNewGame();
        }
        if (kind === 'GUESS') {
          await hostResolveGuess(from || 'p2', id);
        }
        return;
      }

      // Host gửi message "reveal" → Guest show Compare overlay NGAY LẬP TỨC
      if (msg.type === 'reveal') {
        const { chosenId, hiddenId } = msg.payload || {};
        if (typeof showRevealOverlay === 'function') {
          try {
            await showRevealOverlay(chosenId, hiddenId);
          } catch {
            // ignore
          }
        }
        return;
      }

      // Host phát state → Client apply
      if (msg.type === 'state') {
        const incoming = msg.payload;
        if (!window.netReady || !window.myRole) {
          bufferedState = incoming;
          return;
        }
        await applyIncomingState(incoming);
      }
    });

    window.Net.onReadyInGame(async ({ role, isHost }) => {
      window.netReady = true;
      window.isHost = isHost;
      window.myRole =
        role === 'host' ? 'p1' :
        role === 'guest' ? 'p2' :
        role;

      if (window.Marks) {
        window.Marks.init?.();
      }

      if (window.GfxPreload?.readyOnce) {
        try {
          await window.GfxPreload.readyOnce();
        } catch {
          // ignore preload error
        }
      }

      // Guess overlay init
      if (window.Guess && !window.__guessInited) {
        window.__guessInited = true;
        window.Guess.init({
          getState : () => window.G,
          getRole  : () => window.myRole,
          isHostFn : () => window.isHost,
          FRONT_SRC,
          buildDeck,
          reconcile,
          hostNewGame,
          guestNew,
          Net      : window.Net,
          dealFan,
        });
      }

      if (bufferedState) {
        const s = bufferedState;
        bufferedState = null;
        await applyIncomingState(s);
      } else {
        if (isHost) {
          await hostNewGame();
        } else {
          updateUIByTurn?.();
        }
      }
    });
  }
})();
