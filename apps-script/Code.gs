/**
 * Santorini · Quinta das Patroas · Lista VIP
 * Google Apps Script vinculado à planilha (Extensões → Apps Script).
 *
 * Abas criadas automaticamente:
 *   - "Lista (todas)"   → todos os nomes de todas as quintas
 *   - "Quinta DD-MM-AAAA" → uma aba por evento (para a portaria)
 *   - "Clientes"        → base de clientes única por WhatsApp (histórico de listas)
 *
 * Configuração: Projeto → Configurações → Propriedades do script → SECRET = (mesmo valor de SHEETS_SECRET no Netlify)
 */

var TZ = 'America/Sao_Paulo';
var ABA_LISTA = 'Lista (todas)';
var ABA_CLIENTES = 'Clientes';
var CAB_LISTA = ['Data do evento', 'Nome', 'WhatsApp', 'Tipo', 'Titular', 'Instagram', 'Cadastrado em', 'Grupo',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
var CAB_EVENTO = ['Nº', 'Nome', 'Tipo', 'Titular', 'WhatsApp', 'Cadastrado em', 'Presença'];
var CAB_CLIENTES = ['WhatsApp', 'Nome', 'Instagram', 'Primeiro cadastro', 'Último cadastro', 'Qtd. de listas',
  'Quintas', 'Como titular', 'Como acompanhante', 'Origem (1º utm_source)'];

function segredo_() {
  return PropertiesService.getScriptProperties().getProperty('SECRET');
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!segredo_() || d.secret !== segredo_()) return saida_({ ok: false, erro: 'nao_autorizado' });
    if (d.acao === 'adicionar') return saida_(adicionar_(d));
    return saida_({ ok: false, erro: 'acao_invalida' });
  } catch (err) {
    return saida_({ ok: false, erro: 'excecao', detalhe: String(err) });
  }
}

function doGet(e) {
  try {
    var p = e.parameter || {};
    if (!segredo_() || p.secret !== segredo_()) return saida_({ ok: false, erro: 'nao_autorizado' });
    if (p.acao === 'semanas') return saida_({ ok: true, semanas: semanas_() });
    if (p.acao === 'lista') return saida_({ ok: true, data: p.data, pessoas: lista_(p.data) });
    if (p.acao === 'clientes') return saida_({ ok: true, clientes: clientes_() });
    return saida_({ ok: false, erro: 'acao_invalida' });
  } catch (err) {
    return saida_({ ok: false, erro: 'excecao', detalhe: String(err) });
  }
}

/* ---------------- Escrita ---------------- */

function adicionar_(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var aba = garantirAba_(ss, ABA_LISTA, CAB_LISTA, ['A:A', 'C:C']);
    var agora = Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
    var utm = d.utm || {};

    // Duplicidade: mesmo WhatsApp na mesma quinta
    var valores = aba.getLastRow() > 1 ? aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues() : [];
    var jaNaLista = {};
    valores.forEach(function (r) { if (String(r[0]) === d.dataEvento && r[2]) jaNaLista[String(r[2])] = r[1]; });

    var pessoas = [{ nome: d.titular.nome, whatsapp: d.titular.whatsapp, tipo: 'Titular', instagram: d.titular.instagram || '' }]
      .concat((d.acompanhantes || []).map(function (a) {
        return { nome: a.nome, whatsapp: a.whatsapp || '', tipo: 'Acompanhante', instagram: '' };
      }));

    var vistos = {};
    for (var i = 0; i < pessoas.length; i++) {
      var f = pessoas[i].whatsapp;
      if (!f) continue;
      if (jaNaLista[f] || vistos[f]) {
        var quem = i === 0 ? 'Esse WhatsApp' : 'O WhatsApp de ' + pessoas[i].nome;
        return { ok: false, erro: 'duplicado', mensagem: quem + ' já está na lista desta quinta.' };
      }
      vistos[f] = true;
    }

    var linhas = pessoas.map(function (p) {
      return [d.dataEvento, p.nome, p.whatsapp, p.tipo, d.titular.nome, p.instagram, agora, d.grupo,
        utm.utm_source || '', utm.utm_medium || '', utm.utm_campaign || '', utm.utm_content || ''];
    });
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CAB_LISTA.length).setValues(linhas);

    // Aba da quinta (portaria)
    var nomeAba = 'Quinta ' + d.dataEvento.split('-').reverse().join('-');
    var ev = garantirAba_(ss, nomeAba, CAB_EVENTO, ['E:E']);
    var inicio = ev.getLastRow() + 1;
    var linhasEv = pessoas.map(function (p, k) {
      return [inicio - 1 + k, p.nome, p.tipo, d.titular.nome, p.whatsapp, agora, false];
    });
    ev.getRange(inicio, 1, linhasEv.length, CAB_EVENTO.length).setValues(linhasEv);
    ev.getRange(inicio, 7, linhasEv.length, 1).insertCheckboxes();

    // Base de clientes
    atualizarClientes_(ss, pessoas, d, agora);

    return { ok: true, pessoas: pessoas.length };
  } finally {
    lock.releaseLock();
  }
}

