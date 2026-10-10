import { useState } from 'react';
import { COTA, TIPOS, type Periodo, type TipoPeriodo } from '../dominio/tipos';
import { diasEntre, formatarIntervalo, isoValida, somarDias } from '../dominio/datas';
import { novoId } from '../dominio/id';
import { diasUsados } from '../regras/util';
import { Modal } from './Modal';
import { useApp } from './store';

export const descPeriodo = (p: Pick<Periodo, 'tipo' | 'inicio' | 'fim'>) =>
  `${TIPOS[p.tipo].nome.toLowerCase()} ${formatarIntervalo(p.inicio, p.fim)}`;

/** Cria (sem `periodo`) ou edita um período de um advogado. */
export function PeriodoDialog({ advogadoId, periodo, inicial, aoFechar }: {
  advogadoId: string;
  periodo?: Periodo;
  inicial?: Partial<Periodo>;
  aoFechar: () => void;
}) {
  const { estado, alterar, confirmar } = useApp();
  const { ano } = estado.config;
  const adv = estado.advogados.find((a) => a.id === advogadoId)!;
  const [tipo, setTipo] = useState<TipoPeriodo>(periodo?.tipo ?? inicial?.tipo ?? 'ferias');
  const [inicio, setInicio] = useState(periodo?.inicio ?? inicial?.inicio ?? '');
  const [fim, setFim] = useState(periodo?.fim ?? inicial?.fim ?? '');
  const valido = isoValida(inicio) && isoValida(fim) && fim >= inicio;
  const qtd = valido ? diasEntre(inicio, fim) : '';

  // Saldo sem contar o próprio período em edição.
  const outros = { ...adv, periodos: adv.periodos.filter((p) => p.id !== periodo?.id) };
  const cota = tipo === 'ferias' ? COTA.ferias : tipo === 'preFerias' ? COTA.preFerias : null;
  const restante = cota !== null ? cota - diasUsados(outros, ano, tipo) : null;

  const setQtd = (n: number) => {
    if (isoValida(inicio) && n > 0) setFim(somarDias(inicio, n - 1));
  };

  const salvar = async () => {
    const novo: Periodo = { id: periodo?.id ?? novoId(), tipo, inicio, fim };
    const desc = periodo ? `Editou ${descPeriodo(periodo)} → ${descPeriodo(novo)} de ${adv.nome}` : `Adicionou ${descPeriodo(novo)} a ${adv.nome}`;
    const ok = await alterar(desc, (d) => {
      const a = d.advogados.find((x) => x.id === advogadoId)!;
      a.periodos = periodo ? a.periodos.map((p) => (p.id === periodo.id ? novo : p)) : [...a.periodos, novo];
      a.periodos.sort((x, y) => x.inicio.localeCompare(y.inicio));
    });
    if (ok) aoFechar();
  };

  const excluir = async () => {
    if (!periodo) return;
    if (!(await confirmar({ titulo: 'Excluir período?', corpo: <p>Excluir {descPeriodo(periodo)} de {adv.nome}?</p>, textoConfirmar: 'Excluir', perigo: true }))) return;
    if (await alterar(`Excluiu ${descPeriodo(periodo)} de ${adv.nome}`, (d) => {
      const a = d.advogados.find((x) => x.id === advogadoId)!;
      a.periodos = a.periodos.filter((p) => p.id !== periodo.id);
    })) aoFechar();
  };

  return (
    <Modal
      titulo={`${periodo ? 'Editar' : 'Novo'} período — ${adv.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          {periodo && <button className="perigo esquerda" onClick={excluir}>Excluir</button>}
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" disabled={!valido} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <form className="grade-form" onSubmit={(e) => { e.preventDefault(); if (valido) salvar(); }}>
        <label className="campo">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPeriodo)} data-autofocus>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
          </select>
        </label>
        <label className="campo">Início
          <input type="date" value={inicio} min={`${ano}-01-01`} max={`${ano}-12-31`} onChange={(e) => setInicio(e.target.value)} required />
        </label>
        <label className="campo">Fim
          <input type="date" value={fim} min={inicio || `${ano}-01-01`} max={`${ano}-12-31`} onChange={(e) => setFim(e.target.value)} required />
        </label>
        <label className="campo">Quantidade de dias (corridos)
          <input type="number" min={1} max={366} value={qtd} onChange={(e) => setQtd(Number(e.target.value))} disabled={!isoValida(inicio)} />
        </label>
        {restante !== null && (
          <p className="dica">
            Saldo de {TIPOS[tipo].nome.toLowerCase()} sem este período: <b>{restante}</b> de {cota} dia(s).{' '}
            <button type="button" className="link" disabled={!isoValida(inicio) || restante <= 0} onClick={() => setQtd(restante)}>
              Usar saldo restante
            </button>
          </p>
        )}
        {inicio && fim && !valido && <p className="erro-texto">O fim deve ser igual ou posterior ao início.</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
