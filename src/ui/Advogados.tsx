import { useState } from 'react';
import { COTA, TIPOS, type Advogado, type Dados, type Periodo } from '../dominio/tipos';
import { diasEntre, formatar } from '../dominio/datas';
import { compararNomes } from '../dominio/estado';
import { novoId } from '../dominio/id';
import { diasUsados, limiteDoNucleo, NOMES_ARREDONDAMENTO } from '../regras/util';
import { Modal } from './Modal';
import { PeriodoDialog } from './PeriodoDialog';
import { useApp } from './store';

/** "limite 2 de 5 = 40%" — sempre mostra o percentual real resultante do arredondamento. */
export function LimiteNucleo({ n }: { n: number }) {
  const { estado } = useApp();
  const l = limiteDoNucleo(n, estado.config);
  const pct = n ? Math.round((l / n) * 1000) / 10 : 0;
  const acima = pct > estado.config.percentualAfastamento;
  return (
    <span className={acima ? 'acima-pct' : ''} title={acima ? `O arredondamento faz o limite exceder ${estado.config.percentualAfastamento}% estrito` : undefined}>
      limite {l} de {n} = {pct.toLocaleString('pt-BR')}%{acima ? ' ⚠' : ''}
    </span>
  );
}

export function RegraArredondamento() {
  const { config } = useApp().estado;
  return (
    <p className="dica">
      Regra em vigor: no máximo <b>{config.percentualAfastamento}%</b> de cada núcleo afastado (férias ou pré-férias) por dia,{' '}
      <b>{NOMES_ARREDONDAMENTO[config.arredondamento]}</b>, mínimo <b>{config.minimoAfastamento}</b>. Altere em Configurações.
    </p>
  );
}

function Barra({ usado, cota, rotulo }: { usado: number; cota: number; rotulo: string }) {
  const estado = usado > cota ? 'excesso' : usado < cota ? 'pendente' : 'completo';
  const texto = usado > cota ? `${usado - cota} a mais` : usado < cota ? `faltam ${cota - usado}` : 'completo';
  return (
    <div className={`barra ${estado}`} title={`${rotulo}: ${usado}/${cota} — ${texto}`}>
      <span className="barra-rotulo">{rotulo}: {usado}/{cota} <small>({texto})</small></span>
      <span className="barra-trilho"><span style={{ width: `${Math.min(100, (usado / cota) * 100)}%` }} /></span>
    </div>
  );
}

export function Saldo({ adv }: { adv: Advogado }) {
  const { ano } = useApp().estado.config;
  return (
    <div className="saldo">
      <Barra usado={diasUsados(adv, ano, 'ferias')} cota={COTA.ferias} rotulo="Férias" />
      <Barra usado={diasUsados(adv, ano, 'preFerias')} cota={COTA.preFerias} rotulo="Pré-férias" />
    </div>
  );
}

/** Insere mantendo ordem alfabética dentro do núcleo. */
function inserirOrdenado(d: Dados, adv: Advogado) {
  const i = d.advogados.findIndex((a) => a.nucleoId === adv.nucleoId && compararNomes(a.nome, adv.nome) > 0);
  if (i >= 0) return d.advogados.splice(i, 0, adv);
  let ult = -1;
  d.advogados.forEach((a, j) => a.nucleoId === adv.nucleoId && (ult = j));
  d.advogados.splice(ult >= 0 ? ult + 1 : d.advogados.length, 0, adv);
}