function atualizarClientes_(ss, pessoas, d, agora) {
  var aba = garantirAba_(ss, ABA_CLIENTES, CAB_CLIENTES, ['A:A']);
  var n = aba.getLastRow() - 1;
  var dados = n > 0 ? aba.getRange(2, 1, n, CAB_CLIENTES.length).getValues() : [];
  var indice = {};
  dados.forEach(function (r, i) { indice[String(r[0])] = i; });
  var quinta = d.dataEvento.split('-').reverse().join('/');

  pessoas.forEach(function (p) {
    if (!p.whatsapp) return; // acompanhante sem WhatsApp não entra na base
    var i = indice[p.whatsapp];
    if (i === undefined) {
      var nova = [p.whatsapp, p.nome, p.instagram, agora, agora, 1, quinta,
        p.tipo === 'Titular' ? 1 : 0, p.tipo === 'Titular' ? 0 : 1, (d.utm && d.utm.utm_source) || ''];
      aba.appendRow(nova);
      indice[p.whatsapp] = dados.length;
      dados.push(nova);
    } else {
      var r = dados[i];
      r[1] = p.nome;
      if (p.instagram) r[2] = p.instagram;
      r[4] = agora;
      r[5] = Number(r[5] || 0) + 1;
      r[6] = r[6] ? r[6] + ', ' + quinta : quinta;
      if (p.tipo === 'Titular') r[7] = Number(r[7] || 0) + 1; else r[8] = Number(r[8] || 0) + 1;
      aba.getRange(i + 2, 1, 1, CAB_CLIENTES.length).setValues([r]);
    }
  });
}

function garantirAba_(ss, nome, cabecalho, colunasTexto) {
  var aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#0A1A2C').setFontColor('#F4ECDD');
    aba.setFrozenRows(1);
    (colunasTexto || []).forEach(function (c) { aba.getRange(c).setNumberFormat('@'); });
  }
  return aba;
}

/* ---------------- Leitura (painel) ---------------- */

function linhasLista_() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_LISTA);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CAB_LISTA.length).getDisplayValues();
}

function semanas_() {
  var mapa = {};
  linhasLista_().forEach(function (r) {
    var k = String(r[0]);
    if (!mapa[k]) mapa[k] = { data: k, total: 0, titulares: 0, acompanhantes: 0 };
    mapa[k].total++;
    if (r[3] === 'Titular') mapa[k].titulares++; else mapa[k].acompanhantes++;
  });
  return Object.keys(mapa).sort().reverse().map(function (k) { return mapa[k]; });
}

function lista_(data) {
  return linhasLista_().filter(function (r) { return String(r[0]) === data; }).map(function (r) {
    return { nome: r[1], whatsapp: String(r[2]), tipo: r[3], titular: r[4], instagram: r[5], cadastradoEm: String(r[6]),
      grupo: r[7], origem: r[8] };
  });
}

function clientes_() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_CLIENTES);
  if (!aba || aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, CAB_CLIENTES.length).getDisplayValues().map(function (r) {
    return { whatsapp: String(r[0]), nome: r[1], instagram: r[2], primeiro: String(r[3]), ultimo: String(r[4]),
      listas: Number(r[5]) || 0, quintas: r[6], titular: Number(r[7]) || 0, acompanhante: Number(r[8]) || 0, origem: r[9] };
  });
}
