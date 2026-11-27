/* ============================================================
   경미님 비서실 · 합동 비서실 (정적 웹앱)
   - 입장 코드: SHA-256 해시로만 비교 (평문 저장 없음)
   - 실시간 DB: Firebase Realtime Database (databaseURL만 입력)
   - 미연결 시: localStorage 로컬 모드로 모든 기능 동작
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 상수 ---------- */
  var K = {
    cfg: 'pickleOffice.cfg.v1',
    code: 'pickleOffice.codeHash.v1',
    session: 'pickleOffice.session.v1',
    data: 'pickleOffice.data.v1',
    sender: 'pickleOffice.sender.v1',
    room: 'pickleOffice.room.v1'
  };

  // sha256("9119") — 초기 입장 코드의 해시 (평문은 코드에 넣지 않음)
  var DEFAULT_CODE_HASH = 'bedc725da6f59c82f22ba662298fa0c8892a4dceb7d47d9d703af3253818129f';

  var ROOMS = [
    { id: 'grand', emoji: '🏛️', name: '대회의실' },
    { id: 'command', emoji: '🎯', name: '지휘실' },
    { id: 'lounge', emoji: '☕', name: '라운지' }
  ];

  var TASK_STATUS = ['대기', '실행중', '완료'];
  var MEMBER_STATUS = ['대기중', '작업중', '보고완료'];

  function defaultMembers() {
    var t = Date.now();
    var list = [
      { id: 'kyoungmi', name: 'kyoungmi', emoji: '👑', role: '대장님', owner: true, order: 1, status: '대기중', task: '', lastActive: t },
      { id: 'babutang', name: '바부탱', emoji: '🟦', role: '메인 비서', owner: false, order: 2, status: '대기중', task: '', lastActive: t },
      { id: 'mikukpon', name: '미국폰', emoji: '📱', role: '서브 비서', owner: false, order: 3, status: '대기중', task: '', lastActive: t }
    ];
    var map = {};
    list.forEach(function (m) { map[m.id] = m; });
    return map;
  }

  /* ---------- 유틸 ---------- */
  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function objValues(o) { return o && typeof o === 'object' ? Object.keys(o).map(function (k) { return o[k]; }) : []; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var h = d.getHours();
    var ap = h < 12 ? '오전' : '오후';
    h = h % 12; if (h === 0) h = 12;
    var today = new Date();
    var sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return (sameDay ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + ap + ' ' + h + ':' + pad2(d.getMinutes());
  }
  function fmtWhen(ts) {
    if (!ts) return '기록 없음';
    var d = new Date(ts), n = new Date();
    var one = 86400000;
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    var diff = Math.round((b - a) / one);
    if (diff === 0) return '오늘 ' + fmtTime(ts);
    if (diff === 1) return '어제 ' + fmtTime(ts);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + fmtTime(ts);
  }

  /* ---------- SHA-256 (crypto.subtle 없으면 순수 JS) ---------- */
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function sha256Raw(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length;
    var padded = new Uint8Array((((l + 9) + 63) >> 6) << 6);
    padded.set(bytes);
    padded[l] = 0x80;
    var dv = new DataView(padded.buffer);
    var bits = l * 8;
    dv.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
    dv.setUint32(padded.length - 4, bits >>> 0);

    var w = new Uint32Array(64);
    for (var i = 0; i < padded.length; i += 64) {
      for (var t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (var t2 = 16; t2 < 64; t2++) {
        var s0 = rotr(w[t2 - 15], 7) ^ rotr(w[t2 - 15], 18) ^ (w[t2 - 15] >>> 3);
        var s1 = rotr(w[t2 - 2], 17) ^ rotr(w[t2 - 2], 19) ^ (w[t2 - 2] >>> 10);
        w[t2] = (w[t2 - 16] + s0 + w[t2 - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (var t3 = 0; t3 < 64; t3++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + SHA_K[t3] + w[t3]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }

  function sha256(str) {
    var bytes = new TextEncoder().encode(str);
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      return window.crypto.subtle.digest('SHA-256', bytes).then(function (d) {
        return Array.prototype.map.call(new Uint8Array(d), function (b) { return pad2hex(b); }).join('');
      }).catch(function () { return sha256Raw(bytes); });
    }
    return Promise.resolve(sha256Raw(bytes));
  }
  function pad2hex(b) { return ('0' + b.toString(16)).slice(-2); }

  /* ---------- 상태 ---------- */
  var S = {
    mode: 'local',
    db: null,
    cfg: null,
    clientId: 'c-' + Math.random().toString(36).slice(2, 10),
    data: { members: {}, tasks: {}, notes: {}, messages: {} },
    presence: {},
    room: localStorage.getItem(K.room) || 'command',
    senderId: localStorage.getItem(K.sender) || 'kyoungmi',
    tab: 'meeting',
    listeners: [],
    presenceTimer: null,
    editingNote: null,
    seeded: false,
    dbError: '',
    unloadBound: false
  };
  ROOMS.forEach(function (r) { S.data.messages[r.id] = {}; });

  function convMap(v) {
    if (!v || typeof v !== 'object') return {};
    if (Array.isArray(v)) {
      var m = {};
      v.forEach(function (x) { if (x && x.id) m[x.id] = x; });
      return m;
    }
    var out = {};
    Object.keys(v).forEach(function (k) {
      var x = v[k];
      if (x && typeof x === 'object') {
        if (!x.id) x.id = k;
        out[k] = x;
      }
    });
    return out;
  }

  function normalize(d) {
    d = d || {};
    var o = { members: {}, tasks: {}, notes: {}, messages: {} };
    o.members = convMap(d.members);
    o.tasks = convMap(d.tasks);
    o.notes = convMap(d.notes);
    var mm = d.messages && typeof d.messages === 'object' ? d.messages : {};
    ROOMS.forEach(function (r) { o.messages[r.id] = convMap(mm[r.id]); });
    return o;
  }

  function saveLocal() {
    try { localStorage.setItem(K.data, JSON.stringify(S.data)); } catch (e) { /* 용량 초과 등 무시 */ }
  }
  function loadLocal() {
    try {
      var raw = localStorage.getItem(K.data);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { }
    return normalize(null);
  }

  function deepSet(root, path, val) {
    var parts = path.split('/');
    var last = parts.pop();
    var o = root;
    parts.forEach(function (p) {
      if (!o[p] || typeof o[p] !== 'object') o[p] = {};
      o = o[p];
    });
    if (val === null) delete o[last]; else o[last] = val;
  }

  function put(path, val) {
    if (S.mode === 'firebase' && S.db) {
      S.db.ref('office/' + path).set(val).catch(function (e) { setDbState('저장 실패: ' + (e && e.message ? e.message : e), 'err'); });
    } else {
      deepSet(S.data, path, val);
      saveLocal();
      render();
    }
  }
  function patch(path, val) {
    if (S.mode === 'firebase' && S.db) {
      S.db.ref('office/' + path).update(val).catch(function (e) { setDbState('저장 실패: ' + (e && e.message ? e.message : e), 'err'); });
    } else {
      var cur = getPath(S.data, path) || {};
      var merged = {};
      Object.keys(cur).forEach(function (k) { merged[k] = cur[k]; });
      Object.keys(val).forEach(function (k) { merged[k] = val[k]; });
      deepSet(S.data, path, merged);
      saveLocal();
      render();
    }
  }
  function removePath(path) {
    if (S.mode === 'firebase' && S.db) {
      S.db.ref('office/' + path).remove();
    } else {
      deepSet(S.data, path, null);
      saveLocal();
      render();
    }
  }
  function getPath(root, path) {
    return path.split('/').reduce(function (o, k) { return o == null ? undefined : o[k]; }, root);
  }

  /* ---------- Firebase ---------- */
  function firebaseAvailable() {
    return typeof firebase !== 'undefined' && firebase && typeof firebase.database === 'function';
  }

  function attachFirebase(db) {
    S.db = db;
    S.mode = 'firebase';
    S.dbError = '';

    var hook = function (path, apply) {
      var ref = db.ref('office/' + path);
      var cb = function (snap) {
        try { apply(snap.val()); } catch (e) { console.warn(e); }
        render();
      };
      var eb = function (err) {
        var msg = (err && err.message ? err.message : String(err));
        setDbState('DB 읽기 오류: ' + msg + ' — Firebase 규칙에서 읽기/쓰기를 허용해 주세요.', 'err');
        S.dbError = msg;
        setBadge();
      };
      ref.on('value', cb, eb);
      S.listeners.push({ ref: ref, cb: cb });
    };

    hook('members', function (v) {
      var m = convMap(v);
      if (!Object.keys(m).length) {
        if (!S.seeded) { S.seeded = true; db.ref('office/members').set(defaultMembers()); }
        return;
      }
      S.data.members = m;
    });
    hook('tasks', function (v) { S.data.tasks = convMap(v); });
    hook('notes', function (v) { S.data.notes = convMap(v); });
    hook('messages', function (v) {
      var src = v && typeof v === 'object' ? v : {};
      ROOMS.forEach(function (r) { S.data.messages[r.id] = convMap(src[r.id]); });
    });
    hook('presence', function (v) { S.presence = v || {}; });

    startPresence();
  }

  function resetFirebaseApps() {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return Promise.resolve();
      return Promise.all(firebase.apps.slice().map(function (a) {
        return a.delete().catch(function () { });
      }));
    } catch (e) { return Promise.resolve(); }
  }

  function detachFirebase(silent) {
    S.listeners.forEach(function (l) { try { l.ref.off('value', l.cb); } catch (e) { } });
    S.listeners = [];
    if (S.presenceTimer) { clearInterval(S.presenceTimer); S.presenceTimer = null; }
    if (S.db) {
      try { S.db.ref('office/presence/' + S.clientId).remove(); } catch (e) { }
    }
    try {
      resetFirebaseApps();
    } catch (e) { }
    S.db = null;
    S.mode = 'local';
    S.presence = {};
    S.seeded = false;
    S.dbError = '';
    saveLocal();
    if (!silent) { setDbState('연결을 해제했습니다. 이 기기 로컬 모드로 동작합니다.', ''); }
    setBadge();
    render();
  }

  function startPresence() {
    if (S.mode !== 'firebase' || !S.db) return;
    if (S.presenceTimer) { clearInterval(S.presenceTimer); S.presenceTimer = null; }
    var me = currentSender();
    var ref = S.db.ref('office/presence/' + S.clientId);
    ref.set({ name: me ? me.name : '게스트', emoji: me ? me.emoji : '🙂', ts: Date.now() });
    try { ref.onDisconnect().remove(); } catch (e) { }
    S.presenceTimer = setInterval(function () {
      ref.update({ ts: Date.now() }).catch(function () { });
    }, 25000);
    if (!S.unloadBound) {
      S.unloadBound = true;
      window.addEventListener('beforeunload', function () {
        try { ref.remove(); } catch (e) { }
      });
    }
  }

  function onlineCount() {
    if (S.mode !== 'firebase') return 1;
    var t = Date.now(), n = 0;
    Object.keys(S.presence || {}).forEach(function (id) {
      var p = S.presence[id];
      if (p && p.ts && (t - p.ts) < 95000) n++;
    });
    if (!(S.presence && S.presence[S.clientId])) n++;
    return Math.max(1, n);
  }

  function connectFirebase(cfg, done) {
    done = done || function () { };
    if (!firebaseAvailable()) {
      done(false, 'Firebase SDK를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
      return;
    }
    var url = String(cfg.databaseURL || '').trim().replace(/\/+$/, '');
    if (!url) { done(false, 'databaseURL을 입력해 주세요.'); return; }
    if (!/^https:\/\/[^\s]+$/.test(url)) { done(false, 'databaseURL은 https:// 로 시작해야 합니다.'); return; }

    var opts = { databaseURL: url };
    if (cfg.apiKey && String(cfg.apiKey).trim()) opts.apiKey = String(cfg.apiKey).trim();

    detachFirebase(true);
    resetFirebaseApps().then(function () {
      try {
        firebase.initializeApp(opts);
      } catch (e) {
        done(false, '초기화 실패: ' + (e && e.message ? e.message : e));
        return;
      }

      var db;
      try { db = firebase.database(); } catch (e) {
        done(false, 'DB 초기화 실패: ' + (e && e.message ? e.message : e));
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        done(false, 'DB에 연결하지 못했습니다. databaseURL과 DB 규칙(읽기/쓰기 허용)을 확인해 주세요.');
      }, 12000);

      db.ref('.info/connected').on('value', function (snap) {
        if (snap.val() === true && !settled) {
          settled = true;
          clearTimeout(timer);
          S.cfg = { databaseURL: url, apiKey: opts.apiKey || '' };
          try { localStorage.setItem(K.cfg, JSON.stringify(S.cfg)); } catch (e) { }
          attachFirebase(db);
          setBadge();
          render();
          done(true, '실시간 연결됨 · ' + url);
        }
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done(false, 'DB 연결 오류: ' + (err && err.message ? err.message : err));
      });
    });
  }

  /* ---------- 잠금 ---------- */
  function currentCodeHash() {
    try { return localStorage.getItem(K.code) || DEFAULT_CODE_HASH; } catch (e) { return DEFAULT_CODE_HASH; }
  }
  function isUnlocked() {
    try { return localStorage.getItem(K.session) === currentCodeHash(); } catch (e) { return false; }
  }

  function enterApp() {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    render();
    if (S.mode === 'firebase') startPresence();
    var box = $('#msgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function doLock() {
    try { localStorage.removeItem(K.session); } catch (e) { }
    closeMenu();
    $('#app').hidden = true;
    $('#lock').hidden = false;
    var lc = $('#lockCode');
    if (lc) { lc.value = ''; lc.focus(); }
  }

  async function tryUnlock(ev) {
    if (ev) ev.preventDefault();
    var input = $('#lockCode');
    var msg = $('#lockMsg');
    var v = input.value;
    if (!v) { msg.textContent = '입장 코드를 입력해 주세요.'; return; }
    var hash = await sha256(v.trim());
    var hashRaw = await sha256(v);
    if (hash === currentCodeHash() || hashRaw === currentCodeHash()) {
      try { localStorage.setItem(K.session, currentCodeHash()); } catch (e) { }
      msg.textContent = '';
      input.value = '';
      enterApp();
    } else {
      msg.textContent = '코드가 맞지 않습니다. 다시 확인해 주세요.';
      input.select();
    }
  }

  /* ---------- 렌더 ---------- */
  function ensureOrder() {
    var known = { kyoungmi: 1, babutang: 2, mikukpon: 3 };
    var missing = [];
    Object.keys(S.data.members || {}).forEach(function (id) {
      var m = S.data.members[id];
      if (!m) return;
      if (typeof m.order === 'number') return;
      if (known[id]) { m.order = known[id]; return; }
      missing.push(m);
    });
    if (!missing.length) return;
    missing.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); });
    missing.forEach(function (m, i) { m.order = 10 + i; });
  }

  function membersSorted() {
    ensureOrder();
    return objValues(S.data.members).sort(function (a, b) {
      var oa = typeof a.order === 'number' ? a.order : 999;
      var ob = typeof b.order === 'number' ? b.order : 999;
      if (oa !== ob) return oa - ob;
      if (!!a.owner !== !!b.owner) return a.owner ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
  }
  function currentSender() {
    var m = S.data.members[S.senderId];
    if (m) return m;
    var list = membersSorted();
    if (list.length) { S.senderId = list[0].id; return list[0]; }
    return null;
  }

  function setBadge() {
    var b = $('#statusBadge');
    if (!b) return;
    if (S.mode === 'firebase' && S.dbError) {
      b.textContent = '● 연결 오류 (DB 확인)';
      b.classList.add('local');
      b.title = 'DB 오류: ' + S.dbError;
      return;
    }
    if (S.mode === 'firebase') {
      b.textContent = '● 실시간 연결';
      b.classList.remove('local');
      b.title = '실시간 DB 연결됨 — 눌러서 설정';
    } else {
      b.textContent = '● 로컬 모드 (DB 연결)';
      b.classList.add('local');
      b.title = '실시간 DB를 연결하려면 누르세요';
    }
  }

  function render() {
    if ($('#app').hidden) return;
    setBadge();
    renderRooms();
    renderMessages();
    renderChips();
    renderTasks();
    renderStatus();
    renderNotes();
    renderTabs();
  }

  function renderTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === S.tab);
    });
    ['meeting', 'tasks', 'status', 'notes'].forEach(function (id) {
      var p = $('#panel-' + id);
      if (p) p.hidden = id !== S.tab;
    });
  }

  function renderRooms() {
    if (!ROOMS.some(function (r) { return r.id === S.room; })) S.room = 'command';
    var wrap = $('#roomChips');
    wrap.innerHTML = ROOMS.map(function (r) {
      return '<button type="button" class="roomchip' + (r.id === S.room ? ' active' : '') + '" data-room="' + r.id + '">' +
        r.emoji + ' ' + esc(r.name) + '</button>';
    }).join('');
    var room = ROOMS.filter(function (r) { return r.id === S.room; })[0];
    $('#roomMeta').textContent = room.emoji + ' ' + room.name + ' · ON ' + onlineCount() + '명';
  }

  function mentionRegex() {
    var names = membersSorted().map(function (m) { return String(m.name || '').trim(); }).filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    var alts = ['all', '전체'].concat(names);
    return new RegExp('@(' + alts.join('|') + ')', 'g');
  }

  function fmtText(text) {
    var html = esc(text);
    try {
      return html.replace(mentionRegex(), function (m) { return '<span class="mention">' + m + '</span>'; });
    } catch (e) { return html; }
  }

  function renderMessages() {
    var box = $('#msgs');
    var list = objValues(S.data.messages[S.room]).filter(function (m) { return m && m.text; })
      .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    if (list.length > 400) list = list.slice(list.length - 400);

    if (!list.length) {
      box.innerHTML = '<div class="empty">아직 이 방에는 대화가 없습니다.<br>아래에서 발신자를 고르고 첫 메시지를 남겨 보세요.</div>';
      return;
    }
    var nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 120;
    box.innerHTML = list.map(function (m) {
      var self = !!m.owner;
      return '<div class="msg' + (self ? ' self' : '') + '">' +
        '<div class="av">' + esc(m.emoji || '🙂') + '</div>' +
        '<div class="body">' +
        '<div class="who"><b>' + esc(m.name || '이름없음') + '</b>' +
        (m.role ? '<span class="role">' + esc(m.role) + '</span>' : '') +
        '<time>' + fmtTime(m.ts) + '</time></div>' +
        '<div class="bubble">' + fmtText(m.text) + '</div>' +
        '</div></div>';
    }).join('');
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  function renderChips() {
    var list = membersSorted();
    if (!S.data.members[S.senderId] && list.length) S.senderId = list[0].id;

    var sc = $('#senderChips');
    sc.innerHTML = list.map(function (m) {
      return '<button type="button" class="chip' + (m.id === S.senderId ? ' on' : '') + '" data-sender="' + esc(m.id) + '">' +
        esc(m.emoji || '🙂') + ' ' + esc(m.name) +
        (m.role ? '<span class="r">(' + esc(m.role) + ')</span>' : '') + '</button>';
    }).join('') + '<button type="button" class="chip add" data-act="add-member">+ 멤버 추가</button>';

    var mc = $('#mentionChips');
    mc.innerHTML = '<button type="button" class="chip men" data-mention="@all">@all</button>' +
      list.map(function (m) {
        return '<button type="button" class="chip men" data-mention="@' + esc(m.name) + '">@' + esc(m.name) + '</button>';
      }).join('');
  }

  function renderTasks() {
    var board = $('#taskBoard');
    var tasks = objValues(S.data.tasks).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    board.innerHTML = TASK_STATUS.map(function (st) {
      var inCol = tasks.filter(function (t) { return (t.status || '대기') === st; });
      var cards = inCol.map(function (t) {
        var m = S.data.members[t.assignee];
        var who = m ? (esc(m.emoji || '🙂') + ' ' + esc(m.name)) : '미지정';
        return '<div class="task' + (st === '완료' ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
          '<div class="t">' + esc(t.title) + '</div>' +
          '<div class="meta">' +
          '<span class="who-chip">' + who + '</span>' +
          '<select data-task-status="' + esc(t.id) + '">' +
          TASK_STATUS.map(function (x) { return '<option value="' + x + '"' + (x === st ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
          '</select>' +
          '<button type="button" class="del" data-task-del="' + esc(t.id) + '" title="삭제">✕</button>' +
          '</div></div>';
      }).join('');
      return '<div class="col"><div class="col-head"><b>' + st + '</b><span class="n">' + inCol.length + '</span></div>' +
        '<div class="col-body">' + (cards || '<div class="none">비어 있음</div>') + '</div></div>';
    }).join('');

    var sel = $('#taskAssignee');
    var cur = sel.value;
    var opts = '<option value="">담당 미지정</option>' + membersSorted().map(function (m) {
      return '<option value="' + esc(m.id) + '">' + esc(m.emoji || '🙂') + ' ' + esc(m.name) + (m.role ? ' (' + esc(m.role) + ')' : '') + '</option>';
    }).join('');
    if (sel.innerHTML !== opts) sel.innerHTML = opts;
    if (cur) sel.value = cur;
  }

  function renderStatus() {
    var wrap = $('#statusList');
    var list = membersSorted();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty">등록된 멤버가 없습니다. 아래에서 멤버를 추가해 주세요.</div>';
      return;
    }
    wrap.innerHTML = list.map(function (m) {
      var st = MEMBER_STATUS.indexOf(m.status) >= 0 ? m.status : '대기중';
      var cls = st === '작업중' ? 'st-work' : (st === '보고완료' ? 'st-done' : 'st-wait');
      return '<div class="person" data-id="' + esc(m.id) + '">' +
        '<div class="av">' + esc(m.emoji || '🙂') + '</div>' +
        '<div class="info">' +
        '<div class="l1"><b>' + esc(m.name) + '</b>' +
        (m.role ? '<span class="role">' + esc(m.role) + '</span>' : '') +
        '<select class="st stsel ' + cls + '" data-status="' + esc(m.id) + '" aria-label="상태">' +
        MEMBER_STATUS.map(function (x) { return '<option value="' + x + '"' + (x === st ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="taskline"><input type="text" maxlength="80" data-task="' + esc(m.id) + '" placeholder="현재 작업 없음" value="' + esc(m.task || '') + '"></div>' +
        '<div class="foot"><span>최근 활동 ' + esc(fmtWhen(m.lastActive)) + '</span>' +
        '<button type="button" class="rm" data-member-del="' + esc(m.id) + '">삭제</button></div>' +
        '</div></div>';
    }).join('');
  }

  function renderNotes() {
    var wrap = $('#noteList');
    var notes = objValues(S.data.notes).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (!notes.length) {
      wrap.innerHTML = '<div class="empty">공동 메모가 없습니다. 위에서 첫 메모를 남겨 보세요.</div>';
      return;
    }
    wrap.innerHTML = notes.map(function (n) {
      var editing = S.editingNote === n.id;
      var body = editing
        ? '<textarea data-note-edit="' + esc(n.id) + '">' + esc(n.text || '') + '</textarea>'
        : '<div class="txt">' + esc(n.text || '') + '</div>';
      var btns = editing
        ? '<button type="button" data-note-save="' + esc(n.id) + '">저장</button><button type="button" data-note-cancel="1">취소</button>'
        : '<button type="button" data-note-edit-btn="' + esc(n.id) + '">수정</button><button type="button" data-note-del="' + esc(n.id) + '">삭제</button>';
      return '<div class="note" data-id="' + esc(n.id) + '">' +
        (n.title ? '<h4>' + esc(n.title) + '</h4>' : '') + body +
        '<div class="foot"><span>' + esc(n.author || '') + ' · ' + esc(fmtWhen(n.ts)) + '</span>' + btns + '</div></div>';
    }).join('');
  }

  function setDbState(text, cls) {
    var el = $('#dbState');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'db-state' + (cls ? ' ' + cls : '');
  }

  /* ---------- 동작 ---------- */
  function sendMessage() {
    var input = $('#msgInput');
    var text = input.value.trim();
    if (!text) return;
    var me = currentSender();
    if (!me) { alert('먼저 멤버를 추가해 주세요.'); return; }
    var msg = {
      id: uid('m'),
      sender: me.id,
      name: me.name,
      emoji: me.emoji || '🙂',
      role: me.role || '',
      owner: !!me.owner,
      text: text,
      ts: Date.now()
    };
    put('messages/' + S.room + '/' + msg.id, msg);
    patch('members/' + me.id, { lastActive: msg.ts });
    input.value = '';
    input.style.height = 'auto';
    input.focus();
    var box = $('#msgs');
    if (box) setTimeout(function () { box.scrollTop = box.scrollHeight; }, 30);
  }

  function insertMention(name) {
    var input = $('#msgInput');
    var cur = input.value;
    var needsSpace = cur.length > 0 && !/\s$/.test(cur);
    input.value = cur + (needsSpace ? ' ' : '') + name + ' ';
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }

  function addMember() {
    var name = $('#memName').value.trim();
    var emoji = $('#memEmoji').value.trim() || '🙂';
    var role = $('#memRole').value.trim() || '비서';
    var st = $('#memState');
    if (!name) { st.textContent = '이름을 입력해 주세요.'; st.className = 'db-state err'; return; }
    var dup = membersSorted().filter(function (m) { return m.name === name; })[0];
    if (dup) { st.textContent = '같은 이름의 멤버가 이미 있습니다.'; st.className = 'db-state err'; return; }
    var id = uid('mb-');
    var maxOrder = 0;
    membersSorted().forEach(function (m) { if (typeof m.order === 'number' && m.order > maxOrder) maxOrder = m.order; });
    put('members/' + id, {
      id: id, name: name, emoji: emoji, role: role, owner: false, order: maxOrder + 1,
      status: '대기중', task: '', lastActive: Date.now()
    });
    st.textContent = '';
    $('#memName').value = ''; $('#memEmoji').value = ''; $('#memRole').value = '';
    var dlg = $('#memberDialog');
    if (dlg && dlg.open) dlg.close();
  }

  function addTask(ev) {
    ev.preventDefault();
    var titleEl = $('#taskTitle');
    var title = titleEl.value.trim();
    if (!title) { titleEl.focus(); return; }
    var id = uid('t');
    put('tasks/' + id, {
      id: id, title: title,
      assignee: $('#taskAssignee').value || '',
      status: $('#taskStatus').value || '대기',
      ts: Date.now()
    });
    titleEl.value = '';
    titleEl.focus();
  }

  function addNote(ev) {
    ev.preventDefault();
    var t = $('#noteTitle'), b = $('#noteBody');
    var text = b.value.trim();
    if (!text) { b.focus(); return; }
    var me = currentSender();
    var id = uid('n');
    put('notes/' + id, {
      id: id, title: t.value.trim(), text: text,
      author: me ? me.name : '', ts: Date.now()
    });
    t.value = ''; b.value = '';
    b.focus();
  }

  function bindEvents() {
    $('#lockForm').addEventListener('submit', tryUnlock);

    $('#statusBadge').addEventListener('click', function () { openDbDialog(); });
    $('#menuBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var m = $('#menu');
      m.hidden = !m.hidden;
    });
    document.addEventListener('click', function (e) {
      var m = $('#menu');
      if (m && !m.hidden && !m.contains(e.target) && e.target.id !== 'menuBtn') m.hidden = true;
    });
    $('#menu').addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (!act) return;
      $('#menu').hidden = true;
      if (act === 'code') { openCodeDialog(); }
      else if (act === 'lock') { doLock(); }
      else if (act === 'db') { openDbDialog(); }
      else if (act === 'export') { exportData(); }
    });

    document.querySelector('.tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (!t) return;
      S.tab = t.getAttribute('data-tab');
      renderTabs();
      if (S.tab === 'meeting') { var b = $('#msgs'); if (b) b.scrollTop = b.scrollHeight; }
    });

    $('#roomChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-room]');
      if (!b) return;
      S.room = b.getAttribute('data-room');
      try { localStorage.setItem(K.room, S.room); } catch (err) { }
      renderRooms(); renderMessages();
      var box = $('#msgs'); box.scrollTop = box.scrollHeight;
    });

    $('#senderChips').addEventListener('click', function (e) {
      var add = e.target.closest('[data-act="add-member"]');
      if (add) { openMemberDialog(); return; }
      var b = e.target.closest('[data-sender]');
      if (!b) return;
      S.senderId = b.getAttribute('data-sender');
      try { localStorage.setItem(K.sender, S.senderId); } catch (err) { }
      renderChips();
      if (S.mode === 'firebase') startPresence();
    });

    $('#mentionChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mention]');
      if (!b) return;
      insertMention(b.getAttribute('data-mention'));
    });

    $('#sendBtn').addEventListener('click', sendMessage);
    $('#msgInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    $('#msgInput').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    $('#taskForm').addEventListener('submit', addTask);
    $('#taskBoard').addEventListener('change', function (e) {
      var sel = e.target.closest('[data-task-status]');
      if (!sel) return;
      patch('tasks/' + sel.getAttribute('data-task-status'), { status: sel.value });
    });
    $('#taskBoard').addEventListener('click', function (e) {
      var d = e.target.closest('[data-task-del]');
      if (!d) return;
      if (!confirm('이 작업 카드를 삭제할까요?')) return;
      removePath('tasks/' + d.getAttribute('data-task-del'));
    });

    $('#statusList').addEventListener('change', function (e) {
      var sel = e.target.closest('[data-status]');
      if (!sel) return;
      patch('members/' + sel.getAttribute('data-status'), { status: sel.value, lastActive: Date.now() });
    });
    $('#statusList').addEventListener('keydown', function (e) {
      var inp = e.target.closest('[data-task]');
      if (inp && e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
    $('#statusList').addEventListener('change', function (e) {
      var inp = e.target.closest('[data-task]');
      if (!inp) return;
      patch('members/' + inp.getAttribute('data-task'), { task: inp.value.trim(), lastActive: Date.now() });
    });
    $('#statusList').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-member-del]');
      if (!rm) return;
      var id = rm.getAttribute('data-member-del');
      var m = S.data.members[id];
      if (!m) return;
      if (!confirm('"' + m.name + '" 님을 목록에서 삭제할까요? (지난 대화는 그대로 남습니다)')) return;
      removePath('members/' + id);
      if (S.senderId === id) {
        var list = membersSorted();
        S.senderId = list.length ? list[0].id : '';
      }
    });
    $('#addMemberBtn2').addEventListener('click', openMemberDialog);

    $('#noteForm').addEventListener('submit', addNote);
    $('#noteList').addEventListener('click', function (e) {
      var ed = e.target.closest('[data-note-edit-btn]');
      if (ed) { S.editingNote = ed.getAttribute('data-note-edit-btn'); renderNotes(); return; }
      var del = e.target.closest('[data-note-del]');
      if (del) {
        if (!confirm('이 메모를 삭제할까요?')) return;
        removePath('notes/' + del.getAttribute('data-note-del'));
        return;
      }
      var sv = e.target.closest('[data-note-save]');
      if (sv) {
        var id = sv.getAttribute('data-note-save');
        var ta = document.querySelector('[data-note-edit="' + id + '"]');
        if (ta) patch('notes/' + id, { text: ta.value.trim(), ts: Date.now() });
        S.editingNote = null;
        renderNotes();
        return;
      }
      var cx = e.target.closest('[data-note-cancel]');
      if (cx) { S.editingNote = null; renderNotes(); }
    });

    $('#dbConnect').addEventListener('click', function () {
      var cfg = { databaseURL: $('#dbUrl').value.trim(), apiKey: $('#dbKey').value.trim() };
      if (!cfg.databaseURL) { setDbState('databaseURL을 입력해 주세요.', 'err'); return; }
      setDbState('연결하는 중…', '');
      connectFirebase(cfg, function (ok, msg) {
        setDbState(msg, ok ? 'ok' : 'err');
        if (ok) {
          setTimeout(function () { var d = $('#dbDialog'); if (d && d.open) d.close(); }, 900);
        }
      });
    });
    $('#dbDisconnect').addEventListener('click', function () {
      try { localStorage.removeItem(K.cfg); } catch (e) { }
      detachFirebase(true);
      setDbState('연결을 해제했습니다. 이 기기 로컬 모드로 동작합니다.', '');
    });
    $('#dbUpload').addEventListener('click', function () {
      if (S.mode !== 'firebase' || !S.db) { setDbState('먼저 DB에 연결해 주세요.', 'err'); return; }
      if (!confirm('이 기기에 있는 내용을 실시간 DB로 올릴까요? (같은 id의 항목은 덮어씁니다)')) return;
      var db = S.db;
      var work = [];
      ['members', 'tasks', 'notes'].forEach(function (sec) {
        Object.keys(S.data[sec]).forEach(function (id) {
          work.push(db.ref('office/' + sec + '/' + id).set(S.data[sec][id]));
        });
      });
      ROOMS.forEach(function (r) {
        Object.keys(S.data.messages[r.id] || {}).forEach(function (id) {
          work.push(db.ref('office/messages/' + r.id + '/' + id).set(S.data.messages[r.id][id]));
        });
      });
      Promise.all(work).then(function () {
        setDbState('올렸습니다. 잠시 뒤 새로고침하면 반영됩니다.', 'ok');
      }).catch(function (e) {
        setDbState('올리기 실패: ' + (e && e.message ? e.message : e), 'err');
      });
    });

    ['#codeOld', '#codeNew', '#codeNew2'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#codeSave').click(); } });
    });

    $('#codeSave').addEventListener('click', async function () {
      var st = $('#codeState');
      var oldV = $('#codeOld').value, n1 = $('#codeNew').value, n2 = $('#codeNew2').value;
      if (await sha256(oldV.trim()) !== currentCodeHash() && await sha256(oldV) !== currentCodeHash()) {
        st.textContent = '현재 코드가 맞지 않습니다.'; st.className = 'db-state err'; return;
      }
      if (n1.trim().length < 2) { st.textContent = '새 코드는 2자 이상이어야 합니다.'; st.className = 'db-state err'; return; }
      if (n1 !== n2) { st.textContent = '새 코드 확인이 일치하지 않습니다.'; st.className = 'db-state err'; return; }
      var h = await sha256(n1.trim());
      try {
        localStorage.setItem(K.code, h);
        localStorage.setItem(K.session, h);
      } catch (e) { }
      st.textContent = '입장 코드를 변경했습니다.'; st.className = 'db-state ok';
      $('#codeOld').value = ''; $('#codeNew').value = ''; $('#codeNew2').value = '';
    });

    $('#memSave').addEventListener('click', addMember);
    ['#memName', '#memEmoji', '#memRole'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addMember(); } });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var m = $('#menu'); if (m) m.hidden = true; }
    });
  }

  function openDbDialog() {
    var d = $('#dbDialog');
    var cfg = S.cfg;
    if (!cfg) {
      try { cfg = JSON.parse(localStorage.getItem(K.cfg) || 'null'); } catch (e) { cfg = null; }
    }
    if (cfg) {
      $('#dbUrl').value = cfg.databaseURL || '';
      $('#dbKey').value = cfg.apiKey || '';
    }
    setDbState(S.mode === 'firebase' ? '현재 실시간 연결 중입니다.' : '현재 로컬 모드입니다. databaseURL을 넣으면 바로 실시간으로 바뀝니다.', S.mode === 'firebase' ? 'ok' : '');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function openCodeDialog() {
    $('#codeState').textContent = '';
    $('#codeState').className = 'db-state';
    var d = $('#codeDialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  function openMemberDialog() {
    $('#memState').textContent = '';
    $('#memState').className = 'db-state';
    closeMenu();
    var d = $('#memberDialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    setTimeout(function () { $('#memName').focus(); }, 60);
  }
  function closeMenu() { var m = $('#menu'); if (m) m.hidden = true; }

  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pickle-office-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { alert('내보내기에 실패했습니다.'); }
  }

  /* ---------- 시작 ---------- */
  function boot() {
    S.data = loadLocal();
    if (!Object.keys(S.data.members).length) {
      S.data.members = defaultMembers();
      saveLocal();
    }
    if (!S.data.messages[S.room]) S.data.messages[S.room] = {};

    bindEvents();
    setBadge();

    var cfg = null;
    try { cfg = JSON.parse(localStorage.getItem(K.cfg) || 'null'); } catch (e) { cfg = null; }
    if (cfg && cfg.databaseURL) {
      S.cfg = cfg;
      connectFirebase(cfg, function (ok, msg) {
        if (!ok) setDbState(msg, 'err');
      });
    }

    if (isUnlocked()) enterApp();
    else {
      $('#lock').hidden = false;
      setTimeout(function () { var el = $('#lockCode'); if (el) el.focus(); }, 80);
    }

    // 다른 탭/기기에서의 로컬 변경 반영
    window.addEventListener('storage', function (e) {
      if (e.key === K.data && S.mode !== 'firebase') {
        S.data = loadLocal();
        render();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

  // 디버그용 최소 노출 (해시 검증)
  window.__pickleOffice = { sha256: sha256, sha256Raw: sha256Raw, state: S };
})();
