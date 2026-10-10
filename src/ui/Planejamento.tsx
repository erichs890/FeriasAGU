import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TIPOS, type Advogado, type Conflito, type Periodo } from '../dominio/tipos';
import { diasDoAno, diasEntre, formatar, formatarIntervalo, fromDia, MESES, primeiroDia, toDia } from '../dominio/datas';
import { diasMarcados, tipoDia } from '../dominio/calendario';
import { afastadosPorDia } from '../regras/limiteNucleo';
import { intervalosNoAno, limiteDoNucleo } from '../regras/util';
import { PeriodoDialog } from './PeriodoDialog';
import { useApp } from './store';
import { LimiteNucleo } from './Advogados';

const NOMES_DIA_TIPO: Record<string, string> = {
  remessa: 'Dia de remessa', recesso: 'Recesso', feriadoNacional: 'Feriado nacional', feriadoRecife: 'Feriado em Recife', fimDeSemana: 'Fim de semana',
};

/** Dias (ISO) marcados por conflito para cada advogado, para destacar as células envolvidas. */
function celulasEmConflito(conflitos: Conflito[], advogados: Advogado[], ano: number) {
  const s = new Set<string>();
  const porId = new Map(advogados.map((a) => [a.id, a]));
  for (const c of conflitos)
    for (const id of c.advogadoIds) {
      const adv = porId.get(id);
      if (!adv) continue;
      const lo = c.inicio ? toDia(c.inicio) : -Infinity, hi = c.fim ? toDia(c.fim) : Infinity;
      for (const iv of intervalosNoAno(adv, ano))
        if (!c.periodoIds || c.periodoIds.includes(iv.periodo.id))
          for (let d = Math.max(iv.inicio, lo); d <= Math.min(iv.fim, hi); d++) s.add(`${id}|${fromDia(d)}`);
    }
  return s;
}

interface Sel { advId: string; a: number; b: number }

const LinhaAdvogado = memo(function LinhaAdvogado({ adv, dias, ano, conflitos, temConflito, sel, aoIniciar, aoEstender, focado }: {
  adv: Advogado; dias: string[]; ano: number; conflitos: Set<string>; temConflito: boolean; sel: [number, number] | null;
  aoIniciar: (advId: string, i: number) => void; aoEstender: (advId: string, i: number) => void; focado: boolean;
}) {
  const mapa = useMemo(() => {
    const m = new Map<string, Periodo>();
    for (const tipo of ['licencaNaoProgramada', 'licencaProgramada', 'preFerias', 'ferias'] as const)
      for (const iv of intervalosNoAno(adv, ano, [tipo])) for (let d = iv.inicio; d <= iv.fim; d++) m.set(fromDia(d), iv.periodo);
    return m;
  }, [adv, ano]);
  return (
    <tr className={focado ? 'focado' : ''}>
      <th className="nome" scope="row" title={adv.observacao ? `Obs.: ${adv.observacao}` : undefined}>
        {temConflito && <span className="icone-conflito" title="Envolvido em conflito" aria-label="conflito">⚠</span>}
        {adv.nome}
        {adv.observacao && <span className="obs" aria-label="tem observação"> ✎</span>}
      </th>
      {dias.map((iso, i) => {
        const p = mapa.get(iso);
        const emSel = sel && i >= sel[0] && i <= sel[1];
        const conf = conflitos.has(`${adv.id}|${iso}`);
        return (
          <td
            key={iso}
            id={`c-${adv.id}-${iso}`}
            className={`dia ${p ? `t-${p.tipo}` : ''} ${conf ? 'conf' : ''} ${emSel ? 'sel' : ''}`}
            title={p ? `${adv.nome} — ${TIPOS[p.tipo].nome} — ${formatarIntervalo(p.inicio, p.fim)} (${diasEntre(p.inicio, p.fim)} dias)` : `${adv.nome} — ${formatar(iso)}`}
            onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); aoIniciar(adv.id, i); } }}
            onMouseEnter={() => aoEstender(adv.id, i)}
          >{conf ? '!' : ''}</td>
        );
      })}
    </tr>
  );
});