function AdvogadoDialog({ adv, aoFechar }: { adv?: Advogado; aoFechar: () => void }) {
  const { estado, alterar } = useApp();
  const [nome, setNome] = useState(adv?.nome ?? '');
  const [nucleoId, setNucleoId] = useState(adv?.nucleoId ?? estado.nucleos[0]?.id ?? '');
  const [obs, setObs] = useState(adv?.observacao ?? '');
  const ok = nome.trim() && nucleoId;
  const salvar = async () => {
    const n = nome.trim();
    const nomeNuc = estado.nucleos.find((x) => x.id === nucleoId)?.nome;
    const desc = !adv ? `Adicionou advogado ${n} (${nomeNuc})`
      : adv.nucleoId !== nucleoId ? `Moveu ${n} para ${nomeNuc}` : `Editou advogado ${n}`;
    if (await alterar(desc, (d) => {
      if (!adv) return void inserirOrdenado(d, { id: novoId(), nome: n, nucleoId, observacao: obs, periodos: [] });
      const a = d.advogados.find((x) => x.id === adv.id)!;
      Object.assign(a, { nome: n, nucleoId, observacao: obs });
    })) aoFechar();
  };
  return (
    <Modal titulo={adv ? 'Editar advogado' : 'Novo advogado'} aoFechar={aoFechar}
      rodape={<><button onClick={aoFechar}>Cancelar</button><button className="primario" disabled={!ok} onClick={salvar}>Salvar</button></>}>
      <form className="grade-form" onSubmit={(e) => { e.preventDefault(); if (ok) salvar(); }}>
        <label className="campo">Nome <input value={nome} onChange={(e) => setNome(e.target.value)} required /></label>
        <label className="campo">Núcleo
          <select value={nucleoId} onChange={(e) => setNucleoId(e.target.value)}>
            {estado.nucleos.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </select>
        </label>
        <label className="campo">Observação (texto livre; vai para a coluna após dezembro)
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder='ex.: "5 dias ano anterior"' />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function PeriodosDialog({ advId, aoFechar }: { advId: string; aoFechar: () => void }) {
  const { estado } = useApp();
  const adv = estado.advogados.find((a) => a.id === advId);
  const [editando, setEditando] = useState<Periodo | 'novo' | null>(null);
  if (!adv) return null;
  return (
    <Modal titulo={`Períodos — ${adv.nome}`} aoFechar={aoFechar} largo rodape={<button onClick={aoFechar}>Fechar</button>}>
      <Saldo adv={adv} />
      <table className="tabela">
        <thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th /></tr></thead>
        <tbody>
          {adv.periodos.map((p) => (
            <tr key={p.id}>
              <td><span className={`amostra t-${p.tipo}`} /> {TIPOS[p.tipo].nome}</td>
              <td>{formatar(p.inicio)}</td><td>{formatar(p.fim)}</td>
              <td>{p.inicio && p.fim && p.fim >= p.inicio ? diasEntre(p.inicio, p.fim) : '—'}</td>
              <td><button onClick={() => setEditando(p)}>Editar / excluir</button></td>
            </tr>
          ))}
          {!adv.periodos.length && <tr><td colSpan={5} className="dica">Nenhum período. Clique em “Novo período”.</td></tr>}
        </tbody>
      </table>
      <button className="primario" onClick={() => setEditando('novo')}>+ Novo período</button>
      {editando && (
        <PeriodoDialog advogadoId={adv.id} periodo={editando === 'novo' ? undefined : editando} aoFechar={() => setEditando(null)} />
      )}
    </Modal>
  );
}

function Nucleos() {
  const { estado, alterar, confirmar } = useApp();
  const [novo, setNovo] = useState('');
  const qtd = (id: string) => estado.advogados.filter((a) => a.nucleoId === id).length;
  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= estado.nucleos.length) return;
    alterar(`Reordenou núcleo ${estado.nucleos[i].nome}`, (d) => {
      [d.nucleos[i], d.nucleos[j]] = [d.nucleos[j], d.nucleos[i]];
    });
  };
  return (
    <section className="cartao">
      <h2>Núcleos</h2>
      <RegraArredondamento />
      <ul className="lista-nucleos">
        {estado.nucleos.map((n, i) => (
          <li key={n.id}>
            <input key={n.nome}
              aria-label="Nome do núcleo"
              defaultValue={n.nome}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== n.nome) alterar(`Renomeou núcleo ${n.nome} → ${v}`, (d) => { d.nucleos[i].nome = v; });
              }}
            />
            <span className="dica">{qtd(n.id)} advogado(s) · <LimiteNucleo n={qtd(n.id)} /></span>
            <button title="Subir" aria-label="Subir" onClick={() => mover(i, -1)}>↑</button>
            <button title="Descer" aria-label="Descer" onClick={() => mover(i, 1)}>↓</button>
            <button
              title="Ordenar advogados A–Z"
              onClick={() => alterar(`Ordenou advogados de ${n.nome} (A–Z)`, (d) => {
                const doNuc = d.advogados.filter((a) => a.nucleoId === n.id).sort((a, b) => compararNomes(a.nome, b.nome));
                let k = 0;
                d.advogados = d.advogados.map((a) => (a.nucleoId === n.id ? doNuc[k++] : a));
              })}
            >A–Z</button>
            <button
              className="perigo"
              onClick={async () => {
                if (qtd(n.id)) {
                  await confirmar({ titulo: 'Não é possível excluir', corpo: <p>{n.nome} tem {qtd(n.id)} advogado(s). Mova-os ou exclua-os antes.</p>, textoConfirmar: 'Entendi' });
                  return;
                }
                if (await confirmar({ titulo: 'Excluir núcleo?', corpo: <p>Excluir o núcleo {n.nome}?</p>, textoConfirmar: 'Excluir', perigo: true }))
                  alterar(`Excluiu núcleo ${n.nome}`, (d) => { d.nucleos = d.nucleos.filter((x) => x.id !== n.id); });
              }}
            >Excluir</button>
          </li>
        ))}
      </ul>
      <form className="linha-form" onSubmit={(e) => {
        e.preventDefault();
        const v = novo.trim();
        if (!v) return;
        alterar(`Criou núcleo ${v}`, (d) => { d.nucleos.push({ id: novoId(), nome: v }); });
        setNovo('');
      }}>
        <input placeholder="Nome do novo núcleo" value={novo} onChange={(e) => setNovo(e.target.value)} />
        <button className="primario" disabled={!novo.trim()}>+ Núcleo</button>
      </form>
    </section>
  );
}

