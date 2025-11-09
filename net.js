// net.js — Peer + Lobby (Render PeerJS). API: Net.onReadyInGame, Net.onMessage, Net.send, Net.broadcast
(function () {
  const $ = s => document.querySelector(s);

  // ===== Config (Render) =====
  const PEER_HOST = 'cardfeel-sio-relay.onrender.com';
  const PEER_PORT = 443;
  const PEER_PATH = '/pg';
  const PEER_SECURE = true;
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const hostIdOf = code => `pg-room-${code}-host`;

  // ===== UI refs =====
  const lobby = $('#lobby'), app = $('#app');
  const btnCreate = $('#btnCreate'), btnJoin = $('#btnJoin'), lobbyStatus = $('#lobbyStatus');
  const roomTag = $('#roomTag'), roleTag = $('#roleTag');

  const setStatus = t => { if (lobbyStatus) lobbyStatus.textContent = t; };
  const uiToGame = () => { lobby?.classList.add('invisible'); app?.classList.remove('invisible'); };
  const updateRoomUI = (roomCode, prefix) => {
    if (!roomCode) return;
    if (roomTag) roomTag.textContent = `Phòng: ${roomCode}`;
    setStatus(`${prefix ? prefix + ' — ' : ''}Mã phòng: ${roomCode}`);
  };
  const setRoleTag = (role) => {
    if (roleTag) roleTag.textContent = `Vai: ${role.toUpperCase()}`;
    document.body.classList.toggle('role-p1', role === 'p1');
    document.body.classList.toggle('role-p2', role === 'p2');
  };

  // ===== State =====
  let peer = null, conn = null, _isHost = false, _role = 'guest', _roomCode = null;
  let _onMessage = () => {}, _onReady = () => {}, _readyCalled = false;

  // ===== Helpers =====
  // Chuẩn hoá mã phòng: chỉ lấy số 0–9, giữ 2 chữ số (xử lý bàn phím mobile/emoji số/khoảng trắng)
  function normalizeCode(input) {
    const digits = String(input || '').match(/\d/g) || [];
    const last2 = digits.join('').slice(-2);         // lấy 2 số cuối nếu gõ dài
    return last2.padStart(2, '0');                   // '1' -> '01'
  }

  const makePeer = (id) => {
    const p = new Peer(id || undefined, {
      host: PEER_HOST, port: PEER_PORT, path: PEER_PATH, secure: PEER_SECURE,
      debug: 2, config: ICE
    });
    p.on('error', (e) => { console.error('[Peer] error:', e?.type, e); setStatus(`Lỗi Peer: ${e?.type || 'unknown'}`); });
    p.on('disconnected', () => { console.warn('[Peer] disconnected'); setStatus('Mất kết nối, thử nối lại…'); try { p.reconnect(); } catch {} });
    p.on('close', () => { console.warn('[Peer] closed'); });
    return p;
  };

  function callReady() {
    if (_readyCalled) return;
    _readyCalled = true;
    _onReady({ role: _role, isHost: _isHost, roomCode: _roomCode });
  }

  // Connect với retry khi host chưa open / Render vừa wake
  function connectWithRetry(p, hid, { tries = 10, delay = 800 } = {}) {
    console.log('[Net] connect →', hid, `(tries=${tries})`);
    let c = p.connect(hid, { reliable: true });

    const scheduleRetry = (reason) => {
      if (tries <= 1) { setStatus(`Kết nối thất bại: ${reason || 'hết lượt thử'}`); return; }
      console.warn('[Net] retry because:', reason);
      setStatus('Host chưa sẵn sàng, thử lại…');
      setTimeout(() => {
        try { c && c.close && c.close(); } catch {}
        connectWithRetry(p, hid, { tries: tries - 1, delay: Math.min(delay + 300, 2000) });
      }, delay);
    };

    c.on('open', () => {
      conn = c;
      updateRoomUI(_roomCode, 'Đã kết nối Host');
      uiToGame();
      callReady();
    });

    c.on('data', (msg) => _onMessage(msg || {}));

    c.on('error', (e) => {
      console.error('[Conn] error:', e?.type, e);
      if (e?.type === 'peer-unavailable') {
        scheduleRetry('peer-unavailable');
      }
    });

    c.on('close', () => {
      console.warn('[Conn] closed');
      // Nếu đóng quá sớm (host chưa open), cũng thử lại
      if (!conn || !conn.open) scheduleRetry('closed-early');
    });

    // Một số trình duyệt mobile không gọi 'error' ngay, dùng watchdog timeout
    setTimeout(() => {
      if (!conn || !conn.open) {
        scheduleRetry('timeout');
      }
    }, delay + 500);
  }

  // ===== API =====
  const Net = {
    onMessage(fn) { _onMessage = typeof fn === 'function' ? fn : _onMessage; },
    onReadyInGame(fn) { _onReady = typeof fn === 'function' ? fn : _onReady; },

    send(type, payload) { if (conn && conn.open) conn.send({ type, payload }); },
    broadcast(state) { if (_isHost && conn && conn.open) conn.send({ type: 'state', payload: state }); },

    get role() { return _role; },
    get isHost() { return _isHost; },
    get roomCode() { return _roomCode; },

    startHost(roomCodeRaw) {
      const roomCode = normalizeCode(roomCodeRaw);
      _isHost = true; _role = 'p1'; _roomCode = roomCode;
      setRoleTag(_role);

      const hid = hostIdOf(_roomCode);
      console.log('[Net] Host ID =', hid);
      const p = (peer = makePeer(hid));
      p.on('open', () => { updateRoomUI(_roomCode, 'Host sẵn sàng. Chờ Guest…'); console.log('[Peer] open (host):', p.id); });
      p.on('connection', c => {
        conn = c;
        setStatus('Guest đã kết nối!'); uiToGame();
        c.on('data', (msg) => _onMessage(msg || {}));
        c.on('open', () => { updateRoomUI(_roomCode, 'Đã kết nối Guest'); callReady(); });
        c.on('close', () => setStatus('Guest đã ngắt kết nối'));
        c.on('error', (e) => console.error('[Conn] error:', e));
      });
    },

    startGuest(roomCodeRaw) {
      const roomCode = normalizeCode(roomCodeRaw);
      _isHost = false; _role = 'p2'; _roomCode = roomCode;
      setRoleTag(_role);

      const p = (peer = makePeer());
      const hid = hostIdOf(_roomCode);
      console.log('[Net] Guest → connect to', hid);

      p.on('open', () => {
        updateRoomUI(_roomCode, 'Đang kết nối Host');
        connectWithRetry(p, hid, { tries: 10, delay: 800 });
      });
    }
  };

  // ===== Wire UI =====
  btnCreate?.addEventListener('click', () => {
    const code = String(Math.floor(Math.random() * 99) + 1);
    const roomCode = normalizeCode(code);
    updateRoomUI(roomCode, 'Đã tạo phòng');
    Net.startHost(roomCode);
  });

  btnJoin?.addEventListener('click', () => {
    const raw = prompt('Nhập mã phòng (01–99):'); if (!raw) return;
    const roomCode = normalizeCode(raw);
    Net.startGuest(roomCode);
  });

  setStatus('Sẵn sàng. Nhấn Tạo phòng / Vào phòng.');
  window.Net = Net;
})();
