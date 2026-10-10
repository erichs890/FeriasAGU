import type { Calendario, EventoCalendario } from './tipos';
import { diaSemana, fromDia, somarDias, toDia } from './datas';
import { novoId } from './id';

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const ev = (inicio: string, descricao: string, ativo = true, fim = inicio): EventoCalendario => ({
  id: novoId(), inicio, fim, descricao, ativo,
});

/** Calendário pré-populado do ano (tudo editável na tela Calendário). */
export function calendarioPadrao(ano: number): Calendario {
  const p = pascoa(ano);
  const d = (mmdd: string) => `${ano}-${mmdd}`;
  return {
    feriadosNacionais: [
      ev(d('01-01'), 'Confraternização Universal'),
      ev(somarDias(p, -48), 'Carnaval'),
      ev(somarDias(p, -47), 'Carnaval'),
      ev(somarDias(p, -46), 'Quarta-feira de Cinzas'),
      ev(somarDias(p, -2), 'Sexta-feira Santa'),
      ev(d('04-21'), 'Tiradentes'),
      ev(d('05-01'), 'Dia do Trabalho'),
      ev(somarDias(p, 60), 'Corpus Christi'),
      ev(d('09-07'), 'Independência'),
      ev(d('10-12'), 'Nossa Senhora Aparecida'),
      ev(d('10-15'), 'Marcado no rascunho 2026 (motivo a confirmar)', false),
      ev(d('10-28'), 'Dia do Servidor Público (ponto facultativo)'),
      ev(d('11-02'), 'Finados'),
      ev(d('11-15'), 'Proclamação da República'),
      ev(d('11-20'), 'Dia da Consciência Negra'),
      ev(d('12-25'), 'Natal'),
    ],
    feriadosRecife: [
      ev(d('03-06'), 'Data Magna de Pernambuco'),
      ev(d('06-24'), 'São João'),
      ev(d('07-16'), 'Nossa Senhora do Carmo'),
      ev(d('12-08'), 'Nossa Senhora da Conceição'),
    ],
    remessa: [],
    recesso: [],
  };
}

export type TipoDia = 'remessa' | 'feriadoNacional' | 'feriadoRecife' | 'recesso' | 'fimDeSemana' | null;

/** Conjuntos de dias (ISO) por categoria, só eventos ativos. */
export function diasMarcados(cal: Calendario) {
  const expandir = (evs: EventoCalendario[]) => {
    const s = new Map<string, string>();
    for (const e of evs) {
      if (!e.ativo || !e.inicio) continue;
      const fim = e.fim && e.fim >= e.inicio ? e.fim : e.inicio;
      for (let n = toDia(e.inicio); n <= toDia(fim); n++) s.set(fromDia(n), e.descricao);
    }
    return s;
  };
  return {
    remessa: expandir(cal.remessa),
    feriadoNacional: expandir(cal.feriadosNacionais),
    feriadoRecife: expandir(cal.feriadosRecife),
    recesso: expandir(cal.recesso),
  };
}

/**
 * Classificação visual do dia. Feriado vence fim de semana (como no rascunho).
 * Remessa e recesso vêm antes para que a exportação os preserve (são relidos da planilha).
 */
export function tipoDia(iso: string, m: ReturnType<typeof diasMarcados>): TipoDia {
  if (m.remessa.has(iso)) return 'remessa';
  if (m.recesso.has(iso)) return 'recesso';
  if (m.feriadoNacional.has(iso)) return 'feriadoNacional';
  if (m.feriadoRecife.has(iso)) return 'feriadoRecife';
  const s = diaSemana(iso);
  return s === 0 || s === 6 ? 'fimDeSemana' : null;
}
