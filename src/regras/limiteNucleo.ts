import type { Conflito, TipoPeriodo } from '../dominio/tipos';
import { formatarIntervalo, fromDia, primeiroDia, toDia, diasNoAno } from '../dominio/datas';
import type { EstadoValidacao, Regra } from './tipos';
import { intervalosNoAno, limiteDoNucleo, listarNomes } from './util';

const AFASTAMENTO: TipoPeriodo[] = ['ferias', 'preFerias'];
const LICENCAS: TipoPeriodo[] = ['licencaProgramada', 'licencaNaoProgramada'];

/** Para cada núcleo e dia do ano, ids dos advogados afastados (cada pessoa conta uma vez por dia). */
export function afastadosPorDia(estado: EstadoValidacao, nucleoId: string, tipos: TipoPeriodo[] = AFASTAMENTO): string[][] {
  const { ano } = estado.config;
  const base = toDia(primeiroDia(ano));
  const dias: Set<string>[] = Array.from({ length: diasNoAno(ano) }, () => new Set());
  for (const adv of estado.advogados) {
    if (adv.nucleoId !== nucleoId) continue;
    for (const i of intervalosNoAno(adv, ano, tipos)) for (let d = i.inicio; d <= i.fim; d++) dias[d - base].add(adv.id);
  }
  return dias.map((s) => [...s].sort());
}

/**
 * Verifica o limite por núcleo. Agrupa dias consecutivos com o mesmo conjunto de afastados num único conflito.
 * Com `soLicencas`, reporta só os dias em que o excesso decorre de somar as licenças (regra opcional).
 */
function verificar(estado: EstadoValidacao, regraId: string, soLicencas: boolean): Conflito[] {
  const out: Conflito[] = [];
  const base = toDia(primeiroDia(estado.config.ano));
  const nome = new Map(estado.advogados.map((a) => [a.id, a.nome]));
  for (const nuc of estado.nucleos) {
    const n = estado.advogados.filter((a) => a.nucleoId === nuc.id).length;
    const limite = limiteDoNucleo(n, estado.config);
    const semLic = afastadosPorDia(estado, nuc.id);
    const dias = soLicencas ? afastadosPorDia(estado, nuc.id, [...AFASTAMENTO, ...LICENCAS]) : semLic;
    let atual: { ini: number; fim: number; ids: string[] } | null = null;
    const fechar = () => {
      if (!atual) return;
      const inicio = fromDia(base + atual.ini), fim = fromDia(base + atual.fim);
      const qtd = atual.ids.length;
      out.push({
        regraId,
        gravidade: 'erro',
        nucleoId: nuc.id,
        advogadoIds: atual.ids,
        inicio,
        fim,
        mensagem:
          `${nuc.nome}: ${qtd} afastados em ${formatarIntervalo(inicio, fim)} (limite ${limite} de ${n}` +
          `${soLicencas ? ', contando licenças' : ''}) — ${listarNomes(atual.ids.map((id) => nome.get(id) ?? '?'))}.`,
        detalhes: { afastados: qtd, limite, efetivo: n },
      });
      atual = null;
    };
    dias.forEach((ids, i) => {
      const excede = ids.length > limite && (!soLicencas || semLic[i].length <= limite);
      if (!excede) return fechar();
      const chave = ids.join('|');
      if (atual && atual.fim === i - 1 && atual.ids.join('|') === chave) atual.fim = i;
      else {
        fechar();
        atual = { ini: i, fim: i, ids };
      }
    });
    fechar();
  }
  return out;
}

export const limiteNucleo: Regra = {
  id: 'limite-nucleo-30pct',
  nome: 'Limite de afastamento simultâneo por núcleo',
  descricao: 'Em qualquer dia, no máximo X% dos advogados de cada núcleo podem estar em férias ou pré-férias (percentual e arredondamento em Configurações).',
  ativa: true,
  parametros: {},
  validar: (e) => verificar(e, 'limite-nucleo-30pct', false),
};

export const licencasContamLimite: Regra = {
  id: 'licencas-contam-limite',
  nome: 'Licenças contam para o limite do núcleo',
  descricao: 'Inclui licenças programadas e não programadas na contagem do limite; alerta dias que só excedem por causa delas.',
  ativa: false,
  parametros: {},
  validar: (e) => verificar(e, 'licencas-contam-limite', true),
};
