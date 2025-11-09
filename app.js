// ===== app.js — Card Feel – P2P (Host Broadcast State) =====

// ===== DOM helpers =====
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

// ===== Sprite config =====
const FRONT_SRC = id => `assets/cards/${id}.png`;
const BACK_SRC  = `assets/cards/back.png`;

const SPRITE_CACHE = new Map();
function preload(src){
  if (!src || SPRITE_CACHE.has(src)) return;
  const img = new Image();
  img.src = src;
  SPRITE_CACHE.set(src, true);
}
function preloadList(list){ list.forEach(preload); }

// ===== Small async helpers =====
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
async function waitForEl(sel, timeout=1200){
  const t0 = performance.now();
  while(performance.now() - t0 < timeout){
    const el = document.querySelector(sel);
    if (el) return el;
    await wait(16);
  }
  return null;
}

// ===== State =====
let G = null;          // Host authoritative state
let isHost = false;
let netReady = false;
let myRole = 'guest';  // 'p1' | 'p2'
let selectedId = null; // id lá được chọn trong hand
let prevOppStageIds = new Set();
let roundToken = 0;

// ===== Role normalization & DOM correction =====
function normalizeRole(r){
  if (r === 'p1' || r === 'p2') return r;
  if (r === 'host') return 'p1';
  if (r === 'guest') return 'p2';
  return null;
}
function forceDomOrderIfMismatch(containerSel, targetIds){
  const c = document.querySelector(containerSel);
  if (!c) return;
  const dom = [...c.querySelectorAll('.card')].map(el => el.dataset.id);
  if ((dom||[]).join(',') === (targetIds||[]).join(',')) return;

  const map = new Map();
  dom.forEach(id => {
    const el = c.querySelector(`.card[data-id="${id}"]`);
    if (el) map.set(id, el);
  });

  c.innerHTML = '';
  targetIds.forEach(id => {
    let el = map.get(id) || ensureCardEl(id);
    if (el) c.appendChild(el);
  });
}

// ===== Deck utilities =====
function buildDeck(){
  const ids=[];
  ['g','r','y'].forEach(s => { for(let n=1;n<=4;n++) ids.push(`${s}${n}`); });
  for(let n=5;n<=7;n++) ids.push(`k${n}`);
  return ids;
}
function metaOf(id){
  const suit=id[0], no=id.slice(1);
  return { id, suit, no, text: no, frontSrc: FRONT_SRC(id) };
}
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function other(r){ return r==='p1' ? 'p2' : 'p1'; }

// ===== Sort helpers =====
const SUIT_ORDER = { g:0, r:1, y:2, k:3 };
function sortIdsBySuitNo(ids){
  return [...(ids||[])].sort((a,b)=>{
    const sa = SUIT_ORDER[a?.[0]] ?? 99;
    const sb = SUIT_ORDER[b?.[0]] ?? 99;
    if(sa !== sb) return sa - sb;
    const na = parseInt(String(a||'').slice(1),10);
    const nb = parseInt(String(b||'').slice(1),10);
    return na - nb;
  });
}
function sortAllHands(hands){
  return {
    p1: sortIdsBySuitNo(hands?.p1 || []),
    p2: sortIdsBySuitNo(hands?.p2 || []),
  };
}

