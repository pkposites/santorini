import { randomUUID } from "node:crypto";
import {
  janela, json, normalizaFone, nomeValido, limpaNome, sha256, semAcento,
} from "../lib/core.mjs";

/*
 * POST /api/lista
 * 1. Confere a janela (segunda 17h → quinta 19h, Brasília)
 * 2. Valida os dados
 * 3. Grava no Google Sheets (via Apps Script)
 * 4. Envia o evento Lead para a API de Conversões da Meta
 */
export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ ok: false, erro: "json", mensagem: "Dados inválidos." }, 400); }

  // Honeypot: robôs preenchem o campo escondido. Finge sucesso e descarta.
  if (b.empresa) return json({ ok: true });

  const j = janela();
  if (!j.aberta) {
    return json({
      ok: false, erro: "fechada",
      mensagem: "A lista desta semana está fechada. Volte segunda-feira às 17h para colocar seu nome.",
    }, 403);
  }

  // ---- Validação ----
  const nome = limpaNome(b.nome);
  const whatsapp = normalizaFone(b.whatsapp);
  if (!nomeValido(nome)) return json({ ok: false, erro: "nome", mensagem: "Informe nome e sobrenome." }, 400);
  if (!whatsapp) return json({ ok: false, erro: "whatsapp", mensagem: "Informe um celular válido com DDD." }, 400);
  if (b.maior !== true) return json({ ok: false, erro: "maior", mensagem: "Confirme que você tem 18 anos ou mais." }, 400);

  const max = Number(process.env.MAX_ACOMPANHANTES || 5);
  const brutos = Array.isArray(b.acompanhantes) ? b.acompanhantes : [];
  if (brutos.length > max) return json({ ok: false, erro: "acompanhantes", mensagem: `Máximo de ${max} acompanhantes por cadastro.` }, 400);

  const acompanhantes = [];
  for (const a of brutos) {
    const n = limpaNome(a && a.nome);
    if (!nomeValido(n)) return json({ ok: false, erro: "acompanhante", mensagem: "Informe nome e sobrenome de cada acompanhante." }, 400);
    const f = a && a.whatsapp ? normalizaFone(a.whatsapp) : "";
    if (a && a.whatsapp && !f) return json({ ok: false, erro: "acompanhante", mensagem: `WhatsApp inválido para ${n}.` }, 400);
    acompanhantes.push({ nome: n, whatsapp: f });
  }

  const instagram = String(b.instagram || "").trim().slice(0, 40);
  const utm = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    if (b.utm && b.utm[k]) utm[k] = String(b.utm[k]).slice(0, 120);
  }
  const grupo = randomUUID();

  // ---- Google Sheets ----
  const url = process.env.SHEETS_WEBHOOK_URL;
  const secret = process.env.SHEETS_SECRET;
  if (!url || !secret) {
    console.error("SHEETS_WEBHOOK_URL / SHEETS_SECRET não configurados");
    return json({ ok: false, erro: "config", mensagem: "Lista temporariamente indisponível. Tente novamente mais tarde." }, 500);
  }

  let planilha;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret, acao: "adicionar", dataEvento: j.dataEvento, grupo,
        titular: { nome, whatsapp, instagram }, acompanhantes, utm,
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    planilha = await r.json();
  } catch (err) {
    console.error("Falha ao gravar na planilha", err);
    return json({ ok: false, erro: "planilha", mensagem: "Não conseguimos salvar agora. Tente novamente em instantes." }, 502);
  }

  if (!planilha || !planilha.ok) {
    if (planilha && planilha.erro === "duplicado") {
      return json({ ok: false, erro: "duplicado", mensagem: planilha.mensagem || "Esse WhatsApp já está na lista desta quinta." }, 409);
    }
    console.error("Planilha recusou", planilha);
    return json({ ok: false, erro: "planilha", mensagem: "Não conseguimos salvar agora. Tente novamente em instantes." }, 502);
  }

  // ---- Meta Conversions API (não bloqueia o cadastro se falhar) ----
  await enviarCapi({ req, context, b, nome, whatsapp, acompanhantes }).catch((err) =>
    console.error("CAPI falhou", err));

  return json({ ok: true, dataEvento: j.dataEvento, grupo, pessoas: 1 + acompanhantes.length });
};

async function enviarCapi({ req, context, b, nome, whatsapp, acompanhantes }) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return;

  const partes = semAcento(nome).split(/\s+/);
  const user_data = {
    ph: [sha256("55" + whatsapp)],
    fn: [sha256(partes[0])],
    ln: [sha256(partes[partes.length - 1])],
    external_id: [sha256("55" + whatsapp)],
    country: [sha256("br")],
    st: [sha256("rj")],
    client_ip_address: context.ip || req.headers.get("x-nf-client-connection-ip") || undefined,
    client_user_agent: req.headers.get("user-agent") || undefined,
  };
  if (b.fbp) user_data.fbp = String(b.fbp);
  if (b.fbc) user_data.fbc = String(b.fbc);

  const payload = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(b.eventId || randomUUID()),
      action_source: "website",
      event_source_url: String(b.pagina || req.headers.get("referer") || ""),
      user_data,
      custom_data: {
        content_name: "Quinta das Patroas - Lista VIP",
        num_items: 1 + acompanhantes.length,
        acompanhantes: acompanhantes.length,
      },
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  const versao = process.env.META_GRAPH_VERSION || "v23.0";
  const r = await fetch(`https://graph.facebook.com/${versao}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) console.error("CAPI resposta", r.status, await r.text());
}

export const config = { path: "/api/lista" };
