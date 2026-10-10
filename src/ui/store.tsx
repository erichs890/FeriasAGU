import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Config, Conflito, Dados, Estado, Snapshot } from '../dominio/tipos';
import { dadosVazios, estadoInicial, extrairDados, migrar } from '../dominio/estado';
import { agoraISO } from '../dominio/datas';
import { novoId } from '../dominio/id';
import { chaveConflito, validar } from '../regras';
import { ConfirmDialog, type OpcoesConfirmacao } from './Modal';
import { ListaConflitos } from './ListaConflitos';

const CHAVE = 'feriasAGU:estado';
const CHAVE_PILHAS = 'feriasAGU:desfazer';
const LIMITE_SNAPSHOTS = 50;
const SNAPSHOT_A_CADA = 20;
const LIMITE_LOG = 1000;

export type Aba = 'planejamento' | 'advogados' | 'conflitos' | 'calendario' | 'importar' | 'historico' | 'configuracoes';
export interface Foco { advogadoId?: string; nucleoId?: string; dia?: string; t: number }

interface Pilhas { passado: Dados[]; futuro: Dados[] }

/** Lê o estado salvo; se estiver corrompido, guarda uma cópia bruta e começa vazio (avisando). */
function carregar(): { estado: Estado; pilhas: Pilhas; aviso: string | null } {
  let aviso: string | null = null;
  let estado = estadoInicial();
  const bruto = localStorage.getItem(CHAVE);
  if (bruto) {
    try {
      estado = migrar(JSON.parse(bruto));
    } catch (e) {
      const copia = `${CHAVE}:corrompido:${Date.now()}`;
      try { localStorage.setItem(copia, bruto); } catch { /* sem espaço: a cópia fica só no aviso */ }
      aviso = `Os dados salvos não puderam ser lidos (${(e as Error).message}). Uma cópia bruta foi guardada; use "Baixar dados brutos" em Importar/Exportar.`;
    }
  }
  let pilhas: Pilhas = { passado: [], futuro: [] };
  try { pilhas = JSON.parse(localStorage.getItem(CHAVE_PILHAS) ?? '') ?? pilhas; } catch { /* sem pilha salva */ }
  return { estado, pilhas, aviso };
}

/** Insere snapshot respeitando o limite: descarta só automáticos antigos; manuais nunca são descartados aqui. */
function comSnapshot(lista: Snapshot[], s: Snapshot): Snapshot[] {
  const nova = [...lista, s];
  while (nova.length > LIMITE_SNAPSHOTS) {
    const i = nova.findIndex((x) => x.automatico);
    if (i < 0) break;
    nova.splice(i, 1);
  }
  return nova;
}

interface Ctx {
  estado: Estado;
  conflitos: Conflito[];
  alterar(descricao: string, f: (d: Dados) => void): Promise<boolean>;
  setConfig(descricao: string, f: (c: Config) => void): void;
  desfazer(): void;
  refazer(): void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  criarSnapshot(nome: string, automatico?: boolean): void;
  restaurarSnapshot(id: string): void;
  excluirSnapshot(id: string): void;
  substituirDados(dados: Dados, descricao: string): void;
  limparSessao(): void;
  apagarHistorico(): void;
  substituirEstado(e: Estado, descricao: string): void;
  confirmar(o: OpcoesConfirmacao): Promise<boolean>;
  avisoPersistencia: string | null;
  aba: Aba;
  setAba(a: Aba): void;
  foco: Foco | null;
  irPara(f: Omit<Foco, 't'>): void;
}

const Contexto = createContext<Ctx | null>(null);
export const useApp = () => useContext(Contexto)!;

