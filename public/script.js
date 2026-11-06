(function () {
  "use strict";

  var CFG = window.SANTORINI_CONFIG || {};
  var TZ = "America/Sao_Paulo";
  var MAX = CFG.maxAcompanhantes || 5;
  var params = new URLSearchParams(location.search);

  // Modo demonstração: abrir localmente ou com ?demo=1 (não grava nada).
  var DEMO = params.get("demo") === "1" || location.protocol === "file:" ||
    /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ *
   * Meta Pixel
   * ------------------------------------------------------------------ */
  if (CFG.metaPixelId) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", CFG.metaPixelId);
    window.fbq("track", "PageView");
  }
  function pixel(evento, dados, eventId) {
    if (window.fbq) window.fbq("track", evento, dados || {}, eventId ? { eventID: eventId } : undefined);
  }

  /* ------------------------------------------------------------------ *
   * Janela da lista (servidor é a fonte da verdade; cálculo local só no modo demo)
   * ------------------------------------------------------------------ */
  var status = null;      // resposta de /api/status
  var offset = 0;         // relógio do servidor - relógio local (ms)

  function partesSP(date) {
    var f = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    var p = {};
    f.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    var wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: wd };
  }
  function isoDataSP(ms) {
    var p = partesSP(new Date(ms));
    return p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0");
  }
  // Mesma regra de netlify/lib/core.mjs: segunda 17h → quinta 19h
  function janelaLocal(now) {
    var p = partesSP(now);
    var seg = (p.wd - 1) * 86400 + p.h * 3600 + p.mi * 60 + p.s;
    var abre = 0 * 86400 + 17 * 3600, fecha = 3 * 86400 + 19 * 3600;
    var base = Math.floor(now.getTime() / 1000) * 1000 - seg * 1000;
    var abreEm = seg < abre ? base + abre * 1000 : base + (7 * 86400 + abre) * 1000;
    var forcar = params.get("preview");
    var aberta = forcar ? forcar === "open" : (seg >= abre && seg < fecha);
    return {
      aberta: aberta,
      agora: now.toISOString(),
      fechaEm: new Date(base + fecha * 1000).toISOString(),
      abreEm: new Date(abreEm).toISOString(),
      dataEvento: isoDataSP(base + 3 * 86400000 + 12 * 3600000),
      proximaData: isoDataSP(abreEm + 3 * 86400000)
    };
  }

  function carregarStatus() {
    if (DEMO) { aplicar(janelaLocal(new Date())); return Promise.resolve(); }
    var t0 = Date.now();
    return fetch("/api/status", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (s) {
        offset = new Date(s.agora).getTime() - (t0 + Date.now()) / 2;
        aplicar(s);
      })
      .catch(function () {
        // Sem servidor: mostra pela hora local, mas o envio continua bloqueado pelo servidor.
        aplicar(janelaLocal(new Date()));
      });
  }

  /* ------------------------------------------------------------------ *
   * Datas e contagem regressiva
   * ------------------------------------------------------------------ */
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function dataLonga(iso) {           // "quinta, 12 de novembro"
    var a = iso.split("-");
    return "quinta, " + (+a[2]) + " de " + MESES[+a[1] - 1];
  }
  function dataCurta(iso) { var a = iso.split("-"); return a[2] + "/" + a[1]; }

  function duracao(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return (d ? d + "d " : "") + pad(h) + "h " + pad(m) + "m " + pad(s) + "s";
  }

  var tick = null;
  function aplicar(s) {
    status = s;
    var aberta = !!s.aberta;
    var st = $("status");
    st.dataset.state = aberta ? "open" : "closed";

    $("eventDateOpen").textContent = dataLonga(s.dataEvento);
    $("eventDateSuccess").textContent = dataLonga(s.dataEvento);
    $("eventDateInfo").textContent = aberta ? "Quinta, " + dataCurta(s.dataEvento) : "Próxima: quinta, " + dataCurta(s.proximaData);

    if (!$("panelSuccess").hidden) { /* mantém tela de sucesso */ }
    else {
      $("panelOpen").hidden = !aberta;
      $("panelClosed").hidden = aberta;
    }
    if (!aberta) {
      var abre = new Date(s.abreEm);
      var p = partesSP(abre);
      $("reopenDate").textContent = "segunda, " + String(p.d).padStart(2, "0") + "/" + String(p.m).padStart(2, "0") + " às 17h";
    }

    clearInterval(tick);
    var alvo = new Date(aberta ? s.fechaEm : s.abreEm).getTime();
    var atualizar = function () {
      var falta = alvo - (Date.now() + offset);
      var txt = duracao(falta);
      if (aberta) {
        $("countdownOpen").textContent = txt;
        $("statusText").textContent = "Lista aberta · fecha quinta às 19h";
      } else {
        $("countdownClosed").textContent = txt;
        $("statusText").textContent = "Lista fechada · reabre segunda às 17h";
      }
      if (falta <= 0) { clearInterval(tick); setTimeout(carregarStatus, 1500); }
    };
    atualizar();
    tick = setInterval(atualizar, 1000);
  }

  /* ------------------------------------------------------------------ *
   * Links fixos
   * ------------------------------------------------------------------ */
  $("mapLink").href = CFG.mapa || "#";
  $("addressText").textContent = CFG.endereco || "";
  $("reservaLink").href = "https://wa.me/" + (CFG.whatsappReservas || "") + "?text=" +
    encodeURIComponent("Olá! Gostaria de reservar um lounge/camarote para a Quinta das Patroas.");
  $("igLink").href = CFG.instagram || "#";
  $("vipLink").href = $("vipLinkClosed").href = CFG.comunidadeVip || "#";

  /* ------------------------------------------------------------------ *
   * Máscara de telefone
   * ------------------------------------------------------------------ */
  function soDigitos(v) { return (v || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); }
  function mascara(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  function foneValido(v) { var d = soDigitos(v); return d.length === 11 && d[2] === "9"; }
  document.addEventListener("input", function (e) {
    if (e.target.matches('input[type="tel"]')) e.target.value = mascara(e.target.value);
  });

  /* ------------------------------------------------------------------ *
   * Acompanhantes
   * ------------------------------------------------------------------ */
  var qtd = 1;
  var lista = $("acompList");

  function renderAcomp() {
    // Preserva o que já foi digitado
    var antigos = Array.prototype.map.call(lista.querySelectorAll(".guest"), function (g) {
      return { nome: g.querySelector("[data-k=nome]").value, fone: g.querySelector("[data-k=fone]").value };
    });
    lista.innerHTML = "";
    for (var i = 0; i < qtd; i++) {
      var v = antigos[i] || { nome: "", fone: "" };
      var g = document.createElement("div");
      g.className = "guest";
      g.innerHTML =
        '<p class="guest-title">Acompanhante ' + (i + 1) + "</p>" +
        '<label class="field"><span>Nome completo</span>' +
        '<input type="text" data-k="nome" maxlength="80" autocomplete="off" placeholder="Nome e sobrenome"></label>' +
        '<small class="error" data-guest="' + i + '"></small>' +
        '<label class="field"><span>WhatsApp <i>(recomendado)</i></span>' +
        '<input type="tel" data-k="fone" inputmode="numeric" autocomplete="off" placeholder="(21) 99999-9999"></label>';
      g.querySelector("[data-k=nome]").value = v.nome;
      g.querySelector("[data-k=fone]").value = v.fone;
      lista.appendChild(g);
    }
    $("qtd").textContent = qtd;
    $("menos").disabled = qtd <= 1;
    $("mais").disabled = qtd >= MAX;
  }
  function levaAcomp() { return document.querySelector('input[name="acomp"]:checked').value === "sim"; }

  document.querySelectorAll('input[name="acomp"]').forEach(function (r) {
    r.addEventListener("change", function () {
      $("acompBox").hidden = !levaAcomp();
      if (levaAcomp() && !lista.children.length) renderAcomp();
    });
  });
  $("menos").addEventListener("click", function () { if (qtd > 1) { qtd--; renderAcomp(); } });
  $("mais").addEventListener("click", function () { if (qtd < MAX) { qtd++; renderAcomp(); } });

  /* ------------------------------------------------------------------ *
   * Validação e envio
   * ------------------------------------------------------------------ */
  function erro(campo, msg) {
    var el = document.querySelector('.error[data-for="' + campo + '"]');
    if (el) el.textContent = msg || "";
    var inp = $(campo);
    if (inp) inp.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function nomeValido(n) { return /^\S{2,}(\s+\S+)+$/.test(n.trim()); }

  function coletar() {
    var ok = true;
    var nome = $("nome").value.trim().replace(/\s+/g, " ");
    var fone = $("whatsapp").value;
    if (!nomeValido(nome)) { erro("nome", "Informe nome e sobrenome."); ok = false; } else erro("nome");
    if (!foneValido(fone)) { erro("whatsapp", "Informe um celular com DDD, ex.: (21) 99999-9999."); ok = false; } else erro("whatsapp");
    if (!$("maior").checked) { erro("maior", "Confirme que você tem 18 anos ou mais."); ok = false; } else erro("maior");

    var acomp = [];
    if (levaAcomp()) {
      lista.querySelectorAll(".guest").forEach(function (g, i) {
        var n = g.querySelector("[data-k=nome]").value.trim().replace(/\s+/g, " ");
        var f = g.querySelector("[data-k=fone]").value;
        var e = g.querySelector(".error");
        var msg = "";
        if (!nomeValido(n)) msg = "Informe nome e sobrenome da acompanhante.";
        else if (f && !foneValido(f)) msg = "WhatsApp inválido (ou deixe em branco).";
        else if (f && soDigitos(f) === soDigitos(fone)) msg = "Use o WhatsApp da própria acompanhante (ou deixe em branco).";
        e.textContent = msg;
        if (msg) ok = false;
        acomp.push({ nome: n, whatsapp: f ? soDigitos(f) : "" });
      });
    }
    var utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (k) {
      if (params.get(k)) utm[k] = params.get(k);
    });
    return ok ? {
      nome: nome,
      whatsapp: soDigitos(fone),
      instagram: $("instagram").value.trim().replace(/^@?/, "@").replace(/^@$/, ""),
      maior: true,
      acompanhantes: acomp,
      utm: utm,
      empresa: $("empresa").value
    } : null;
  }

  function cookie(nome) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + nome + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function novoId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "ev-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  var form = $("form");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    $("formMsg").textContent = "";
    var dados = coletar();
    if (!dados) {
      var primeiro = form.querySelector('[aria-invalid="true"]') || form.querySelector(".error:not(:empty)");
      if (primeiro) primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var eventId = novoId();
    dados.eventId = eventId;
    dados.fbp = cookie("_fbp");
    dados.fbc = cookie("_fbc") || (params.get("fbclid") ? "fb.1." + Date.now() + "." + params.get("fbclid") : "");
    dados.pagina = location.href;

    var btn = $("submitBtn");
    btn.disabled = true;
    btn.querySelector(".btn-label").textContent = "Enviando…";

    var envio = DEMO
      ? new Promise(function (res) { setTimeout(function () { res({ ok: true, dataEvento: status && status.dataEvento, demo: true }); }, 700); })
      : fetch("/api/lista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) })
          .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });

    envio.then(function (res) {
      if (res && res.ok) {
        pixel("Lead", { content_name: "Quinta das Patroas - Lista VIP", num_items: 1 + dados.acompanhantes.length }, eventId);
        sucesso(dados);
      } else {
        if (res && res.erro === "fechada") { carregarStatus(); }
        $("formMsg").textContent = (res && res.mensagem) || "Não foi possível enviar agora. Tente novamente em instantes.";
      }
    }).catch(function () {
      $("formMsg").textContent = "Sem conexão. Verifique sua internet e tente novamente.";
    }).then(function () {
      btn.disabled = false;
      btn.querySelector(".btn-label").textContent = "Quero meu nome na lista";
    });
  });

  function sucesso(d) {
    $("successName").textContent = d.nome.split(" ")[0];
    var ol = $("successNames");
    ol.innerHTML = "";
    [d.nome].concat(d.acompanhantes.map(function (a) { return a.nome; })).forEach(function (n) {
      var li = document.createElement("li"); li.textContent = n; ol.appendChild(li);
    });
    $("successList").hidden = d.acompanhantes.length === 0;

    if (d.acompanhantes.length) {
      var txt = "Coloquei seu nome na Lista VIP da *Quinta das Patroas* no Santorini (" +
        dataLonga(status.dataEvento) + ")! 🥂\nOpen de drinks pras 100 primeiras mulheres das 20h às 22h — bora chegar cedo.\n" +
        "Leve documento com foto. " + location.origin + location.pathname;
      $("shareBtn").href = "https://wa.me/?text=" + encodeURIComponent(txt);
      $("shareBtn").hidden = false;
    }
    $("panelOpen").hidden = true;
    $("panelClosed").hidden = true;
    $("panelSuccess").hidden = false;
    $("panelSuccess").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  carregarStatus();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) carregarStatus(); });
})();