// ===== Card DOM =====
function createCardEl(meta){
  const el=document.createElement('div');
  el.className='card';
  el.dataset.id=meta.id;
  el.dataset.suit=meta.suit;
  el.dataset.no=meta.no;

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
function ensureCardEl(id){
  let el=document.querySelector(`.card[data-id="${id}"]`);
  if(el) return el;
  const meta=G?.cards?.[id];
  if(!meta) return null;
  return createCardEl(meta);
}
function getContainers(){
  return {
    hand:  $('#hand'),
    stage: $('#stage'),
    pile:  $('#pile'),
    ozOpen:   $('#ozOpen'),
    ozHidden: $('#ozHidden'),
  };
}

// ===== Hidden-state sanitizers =====
function sanitizeCardForZone(el, containerId){
  if (containerId !== 'ozHidden'){
    if (el.hasAttribute('data-hidden')) el.removeAttribute('data-hidden');
    el.classList.remove('facedown');
    el.style.transform = '';
  }
}
function purgeHiddenOutsideOpenZone(){
  $$('.card[data-hidden="1"]').forEach(el=>{
    const inHiddenSlot = el.closest('#ozHidden');
    if (!inHiddenSlot){
      el.removeAttribute('data-hidden');
      el.classList.remove('facedown');
      el.style.transform = '';
    }
  });
}

// ===== UI helpers =====
function setTurnHint(txt,cls){
  const hint=$('#turnHint');
  if(!hint) return;
  hint.textContent=txt;
  hint.classList.remove('turn--my','turn--opp','turn--end');
  if(cls) hint.classList.add(cls);
}
function myTurn(){ return G && !G.end && G.turn===myRole; }

function setButtonsEnabled(){
  const bPlay = $('#btnPlay'), bEnd = $('#btnEnd'), bNew = $('#btnNew');
  const canAct  = !!G && !G.end && myTurn();
  [bPlay, bEnd].forEach(b=>{
    if(!b) return;
    if(b.hasAttribute('disabled')) b.removeAttribute('disabled');
    b.classList.toggle('btn-off', !canAct);
  });
  if(bNew && bNew.hasAttribute('disabled')) bNew.removeAttribute('disabled');
}
function updateUIByTurn(){
  if(!G){ setTurnHint('Host authoritative','turn--end'); setButtonsEnabled(); return; }
  if(G.end){ setTurnHint('ĐÃ LẬT LÁ ẨN — KẾT THÚC VÁN','turn--end'); }
  else if(myTurn()){ setTurnHint('Tới lượt bạn','turn--my'); }
  else{
    setTurnHint('Đợi đối thủ','turn--opp');
    if (selectedId) clearSelection();
  }
  setButtonsEnabled();
}

// ===== Reconcile DOM =====
async function ensureContainerOrder(container, targetIds, {skipAnim=false}={}){
  if (!container) return;

  const containerId = container.id;
  const currentHiddenId = G?.C?.hidden?.id || null;

  let effectiveIds = targetIds;
  if (containerId === 'ozOpen'){
    effectiveIds = G?.C?.open ? [G.C.open] : [];
  } else if (containerId === 'ozHidden'){
    effectiveIds = G?.C?.hidden?.id ? [G.C.hidden.id] : [];
  } else {
    effectiveIds = targetIds.filter(id => id !== currentHiddenId);
  }

  for (const id of effectiveIds){
    let el = document.querySelector(`.card[data-id="${id}"]`);
    if (!el) el = ensureCardEl(id);
    if (!el) continue;

    const appendAndSanitize = () => {
      container.appendChild(el);
      sanitizeCardForZone(el, containerId);
    };

    if (!document.body.contains(el) || !el.parentNode){
      appendAndSanitize();
      continue;
    }

    if (el.parentElement !== container){
      if (skipAnim || containerId.startsWith('oz')) {
        appendAndSanitize();
      } else {
        await flyFLIP(el, container, { duration: 560 });
        sanitizeCardForZone(el, containerId);
      }
    } else {
      const curIdx = [...container.children].indexOf(el);
      const tgtIdx = effectiveIds.indexOf(id);
      if (curIdx !== tgtIdx){
        container.insertBefore(el, container.children[tgtIdx] || null);
      }
      sanitizeCardForZone(el, containerId);
    }
  }

  [...container.querySelectorAll('.card')].forEach(el=>{
    const id = el.dataset.id;
    const inList = effectiveIds.includes(id);
    if (!inList) el.remove();
  });

  if (containerId === 'hand' && typeof selectedId === 'string' && !effectiveIds.includes(selectedId)){
    $$('.card.selected').forEach(c => c.classList.remove('selected'));
    selectedId = null;
  }
}

async function reconcile(options = {}){
  if(!G) return;

  const skipAnim = !!options.skipAnim;
  const {hand, stage, pile, ozOpen, ozHidden} = getContainers();

  const myHandSorted = sortIdsBySuitNo(G.hands[myRole] || []);
  await ensureContainerOrder(hand,  myHandSorted, {skipAnim});
  await ensureContainerOrder(stage, G.stage[myRole],        {skipAnim});
  await ensureContainerOrder(pile,  G.stage[other(myRole)], {skipAnim});

  await ensureContainerOrder(ozOpen,   [], {skipAnim:true});
  await ensureContainerOrder(ozHidden, [], {skipAnim:true});

  // Hidden facedown state
  const hidId = G?.C?.hidden?.id;
  if (hidId) {
    const hiddenEl = $('#ozHidden .card');
    if (hiddenEl) {
      if (G.C.hidden.revealed) {
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

// Đánh dấu tím local khi đối phương PLAY
function updateOpponentStageMarks(){
  if (!G) return;
  const opp = other(myRole);
  const nowIds = new Set(G.stage[opp] || []);
  for (const id of nowIds){
    if (!prevOppStageIds.has(id)){
      if (window.Marks && typeof Marks.markOpponentPlay === 'function') {
        Marks.markOpponentPlay(id);
      }
    }
  }
  prevOppStageIds = nowIds;
}

// ===== Selection (toggle chọn / bỏ chọn) =====
function clearSelection(){
  $$('.card.selected').forEach(c=>c.classList.remove('selected'));
  selectedId = null;
}
$('#hand').addEventListener('click', e=>{
  if (!myTurn()) return;
  if (G?.turnHasCard) return;

  const el = e.target.closest('.card');
  if (!el || !el.closest('#hand')) return;

  const id = el.dataset.id;
  if (!G || !G.hands[myRole].includes(id)) return;

  if (selectedId === id && el.classList.contains('selected')){
    el.classList.remove('selected');
    selectedId = null;
    return;
  }

  clearSelection();
  el.classList.add('selected');
  selectedId = id;
});

// ===== SplitFX trigger for C.open at new round =====
let lastSplitRoundToken = -1;
async function maybeRunOpenSplitFX(){
  if (!window.SplitFX) return;
  if (!G || !G.C?.open) return;
  if (roundToken === lastSplitRoundToken) return;

  const ozOpenCard = await waitForEl('#ozOpen .card', 1000);
  const pileEl = document.getElementById('pile');
  if (!ozOpenCard || !pileEl) return;

  const openId = G.C.open;
  const frontSrc = FRONT_SRC(openId);

  const clone = ozOpenCard.cloneNode(true);
  clone.classList.add('splitfx-clone');
  ozOpenCard.before(clone);

  const prevVis = ozOpenCard.style.visibility;
  ozOpenCard.style.visibility = 'hidden';

  try{
    await window.SplitFX.cutAndDrop({
      cardEl: clone,
      pileEl,
      frontSrc,
      scale: 2.0,
      timings: { flyDur: 520, splitDur: 420, hold: 180, dropDur: 680 },
      geometry: { gap: 18, tilt: 8 },
      onDone: () => {
        ozOpenCard.style.visibility = prevVis || '';
      }
    });
  }finally{
    lastSplitRoundToken = roundToken;
  }
}

// ===== Host setup =====
async function hostNewGame(){
  const {hand, stage, pile, ozOpen, ozHidden} = getContainers();
  [hand,stage,pile,ozOpen,ozHidden].forEach(c=>c && (c.innerHTML=''));
  clearSelection();

  purgeHiddenOutsideOpenZone();

  roundToken++;
  prevOppStageIds = new Set();
  if (window.Marks) Marks.reset();

  const deck   = shuffle(buildDeck());
  const open   = deck.shift();
  const hidden = deck.shift();

  const starter    = Math.random() < 0.5 ? 'p1' : 'p2';
  const handStart  = deck.splice(0,7);
  const handFollow = deck.splice(0,6);

  const cards = {};
  [open,hidden, ...handStart, ...handFollow].forEach(id => cards[id] = metaOf(id));

  preloadList([
    BACK_SRC,
    ...Object.values(cards).map(m => m.frontSrc),
  ]);

  let hands = {
    p1: starter==='p1' ? handStart  : handFollow,
    p2: starter==='p2' ? handStart  : handFollow
  };
  hands = sortAllHands(hands);

  G = {
    turn: starter,
    end: false,
    turnHasCard: false,
    hands,
    stage: { p1:[], p2:[] },
    C: {
      open,
      hidden: { id: hidden, revealed: false }
    },
    cards,
    flags: { newRound: true },
    version: Date.now()
  };

  if (window.Marks) {
    const myHandIds = G.hands[myRole] || [];
    const openId = G.C.open;
    Marks.applyDeal({ myHandIds, openId });
  }

  await reconcile({ skipAnim: true });
  updateUIByTurn();
  Net.broadcast(G);
  if (G.flags) G.flags.newRound = false;

  // Run split-effect on host
  await maybeRunOpenSplitFX();
}

function inDOM(el){ return el && el.parentElement; }

// ===== Host actions =====
async function hostPlay(bypassTurn=false){
  if(!G || G.end) return;
  if(!bypassTurn && !myTurn()) return;
  if(G.turnHasCard) return;

  const me = G.turn;
  if(!selectedId || !G.hands[me].includes(selectedId)) return;

  G.hands[me] = G.hands[me].filter(x => x !== selectedId);
  G.stage[me].push(selectedId);
  G.turnHasCard = true;
  G.version = Date.now();

  const el = document.querySelector(`.card[data-id="${selectedId}"]`);
  if (inDOM(el)) await flyFLIP(el, $('#stage'), { duration: 560 });

  clearSelection();
  await reconcile();
  Net.broadcast(G);
}

async function hostEnd(bypassTurn=false){
  if(!G || G.end) return;
  if(!bypassTurn && !myTurn()) return;
  if(!G.turnHasCard) return;

  const me  = G.turn;
  const opp = other(me);

  const id = G.stage[me][G.stage[me].length - 1];
  if(!id) return;

  G.stage[me] = G.stage[me].filter(x => x !== id);
  G.stage[opp].push(id);

  const el = document.querySelector(`.card[data-id="${id}"]`);
  if (inDOM(el)) await flyFLIP(el, $('#pile'), { duration: 560 });

  G.turn = opp;
  G.turnHasCard = false;
  G.version = Date.now();

  clearSelection();
  await reconcile();
  Net.broadcast(G);
}

async function hostFlip(bypassTurn=false){
  if(!G || G.end) return;
  if(!bypassTurn && !myTurn()) return;
  if(G.turnHasCard) return;
  if(!G.C?.hidden?.id || G.C.hidden.revealed) return;

  const hiddenEl = $('#ozHidden .card');
  if(hiddenEl) await flip3D(hiddenEl, { duration: 420 });

  G.C.hidden.revealed = true;
  G.end = true;
  G.version = Date.now();

  await reconcile();
  Net.broadcast(G);
}

// ===== Guest intents (Optimistic Animations) =====
async function guestPlay(){
  if(!myTurn() || !selectedId) return;
  if(G?.turnHasCard) return;

  const idToSend = selectedId;

  const el = ensureCardEl(idToSend);
  if (el) {
    el.classList.remove('selected');
    await flyFLIP(el, $('#stage'), { duration: 560 });
  }

  if (G) G.turnHasCard = true;

  clearSelection();
  updateUIByTurn();
  Net.send('intent', { kind:'PLAY', id: idToSend });
}

async function guestEnd(){
  if(!myTurn()) return;
  if(!G?.turnHasCard) return;

  const stageEl = $('#stage');
  const list = stageEl ? [...stageEl.querySelectorAll('.card')] : [];
  const last = list[list.length - 1];
  if (last) await flyFLIP(last, $('#pile'), { duration: 560 });

  if (G) G.turnHasCard = false;

  updateUIByTurn();
  Net.send('intent', { kind:'END' });
}

async function guestFlip(){
  if(!myTurn()) return;
  if(G?.turnHasCard) return;

  const hiddenEl = $('#ozHidden .card');
  if (hiddenEl) await flip3D(hiddenEl, { duration: 420 });
  updateUIByTurn();

  Net.send('intent', { kind:'FLIP' });
}

async function guestNew(){
  Net.send('intent', { kind:'NEW' });
}

// ===== Wire buttons =====
$('#btnPlay').addEventListener('click', ()=> isHost ? hostPlay()     : guestPlay());
$('#btnEnd') .addEventListener('click', ()=> isHost ? hostEnd()      : guestEnd());
$('#btnReveal')?.addEventListener('click', ()=> isHost ? hostFlip()  : guestFlip());
$('#btnNew') .addEventListener('click', ()=> isHost ? hostNewGame()  : guestNew());

// ===== Incoming state apply (Guest-safe) =====
async function applyIncomingState(incoming){
  if (incoming?.cards){
    const srcs = Object.values(incoming.cards).map(m => FRONT_SRC(m.id));
    preloadList([BACK_SRC, ...srcs]);
  }

  if (incoming?.hands){
    incoming.hands = sortAllHands(incoming.hands);
  }

  if (incoming?.flags?.newRound) {
    purgeHiddenOutsideOpenZone();
    G = incoming;
    roundToken++;
    prevOppStageIds = new Set();

    if (window.Marks && myRole){
      Marks.reset();
      const myHandIds = G.hands[myRole] || [];
      const openId = G.C.open;
      Marks.applyDeal({ myHandIds, openId });
    }

    await reconcile({ skipAnim: true });

    // Run split-effect on guest (lần đầu ván)
    await maybeRunOpenSplitFX();

  } else {
    G = incoming;
    await reconcile();
  }

  const want = sortIdsBySuitNo(G.hands[myRole] || []);
  const dom  = [...$('#hand').querySelectorAll('.card')].map(e=>e.dataset.id);
  if ((dom||[]).join(',') !== (want||[]).join(',')){
    forceDomOrderIfMismatch('#hand', want);
  }

  clearSelection();
  updateUIByTurn();
}

// ===== Networking =====
let bufferedState = null;

Net.onMessage(async msg=>{
  if(!msg || !msg.type) return;

  if(msg.type === 'intent' && isHost){
    const { kind, id } = msg.payload || {};
    if(kind === 'PLAY'){ selectedId = id; await hostPlay(true); }
    if(kind === 'END'){  await hostEnd(true); }
    if(kind === 'FLIP'){ await hostFlip(true); }
    if(kind === 'NEW'){  await hostNewGame(); }
    return;
  }

  if(msg.type === 'state'){
    const incoming = msg.payload;
    if (!netReady || !myRole){
      bufferedState = incoming;
      return;
    }
    await applyIncomingState(incoming);
  }
});

Net.onReadyInGame(async ({ role, isHost:_isHost })=>{
  netReady = true;
  isHost   = _isHost;
  myRole   = normalizeRole(role);

  if (window.Marks) Marks.init();

  if (bufferedState){
    const s = bufferedState; bufferedState = null;
    await applyIncomingState(s);
    return;
  }

  if (isHost) await hostNewGame();
  else updateUIByTurn();
});
