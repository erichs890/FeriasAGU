import ExcelJS from 'exceljs';
import { CORES, TIPOS, type Config, type Dados, type TipoPeriodo } from '../dominio/tipos';
import { diasDoAno, MESES, primeiroDia, toDia } from '../dominio/datas';
import { diasMarcados, tipoDia } from '../dominio/calendario';
import { intervalosNoAno } from '../regras/util';

const solido = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
const fino: Partial<ExcelJS.Border> = { style: 'thin' };
const bordas: Partial<ExcelJS.Borders> = { top: fino, left: fino, bottom: fino, right: fino };

/** Ordem de pintura: o último vence em caso de sobreposição (que já é um conflito). */
const ORDEM_PINTURA: TipoPeriodo[] = ['licencaNaoProgramada', 'licencaProgramada', 'preFerias', 'ferias'];

export const LEGENDA: [string, string][] = [
  ['Dia de Remessa', CORES.remessa],
  ['Sábados e Domingos', CORES.fimDeSemana],
  ['Feriados Nacionais', CORES.feriadoNacional],
  ['Feriados em Recife', CORES.feriadoRecife],
  ['Férias ', TIPOS.ferias.cor],
  ['Pré-férias', TIPOS.preFerias.cor],
  ['Licenças não programadas', TIPOS.licencaNaoProgramada.cor],
  ['Licenças Programadas', TIPOS.licencaProgramada.cor],
  ['Recesso', CORES.recesso],
];

/** Gera o .xlsx no mesmo layout do rascunho (aba Planilha1). */
export async function exportarXlsx(dados: Dados, config: Config): Promise<ArrayBuffer> {
  const { ano } = config;
  const dias = diasDoAno(ano);
  const base = toDia(primeiroDia(ano));
  const ultimaCol = dias.length + 1;
  const colObs = ultimaCol + 1;
  const marcados = diasMarcados(dados.calendario);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha1', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  ws.getColumn(1).width = 43.54296875;
  ws.getColumn(2).width = 10.1796875;
  ws.getColumn(colObs).width = 18.26953125;

  // Linha 1: meses mesclados
  ws.getCell(1, 1).border = bordas;
  let c = 2;
  for (let m = 0; m < 12; m++) {
    const n = dias.filter((d) => Number(d.slice(5, 7)) === m + 1).length;
    const cel = ws.getCell(1, c);
    cel.value = MESES[m];
    cel.alignment = { horizontal: 'center' };
    cel.border = bordas;
    ws.mergeCells(1, c, 1, c + n - 1);
    c += n;
  }

  // Linha 2: cabeçalho de dias com cores do calendário do ano
  const r2 = ws.getRow(2);
  r2.height = 16;
  const a2 = r2.getCell(1);
  a2.value = 'Advogada(o) da União';
  a2.font = { name: 'Calibri', size: 12 };
  a2.alignment = { horizontal: 'center' };
  a2.border = { ...bordas, bottom: { style: 'double' } };
  const corDia: Record<string, string> = {
    remessa: CORES.remessa, recesso: CORES.recesso, feriadoNacional: CORES.feriadoNacional,
    feriadoRecife: CORES.feriadoRecife, fimDeSemana: CORES.fimDeSemana,
  };
  dias.forEach((iso, i) => {
    const cel = r2.getCell(i + 2);
    cel.value = Number(iso.slice(8, 10));
    cel.border = bordas;
    const t = tipoDia(iso, marcados);
    if (t) cel.fill = solido(corDia[t]);
  });

  // Blocos de núcleo + advogados
  let r = 3;
  for (const nuc of dados.nucleos) {
    const row = ws.getRow(r++);
    row.height = 16.5;
    for (let col = 1; col <= ultimaCol; col++) row.getCell(col).fill = solido(CORES.nucleo);
    const a = row.getCell(1);
    a.value = nuc.nome;
    a.font = { name: 'Calibri', size: 12, bold: true };
    a.alignment = { horizontal: 'center' };
    a.border = { left: fino, right: fino, bottom: { style: 'double' } };

    for (const adv of dados.advogados.filter((x) => x.nucleoId === nuc.id)) {
      const row = ws.getRow(r++);
      row.height = 15.75;
      const a = row.getCell(1);
      a.value = adv.nome;
      a.font = { name: 'Calibri', size: 12, bold: true };
      a.alignment = { horizontal: 'left', vertical: 'middle' };
      a.border = bordas;
      for (let col = 2; col <= ultimaCol; col++) row.getCell(col).border = bordas;
      for (const tipo of ORDEM_PINTURA)
        for (const iv of intervalosNoAno(adv, ano, [tipo]))
          for (let d = iv.inicio; d <= iv.fim; d++) row.getCell(d - base + 2).fill = solido(TIPOS[tipo].cor);
      if (adv.observacao) row.getCell(colObs).value = adv.observacao;
    }
  }

  // Legenda no rodapé (3 linhas em branco antes, como no modelo)
  r += 3;
  const leg = ws.getCell(r++, 1);
  leg.value = 'Legendas';
  leg.font = { name: 'Calibri', size: 12, bold: true };
  leg.alignment = { horizontal: 'center' };
  leg.border = bordas;
  for (const [texto, cor] of LEGENDA) {
    const cel = ws.getCell(r, 1);
    ws.getRow(r++).height = 15.5;
    cel.value = texto;
    cel.font = { name: 'Calibri', size: 12, bold: true };
    cel.alignment = { horizontal: 'center', vertical: 'middle' };
    cel.border = bordas;
    cel.fill = solido(cor);
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export const nomeArquivoExport = (ano: number, agora = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `FERIAS_${ano}_${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}.xlsx`;
};
