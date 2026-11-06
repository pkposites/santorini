import { createHash, timingSafeEqual } from "node:crypto";

export const TZ = "America/Sao_Paulo";
// Janela da lista. day: 1 = segunda ... 7 = domingo.
export const ABRE = { day: 1, hour: 17, minute: 0 };   // segunda 17h
export const FECHA = { day: 4, hour: 19, minute: 0 };  // quinta 19h
export const DIA_EVENTO = 4;                           // quinta

function partesSP(date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd };
}

function isoDataSP(ms) {
  const p = partesSP(new Date(ms));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

const segDaSemana = (x) => (x.day - 1) * 86400 + x.hour * 3600 + x.minute * 60;

/** Estado da lista no horário de Brasília. */
export function janela(now = new Date()) {
  const p = partesSP(now);
  const seg = (p.wd - 1) * 86400 + p.h * 3600 + p.mi * 60 + p.s;
  const abre = segDaSemana(ABRE);
  const fecha = segDaSemana(FECHA);
  // Segunda-feira 00:00 (Brasília) desta semana, em ms UTC
  const base = Math.floor(now.getTime() / 1000) * 1000 - seg * 1000;
  const abreEm = seg < abre ? base + abre * 1000 : base + (7 * 86400 + abre) * 1000;
  const meioDiaEvento = (DIA_EVENTO - 1) * 86400000 + 12 * 3600000;
  return {
    aberta: seg >= abre && seg < fecha,
    agora: now.toISOString(),
    fechaEm: new Date(base + fecha * 1000).toISOString(),
    abreEm: new Date(abreEm).toISOString(),
    dataEvento: isoDataSP(base + meioDiaEvento),    // quinta desta semana
    proximaData: isoDataSP((seg < abre ? base : base + 7 * 86400000) + meioDiaEvento), // quinta da próxima abertura
  };
}

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Celular BR → apenas dígitos, sem 55 (DDD + 9 dígitos). Retorna "" se inválido. */
export function normalizaFone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  return d.length === 11 && d[2] === "9" ? d : "";
}

export const nomeValido = (n) => /^\S{2,}(\s+\S+)+$/.test(String(n || "").trim());
export const limpaNome = (n) => String(n || "").trim().replace(/\s+/g, " ").slice(0, 80);

export const sha256 = (v) => createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex");

/** Remove acentos para o hash da Meta (fn/ln em minúsculas, sem pontuação). */
export const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z ]/g, "").toLowerCase().trim();

export function igualSeguro(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
