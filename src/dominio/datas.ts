// Aritmética de datas em dias inteiros (UTC): sem bugs de fuso/horário de verão.
const MS_DIA = 86_400_000;

export const toDia = (iso: string): number => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / MS_DIA;
};

export const fromDia = (n: number): string => new Date(n * MS_DIA).toISOString().slice(0, 10);

export const isoValida = (s: string | undefined | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDia(toDia(s)) === s;

export const somarDias = (iso: string, n: number) => fromDia(toDia(iso) + n);

/** Quantidade de dias corridos de inicio a fim, inclusive. */
export const diasEntre = (inicio: string, fim: string) => toDia(fim) - toDia(inicio) + 1;

export const diaSemana = (iso: string) => new Date(toDia(iso) * MS_DIA).getUTCDay();

export const ehBissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

export const diasNoAno = (ano: number) => (ehBissexto(ano) ? 366 : 365);

export const primeiroDia = (ano: number) => `${ano}-01-01`;
export const ultimoDia = (ano: number) => `${ano}-12-31`;

export const diasDoAno = (ano: number): string[] => {
  const ini = toDia(primeiroDia(ano));
  return Array.from({ length: diasNoAno(ano) }, (_, i) => fromDia(ini + i));
};

export const formatar = (iso: string) =>
  isoValida(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '—';
export const formatarCurto = (iso: string) => (isoValida(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso || '—');

export const formatarIntervalo = (inicio: string, fim: string, curto = true) => {
  const f = curto ? formatarCurto : formatar;
  return inicio === fim ? f(inicio) : `${f(inicio)} a ${f(fim)}`;
};

/** 'dd/mm/aaaa' → ISO, ou null se inválida. */
export const parseBR = (s: string): string | null => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isoValida(iso) ? iso : null;
};

/** Agrupa números de dia (ordenados) em intervalos consecutivos. */
export const agruparConsecutivos = (dias: number[]): { inicio: number; fim: number }[] => {
  const out: { inicio: number; fim: number }[] = [];
  for (const d of dias) {
    const ult = out[out.length - 1];
    if (ult && d === ult.fim + 1) ult.fim = d;
    else out.push({ inicio: d, fim: d });
  }
  return out;
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Data/hora local legível para logs. */
export const agoraISO = () => new Date().toISOString();
export const formatarDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');
