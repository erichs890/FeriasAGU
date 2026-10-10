import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Modal({ titulo, children, aoFechar, rodape, largo }: {
  titulo: string; children: ReactNode; aoFechar: () => void; rodape?: ReactNode; largo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
    return () => anterior?.focus();
  }, []);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        className={`modal ${largo ? 'largo' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            aoFechar();
          }
        }}
      >
        <h2>{titulo}</h2>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export interface OpcoesConfirmacao {
  titulo: string;
  corpo: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  perigo?: boolean;
  /** Exige digitar esta palavra para habilitar o botão (ou esperar `esperaSegundos`, se informado). */
  exigirTexto?: string;
  esperaSegundos?: number;
}

export function ConfirmDialog({ titulo, corpo, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigo, exigirTexto, esperaSegundos, aoResponder }:
  OpcoesConfirmacao & { aoResponder: (v: boolean) => void }) {
  const [digitado, setDigitado] = useState('');
  const [restante, setRestante] = useState(esperaSegundos ?? 0);
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);
  const liberado = !exigirTexto || digitado.trim() === exigirTexto || (esperaSegundos !== undefined && restante <= 0);
  return (
    <Modal
      titulo={titulo}
      aoFechar={() => aoResponder(false)}
      rodape={
        <>
          <button data-autofocus onClick={() => aoResponder(false)}>{textoCancelar}</button>
          <button className={perigo ? 'perigo' : 'primario'} disabled={!liberado} onClick={() => aoResponder(true)}>
            {textoConfirmar}{exigirTexto && esperaSegundos !== undefined && restante > 0 && !liberado ? ` (${restante}s)` : ''}
          </button>
        </>
      }
    >
      {corpo}
      {exigirTexto && (
        <label className="campo">
          Digite <b>{exigirTexto}</b> para confirmar{esperaSegundos !== undefined ? ` (ou aguarde ${esperaSegundos}s)` : ''}:
          <input value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
        </label>
      )}
    </Modal>
  );
}
