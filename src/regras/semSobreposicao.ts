import { TIPOS, type Conflito } from '../dominio/tipos';
import { formatarIntervalo, fromDia } from '../dominio/datas';
import type { Regra } from './tipos';
import { intervalosNoAno } from './util';

/** Um dia só pode ter um tipo de afastamento para a mesma pessoa. */
export const semSobreposicao: Regra = {
  id: 'sem-sobreposicao-mesmo-advogado',
  nome: 'Sem sobreposição de períodos do mesmo advogado',
  descricao: 'Dois períodos do mesmo advogado (ex.: férias e pré-férias) não podem cobrir o mesmo dia.',
  ativa: true,
  parametros: {},
  validar: (estado) => {
    const out: Conflito[] = [];
    for (const adv of estado.advogados) {
      const iv = intervalosNoAno(adv, estado.config.ano);
      for (let i = 0; i < iv.length; i++)
        for (let j = i + 1; j < iv.length; j++) {
          const a = iv[i], b = iv[j];
          const ini = Math.max(a.inicio, b.inicio), fim = Math.min(a.fim, b.fim);
          if (ini > fim) continue;
          const desc = (x: typeof a) => `${TIPOS[x.periodo.tipo].nome} ${formatarIntervalo(x.periodo.inicio, x.periodo.fim)}`;
          out.push({
            regraId: 'sem-sobreposicao-mesmo-advogado',
            gravidade: 'erro',
            nucleoId: adv.nucleoId,
            advogadoIds: [adv.id],
            periodoIds: [a.periodo.id, b.periodo.id],
            inicio: fromDia(ini),
            fim: fromDia(fim),
            mensagem: `${adv.nome}: ${desc(a)} e ${desc(b)} se sobrepõem em ${formatarIntervalo(fromDia(ini), fromDia(fim))} (${fim - ini + 1} dia(s)).`,
          });
        }
    }
    return out;
  },
};
