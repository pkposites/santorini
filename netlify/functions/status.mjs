import { janela, json } from "../lib/core.mjs";

// GET /api/status → estado da lista pelo relógio do servidor (horário de Brasília)
export default async () => json(janela());

export const config = { path: "/api/status" };
