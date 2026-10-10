// Regras opcionais, desligadas por padrão. Ligue em Configurações para testar.
import { TIPOS, type Conflito } from '../dominio/tipos';
import { diasEntre, formatar, formatarIntervalo, somarDias } from '../dominio/datas';
import { diasMarcados, tipoDia } from '../dominio/calendario';
import type { Regra } from './tipos';
import { periodoBemFormado } from './util';

const FER_PRE = ['ferias', 'preFerias'];

export const maxPeriodosFerias: Regra = {
  id: 'max-periodos-ferias',
  nome: 'Número máximo de períodos de férias',
  descricao: 'Limita em quantos blocos as férias de cada advogado podem ser divididas.',
  ativa: false,
  parametros: { maxPeriodos: 3 },
  rotulos: { maxPeriodos: 'Máximo de períodos' },
  validar: (estado, p) =>
    estado.advogados.flatMap((adv) => {
      const fer = adv.periodos.filter((x) => x.tipo === 'ferias');
      const max = Number(p.maxPeriodos);
      if (fer.length <= max) return [];
      return [{
        regraId: 'max-periodos-ferias', gravidade: 'erro' as const, nucleoId: adv.nucleoId, advogadoIds: [adv.id], periodoIds: fer.map((x) => x.id),
        mensagem: `${adv.nome}: férias divididas em ${fer.length} períodos (máximo ${max}).`,
      }];
    }),
};

export const blocoMinimo: Regra = {
  id: 'bloco-minimo',
  nome: 'Tamanho mínimo de bloco',
  descricao: 'Cada período de férias ou pré-férias deve ter pelo menos N dias corridos.',
  ativa: false,
  parametros: { minDias: 5 },
  rotulos: { minDias: 'Mínimo de dias por período' },
  validar: (estado, p) => {
    const min = Number(p.minDias);
    const out: Conflito[] = [];
    for (const adv of estado.advogados)
      for (const x of adv.periodos) {
        if (!FER_PRE.includes(x.tipo) || !periodoBemFormado(x)) continue;
        const dias = diasEntre(x.inicio, x.fim);
        if (dias < min)
          out.push({
            regraId: 'bloco-minimo', gravidade: 'erro', nucleoId: adv.nucleoId, advogadoIds: [adv.id], periodoIds: [x.id], inicio: x.inicio, fim: x.fim,
            mensagem: `${adv.nome}: ${TIPOS[x.tipo].nome} ${formatarIntervalo(x.inicio, x.fim)} tem ${dias} dia(s) (mínimo ${min}).`,
          });
      }
    return out;
  },
};

export const inicioEmDiaUtil: Regra = {
  id: 'inicio-em-dia-util',
  nome: 'Início em dia útil',
  descricao: 'Férias e pré-férias não podem iniciar em sábado, domingo ou feriado (nacional ou de Recife).',
  ativa: false,
  parametros: {},
  validar: (estado) => {
    const m = diasMarcados(estado.calendario);
    const out: Conflito[] = [];
    for (const adv of estado.advogados)
      for (const x of adv.periodos) {
        if (!FER_PRE.includes(x.tipo) || !periodoBemFormado(x)) continue;
        const t = tipoDia(x.inicio, m);
        if (t === 'fimDeSemana' || t === 'feriadoNacional' || t === 'feriadoRecife')
          out.push({
            regraId: 'inicio-em-dia-util', gravidade: 'erro', nucleoId: adv.nucleoId, advogadoIds: [adv.id], periodoIds: [x.id], inicio: x.inicio, fim: x.inicio,
            mensagem: `${adv.nome}: ${TIPOS[x.tipo].nome} inicia em ${formatar(x.inicio)}, que é ${t === 'fimDeSemana' ? 'fim de semana' : 'feriado'}.`,
          });
      }
    return out;
  },
};

export const antecedenciaMinima: Regra = {
  id: 'antecedencia-minima',
  nome: 'Antecedência mínima',
  descricao: 'Períodos futuros devem começar pelo menos N dias depois de hoje (períodos já iniciados são ignorados).',
  ativa: false,
  parametros: { dias: 30 },
  rotulos: { dias: 'Dias de antecedência' },
  validar: (estado, p) => {
    const hoje = estado.hoje ?? new Date().toISOString().slice(0, 10);
    const limite = somarDias(hoje, Number(p.dias));
    const out: Conflito[] = [];
    for (const adv of estado.advogados)
      for (const x of adv.periodos) {
        if (!periodoBemFormado(x) || x.inicio < hoje || x.inicio >= limite) continue;
        out.push({
          regraId: 'antecedencia-minima', gravidade: 'aviso', nucleoId: adv.nucleoId, advogadoIds: [adv.id], periodoIds: [x.id], inicio: x.inicio, fim: x.fim,
          mensagem: `${adv.nome}: ${TIPOS[x.tipo].nome} em ${formatar(x.inicio)} tem menos de ${p.dias} dias de antecedência.`,
        });
      }
    return out;
  },
};
