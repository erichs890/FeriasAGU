import { TIPOS, type Conflito } from '../dominio/tipos';
import { formatar, isoValida, primeiroDia, ultimoDia } from '../dominio/datas';
import type { Regra } from './tipos';

/** Campos preenchidos, datas válidas, fim >= início e dentro do ano de trabalho. */
export const periodoValido: Regra = {
  id: 'periodo-valido',
  nome: 'Período válido',
  descricao: 'Início e fim preenchidos, fim não anterior ao início e datas dentro do ano de trabalho.',
  ativa: true,
  parametros: {},
  validar: (estado) => {
    const { ano } = estado.config;
    const out: Conflito[] = [];
    for (const adv of estado.advogados)
      for (const p of adv.periodos) {
        const tipo = TIPOS[p.tipo]?.nome ?? p.tipo;
        let erro = '';
        if (!p.inicio || !p.fim) erro = 'início ou fim não preenchido';
        else if (!isoValida(p.inicio) || !isoValida(p.fim)) erro = 'data inválida';
        else if (p.fim < p.inicio) erro = `fim (${formatar(p.fim)}) antes do início (${formatar(p.inicio)})`;
        else if (p.inicio < primeiroDia(ano) || p.fim > ultimoDia(ano))
          erro = `${formatar(p.inicio)} a ${formatar(p.fim)} sai do ano de trabalho ${ano} (dias fora do ano são ignorados nas demais regras)`;
        if (erro)
          out.push({
            regraId: 'periodo-valido',
            gravidade: 'erro',
            nucleoId: adv.nucleoId,
            advogadoIds: [adv.id],
            periodoIds: [p.id],
            inicio: isoValida(p.inicio) ? p.inicio : undefined,
            fim: isoValida(p.fim) ? p.fim : undefined,
            mensagem: `${adv.nome}: período de ${tipo} inválido — ${erro}.`,
          });
      }
    return out;
  },
};
