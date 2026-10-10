import { useEffect } from 'react';
import { Provider, useApp, type Aba } from './ui/store';
import { Planejamento } from './ui/Planejamento';
import { Advogados } from './ui/Advogados';
import { CalendarioPagina, Configuracoes, Conflitos, Historico, ImportarExportar } from './ui/Paginas';

const ABAS: [Aba, string][] = [
  ['planejamento', 'Planejamento'],
  ['advogados', 'Advogados'],
  ['conflitos', 'Conflitos'],
  ['calendario', 'Calendário'],
  ['importar', 'Importar/Exportar'],
  ['historico', 'Histórico'],
  ['configuracoes', 'Configurações'],
];

function Shell() {
  const { estado, conflitos, aba, setAba, desfazer, refazer, podeDesfazer, podeRefazer, avisoPersistencia } = useApp();

  // Atalhos: Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z), fora de campos de texto.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (!(e.ctrlKey || e.metaKey) || alvo.closest('input, textarea, select, [role=dialog]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const erros = conflitos.length;
  return (
    <>
      <header className="topo">
        <h1>Férias AGU <small>{estado.config.ano}</small></h1>
        <nav aria-label="Seções">
          {ABAS.map(([id, nome]) => (
            <button key={id} className={aba === id ? 'ativa' : ''} aria-current={aba === id ? 'page' : undefined} onClick={() => setAba(id)}>
              {nome}
            </button>
          ))}
        </nav>
        <div className="acoes-topo">
          <button disabled={!podeDesfazer} onClick={desfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
          <button disabled={!podeRefazer} onClick={refazer} title="Refazer (Ctrl+Y)" aria-label="Refazer">↷</button>
          <button className={`contador ${erros ? 'com-conflito' : ''}`} onClick={() => setAba('conflitos')}>
            {erros ? `⚠ ${erros} conflito${erros > 1 ? 's' : ''}` : '✓ sem conflitos'}
          </button>
        </div>
      </header>
      {avisoPersistencia && aba !== 'importar' && (
        <div className="aviso-banner" role="alert">{avisoPersistencia} <button onClick={() => setAba('importar')}>Ver opções</button></div>
      )}
      <main>
        {aba === 'planejamento' && <Planejamento />}
        {aba === 'advogados' && <Advogados />}
        {aba === 'conflitos' && <Conflitos />}
        {aba === 'calendario' && <CalendarioPagina />}
        {aba === 'importar' && <ImportarExportar />}
        {aba === 'historico' && <Historico />}
        {aba === 'configuracoes' && <Configuracoes />}
      </main>
    </>
  );
}

export default function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
