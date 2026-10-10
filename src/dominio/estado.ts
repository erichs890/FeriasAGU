import type { Advogado, Config, Dados, Estado, Nucleo, Periodo, TipoPeriodo } from './tipos';
import { calendarioPadrao } from './calendario';
import { novoId } from './id';
import { configRegrasPadrao } from '../regras';

export const SCHEMA_VERSION = 1;
export const ANO_PADRAO = 2027;

export const configPadrao = (ano = ANO_PADRAO): Config => ({
  ano,
  percentualAfastamento: 30,
  arredondamento: 'proximo',
  minimoAfastamento: 1,
  regras: configRegrasPadrao(),
  tema: 'sistema',
});

export const dadosVazios = (ano: number): Dados => ({ nucleos: [], advogados: [], calendario: calendarioPadrao(ano) });

export const estadoInicial = (ano = ANO_PADRAO): Estado => ({
  schemaVersion: SCHEMA_VERSION,
  config: configPadrao(ano),
  ...dadosVazios(ano),
  historico: { log: [], snapshots: [] },
});

export const extrairDados = (e: Dados): Dados => ({ nucleos: e.nucleos, advogados: e.advogados, calendario: e.calendario });

/** Migra dados salvos de versões anteriores do schema. Lança erro se não reconhecer. */
export function migrar(obj: unknown): Estado {
  const e = obj as Partial<Estado>;
  if (!e || typeof e !== 'object' || !Array.isArray(e.advogados) || !Array.isArray(e.nucleos)) throw new Error('Formato de dados não reconhecido.');
  if ((e.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error(`Dados de uma versão mais nova do app (schema ${e.schemaVersion}).`);
  // v1 é a primeira versão: apenas completa campos ausentes. Próximas migrações entram aqui, em sequência.
  const base = estadoInicial(e.config?.ano ?? ANO_PADRAO);
  return {
    ...base,
    ...e,
    schemaVersion: SCHEMA_VERSION,
    config: { ...base.config, ...e.config, regras: { ...base.config.regras, ...e.config?.regras } },
    calendario: { ...base.calendario, ...e.calendario },
    historico: { log: e.historico?.log ?? [], snapshots: e.historico?.snapshots ?? [] },
  } as Estado;
}

export const compararNomes = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

/** Normaliza nome para comparação (sem acento, caixa, espaços extras). */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Sessão fictícia pequena (sem nomes reais) para testes. */
export function dadosExemplo(ano: number): Dados {
  const nuc = (nome: string): Nucleo => ({ id: novoId(), nome });
  const coord = nuc('Coordenação'), nug = nuc('NUG/CORESE'), nuesp = nuc('NUESP/CORESE');
  const p = (tipo: TipoPeriodo, i: string, f: string): Periodo => ({ id: novoId(), tipo, inicio: `${ano}-${i}`, fim: `${ano}-${f}` });
  const adv = (nome: string, n: Nucleo, periodos: Periodo[], observacao = ''): Advogado => ({ id: novoId(), nome, nucleoId: n.id, observacao, periodos });
  return {
    nucleos: [coord, nug, nuesp],
    calendario: calendarioPadrao(ano),
    advogados: [
      adv('Ana Exemplo', coord, [p('ferias', '01-11', '01-30'), p('ferias', '07-05', '07-14'), p('preFerias', '09-01', '09-21')]),
      adv('Bruno Fictício', coord, [p('ferias', '03-01', '03-30'), p('preFerias', '10-04', '10-24')], '5 dias ano anterior'),
      adv('Carla Teste', nug, [p('ferias', '07-01', '07-30'), p('preFerias', '12-01', '12-21')]),
      adv('Daniel Modelo', nug, [p('ferias', '07-10', '07-24'), p('preFerias', '04-05', '04-25')]),
      adv('Eva Demonstração', nug, [p('ferias', '07-15', '07-29')], '10 dias p/' + (ano + 1)),
      adv('Fábio Amostra', nug, [p('ferias', '02-01', '03-02'), p('preFerias', '05-03', '05-23')]),
      adv('Gina Simulada', nug, [p('ferias', '08-02', '08-31')]),
      adv('Hugo Hipotético', nuesp, [p('ferias', '06-01', '06-30'), p('preFerias', '06-20', '07-10')]),
      adv('Íris Imaginária', nuesp, [p('ferias', '11-03', '12-02'), p('preFerias', '02-01', '02-21')]),
      adv('João Genérico', nuesp, [p('ferias', '01-04', '02-12')]),
    ],
  };
}
