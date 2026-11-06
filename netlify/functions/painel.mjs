import { json, igualSeguro } from "../lib/core.mjs";

/*
 * GET /api/painel?acao=semanas | acao=lista&data=AAAA-MM-DD | acao=clientes
 * Protegido pela senha PAINEL_SENHA (header x-painel-senha).
 */
export default async (req) => {
  if (!igualSeguro(req.headers.get("x-painel-senha"), process.env.PAINEL_SENHA)) {
    return json({ ok: false, erro: "senha" }, 401);
  }
  const u = new URL(req.url);
  const acao = u.searchParams.get("acao") || "semanas";
  if (!["semanas", "lista", "clientes"].includes(acao)) return json({ ok: false, erro: "acao" }, 400);

  const alvo = new URL(process.env.SHEETS_WEBHOOK_URL);
  alvo.searchParams.set("secret", process.env.SHEETS_SECRET || "");
  alvo.searchParams.set("acao", acao);
  const data = u.searchParams.get("data");
  if (data && /^\d{4}-\d{2}-\d{2}$/.test(data)) alvo.searchParams.set("data", data);

  try {
    const r = await fetch(alvo, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    return json(await r.json());
  } catch (err) {
    console.error("Painel: falha ao ler planilha", err);
    return json({ ok: false, erro: "planilha" }, 502);
  }
};

export const config = { path: "/api/painel" };
