import { TIPOS, type TipoPeriodo } from '../dominio/tipos';
import type { Regra } from './tipos';
import { diasUsados } from './util';

/** Fábrica: advogado não pode ter mais de `maxDias` dias corridos do tipo no ano. */
function regraMaxDias(id: string, tipo: TipoPeriodo, max: number): Regra {
  const nome = TIPOS[tipo].nome.toLowerCase();
  return {
    id,
    nome: `Máximo de ${max} dias de ${nome}`,
    descricao: `Cada advogado tem no máximo ${max} dias corridos de ${nome} no ano.`,
    ativa: true,
    parametros: { maxDias: max },
    rotulos: { maxDias: 'Máximo de dias' },
    validar: (estado, p) => {
      const limite = Number(p.maxDias);
      return estado.advogados.flatMap((adv) => {
        const usados = diasUsados(adv, estado.config.ano, tipo);
        if (usados <= limite) return [];
        return [{
          regraId: id,
          gravidade: 'erro' as const,
          nucleoId: adv.nucleoId,
          advogadoIds: [adv.id],
          periodoIds: adv.periodos.filter((x) => x.tipo === tipo).map((x) => x.id),
          mensagem: `${adv.nome}: ${usados} dias de ${nome} (máximo ${limite}) — ${usados - limite} a mais.`,
          detalhes: { usados, limite, excesso: usados - limite },
        }];
      });
    },
  };
}

export const maxDiasFerias = regraMaxDias('max-dias-ferias-30', 'ferias', 30);
export const maxDiasPreFerias = regraMaxDias('max-dias-pre-ferias-21', 'preFerias', 21);
