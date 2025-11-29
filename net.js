// net.js — Peer + Lobby (PeerJS Cloud). API: Net.onReadyInGame, Net.onMessage, Net.send, Net.broadcast
(function () {
  const $ = s => document.querySelector(s);

  // ===== Config (PeerJS Cloud default) =====
  // Không chỉ định host/port/path → dùng cloud server mặc định của PeerJS
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const hostIdOf = code => `pg-room-${code}-host`;

  // ===== UI refs =====
  const lobby       = $('#lobby');
  const app         = $('#app');
  const btnCreate   = $('#btnCreate');
  const btnJoin     = $('#btnJoin');
  const lobbyStatus = $('#lobbyStatus');
  const roomTag     = $('#roomTag');
  const roleTag     = $('#roleTag');
  const roomInput   = $('#roomCodeInput');

  const setStatus = t => { if (lobbyStatus) lobbyStatus.textContent = t; };

  const uiToGame = () => {
    lobby?.classList.add('invisible');
    app?.classList.remove('invisible');
  };

  // Baseline: chỉ hiện prefix, KHÔNG thêm "— Mã phòng: ..."
  const updateRoomUI = (roomCode, prefix) => {
    if (!roomCode) return;
    if (roomTag) roomTag.textContent = `Phòng: ${roomCode}`;
    if (prefix) setStatus(prefix);
  };

  const setRoleTag = (role) => {
    if (roleTag) roleTag.textContent = `Vai: ${role.toUpperCase()}`;
    document.body.classList.toggle('role-p1', role === 'p1');
    document.body.classList.toggle('role-p2', role === 'p2');
  };

  // ===== Room code helpers =====
  // Chuẩn hoá input: lấy toàn bộ số, lấy 2 số cuối, pad thành 2 chữ số
  function normalizeRoomInput(value){
    const digits = String(value || '').match(/\d/g) || [];
    const last2  = digits.join('').slice(-2);
    if (!last2) return '';
    return last2.padStart(2, '0'); // '1' -> '01'
  }

  function makeRoomCode(){
    const n = Math.floor(Math.random() * 99) + 1; // 1..99
    return String(n).padStart(2, '0');
  }

  async function copyToClipboard(text){
    try{
      if (navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
      }
    }catch(e){
      // ignore
    }
  }

  // ===== Internal state =====
  let peer         = null;
  let conn         = null;
  let _isHost      = false;
  let _role        = 'guest';
  let _roomCode    = null;
  let _onMessage   = () => {};
  let _onReady     = () => {};
  let _readyCalled = false;

  // ===== Peer helpers (PeerJS Cloud) =====
  const makePeer = (id) => {
    // Dùng PeerJS cloud server mặc định: không set host/port/path/secure
    const p = new Peer(id || undefined, {
      debug: 2,
      config: ICE
    });

    p.on('error', (e) => {
      console.error('[Peer] error:', e?.type, e);
      setStatus(`Lỗi Peer: ${e?.type || 'unknown'}`);
    });

    p.on('disconnected', () => {
      console.warn('[Peer] disconnected');
      setStatus('Mất kết nối, thử nối lại…');
      try { p.reconnect(); } catch(e){}
    });

    p.on('close', () => {
      console.warn('[Peer] closed');
    });

    return p;
  };

  function callReady(){
    if (_readyCalled) return;
    _readyCalled = true;
    _onReady({ role: _role, isHost: _isHost, roomCode: _roomCode });
  }

  // Connect với retry khi host chưa open / peer cloud vừa wake
  function connectWithRetry(p, hid, { tries = 10, delay = 800 } = {}){
    console.log('[Net] connect →', hid, `(tries=${tries})`);
    let localConn = p.connect(hid, { reliable: true });

    const scheduleRetry = (reason) => {
      if (tries <= 1){
        setStatus(`Kết nối thất bại: ${reason || 'hết lượt thử'}`);
        return;
      }
      console.warn('[Net] retry because:', reason);
      setStatus('Host chưa sẵn sàng, thử lại…');
      setTimeout(() => {
        try{ localConn && localConn.close && localConn.close(); }catch(e){}
        connectWithRetry(p, hid, {
          tries: tries - 1,
          delay: Math.min(delay + 300, 2000)
        });
      }, delay);
    };

    localConn.on('open', () => {
      conn = localConn;
      updateRoomUI(_roomCode, 'Đã kết nối Host');
      uiToGame();
      callReady();
    });

    localConn.on('data', (msg) => _onMessage(msg || {}));

    localConn.on('error', (e) => {
      console.error('[Conn] error:', e?.type, e);
      if (e?.type === 'peer-unavailable'){
        scheduleRetry('peer-unavailable');
      }
    });

    localConn.on('close', () => {
      console.warn('[Conn] closed');
      // Nếu đóng quá sớm (host chưa open), cũng thử lại
      if (!conn || !conn.open){
        scheduleRetry('closed-early');
      }
    });

    // Watchdog timeout (một số mobile không bắn lỗi ngay)
    setTimeout(() => {
      if (!conn || !conn.open){
        scheduleRetry('timeout');
      }
    }, delay + 500);
  }

  // ===== API =====
  const Net = {
    onMessage(fn){
      _onMessage = (typeof fn === 'function') ? fn : _onMessage;
    },
    onReadyInGame(fn){
      _onReady = (typeof fn === 'function') ? fn : _onReady;
    },

    send(type, payload){
      if (conn && conn.open) conn.send({ type, payload });
    },
    broadcast(state){
      if (!_isHost) return;
      if (conn && conn.open) conn.send({ type:'state', payload: state });
    },

    get role(){ return _role; },
    get isHost(){ return _isHost; },
    get roomCode(){ return _roomCode; },

    startHost(roomCodeRaw){
      const roomCode = normalizeRoomInput(roomCodeRaw);
      if (!roomCode) return;

      _isHost   = true;
      _role     = 'p1';
      _roomCode = roomCode;
      setRoleTag(_role);

      const hid = hostIdOf(_roomCode);
      console.log('[Net] Host ID =', hid);

      const p = peer = makePeer(hid);
      p.on('open', () => {
        updateRoomUI(_roomCode, 'Host sẵn sàng. Chờ Guest…');
        console.log('[Peer] open (host):', p.id);
      });

      p.on('connection', c => {
        conn = c;
        setStatus('Guest đã kết nối!');
        uiToGame();

        c.on('data', (msg) => _onMessage(msg || {}));
        c.on('open', () => {
          updateRoomUI(_roomCode, 'Đã kết nối Guest');
          callReady();
        });
        c.on('close', () => {
          setStatus('Guest đã ngắt kết nối');
        });
        c.on('error', (e) => {
          console.error('[Conn] error:', e);
        });
      });
    },

    startGuest(roomCodeRaw){
      const roomCode = normalizeRoomInput(roomCodeRaw);
      if (!roomCode){
        setStatus('Nhập mã phòng (01–99) trước khi vào phòng.');
        return;
      }

      _isHost   = false;
      _role     = 'p2';
      _roomCode = roomCode;
      setRoleTag(_role);

      const p   = peer = makePeer();
      const hid = hostIdOf(_roomCode);
      console.log('[Net] Guest → connect to', hid);

      p.on('open', () => {
        updateRoomUI(_roomCode, 'Đang kết nối Host');
        connectWithRetry(p, hid, { tries: 10, delay: 800 });
      });
    }
  };

  // ===== Wire UI (Create / Join với input + auto copy) =====
  btnCreate?.addEventListener('click', async () => {
    let code = normalizeRoomInput(roomInput?.value);
    if (!code){
      code = makeRoomCode();
    }
    if (roomInput){
      roomInput.value = code;
    }

    // Auto copy mã phòng cho Host
    await copyToClipboard(code);
    updateRoomUI(code, 'Đã tạo phòng (mã đã copy)');

    Net.startHost(code);
  });

  btnJoin?.addEventListener('click', () => {
    const code = normalizeRoomInput(roomInput?.value);
    if (!code){
      setStatus('Nhập mã phòng (01–99) trước khi vào phòng.');
      return;
    }
    updateRoomUI(code, 'Đang vào phòng');
    Net.startGuest(code);
  });

  setStatus('Sẵn sàng. Nhấn Tạo phòng / Vào phòng.');

  window.Net = Net;
})();
