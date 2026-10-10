import ExcelJS from 'exceljs';
import { CORES, TIPOS, type Advogado, type Dados, type EventoCalendario, type Nucleo, type TipoPeriodo } from '../dominio/tipos';
import { agruparConsecutivos, fromDia, isoValida, MESES, toDia } from '../dominio/datas';
import { calendarioPadrao } from '../dominio/calendario';
import { normalizar } from '../dominio/estado';
import { novoId } from '../dominio/id';

export class ErroImportacao extends Error {}

export interface ResultadoImportacao {
  dados: Dados;
  avisos: string[];
}

type Marca = TipoPeriodo | 'remessa' | 'recesso';

const ALVOS: [Marca, string][] = [
  ['ferias', TIPOS.ferias.cor],
  ['preFerias', TIPOS.preFerias.cor],
  ['licencaProgramada', TIPOS.licencaProgramada.cor],
  ['licencaNaoProgramada', TIPOS.licencaNaoProgramada.cor],
  ['remessa', CORES.remessa],
  ['recesso', CORES.recesso],
];

// Paleta de tema do Office (2023+). O tint é aplicado como no Excel (aproximação por canal).
const TEMA = ['FFFFFF', '000000', 'E8E8E8', '0E2841', '156082', 'E97132', '196B24', '0F9ED5', 'A02B93', '4EA72E'];
const INDEXADAS: Record<number, string> = { 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 11: '00FF00', 12: '0000FF', 13: 'FFFF00', 64: 'FFFFFF' };

const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Cor de preenchimento de uma célula em RRGGBB, ou null se não houver. */
export function corCelula(cel: ExcelJS.Cell): string | null {
  const f = cel.fill as ExcelJS.FillPattern | undefined;
  if (!f || f.type !== 'pattern' || f.pattern === 'none' || !f.fgColor) return null;
  const c = f.fgColor as { argb?: string; theme?: number; tint?: number; indexed?: number };
  if (c.argb) return c.argb.slice(-6).toUpperCase();
  if (c.indexed !== undefined) return INDEXADAS[c.indexed] ?? null;
  if (c.theme !== undefined && TEMA[c.theme]) {
    const t = c.tint ?? 0;
    return rgb(TEMA[c.theme])
      .map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  return null;
}

/** Associa a cor ao tipo mais próximo (tolerante a pequenas variações de tom). */
export function marcaDaCor(hex: string | null): Marca | null {
  if (!hex) return null;
  const [r, g, b] = rgb(hex);
  let melhor: Marca | null = null, dist = 40; // limiar: FFC000 (fim de semana) fica a 63 de FFFF00
  for (const [m, alvo] of ALVOS) {
    const [r2, g2, b2] = rgb(alvo);
    const d = Math.hypot(r - r2, g - g2, b - b2);
    if (d < dist) [melhor, dist] = [m, d];
  }
  return melhor;
}

const texto = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};

const ehClaro = (hex: string) => rgb(hex).every((v) => v > 0xe0);

