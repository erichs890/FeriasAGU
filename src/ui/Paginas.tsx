import { useState } from 'react';
import type { Calendario, Conflito, Dados, EventoCalendario } from '../dominio/tipos';
import { formatar, formatarDataHora, isoValida } from '../dominio/datas';
import { calendarioPadrao } from '../dominio/calendario';
import { dadosExemplo, migrar, normalizar } from '../dominio/estado';
import { novoId } from '../dominio/id';
import { REGRAS, configDaRegra, validar } from '../regras';
import { NOMES_ARREDONDAMENTO } from '../regras/util';
import { exportarXlsx, nomeArquivoExport } from '../xlsx/exportar';
import { ErroImportacao, importarXlsx, type ResultadoImportacao } from '../xlsx/importar';
import { ListaConflitos } from './ListaConflitos';
import { Modal } from './Modal';
import { RegraArredondamento } from './Advogados';
import { useApp } from './store';

export function baixar(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Conflitos ---------- */

export function Conflitos() {
  const { conflitos, irPara } = useApp();
  const ir = (c: Conflito) => irPara({ advogadoId: c.advogadoIds[0], nucleoId: c.nucleoId, dia: c.inicio });
  return (
    <div className="pagina cartao">
      <h2>Conflitos ({conflitos.length})</h2>
      <RegraArredondamento />
      <p className="dica">Clique num conflito para vê-lo na grade. Saldo incompleto (menos de 30/21 dias) não é conflito: aparece em laranja nas barras de saldo.</p>
      <ListaConflitos conflitos={conflitos} aoClicar={ir} agrupar />
    </div>
  );
}

/* ---------- Calendário ---------- */

const SECOES: [keyof Calendario, string, string][] = [
  ['feriadosNacionais', 'Feriados nacionais', 'd-feriadoNacional'],
  ['feriadosRecife', 'Feriados em Recife', 'd-feriadoRecife'],
  ['remessa', 'Dias de remessa', 'd-remessa'],
  ['recesso', 'Recesso', 'd-recesso'],
];

export function CalendarioPagina() {
  const { estado, alterar, confirmar } = useApp();
  const { ano } = estado.config;
  const editar = (secao: keyof Calendario, id: string, campo: keyof EventoCalendario, valor: string | boolean, desc: string) =>
    alterar(desc, (d) => {
      const e = d.calendario[secao].find((x) => x.id === id)!;
      (e as unknown as Record<string, unknown>)[campo] = valor;
      if (campo === 'inicio' && (!e.fim || e.fim < e.inicio)) e.fim = e.inicio;
    });
  return (
    <div className="pagina">
      <div className="cartao">
        <div className="cabecalho-secao">
          <h2>Calendário {ano}</h2>
          <button onClick={async () => {
            if (await confirmar({ titulo: `Restaurar calendário padrão de ${ano}?`, corpo: <p>Feriados nacionais e de Recife voltam ao padrão calculado para {ano} (remessa e recesso são mantidos).</p>, textoConfirmar: 'Restaurar' }))
              alterar(`Restaurou feriados padrão de ${ano}`, (d) => {
                const p = calendarioPadrao(ano);
                d.calendario.feriadosNacionais = p.feriadosNacionais;
                d.calendario.feriadosRecife = p.feriadosRecife;
              });
          }}>Restaurar feriados padrão de {ano}</button>
        </div>
        <p className="dica">Feriados, fins de semana e recesso não alteram a contagem de dias (dias corridos) nem a regra de afastamento; servem de referência visual e na exportação. Itens desmarcados não aparecem.</p>
      </div>
      {SECOES.map(([secao, titulo, cls]) => (
        <section className="cartao" key={secao}>
          <h3><span className={`amostra ${cls}`} /> {titulo}</h3>
          <table className="tabela">
            <thead><tr><th>Ativo</th><th>Início</th><th>Fim</th><th>Descrição</th><th /></tr></thead>
            <tbody>
              {estado.calendario[secao].map((e) => (
                <tr key={e.id} className={e.ativo ? '' : 'inativo'}>
                  <td><input type="checkbox" checked={e.ativo} aria-label="Ativo"
                    onChange={(x) => editar(secao, e.id, 'ativo', x.target.checked, `${x.target.checked ? 'Ativou' : 'Desativou'} ${titulo.toLowerCase()} ${formatar(e.inicio)}`)} /></td>
                  <td><input type="date" value={e.inicio} onChange={(x) => isoValida(x.target.value) && editar(secao, e.id, 'inicio', x.target.value, `Alterou data em ${titulo.toLowerCase()}: ${e.descricao}`)} /></td>
                  <td><input type="date" value={e.fim} min={e.inicio} onChange={(x) => isoValida(x.target.value) && editar(secao, e.id, 'fim', x.target.value, `Alterou fim em ${titulo.toLowerCase()}: ${e.descricao}`)} /></td>
                  <td><input key={e.descricao} defaultValue={e.descricao} aria-label="Descrição"
                    onBlur={(x) => x.target.value !== e.descricao && editar(secao, e.id, 'descricao', x.target.value, `Renomeou ${titulo.toLowerCase()} ${formatar(e.inicio)}`)} /></td>
                  <td><button className="perigo" onClick={() => alterar(`Removeu ${titulo.toLowerCase()} ${formatar(e.inicio)} (${e.descricao})`, (d) => {
                    d.calendario[secao] = d.calendario[secao].filter((x) => x.id !== e.id);
                  })}>Remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => alterar(`Adicionou item em ${titulo.toLowerCase()}`, (d) => {
            d.calendario[secao].push({ id: novoId(), inicio: `${ano}-01-01`, fim: `${ano}-01-01`, descricao: 'Novo', ativo: true });
          })}>+ Adicionar</button>
        </section>
      ))}
    </div>
  );
}

/* ---------- Importar / Exportar ---------- */

/** Mescla: núcleos e advogados casados por nome normalizado; períodos idênticos não se repetem. */
function mesclar(atual: Dados, novo: Dados): Dados {
  const d = structuredClone(atual);
  const mapaNuc = new Map<string, string>();
  for (const n of novo.nucleos) {
    const existente = d.nucleos.find((x) => normalizar(x.nome) === normalizar(n.nome));
    if (existente) mapaNuc.set(n.id, existente.id);
    else {
      d.nucleos.push(n);
      mapaNuc.set(n.id, n.id);
    }
  }
  for (const a of novo.advogados) {
    const existente = d.advogados.find((x) => normalizar(x.nome) === normalizar(a.nome));
    if (!existente) {
      d.advogados.push({ ...a, nucleoId: mapaNuc.get(a.nucleoId)! });
      continue;
    }
    for (const p of a.periodos)
      if (!existente.periodos.some((q) => q.tipo === p.tipo && q.inicio === p.inicio && q.fim === p.fim)) existente.periodos.push(p);
    existente.periodos.sort((x, y) => x.inicio.localeCompare(y.inicio));
    if (!existente.observacao) existente.observacao = a.observacao;
  }
  for (const k of ['remessa', 'recesso'] as const)
    for (const e of novo.calendario[k]) if (!d.calendario[k].some((x) => x.inicio === e.inicio && x.fim === e.fim)) d.calendario[k].push(e);
  return d;
}

export function ImportarExportar() {
  const { estado, substituirDados, substituirEstado, confirmar, avisoPersistencia } = useApp();
  const { config } = estado;
  const [anoImport, setAnoImport] = useState(config.ano);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<(ResultadoImportacao & { nome: string }) | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const duplaConfirmacao = async (titulo: string, oQue: string) =>
    (await confirmar({
      titulo,
      corpo: <p>Isto substitui a sessão atual ({estado.advogados.length} advogados, {estado.advogados.reduce((s, a) => s + a.periodos.length, 0)} períodos) por {oQue}. Um snapshot automático será criado antes.</p>,
      textoConfirmar: 'Continuar', perigo: true,
    })) &&
    (await confirmar({ titulo: 'Confirmação final', corpo: <p>Tem certeza? A sessão atual será substituída.</p>, textoConfirmar: 'Sim, substituir', perigo: true, exigirTexto: 'LIMPAR', esperaSegundos: 3 }));

  const ler = async () => {
    if (!arquivo) return;
    setErro('');
    setOcupado(true);
    try {
      const r = await importarXlsx(await arquivo.arrayBuffer(), anoImport);
      setPrevia({ ...r, nome: arquivo.name });
    } catch (e) {
      setErro(e instanceof ErroImportacao ? e.message : `Falha ao ler o arquivo: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  };

  const exportar = async () => {
    setOcupado(true);
    try {
      baixar(await exportarXlsx(estado, config), nomeArquivoExport(config.ano), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } finally {
      setOcupado(false);
    }
  };

  const conflitosPrevia = previa ? validar({ config: { ...config, ano: anoImport }, ...previa.dados }) : [];

  return (
    <div className="pagina">
      {avisoPersistencia && (
        <div className="aviso-banner">
          {avisoPersistencia}{' '}
          <button onClick={() => {
            const brutos = Object.keys(localStorage).filter((k) => k.startsWith('feriasAGU:')).map((k) => [k, localStorage.getItem(k)]);
            baixar(JSON.stringify(Object.fromEntries(brutos)), 'ferias-dados-brutos.json', 'application/json');
          }}>Baixar dados brutos</button>
        </div>
      )}
      <section className="cartao">
        <h2>Exportar planilha (.xlsx)</h2>
        <p className="dica">Gera a planilha no mesmo layout do rascunho, com feriados/fins de semana de {config.ano}, painéis congelados em B3 e legenda. Arquivo: <code>{nomeArquivoExport(config.ano)}</code></p>
        <button className="primario" disabled={ocupado} onClick={exportar}>⬇ Exportar {config.ano}</button>
      </section>

      <section className="cartao">
        <h2>Importar planilha (.xlsx)</h2>
        <div className="linha-form">
          <input type="file" accept=".xlsx" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setPrevia(null); setErro(''); }} />
          <label>Ano dos dados <input type="number" value={anoImport} min={2000} max={2100} onChange={(e) => setAnoImport(Number(e.target.value))} /></label>
          <button className="primario" disabled={!arquivo || ocupado} onClick={ler}>Ler arquivo</button>
        </div>
        <p className="dica">O ano informado é usado para mapear cada coluna a uma data (o rascunho 2026 pode ser lido como {config.ano}: os mesmos dia/mês). Feriados são recalculados para o ano; não são lidos da planilha.</p>
        {erro && <p className="erro-texto" role="alert">⛔ {erro}</p>}
      </section>

      <section className="cartao">
        <h2>Backup completo (JSON)</h2>
        <p className="dica">Inclui configurações, histórico e snapshots. Proteção extra além do .xlsx.</p>
        <div className="linha-form">
          <button onClick={() => baixar(JSON.stringify(estado, null, 1), `ferias-backup-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`, 'application/json')}>⬇ Baixar backup JSON</button>
          <label className="botao">⬆ Restaurar backup JSON
            <input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const novo = migrar(JSON.parse(await f.text()));
                if (await duplaConfirmacao('Restaurar backup JSON?', `o backup "${f.name}" (inclusive histórico e configurações)`)) substituirEstado(novo, `Restaurou backup ${f.name}`);
              } catch (err) {
                setErro(`Backup inválido: ${(err as Error).message}`);
              }
            }} />
          </label>
        </div>
      </section>

      <section className="cartao">
        <h2>Dados de exemplo</h2>
        <p className="dica">Sessão fictícia pequena (nomes inventados), com alguns conflitos de propósito.</p>
        <button onClick={async () => {
          if (await duplaConfirmacao('Carregar exemplo?', 'dados fictícios de exemplo')) substituirDados(dadosExemplo(config.ano), 'Carregou dados de exemplo');
        }}>Carregar exemplo</button>
      </section>

      {previa && (
        <Modal titulo={`Pré-visualização: ${previa.nome}`} largo aoFechar={() => setPrevia(null)} rodape={
          <>
            <button onClick={() => setPrevia(null)}>Cancelar</button>
            <button onClick={() => { substituirDados(mesclar(estado, previa.dados), `Importou planilha ${previa.nome} (mesclou)`); setPrevia(null); }}>Mesclar com a sessão atual</button>
            <button className="perigo" onClick={async () => {
              if (await duplaConfirmacao('Substituir sessão atual?', `o conteúdo de "${previa.nome}"`)) {
                substituirDados(previa.dados, `Importou planilha ${previa.nome} (substituiu)`);
                setPrevia(null);
              }
            }}>Substituir sessão atual</button>
          </>
        }>
          <ul className="resumo">
            <li><b>{previa.dados.nucleos.length}</b> núcleos: {previa.dados.nucleos.map((n) => n.nome).join(', ')}</li>
            <li><b>{previa.dados.advogados.length}</b> advogados</li>
            <li><b>{previa.dados.advogados.reduce((s, a) => s + a.periodos.length, 0)}</b> períodos</li>
            <li><b>{conflitosPrevia.length}</b> conflitos detectados (a importação não é bloqueada)</li>
            {anoImport !== config.ano && <li className="erro-texto">Atenção: ano de trabalho atual é {config.ano}; os dados são de {anoImport}. Ajuste em Configurações.</li>}
          </ul>
          {previa.avisos.length > 0 && <><h3>Avisos</h3><ul>{previa.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          <h3>Conflitos</h3>
          <ListaConflitos conflitos={conflitosPrevia} agrupar />
        </Modal>
      )}
    </div>
  );
}

/* ---------- Histórico ---------- */

function diferenca(a: Dados, b: Dados): string[] {
  const nomes = (d: Dados) => new Map(d.advogados.map((x) => [x.id, x]));
  const ma = nomes(a), mb = nomes(b);
  const out: string[] = [];
  for (const [id, x] of ma) if (!mb.has(id)) out.push(`− advogado ${x.nome}`);
  for (const [id, x] of mb) if (!ma.has(id)) out.push(`+ advogado ${x.nome}`);
  for (const [id, x] of ma) {
    const y = mb.get(id);
    if (!y) continue;
    const chave = (p: { tipo: string; inicio: string; fim: string }) => `${p.tipo}|${p.inicio}|${p.fim}`;
    const pa = new Set(x.periodos.map(chave)), pb = new Set(y.periodos.map(chave));
    const rem = [...pa].filter((k) => !pb.has(k)).length, add = [...pb].filter((k) => !pa.has(k)).length;
    if (rem || add) out.push(`~ ${x.nome}: ${add} período(s) a mais, ${rem} a menos`);
    if (x.nucleoId !== y.nucleoId) out.push(`~ ${x.nome}: mudou de núcleo`);
    if (x.observacao !== y.observacao) out.push(`~ ${x.nome}: observação alterada`);
  }
  if (a.nucleos.map((n) => n.nome).join() !== b.nucleos.map((n) => n.nome).join()) out.push('~ núcleos alterados');
  if (JSON.stringify(a.calendario) !== JSON.stringify(b.calendario)) out.push('~ calendário alterado');
  return out;
}

export function Historico() {
  const { estado, desfazer, refazer, podeDesfazer, podeRefazer, criarSnapshot, restaurarSnapshot, excluirSnapshot, limparSessao, apagarHistorico, confirmar } = useApp();
  const [nome, setNome] = useState('');
  const [vendo, setVendo] = useState<string | null>(null);
  const snap = estado.historico.snapshots.find((s) => s.id === vendo);
  const nPeriodos = estado.advogados.reduce((s, a) => s + a.periodos.length, 0);

  return (
    <div className="pagina">
      <section className="cartao">
        <h2>Desfazer / refazer</h2>
        <button disabled={!podeDesfazer} onClick={desfazer}>↶ Desfazer (Ctrl+Z)</button>{' '}
        <button disabled={!podeRefazer} onClick={refazer}>↷ Refazer (Ctrl+Y)</button>
      </section>

      <section className="cartao">
        <h2>Snapshots ({estado.historico.snapshots.length})</h2>
        <form className="linha-form" onSubmit={(e) => { e.preventDefault(); if (nome.trim()) { criarSnapshot(nome.trim()); setNome(''); } }}>
          <input placeholder='Nome (ex.: "versão enviada ao chefe")' value={nome} onChange={(e) => setNome(e.target.value)} />
          <button className="primario" disabled={!nome.trim()}>Criar snapshot</button>
        </form>
        <p className="dica">Automáticos: a cada importação, antes de limpar/restaurar e a cada 20 alterações. Até 50 são mantidos; os automáticos mais antigos são descartados primeiro, os manuais nunca.</p>
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Data</th><th>Tipo</th><th>Conteúdo</th><th /></tr></thead>
          <tbody>
            {[...estado.historico.snapshots].reverse().map((s) => (
              <tr key={s.id}>
                <td>{s.nome}</td><td>{formatarDataHora(s.data)}</td><td>{s.automatico ? 'automático' : 'manual'}</td>
                <td>{s.dados.advogados.length} adv., {s.dados.advogados.reduce((t, a) => t + a.periodos.length, 0)} períodos</td>
                <td className="nowrap">
                  <button onClick={() => setVendo(s.id)}>Comparar</button>
                  <button onClick={async () => {
                    if (await confirmar({ titulo: 'Restaurar snapshot?', corpo: <p>Restaurar “{s.nome}”? Um snapshot do estado atual é criado antes.</p>, textoConfirmar: 'Restaurar' })) restaurarSnapshot(s.id);
                  }}>Restaurar</button>
                  <button className="perigo" onClick={async () => {
                    if (await confirmar({ titulo: 'Excluir snapshot?', corpo: <p>Excluir “{s.nome}”{s.automatico ? '' : ' (manual)'}?</p>, textoConfirmar: 'Excluir', perigo: true })) excluirSnapshot(s.id);
                  }}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="cartao">
        <h2>Log de alterações</h2>
        <ol className="log" reversed>
          {[...estado.historico.log].reverse().map((l) => <li key={l.id}><time>{formatarDataHora(l.data)}</time> {l.descricao}</li>)}
        </ol>
      </section>

      <section className="cartao zona-perigo">
        <h2>Zona de perigo</h2>
        <button className="perigo" onClick={async () => {
          const ok = (await confirmar({
            titulo: 'Limpar sessão atual?',
            corpo: <p>Serão apagados <b>{estado.advogados.length} advogados</b>, <b>{nPeriodos} períodos</b>, {estado.nucleos.length} núcleos e o calendário editado. Histórico, snapshots e configurações são mantidos, e um snapshot “Antes de limpar sessão” é criado.</p>,
            textoConfirmar: 'Continuar', perigo: true,
          })) && (await confirmar({ titulo: 'Confirmação final', corpo: <p>Esta é a segunda confirmação.</p>, textoConfirmar: 'Sim, apagar tudo', perigo: true, exigirTexto: 'LIMPAR', esperaSegundos: 3 }));
          if (ok) limparSessao();
        }}>Limpar sessão</button>{' '}
        <button className="perigo" onClick={async () => {
          const ok = (await confirmar({
            titulo: 'Apagar TODO o histórico?',
            corpo: <p>Apaga o log, <b>todos os {estado.historico.snapshots.length} snapshots</b> (inclusive manuais) e a pilha de desfazer. Não há como recuperar. Considere baixar o backup JSON antes.</p>,
            textoConfirmar: 'Continuar', perigo: true,
          })) && (await confirmar({ titulo: 'Confirmação final', corpo: <p>Não haverá snapshot de segurança.</p>, textoConfirmar: 'Apagar histórico', perigo: true, exigirTexto: 'APAGAR HISTÓRICO' }));
          if (ok) apagarHistorico();
        }}>Apagar também o histórico</button>
      </section>

      {snap && (
        <Modal titulo={`Snapshot “${snap.nome}” × estado atual`} aoFechar={() => setVendo(null)} rodape={<button onClick={() => setVendo(null)}>Fechar</button>}>
          <p className="dica">{formatarDataHora(snap.data)} — o que mudou do snapshot para o estado atual:</p>
          {(() => {
            const d = diferenca(snap.dados, estado);
            return d.length ? <ul>{d.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="ok">Idêntico ao estado atual.</p>;
          })()}
        </Modal>
      )}
    </div>
  );
}

/* ---------- Configurações ---------- */

export function Configuracoes() {
  const { estado, setConfig, alterar, confirmar } = useApp();
  const { config } = estado;
  return (
    <div className="pagina">
      <section className="cartao grade-form">
        <h2>Geral</h2>
        <label className="campo">Ano de trabalho
          <input type="number" min={2000} max={2100} defaultValue={config.ano} key={config.ano} onBlur={async (e) => {
            const ano = Number(e.target.value);
            if (!ano || ano === config.ano) return;
            setConfig(`Mudou ano de trabalho para ${ano}`, (c) => { c.ano = ano; });
            if (await confirmar({ titulo: `Recalcular feriados para ${ano}?`, corpo: <p>Recomendado. Remessa e recesso são mantidos. Períodos fora de {ano} aparecerão como conflito.</p>, textoConfirmar: 'Recalcular', textoCancelar: 'Manter como está' }))
              alterar(`Recalculou feriados para ${ano}`, (d) => {
                const p = calendarioPadrao(ano);
                d.calendario.feriadosNacionais = p.feriadosNacionais;
                d.calendario.feriadosRecife = p.feriadosRecife;
              });
          }} />
        </label>
        <label className="campo">Tema
          <select value={config.tema} onChange={(e) => setConfig('Mudou tema', (c) => { c.tema = e.target.value as typeof c.tema; })}>
            <option value="sistema">Seguir o sistema</option><option value="claro">Claro</option><option value="escuro">Escuro</option>
          </select>
        </label>
        <p className="dica">
          Os dados ficam no navegador, na origem <code>{location.origin}</code>. Use sempre este mesmo endereço (o <code>start.bat</code> usa a porta fixa 5173):
          em outra porta o navegador mostra uma sessão vazia.
        </p>
      </section>

      <section className="cartao grade-form">
        <h2>Limite de afastamento por núcleo</h2>
        <label className="campo">Percentual máximo afastado (%)
          <input type="number" min={1} max={100} value={config.percentualAfastamento}
            onChange={(e) => setConfig(`Percentual de afastamento → ${e.target.value}%`, (c) => { c.percentualAfastamento = Number(e.target.value); })} />
        </label>
        <label className="campo">Arredondamento
          <select value={config.arredondamento} onChange={(e) => setConfig('Mudou arredondamento', (c) => { c.arredondamento = e.target.value as typeof c.arredondamento; })}>
            {Object.entries(NOMES_ARREDONDAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="campo">Mínimo de afastados permitidos
          <input type="number" min={0} value={config.minimoAfastamento}
            onChange={(e) => setConfig(`Mínimo de afastamento → ${e.target.value}`, (c) => { c.minimoAfastamento = Number(e.target.value); })} />
        </label>
        <RegraArredondamento />
      </section>

      <section className="cartao">
        <h2>Regras</h2>
        <table className="tabela">
          <thead><tr><th>Ativa</th><th>Regra</th><th>Parâmetros</th></tr></thead>
          <tbody>
            {REGRAS.map((r) => {
              const c = configDaRegra(config, r);
              return (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={c.ativa} aria-label={`Ativar ${r.nome}`}
                    onChange={(e) => setConfig(`${e.target.checked ? 'Ligou' : 'Desligou'} regra ${r.nome}`, (cfg) => { cfg.regras[r.id] = { ...c, ativa: e.target.checked }; })} /></td>
                  <td><b>{r.nome}</b><br /><small className="dica">{r.descricao} <code>{r.id}</code></small></td>
                  <td>
                    {Object.entries(c.parametros).map(([k, v]) => (
                      <label key={k} className="campo">{r.rotulos?.[k] ?? k}
                        <input type="number" value={Number(v)} min={0}
                          onChange={(e) => setConfig(`Regra ${r.nome}: ${k} = ${e.target.value}`, (cfg) => { cfg.regras[r.id] = { ...c, parametros: { ...c.parametros, [k]: Number(e.target.value) } }; })} />
                      </label>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
