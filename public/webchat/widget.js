(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var siteId = (script.getAttribute("data-site-id") || "").trim();
  if (!siteId) return;

  var scriptUrl = new URL(script.src, window.location.href);
  var apiBase = (script.getAttribute("data-api-base") || scriptUrl.origin + "/agent-api").replace(/\/+$/, "");
  var title = script.getAttribute("data-title") || "Atendimento";
  var subtitle = script.getAttribute("data-subtitle") || "Fale com a equipe";
  var welcomeFallback = script.getAttribute("data-welcome") || "Ola. Como podemos ajudar?";
  var accent = script.getAttribute("data-accent") || "#fc6c16";
  var bottom = safeCssLength(script.getAttribute("data-bottom"), "18px");
  var right = safeCssLength(script.getAttribute("data-right"), "18px");
  var bottomMobile = safeCssLength(script.getAttribute("data-bottom-mobile"), "12px");
  var rightMobile = safeCssLength(script.getAttribute("data-right-mobile"), "12px");
  var storageKey = "converta:webchat:" + siteId + ":sessionToken";
  var pollingMs = Math.max(3000, Number(script.getAttribute("data-polling-ms") || 5000));
  var state = {
    open: false,
    booting: false,
    sending: false,
    token: safeStorageGet(storageKey),
    cursor: null,
    messages: [],
    messageIds: Object.create(null),
    pendingMessages: [],
    name: "",
    error: "",
    welcomeMessage: welcomeFallback,
    collectName: script.getAttribute("data-collect-name") !== "false",
    pollTimer: 0,
    unreadCount: 0,
    interacted: false,
    muted: safeStorageGet("converta:webchat:" + siteId + ":muted") === "true",
    lastSoundAt: 0,
    audioContext: null
  };

  var host = document.createElement("div");
  host.setAttribute("data-converta-webchat", "true");
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  root.innerHTML = [
    "<style>",
    ":host{all:initial}",
    ".cw-shell{position:fixed;right:var(--cw-right);bottom:var(--cw-bottom);z-index:2147483000;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a}",
    ".cw-button{width:58px;height:58px;border:0;border-radius:50%;background:var(--cw-accent);color:#fff;box-shadow:0 18px 42px rgba(15,23,42,.28);display:grid;place-items:center;cursor:pointer}",
    ".cw-shell[data-has-unread='true'] .cw-button{animation:cw-pulse 1.35s ease-in-out infinite}",
    ".cw-button:focus-visible,.cw-send:focus-visible,.cw-close:focus-visible,.cw-sound:focus-visible{outline:3px solid rgba(252,108,22,.35);outline-offset:3px}",
    ".cw-button svg{width:28px;height:28px}",
    ".cw-badge{display:none;position:absolute;right:-4px;top:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;border:2px solid #fff;font-size:11px;font-weight:800;line-height:20px;text-align:center;box-sizing:border-box}",
    ".cw-shell[data-has-unread='true'] .cw-badge{display:block}",
    ".cw-panel{display:none;position:absolute;right:0;bottom:74px;width:min(360px,calc(100vw - 32px));height:min(560px,calc(100dvh - 110px));background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:14px;box-shadow:0 24px 80px rgba(15,23,42,.24);overflow:hidden}",
    ".cw-shell[data-open='true'] .cw-panel{display:grid;grid-template-rows:auto 1fr auto}",
    ".cw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 12px;background:#0f172a;color:#fff}",
    ".cw-title{font-size:15px;font-weight:700;line-height:1.2;margin:0}",
    ".cw-subtitle{font-size:12px;color:rgba(255,255,255,.72);line-height:1.2;margin:3px 0 0}",
    ".cw-actions{display:flex;gap:7px;align-items:center}",
    ".cw-close,.cw-sound{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:18px;line-height:32px}",
    ".cw-sound{font-size:14px;font-weight:800}",
    ".cw-body{background:#f8fafc;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin}",
    ".cw-message{max-width:82%;border-radius:12px;padding:9px 11px;font-size:13px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".cw-message.visitor{align-self:flex-end;background:var(--cw-accent);color:#fff;border-bottom-right-radius:4px}",
    ".cw-message.visitor.pending{opacity:.78}",
    ".cw-message.visitor.failed{background:#b42318}",
    ".cw-message.agent{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid rgba(15,23,42,.08);border-bottom-left-radius:4px}",
    ".cw-message.agent.new{box-shadow:0 0 0 2px rgba(252,108,22,.18)}",
    ".cw-message.system{align-self:center;background:transparent;color:#64748b;text-align:center;font-size:12px;max-width:100%}",
    ".cw-meta{display:block;margin-top:4px;font-size:10px;opacity:.72}",
    ".cw-form{border-top:1px solid rgba(15,23,42,.1);background:#fff;padding:10px;display:grid;gap:8px}",
    ".cw-name{width:100%;box-sizing:border-box;border:1px solid rgba(15,23,42,.14);border-radius:10px;padding:9px 10px;font:inherit;font-size:13px;color:#0f172a;background:#fff}",
    ".cw-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}",
    ".cw-text{width:100%;min-height:42px;max-height:98px;resize:vertical;box-sizing:border-box;border:1px solid rgba(15,23,42,.14);border-radius:10px;padding:10px;font:inherit;font-size:14px;color:#0f172a;background:#fff}",
    ".cw-send{border:0;border-radius:10px;background:var(--cw-accent);color:#fff;min-width:78px;height:42px;font-size:13px;font-weight:700;cursor:pointer}",
    ".cw-send:disabled,.cw-text:disabled,.cw-name:disabled{opacity:.58;cursor:not-allowed}",
    ".cw-error{display:none;color:#b42318;background:#fff1f0;border:1px solid #ffd0cc;border-radius:9px;padding:8px 10px;font-size:12px}",
    ".cw-error:not(:empty){display:block}",
    "@keyframes cw-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}",
    "@media (max-width:480px){.cw-shell{right:var(--cw-right-mobile);bottom:var(--cw-bottom-mobile)}.cw-panel{right:-2px;bottom:70px;width:calc(100vw - 24px);height:min(560px,calc(100dvh - 96px));border-radius:12px}.cw-button{width:54px;height:54px}}",
    "</style>",
    "<div class='cw-shell' style='--cw-accent:" + escapeAttr(accent) + ";--cw-bottom:" + bottom + ";--cw-right:" + right + ";--cw-bottom-mobile:" + bottomMobile + ";--cw-right-mobile:" + rightMobile + "'>",
    "  <div class='cw-panel' role='dialog' aria-label='Webchat'>",
    "    <div class='cw-head'>",
    "      <div><p class='cw-title'></p><p class='cw-subtitle'></p></div>",
    "      <div class='cw-actions'><button class='cw-sound' type='button' aria-label='Silenciar notificações'>♪</button><button class='cw-close' type='button' aria-label='Fechar'>x</button></div>",
    "    </div>",
    "    <div class='cw-body' aria-live='polite'></div>",
    "    <form class='cw-form'>",
    "      <input class='cw-name' type='text' maxlength='160' autocomplete='name' placeholder='Nome' />",
    "      <div class='cw-row'><textarea class='cw-text' maxlength='4000' placeholder='Digite sua mensagem'></textarea><button class='cw-send' type='submit'>Enviar</button></div>",
    "      <div class='cw-error' role='status'></div>",
    "    </form>",
    "  </div>",
    "  <button class='cw-button' type='button' aria-label='Abrir atendimento'>",
    "    <svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'/></svg>",
    "    <span class='cw-badge' aria-hidden='true'></span>",
    "  </button>",
    "</div>"
  ].join("");

  var shell = root.querySelector(".cw-shell");
  var panel = root.querySelector(".cw-panel");
  var button = root.querySelector(".cw-button");
  var closeButton = root.querySelector(".cw-close");
  var soundButton = root.querySelector(".cw-sound");
  var badgeEl = root.querySelector(".cw-badge");
  var titleEl = root.querySelector(".cw-title");
  var subtitleEl = root.querySelector(".cw-subtitle");
  var bodyEl = root.querySelector(".cw-body");
  var formEl = root.querySelector(".cw-form");
  var nameEl = root.querySelector(".cw-name");
  var textEl = root.querySelector(".cw-text");
  var sendEl = root.querySelector(".cw-send");
  var errorEl = root.querySelector(".cw-error");

  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  render();

  button.addEventListener("click", function () {
    state.interacted = true;
    primeNotificationAudio();
    state.open = !state.open;
    if (state.open) state.unreadCount = 0;
    render();
    if (state.open) {
      ensureSession().then(function () {
        pollMessages();
        schedulePolling();
        setTimeout(function () { textEl.focus(); }, 0);
      });
    } else {
      schedulePolling();
    }
  });

  closeButton.addEventListener("click", function () {
    state.interacted = true;
    primeNotificationAudio();
    state.open = false;
    schedulePolling();
    render();
  });

  soundButton.addEventListener("click", function () {
    state.interacted = true;
    state.muted = !state.muted;
    safeStorageSet("converta:webchat:" + siteId + ":muted", state.muted ? "true" : "false");
    primeNotificationAudio();
    renderControls();
  });

  formEl.addEventListener("submit", function (event) {
    event.preventDefault();
    state.interacted = true;
    primeNotificationAudio();
    sendMessage();
  });

  function endpoint(path) {
    return apiBase + path;
  }

  function setError(message) {
    state.error = message || "";
    renderControls();
  }

  function render() {
    shell.setAttribute("data-open", state.open ? "true" : "false");
    shell.setAttribute("data-has-unread", state.unreadCount > 0 ? "true" : "false");
    renderMessages();
    renderControls();
  }

  function renderControls() {
    nameEl.style.display = state.collectName && !state.token ? "block" : "none";
    errorEl.textContent = state.error || "";
    sendEl.disabled = state.booting || state.sending;
    textEl.disabled = state.booting || state.sending;
    nameEl.disabled = state.booting || state.sending;
    sendEl.textContent = state.sending ? "Enviando" : "Enviar";
    soundButton.textContent = state.muted ? "×" : "♪";
    soundButton.setAttribute("aria-label", state.muted ? "Ativar som de notificações" : "Silenciar notificações");
    badgeEl.textContent = state.unreadCount > 9 ? "9+" : String(state.unreadCount || "");
  }

  function renderMessages() {
    var nearBottom = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 40;
    var html = "";
    if (state.messages.length === 0) {
      html += "<div class='cw-message system'>" + escapeHtml(state.welcomeMessage) + "</div>";
    }
    for (var i = 0; i < state.messages.length; i += 1) {
      var item = state.messages[i];
      var cls = item.direction === "outbound" ? "agent" : "visitor";
      if (item.localStatus === "pending") cls += " pending";
      if (item.localStatus === "failed") cls += " failed";
      if (item.unreadHighlight) cls += " new";
      html += "<div class='cw-message " + cls + "'>";
      html += escapeHtml(item.text || "");
      html += "<span class='cw-meta'>" + formatTime(item.createdAt) + formatStatus(item) + "</span>";
      html += "</div>";
    }
    bodyEl.innerHTML = html;
    if (nearBottom) {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }
  }

  function ensureSession() {
    if (state.token || state.booting) return Promise.resolve();
    state.booting = true;
    setError("");
    renderControls();
    return fetchJson("/webchat/v1/session", {
      method: "POST",
      body: JSON.stringify({
        siteId: siteId,
        visitor: {
          name: state.collectName ? nameEl.value.trim() || undefined : undefined
        }
      })
    }).then(function (payload) {
      state.token = payload.token;
      safeStorageSet(storageKey, state.token);
      if (payload.site && payload.site.settings) {
        state.welcomeMessage = payload.site.settings.welcomeMessage || state.welcomeMessage;
        state.collectName = Boolean(payload.site.settings.collectName);
      }
      setError("");
    }).catch(function (error) {
      if (String(error.message || "").indexOf("webchat_identity_required") >= 0) {
        state.collectName = true;
        setError("Informe seu nome para iniciar o atendimento.");
        return;
      }
      setError(readableError(error.message));
    }).finally(function () {
      state.booting = false;
      render();
    });
  }

  function sendMessage() {
    var text = textEl.value.trim();
    if (!text) return;
    state.name = nameEl.value.trim();
    state.sending = true;
    setError("");
    var localId = "local:" + Date.now() + ":" + Math.random().toString(16).slice(2);
    var localMessage = {
      id: localId,
      direction: "inbound",
      text: text,
      createdAt: new Date().toISOString(),
      localStatus: "pending"
    };
    state.messageIds[localId] = true;
    state.pendingMessages.push(localMessage);
    state.messages.push(localMessage);
    renderMessages();
    ensureSession().then(function () {
      if (!state.token) return;
      return fetchJson("/webchat/v1/messages", {
        method: "POST",
        body: JSON.stringify({ sessionToken: state.token, text: text })
      }).then(function () {
        localMessage.localStatus = "sent";
        textEl.value = "";
        return pollMessages();
      });
    }).catch(function (error) {
      localMessage.localStatus = "failed";
      setError(readableError(error.message));
    }).finally(function () {
      state.sending = false;
      renderMessages();
      renderControls();
    });
  }

  function pollMessages() {
    if (!state.token) return Promise.resolve();
    var path = "/webchat/v1/messages?sessionToken=" + encodeURIComponent(state.token) + "&limit=30";
    if (state.cursor) path += "&cursor=" + encodeURIComponent(state.cursor);
    return fetchJson(path, { method: "GET" }).then(function (payload) {
      var list = Array.isArray(payload.messages) ? payload.messages : [];
      var receivedNewOutbound = false;
      for (var i = 0; i < list.length; i += 1) {
        var item = normalizeMessage(list[i]);
        if (!item || state.messageIds[item.id]) continue;
        state.messageIds[item.id] = true;
        item.unreadHighlight = item.direction === "outbound" && !state.open;
        if (item.direction === "outbound") receivedNewOutbound = true;
        if (item.direction === "inbound" && markPendingReceived(item)) continue;
        state.messages.push(item);
      }
      if (receivedNewOutbound) {
        if (!state.open) state.unreadCount += 1;
        playNotificationSound();
      }
      state.cursor = payload.page && payload.page.nextCursor ? payload.page.nextCursor : state.cursor;
      setError("");
      render();
    }).catch(function (error) {
      var code = String(error.message || "");
      if (code.indexOf("webchat_session_not_found") >= 0 || code.indexOf("webchat_session_expired") >= 0) {
        safeStorageRemove(storageKey);
        state.token = "";
        state.cursor = null;
        setError("Sessao expirada. Envie uma nova mensagem para recomecar.");
        return;
      }
      setError(readableError(code));
    });
  }

  function schedulePolling() {
    stopPolling();
    state.pollTimer = window.setInterval(function () {
      if (state.token) pollMessages();
    }, pollingMs);
  }

  function stopPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
  }

  function fetchJson(path, options) {
    var init = options || {};
    init.headers = Object.assign({ "Content-Type": "application/json" }, init.headers || {});
    return fetch(endpoint(path), init).then(function (response) {
      return response.text().then(function (text) {
        var payload = text ? safeJson(text) : {};
        if (!response.ok || payload.ok === false) {
          var code = payload && payload.error ? payload.error : "webchat_request_failed";
          if (payload && payload.error && payload.error.code) code = payload.error.code;
          throw new Error(code);
        }
        return payload;
      });
    });
  }

  function normalizeMessage(input) {
    if (!input || typeof input !== "object") return null;
    var text = typeof input.text === "string" ? input.text : "";
    if (!text) return null;
    return {
      id: String(input.id || ""),
      direction: input.direction === "outbound" ? "outbound" : "inbound",
      text: text,
      createdAt: String(input.createdAt || new Date().toISOString())
    };
  }

  function markPendingReceived(item) {
    for (var i = 0; i < state.pendingMessages.length; i += 1) {
      var pending = state.pendingMessages[i];
      if (pending.localStatus !== "sent" && pending.localStatus !== "pending") continue;
      if (pending.text !== item.text) continue;
      delete state.messageIds[pending.id];
      pending.id = item.id;
      state.messageIds[item.id] = true;
      pending.createdAt = item.createdAt;
      pending.localStatus = "received";
      return true;
    }
    return false;
  }

  function formatStatus(item) {
    if (item.direction !== "inbound") return "";
    if (item.localStatus === "pending") return " · enviando...";
    if (item.localStatus === "sent") return " · enviado";
    if (item.localStatus === "received") return " · recebido";
    if (item.localStatus === "failed") return " · erro";
    return "";
  }

  function playNotificationSound() {
    if (state.muted || !state.interacted) return;
    var now = Date.now();
    if (now - state.lastSoundAt < 700) return;
    state.lastSoundAt = now;
    try {
      var context = getAudioContext();
      if (!context) return;
      if (context.state === "suspended" && context.resume) {
        context.resume().catch(function () {});
      }
      playTone(context, 740, 0.11, 0);
      playTone(context, 920, 0.08, 0.1);
    } catch (_error) {
      // Audio feedback is optional and browser-dependent.
    }
  }

  function primeNotificationAudio() {
    if (state.muted) return;
    try {
      var context = getAudioContext();
      if (context && context.state === "suspended" && context.resume) {
        context.resume().catch(function () {});
      }
    } catch (_error) {
      // Audio unlock is optional and browser-dependent.
    }
  }

  function getAudioContext() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!state.audioContext || state.audioContext.state === "closed") {
      state.audioContext = new AudioContext();
    }
    return state.audioContext;
  }

  function playTone(context, frequency, duration, delay) {
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    var startAt = context.currentTime + delay;
    var endAt = startAt + duration;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  }

  function readableError(code) {
    if (code === "webchat_origin_not_allowed") return "Este dominio nao esta autorizado para o Webchat.";
    if (code === "webchat_site_inactive") return "Este Webchat esta inativo.";
    if (code === "feature_not_enabled") return "Webchat indisponivel neste momento.";
    if (code === "webchat_rate_limited") return "Muitas tentativas. Aguarde um instante.";
    if (code === "webchat_message_required") return "Digite uma mensagem.";
    if (code === "webchat_message_too_long") return "Mensagem muito longa.";
    return "Nao foi possivel concluir a operacao.";
  }

  function formatTime(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function safeJson(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return {};
    }
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Storage is optional.
    }
  }

  function safeStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // Storage is optional.
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return String(value).replace(/[;"'<>]/g, "");
  }

  function safeCssLength(value, fallback) {
    var raw = String(value || "").trim();
    if (/^\d{1,4}(\.\d{1,2})?(px|rem|em|vh|vw|dvh|dvw|%)$/.test(raw)) return raw;
    return fallback;
  }
})();