/** Lê um .xlsx no layout do rascunho e devolve dados editáveis do ano informado. */
export async function importarXlsx(buf: ArrayBuffer, ano: number): Promise<ResultadoImportacao> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new ErroImportacao('Arquivo não é um .xlsx válido.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErroImportacao('A planilha não tem nenhuma aba.');
  const avisos: string[] = [];

  // Linha 2: dia do mês por coluna; o mês avança quando o dia volta a 1.
  const r2 = ws.getRow(2);
  const primeiro = Number(texto(r2.getCell(2).value));
  if (primeiro !== 1) throw new ErroImportacao(`Linha 2, coluna B: esperado o dia 1 de janeiro, encontrado "${texto(r2.getCell(2).value)}".`);
  const colData = new Map<number, string>();
  let mes = -1, anterior = 0, col = 2;
  for (; ; col++) {
    const v = texto(r2.getCell(col).value).trim();
    if (!/^\d{1,2}$/.test(v)) break;
    const dia = Number(v);
    if (dia === 1) {
      mes++;
      const rotulo = normalizar(texto(ws.getCell(1, col).value));
      if (mes < 12 && rotulo && rotulo !== normalizar(MESES[mes]))
        avisos.push(`Linha 1, coluna ${ws.getColumn(col).letter}: esperado "${MESES[mes]}", encontrado "${texto(ws.getCell(1, col).value)}".`);
    } else if (dia !== anterior + 1)
      throw new ErroImportacao(`Linha 2, coluna ${ws.getColumn(col).letter}: sequência de dias quebrada (${anterior} → ${dia}).`);
    if (mes > 11) throw new ErroImportacao(`Linha 2, coluna ${ws.getColumn(col).letter}: mais de 12 meses de dias.`);
    anterior = dia;
    const iso = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (isoValida(iso)) colData.set(col, iso);
    else avisos.push(`Coluna ${ws.getColumn(col).letter} (${dia}/${mes + 1}) não existe em ${ano} e foi ignorada.`);
  }
  const ultimaCol = col - 1;
  const colObs = col;
  if (mes !== 11) throw new ErroImportacao(`Linha 2: encontrados dias de apenas ${mes + 1} mês(es); esperado janeiro a dezembro.`);

  // Remessa e recesso (do cabeçalho e de linhas de advogado) vão para o calendário.
  const diasCal = { remessa: new Set<number>(), recesso: new Set<number>() };
  const marcarCal = (m: Marca | null, iso: string) => {
    if (m === 'remessa' || m === 'recesso') diasCal[m].add(toDia(iso));
  };
  for (const [c, iso] of colData) marcarCal(marcaDaCor(corCelula(r2.getCell(c))), iso);

  const nucleos: Nucleo[] = [];
  const advogados: Advogado[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nome = texto(row.getCell(1).value).replace(/\s+/g, ' ').trim();
    if (!nome) {
      if (advogados.length || nucleos.length) break; // linha vazia antes da legenda
      continue;
    }
    if (normalizar(nome) === 'legendas') break;
    const corA = corCelula(row.getCell(1));
    if (corA && !ehClaro(corA)) {
      nucleos.push({ id: novoId(), nome });
      continue;
    }
    if (!nucleos.length) {
      nucleos.push({ id: novoId(), nome: 'Sem núcleo' });
      avisos.push(`Linha ${r}: advogado antes de qualquer linha de núcleo; colocado em "Sem núcleo".`);
    }
    const porTipo = new Map<TipoPeriodo, number[]>();
    for (let c = 2; c <= ultimaCol; c++) {
      const iso = colData.get(c);
      if (!iso) continue;
      const m = marcaDaCor(corCelula(row.getCell(c)));
      if (!m) continue;
      if (m === 'remessa' || m === 'recesso') marcarCal(m, iso);
      else porTipo.set(m, [...(porTipo.get(m) ?? []), toDia(iso)]);
    }
    const periodos = [...porTipo].flatMap(([tipo, ds]) =>
      agruparConsecutivos(ds.sort((a, b) => a - b)).map((g) => ({ id: novoId(), tipo, inicio: fromDia(g.inicio), fim: fromDia(g.fim) })),
    );
    periodos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    advogados.push({ id: novoId(), nome, nucleoId: nucleos[nucleos.length - 1].id, observacao: texto(row.getCell(colObs).value), periodos });
  }
  if (!advogados.length && !nucleos.length) throw new ErroImportacao('Nenhum núcleo ou advogado encontrado a partir da linha 3 (coluna A).');

  const eventos = (s: Set<number>, descricao: string): EventoCalendario[] =>
    agruparConsecutivos([...s].sort((a, b) => a - b)).map((g) => ({ id: novoId(), inicio: fromDia(g.inicio), fim: fromDia(g.fim), descricao, ativo: true }));
  const calendario = calendarioPadrao(ano);
  calendario.remessa = eventos(diasCal.remessa, 'Importado da planilha');
  calendario.recesso = eventos(diasCal.recesso, 'Importado da planilha');

  return { dados: { nucleos, advogados, calendario }, avisos };
}