export function Advogados() {
  const { estado, conflitos, alterar, confirmar, irPara } = useApp();
  const [editar, setEditar] = useState<Advogado | 'novo' | null>(null);
  const [periodosDe, setPeriodosDe] = useState<string | null>(null);
  const nConf = (id: string) => conflitos.filter((c) => c.advogadoIds.includes(id)).length;

  const mover = (adv: Advogado, delta: number) => {
    const doNuc = estado.advogados.filter((a) => a.nucleoId === adv.nucleoId);
    const vizinho = doNuc[doNuc.indexOf(adv) + delta];
    if (!vizinho) return;
    alterar(`Reordenou ${adv.nome}`, (d) => {
      const i = d.advogados.findIndex((a) => a.id === adv.id), j = d.advogados.findIndex((a) => a.id === vizinho.id);
      [d.advogados[i], d.advogados[j]] = [d.advogados[j], d.advogados[i]];
    });
  };

  return (
    <div className="pagina">
      <Nucleos />
      <section className="cartao">
        <div className="cabecalho-secao">
          <h2>Advogados ({estado.advogados.length})</h2>
          <button className="primario" disabled={!estado.nucleos.length} onClick={() => setEditar('novo')}>+ Advogado</button>
        </div>
        {!estado.nucleos.length && <p className="dica">Crie um núcleo primeiro.</p>}
        <table className="tabela">
          <thead><tr><th>Ordem</th><th>Nome</th><th>Núcleo</th><th>Saldo</th><th>Conflitos</th><th>Observação</th><th>Ações</th></tr></thead>
          {estado.nucleos.map((n) => (
            <tbody key={n.id}>
              <tr className="grupo"><th colSpan={7}>{n.nome}</th></tr>
              {estado.advogados.filter((a) => a.nucleoId === n.id).map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">
                    <button aria-label="Subir" onClick={() => mover(a, -1)}>↑</button>
                    <button aria-label="Descer" onClick={() => mover(a, 1)}>↓</button>
                  </td>
                  <td><b>{a.nome}</b></td>
                  <td>
                    <select value={a.nucleoId} aria-label="Núcleo" onChange={(e) => {
                      const destino = estado.nucleos.find((x) => x.id === e.target.value)!;
                      alterar(`Moveu ${a.nome} para ${destino.nome}`, (d) => { d.advogados.find((x) => x.id === a.id)!.nucleoId = destino.id; });
                    }}>
                      {estado.nucleos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </td>
                  <td><Saldo adv={a} /></td>
                  <td>{nConf(a.id) ? <button className="link erro-texto" onClick={() => irPara({ advogadoId: a.id })}>⚠ {nConf(a.id)}</button> : '—'}</td>
                  <td>{a.observacao}</td>
                  <td className="nowrap">
                    <button onClick={() => setPeriodosDe(a.id)}>Períodos ({a.periodos.length})</button>
                    <button onClick={() => setEditar(a)}>Editar</button>
                    <button className="perigo" onClick={async () => {
                      if (await confirmar({ titulo: 'Excluir advogado?', corpo: <p>Excluir {a.nome} e seus {a.periodos.length} período(s)? (Dá para desfazer com Ctrl+Z.)</p>, textoConfirmar: 'Excluir', perigo: true }))
                        alterar(`Excluiu advogado ${a.nome}`, (d) => { d.advogados = d.advogados.filter((x) => x.id !== a.id); });
                    }}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </section>
      {editar && <AdvogadoDialog adv={editar === 'novo' ? undefined : editar} aoFechar={() => setEditar(null)} />}
      {periodosDe && <PeriodosDialog advId={periodosDe} aoFechar={() => setPeriodosDe(null)} />}
    </div>
  );
}

