import type { Advogado, Config, ModoArredondamento, Periodo, TipoPeriodo } from '../dominio/tipos';
import { isoValida, primeiroDia, toDia, ultimoDia } from '../dominio/datas';

/**
 * Limite de afastados simultâneos de um núcleo com n advogados.
 * Ex. (30%, mais próximo, mínimo 1): 2 → 1; 5 → 2; 16 → 5.
 */
export function limiteEfetivo(n: number, percentual: number, modo: ModoArredondamento, minimo: number): number {
  if (n <= 0) return 0;
  const bruto = (n * percentual) / 100;
  const eps = 1e-9; // evita 4.999999 em produtos de ponto flutuante
  const arred = modo === 'baixo' ? Math.floor(bruto + eps) : modo === 'cima' ? Math.ceil(bruto - eps) : Math.floor(bruto + 0.5 + eps);
  return Math.min(n, Math.max(minimo, arred));
}

export const limiteDoNucleo = (n: number, c: Config) => limiteEfetivo(n, c.percentualAfastamento, c.arredondamento, c.minimoAfastamento);

export const NOMES_ARREDONDAMENTO: Record<ModoArredondamento, string> = {
  proximo: 'arredondar para o inteiro mais próximo (meio para cima)',
  baixo: 'arredondar para baixo',
  cima: 'arredondar para cima',
};

/** Período com datas válidas e fim >= início. */
export const periodoBemFormado = (p: Periodo) => isoValida(p.inicio) && isoValida(p.fim) && p.fim >= p.inicio;

/** Períodos válidos recortados ao ano de trabalho, em números de dia (inclusive). Inválidos são tratados pela regra periodo-valido. */
export function intervalosNoAno(adv: Advogado, ano: number, tipos?: TipoPeriodo[]) {
  const ini = toDia(primeiroDia(ano)), fim = toDia(ultimoDia(ano));
  const out: { periodo: Periodo; inicio: number; fim: number }[] = [];
  for (const p of adv.periodos) {
    if (!periodoBemFormado(p) || (tipos && !tipos.includes(p.tipo))) continue;
    const a = Math.max(ini, toDia(p.inicio)), b = Math.min(fim, toDia(p.fim));
    if (a <= b) out.push({ periodo: p, inicio: a, fim: b });
  }
  return out;
}

/** Dias usados de um tipo no ano (dias corridos). */
export const diasUsados = (adv: Advogado, ano: number, tipo: TipoPeriodo) =>
  intervalosNoAno(adv, ano, [tipo]).reduce((s, i) => s + i.fim - i.inicio + 1, 0);

export const nomeAdv = (advs: Advogado[], id: string) => advs.find((a) => a.id === id)?.nome ?? '?';

export const listarNomes = (nomes: string[]) =>
  nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
