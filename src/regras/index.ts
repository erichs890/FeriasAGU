// Registro de regras. Para adicionar uma regra nova: crie o arquivo (veja os existentes) e inclua-a nesta lista.
import type { Config, ConfigRegra, Conflito } from '../dominio/tipos';
import type { EstadoValidacao, Regra } from './tipos';
import { limiteNucleo, licencasContamLimite } from './limiteNucleo';
import { maxDiasFerias, maxDiasPreFerias } from './maxDias';
import { semSobreposicao } from './semSobreposicao';
import { periodoValido } from './periodoValido';
import { antecedenciaMinima, blocoMinimo, inicioEmDiaUtil, maxPeriodosFerias } from './opcionais';

export const REGRAS: Regra[] = [
  limiteNucleo,
  maxDiasFerias,
  maxDiasPreFerias,
  semSobreposicao,
  periodoValido,
  // opcionais (desligadas por padrão)
  maxPeriodosFerias,
  blocoMinimo,
  inicioEmDiaUtil,
  licencasContamLimite,
  antecedenciaMinima,
];

export const configRegrasPadrao = (): Record<string, ConfigRegra> =>
  Object.fromEntries(REGRAS.map((r) => [r.id, { ativa: r.ativa, parametros: { ...r.parametros } }]));

/** Configuração efetiva de uma regra (padrão + o que o usuário alterou). */
export const configDaRegra = (config: Config, r: Regra): ConfigRegra => {
  const c = config.regras[r.id];
  return { ativa: c?.ativa ?? r.ativa, parametros: { ...r.parametros, ...c?.parametros } };
};

/** Roda todas as regras ativas. Determinístico; recalcula tudo do zero. */
export function validar(estado: EstadoValidacao): Conflito[] {
  return REGRAS.flatMap((r) => {
    const c = configDaRegra(estado.config, r);
    return c.ativa ? r.validar(estado, c.parametros) : [];
  });
}

/** Chave estável de um conflito, para detectar conflitos novos após uma alteração. */
export const chaveConflito = (c: Conflito) => [c.regraId, c.nucleoId, c.advogadoIds.join(','), c.inicio, c.fim, c.mensagem].join('§');

export const nomeRegra = (id: string) => REGRAS.find((r) => r.id === id)?.nome ?? id;