export function Provider({ children }: { children: ReactNode }) {
  const inicial = useMemo(carregar, []);
  const [estado, setEstado] = useState(inicial.estado);
  const [pilhas, setPilhas] = useState(inicial.pilhas);
  const [aviso, setAviso] = useState<string | null>(inicial.aviso);
  const [dialogo, setDialogo] = useState<(OpcoesConfirmacao & { resolver: (v: boolean) => void; id: string }) | null>(null);
  const [aba, setAba] = useState<Aba>('planejamento');
  const [foco, setFoco] = useState<Foco | null>(null);
  const contador = useRef(0);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  const conflitos = useMemo(() => validar(estado), [estado]);

  // Autosave com debounce curto.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(estado));
        setAviso((a) => (a?.startsWith('Espaço') ? null : a));
      } catch {
        setAviso('Espaço do navegador cheio: as últimas alterações NÃO foram salvas. Baixe o backup JSON e exclua snapshots antigos em Histórico.');
      }
      // A pilha de desfazer é salva enquanto couber; se não couber, guarda a metade mais recente.
      let p = pilhas;
      for (;;) {
        try {
          localStorage.setItem(CHAVE_PILHAS, JSON.stringify(p));
          break;
        } catch {
          if (!p.passado.length && !p.futuro.length) break;
          p = { passado: p.passado.slice(Math.ceil(p.passado.length / 2)), futuro: p.futuro.slice(0, Math.floor(p.futuro.length / 2)) };
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [estado, pilhas]);

  useEffect(() => {
    const tema = estado.config.tema;
    if (tema === 'sistema') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = tema === 'escuro' ? 'dark' : 'light';
  }, [estado.config.tema]);

  // `id` novo por diálogo: diálogos em sequência não reaproveitam estado (texto digitado, contagem).
  const confirmar = useCallback((o: OpcoesConfirmacao) => new Promise<boolean>((resolver) => setDialogo({ ...o, resolver, id: novoId() })), []);

  const log = (e: Estado, descricao: string): Estado['historico'] => ({
    ...e.historico,
    log: [...e.historico.log, { id: novoId(), data: agoraISO(), descricao }].slice(-LIMITE_LOG),
  });

  const snap = (e: Estado, nome: string, automatico: boolean): Snapshot => ({ id: novoId(), nome, data: agoraISO(), automatico, dados: extrairDados(e) });

  /** Aplica novos dados: empilha desfazer, registra log e snapshot periódico. */
  const aplicar = useCallback((novos: Dados, descricao: string) => {
    const atual = estadoRef.current;
    setPilhas((p) => ({ passado: [...p.passado, extrairDados(atual)], futuro: [] }));
    contador.current++;
    setEstado((e) => {
      let historico = log(e, descricao);
      if (contador.current % SNAPSHOT_A_CADA === 0)
        historico = { ...historico, snapshots: comSnapshot(historico.snapshots, snap(e, `Automático (${contador.current} alterações)`, true)) };
      return { ...e, ...novos, historico };
    });
  }, []);

  const alterar = useCallback(async (descricao: string, f: (d: Dados) => void) => {
    const atual = estadoRef.current;
    const novos = structuredClone(extrairDados(atual));
    f(novos);
    const antes = new Set(validar(atual).map(chaveConflito));
    const novosConflitos = validar({ ...atual, ...novos }).filter((c) => !antes.has(chaveConflito(c)));
    if (novosConflitos.length) {
      const salvar = await confirmar({
        titulo: `⚠ ${novosConflitos.length} conflito(s) novo(s)`,
        corpo: (<><p>A alteração <b>“{descricao}”</b> viola regras:</p><ListaConflitos conflitos={novosConflitos} /></>),
        textoConfirmar: 'Salvar mesmo assim',
        textoCancelar: 'Voltar e corrigir',
        perigo: true,
      });
      if (!salvar) return false;
      const certeza = await confirmar({
        titulo: 'Salvar com conflito?',
        corpo: <p>O conflito ficará registrado e visível no painel de conflitos até ser corrigido.</p>,
        textoConfirmar: 'Sim, salvar com conflito',
        perigo: true,
      });
      if (!certeza) return false;
      descricao += ` (salvo com ${novosConflitos.length} conflito(s))`;
    }
    aplicar(novos, descricao);
    return true;
  }, [aplicar, confirmar]);

  const setConfig = useCallback((descricao: string, f: (c: Config) => void) => {
    setEstado((e) => {
      const config = structuredClone(e.config);
      f(config);
      return { ...e, config, historico: log(e, descricao) };
    });
  }, []);

  const mover = (de: 'passado' | 'futuro', descricao: string) => {
    const pilha = pilhas[de];
    if (!pilha.length) return;
    const alvo = pilha[pilha.length - 1];
    const atual = extrairDados(estadoRef.current);
    setPilhas(de === 'passado'
      ? { passado: pilha.slice(0, -1), futuro: [...pilhas.futuro, atual] }
      : { futuro: pilha.slice(0, -1), passado: [...pilhas.passado, atual] });
    setEstado((e) => ({ ...e, ...alvo, historico: log(e, descricao) }));
  };

  /** Troca os dados inteiros (importação, exemplo, restauração), com snapshot automático antes. */
  const substituirDados = useCallback((dados: Dados, descricao: string, nomeSnapshot = `Antes de: ${descricao}`) => {
    setEstado((e) => ({ ...e, historico: { ...e.historico, snapshots: comSnapshot(e.historico.snapshots, snap(e, nomeSnapshot, true)) } }));
    aplicar(dados, descricao);
  }, [aplicar]);

  const ctx: Ctx = {
    estado,
    conflitos,
    alterar,
    setConfig,
    desfazer: () => mover('passado', 'Desfez a última alteração'),
    refazer: () => mover('futuro', 'Refez a alteração'),
    podeDesfazer: pilhas.passado.length > 0,
    podeRefazer: pilhas.futuro.length > 0,
    criarSnapshot: (nome, automatico = false) =>
      setEstado((e) => ({ ...e, historico: { ...log(e, `Criou snapshot "${nome}"`), snapshots: comSnapshot(e.historico.snapshots, snap(e, nome, automatico)) } })),
    restaurarSnapshot: (id) => {
      const s = estado.historico.snapshots.find((x) => x.id === id);
      if (s) substituirDados(structuredClone(s.dados), `Restaurou snapshot "${s.nome}"`, `Antes de restaurar "${s.nome}"`);
    },
    excluirSnapshot: (id) =>
      setEstado((e) => {
        const s = e.historico.snapshots.find((x) => x.id === id);
        return { ...e, historico: { ...log(e, `Excluiu snapshot "${s?.nome}"`), snapshots: e.historico.snapshots.filter((x) => x.id !== id) } };
      }),
    substituirDados: (d, desc) => substituirDados(d, desc),
    limparSessao: () => substituirDados(dadosVazios(estado.config.ano), 'Limpou a sessão', 'Antes de limpar sessão'),
    apagarHistorico: () => {
      setPilhas({ passado: [], futuro: [] });
      setEstado((e) => ({ ...e, historico: { log: [{ id: novoId(), data: agoraISO(), descricao: 'Apagou todo o histórico' }], snapshots: [] } }));
    },
    substituirEstado: (novo, descricao) => {
      const antes = snap(estadoRef.current, `Antes de: ${descricao}`, true);
      setPilhas({ passado: [], futuro: [] });
      setEstado({ ...novo, historico: { ...log(novo, descricao), snapshots: comSnapshot(novo.historico.snapshots, antes) } });
    },
    confirmar,
    avisoPersistencia: aviso,
    aba,
    setAba,
    foco,
    irPara: (f) => {
      setAba('planejamento');
      setFoco({ ...f, t: Date.now() });
    },
  };

  return (
    <Contexto.Provider value={ctx}>
      {children}
      {dialogo && (
        <ConfirmDialog
          key={dialogo.id}
          {...dialogo}
          aoResponder={(v) => {
            dialogo.resolver(v);
            setDialogo(null);
          }}
        />
      )}
    </Contexto.Provider>
  );
}
