import type { Conflito } from '../dominio/tipos';
import { nomeRegra } from '../regras';

/** Lista de conflitos; se `aoClicar` for passado, cada item navega até o conflito. */
export function ListaConflitos({ conflitos, aoClicar, agrupar }: { conflitos: Conflito[]; aoClicar?: (c: Conflito) => void; agrupar?: boolean }) {
  if (!conflitos.length) return <p className="ok">✓ Nenhum conflito.</p>;
  const grupos = agrupar
    ? [...new Set(conflitos.map((c) => c.regraId))].map((id) => [id, conflitos.filter((c) => c.regraId === id)] as const)
    : [['', conflitos] as const];
  return (
    <>
      {grupos.map(([id, lista]) => (
        <section key={id}>
          {id && <h3>{nomeRegra(id)} <span className="selo">{lista.length}</span></h3>}
          <ul className="conflitos">
            {lista.map((c, i) => (
              <li key={i} className={c.gravidade}>
                <span aria-hidden>{c.gravidade === 'erro' ? '⛔' : '⚠'}</span>{' '}
                {aoClicar ? (
                  <button className="link" onClick={() => aoClicar(c)}>{c.mensagem}</button>
                ) : (
                  <span>{c.mensagem}</span>
                )}
                {!id && <small> — {nomeRegra(c.regraId)}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
