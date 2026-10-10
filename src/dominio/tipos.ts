// Tipos de domínio. Datas sempre como string ISO 'YYYY-MM-DD'.

export type TipoPeriodo = 'ferias' | 'preFerias' | 'licencaProgramada' | 'licencaNaoProgramada';

export interface Periodo {
  id: string;
  tipo: TipoPeriodo;
  inicio: string;
  fim: string;
}

export interface Advogado {
  id: string;
  nome: string;
  nucleoId: string;
  observacao: string;
  periodos: Periodo[];
}

export interface Nucleo {
  id: string;
  nome: string;
}

export interface EventoCalendario {
  id: string;
  inicio: string;
  fim: string;
  descricao: string;
  ativo: boolean;
}

export interface Calendario {
  feriadosNacionais: EventoCalendario[];
  feriadosRecife: EventoCalendario[];
  remessa: EventoCalendario[];
  recesso: EventoCalendario[];
}

export type ModoArredondamento = 'proximo' | 'baixo' | 'cima';

export type ValorParametro = number | boolean;

export interface ConfigRegra {
  ativa: boolean;
  parametros: Record<string, ValorParametro>;
}

export interface Config {
  ano: number;
  percentualAfastamento: number;
  arredondamento: ModoArredondamento;
  minimoAfastamento: number;
  regras: Record<string, ConfigRegra>;
  tema: 'sistema' | 'claro' | 'escuro';
}

/** Dados da sessão: o que é desfeito/refeito, salvo em snapshot e apagado ao limpar. */
export interface Dados {
  nucleos: Nucleo[];
  advogados: Advogado[];
  calendario: Calendario;
}

export interface EntradaLog {
  id: string;
  data: string; // ISO datetime
  descricao: string;
}

export interface Snapshot {
  id: string;
  nome: string;
  data: string;
  automatico: boolean;
  dados: Dados;
}

export interface Estado extends Dados {
  schemaVersion: number;
  config: Config;
  historico: { log: EntradaLog[]; snapshots: Snapshot[] };
}

export interface Conflito {
  regraId: string;
  gravidade: 'erro' | 'aviso';
  mensagem: string;
  nucleoId?: string;
  advogadoIds: string[];
  periodoIds?: string[];
  inicio?: string;
  fim?: string;
  detalhes?: Record<string, unknown>;
}

export const TIPOS: Record<TipoPeriodo, { nome: string; cor: string }> = {
  ferias: { nome: 'Férias', cor: 'FF0000' },
  preFerias: { nome: 'Pré-férias', cor: 'FFFF00' },
  licencaProgramada: { nome: 'Licença programada', cor: '0070C0' },
  licencaNaoProgramada: { nome: 'Licença não programada', cor: '7030A0' },
};

export const CORES = {
  remessa: '00B0F0',
  fimDeSemana: 'FFC000',
  feriadoNacional: '92D050',
  feriadoRecife: 'AEAAAA',
  recesso: 'F6C6AD',
  nucleo: '595959',
};

export const COTA = { ferias: 30, preFerias: 21 };
