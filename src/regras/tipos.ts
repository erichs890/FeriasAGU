import type { Advogado, Calendario, Config, Conflito, Nucleo, ValorParametro } from '../dominio/tipos';

/** Tudo que uma regra pode ler. Sem dependência de UI. */
export interface EstadoValidacao {
  config: Config;
  nucleos: Nucleo[];
  advogados: Advogado[];
  calendario: Calendario;
  /** Data de referência ("hoje") para regras de antecedência; padrão = data atual. */
  hoje?: string;
}

export interface Regra {
  id: string;
  nome: string;
  descricao: string;
  /** Estado padrão; o usuário liga/desliga em Configurações. */
  ativa: boolean;
  parametros: Record<string, ValorParametro>;
  /** Rótulo de cada parâmetro para a tela de Configurações. */
  rotulos?: Record<string, string>;
  validar(estado: EstadoValidacao, parametros: Record<string, ValorParametro>): Conflito[];
}