export function Planejamento() {
  const { estado, conflitos, foco, setAba } = useApp();
  const { ano } = estado.config;
  const [filtroNucleo, setFiltroNucleo] = useState('');
  const [mes, setMes] = useState(-1);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [dialogo, setDialogo] = useState<{ advogadoId: string; periodo?: Periodo; inicial?: Partial<Periodo> } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  const todosDias = useMemo(() => diasDoAno(ano), [ano]);
  const dias = useMemo(() => (mes < 0 ? todosDias : todosDias.filter((d) => Number(d.slice(5, 7)) === mes + 1)), [todosDias, mes]);
  const indiceAno = useMemo(() => dias.map((d) => toDia(d) - toDia(primeiroDia(ano))), [dias, ano]);
  const marcados = useMemo(() => diasMarcados(estado.calendario), [estado.calendario]);
  const celConf = useMemo(() => celulasEmConflito(conflitos, estado.advogados, ano), [conflitos, estado.advogados, ano]);
  const advComConflito = useMemo(() => new Set(conflitos.flatMap((c) => c.advogadoIds)), [conflitos]);
  const ocupacao = useMemo(
    () => new Map(estado.nucleos.map((n) => [n.id, afastadosPorDia(estado, n.id).map((x) => x.length)])),
    [estado],
  );

  const meses = useMemo(() => {
    const out: { nome: string; n: number }[] = [];
    for (const d of dias) {
      const m = Number(d.slice(5, 7)) - 1;
      if (out.length && out[out.length - 1].nome === MESES[m]) out[out.length - 1].n++;
      else out.push({ nome: MESES[m], n: 1 });
    }
    return out;
  }, [dias]);

  // Seleção por arraste: mousedown inicia, mouseenter estende, mouseup abre o diálogo.
  const aoIniciar = useCallback((advId: string, i: number) => setSel({ advId, a: i, b: i }), []);
  const aoEstender = useCallback((advId: string, i: number) => {
    const s = selRef.current;
    if (s && s.advId === advId) setSel({ ...s, b: i });
  }, []);
  useEffect(() => {
    const fim = () => {
      const s = selRef.current;
      if (!s) return;
      setSel(null);
      const [a, b] = [Math.min(s.a, s.b), Math.max(s.a, s.b)];
      const adv = estado.advogados.find((x) => x.id === s.advId);
      if (!adv) return;
      const p = a === b ? adv.periodos.find((x) => x.inicio <= dias[a] && x.fim >= dias[a]) : undefined;
      setDialogo(p ? { advogadoId: adv.id, periodo: p } : { advogadoId: adv.id, inicial: { inicio: dias[a], fim: dias[b] } });
    };
    window.addEventListener('mouseup', fim);
    return () => window.removeEventListener('mouseup', fim);
  }, [dias, estado.advogados]);

  // Navegação vinda da lista de conflitos.
  useEffect(() => {
    if (!foco) return;
    if (foco.dia && mes >= 0 && Number(foco.dia.slice(5, 7)) - 1 !== mes) setMes(Number(foco.dia.slice(5, 7)) - 1);
    setFiltroNucleo('');
    setBusca('');
    requestAnimationFrame(() => {
      const alvo = foco.advogadoId && foco.dia ? document.getElementById(`c-${foco.advogadoId}-${foco.dia}`)
        : foco.dia ? document.getElementById(`h-${foco.dia}`)
        : foco.advogadoId ? document.getElementById(`c-${foco.advogadoId}-${dias[0]}`) : null;
      alvo?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }, [foco]); // eslint-disable-line react-hooks/exhaustive-deps

  const termo = busca.trim().toLowerCase();
  const nucleosVisiveis = estado.nucleos.filter((n) => !filtroNucleo || n.id === filtroNucleo);

  if (!estado.advogados.length && !estado.nucleos.length)
    return (
      <div className="vazio">
        <h2>Nenhum dado ainda</h2>
        <p>Importe a planilha em <button className="link" onClick={() => setAba('importar')}>Importar/Exportar</button>, cadastre
          núcleos e advogados em <button className="link" onClick={() => setAba('advogados')}>Advogados</button>, ou carregue o exemplo.</p>
      </div>
    );

  return (
    <div className="planejamento">
      <div className="filtros">
        <label>Núcleo <select value={filtroNucleo} onChange={(e) => setFiltroNucleo(e.target.value)}>
          <option value="">Todos</option>
          {estado.nucleos.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        </select></label>
        <label>Zoom <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          <option value={-1}>Ano todo</option>
          {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select></label>
        <label>Advogado <input type="search" placeholder="Filtrar por nome…" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <span className="dica">Arraste numa linha para criar um período; clique num período para editar.</span>
        <Legenda />
      </div>
      <div className={`grade-scroll ${mes >= 0 ? 'zoom-mes' : ''}`}>
        <table className="grade">
          <thead>
            <tr>
              <th className="nome canto" rowSpan={2}>Advogada(o) da União</th>
              {meses.map((m) => <th key={m.nome} colSpan={m.n} className="mes">{m.nome}</th>)}
            </tr>
            <tr>
              {dias.map((iso) => {
                const t = tipoDia(iso, marcados);
                const desc = t && t !== 'fimDeSemana' ? (marcados[t as 'remessa'].get(iso) ?? '') : '';
                return (
                  <th key={iso} id={`h-${iso}`} className={`num ${t ? `d-${t}` : ''}`} title={`${formatar(iso)}${t ? ` — ${NOMES_DIA_TIPO[t]}` : ''}${desc ? `: ${desc}` : ''}`}>
                    {Number(iso.slice(8, 10))}
                  </th>
                );
              })}
            </tr>
          </thead>
          {nucleosVisiveis.map((nuc) => {
            const membros = estado.advogados.filter((a) => a.nucleoId === nuc.id);
            const visiveis = membros.filter((a) => !termo || a.nome.toLowerCase().includes(termo));
            const limite = limiteDoNucleo(membros.length, estado.config);
            const occ = ocupacao.get(nuc.id) ?? [];
            if (termo && !visiveis.length) return null;
            return (
              <tbody key={nuc.id}>
                <tr className="linha-nucleo">
                  <th className="nome" scope="rowgroup">{nuc.nome} <small><LimiteNucleo n={membros.length} /></small></th>
                  <td colSpan={dias.length} />
                </tr>
                {visiveis.map((adv) => (
                  <LinhaAdvogado
                    key={adv.id}
                    adv={adv}
                    dias={dias}
                    ano={ano}
                    conflitos={celConf}
                    temConflito={advComConflito.has(adv.id)}
                    sel={sel && sel.advId === adv.id ? [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)] : null}
                    aoIniciar={aoIniciar}
                    aoEstender={aoEstender}
                    focado={foco?.advogadoId === adv.id}
                  />
                ))}
                <tr className="ocupacao">
                  <th className="nome" scope="row">Ocupação (afastados / limite {limite})</th>
                  {indiceAno.map((idx, i) => {
                    const v = occ[idx] ?? 0;
                    const cls = v === 0 ? '' : v > limite ? 'acima' : v === limite ? 'no-limite' : 'abaixo';
                    return <td key={i} className={cls} title={`${nuc.nome} — ${formatar(dias[i])}: ${v} afastado(s), limite ${limite}`}>{v || ''}</td>;
                  })}
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
      {dialogo && <PeriodoDialog {...dialogo} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}

export function Legenda() {
  const itens: [string, string][] = [
    ['t-ferias', 'Férias'], ['t-preFerias', 'Pré-férias'], ['t-licencaProgramada', 'Licença programada'], ['t-licencaNaoProgramada', 'Licença não programada'],
    ['d-fimDeSemana', 'Sáb./dom.'], ['d-feriadoNacional', 'Feriado nacional'], ['d-feriadoRecife', 'Feriado Recife'], ['d-remessa', 'Remessa'], ['d-recesso', 'Recesso'],
  ];
  return (
    <ul className="legenda" aria-label="Legenda de cores">
      {itens.map(([c, n]) => <li key={c}><span className={`amostra ${c}`} />{n}</li>)}
      <li><span className="amostra conf">!</span>Em conflito</li>
    </ul>
  );
}
