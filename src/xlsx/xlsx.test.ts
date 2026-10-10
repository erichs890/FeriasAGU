import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { Dados } from '../dominio/tipos';
import { configPadrao, dadosExemplo } from '../dominio/estado';
import { toDia } from '../dominio/datas';
import { validar } from '../regras';
import { diasUsados } from '../regras/util';
import { exportarXlsx } from './exportar';
import { corCelula, ErroImportacao, importarXlsx, marcaDaCor } from './importar';

/** Forma comparável do estado: sem ids, períodos ordenados e adjacentes do mesmo tipo fundidos. */
function forma(d: Dados) {
  const nomeNuc = new Map(d.nucleos.map((n) => [n.id, n.nome]));
  return {
    nucleos: d.nucleos.map((n) => n.nome),
    advogados: d.advogados.map((a) => {
      const ps = [...a.periodos].sort((x, y) => x.inicio.localeCompare(y.inicio));
      const fundidos: { tipo: string; inicio: string; fim: string }[] = [];
      for (const p of ps) {
        const u = fundidos[fundidos.length - 1];
        if (u && u.tipo === p.tipo && toDia(p.inicio) === toDia(u.fim) + 1) u.fim = p.fim;
        else fundidos.push({ tipo: p.tipo, inicio: p.inicio, fim: p.fim });
      }
      return { nome: a.nome, nucleo: nomeNuc.get(a.nucleoId), observacao: a.observacao, periodos: fundidos };
    }),
    remessa: d.calendario.remessa.map((e) => [e.inicio, e.fim]),
    recesso: d.calendario.recesso.map((e) => [e.inicio, e.fim]),
  };
}

const paraBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('cores', () => {
  it('tolera tema/tint e rejeita fim de semana', () => {
    expect(marcaDaCor('FF0000')).toBe('ferias');
    expect(marcaDaCor('FEFE02')).toBe('preFerias');
    expect(marcaDaCor('FFC000')).toBeNull();
    expect(marcaDaCor('F8CBAD')).toBe('recesso');
    const wb = new ExcelJS.Workbook();
    const c = wb.addWorksheet('x').getCell('A1');
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 1, tint: 0.35 } as never };
    expect(corCelula(c)).toBe('595959');
  });
});

describe('exportar → importar (round-trip)', () => {
  it('devolve o mesmo estado', async () => {
    const config = configPadrao(2027);
    const dados = dadosExemplo(2027);
    // Sobreposição do mesmo advogado (conflito) não sobrevive: uma célula guarda uma só cor.
    const hugo = dados.advogados.find((a) => a.nome === 'Hugo Hipotético')!;
    hugo.periodos = hugo.periodos.filter((p) => p.tipo !== 'preFerias');
    dados.calendario.remessa = [{ id: 'r', inicio: '2027-03-10', fim: '2027-03-10', descricao: '', ativo: true }];
    dados.calendario.recesso = [{ id: 'x', inicio: '2027-12-20', fim: '2027-12-31', descricao: '', ativo: true }];
    const buf = await exportarXlsx(dados, config);
    const { dados: lidos, avisos } = await importarXlsx(buf, 2027);
    expect(avisos).toEqual([]);
    expect(forma(lidos)).toEqual(forma(dados));
    // e uma segunda volta também é estável
    const de_novo = await importarXlsx(await exportarXlsx(lidos, config), 2027);
    expect(forma(de_novo.dados)).toEqual(forma(dados));
  });

  it('layout: meses mesclados, freeze em B3, cores do cabeçalho de 2027', async () => {
    const buf = await exportarXlsx(dadosExemplo(2027), configPadrao(2027));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Planilha1');
    expect(ws.getCell('B1').value).toBe('Janeiro');
    expect(ws.getCell('AF1').isMerged).toBe(true);
    expect(ws.getCell('NB2').value).toBe(31); // 365ª coluna de dia = 31/12
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 2 });
    expect(corCelula(ws.getCell('B2'))).toBe('92D050'); // 01/01 feriado
    expect(corCelula(ws.getCell('C2'))).toBe('FFC000'); // 02/01/2027 sábado
  });

  it('erro claro para estrutura desconhecida', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x').getCell('B2').value = 'abc';
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    await expect(importarXlsx(buf, 2027)).rejects.toThrow(ErroImportacao);
    await expect(importarXlsx(buf, 2027)).rejects.toThrow(/Linha 2, coluna B/);
  });
});

const MODELO = 'modelo/RASCUNHO_FERIAS_2026.xlsx';
describe.skipIf(!existsSync(MODELO))('planilha modelo real (local, não versionada)', () => {
  it('importa núcleos, advogados e totais pintados; acusa excessos', async () => {
    const { dados } = await importarXlsx(paraBuffer(readFileSync(MODELO)), 2027);
    expect(dados.nucleos.map((n) => n.nome)).toEqual(['Coordenação', 'NUG/CORESE', 'NUESP/CORESE', 'TRAB/CORESE']);
    expect(dados.advogados).toHaveLength(25);
    const tot = (i: number) => [diasUsados(dados.advogados[i], 2027, 'ferias'), diasUsados(dados.advogados[i], 2027, 'preFerias')];
    // contagens conferidas célula a célula com openpyxl
    expect(tot(0)).toEqual([30, 8]);
    expect(tot(2)).toEqual([35, 21]);
    expect(tot(9)).toEqual([43, 28]);
    expect(tot(12)).toEqual([45, 35]);
    expect(tot(22)).toEqual([0, 0]); // advogado sem dias também é importado
    expect(tot(24)).toEqual([31, 21]);
    expect(dados.advogados[1].observacao).toBe('5 dias ano anterior');
    const conflitos = validar({ config: configPadrao(2027), ...dados });
    expect(conflitos.filter((c) => c.regraId === 'max-dias-ferias-30').length).toBeGreaterThan(0);

    const config = configPadrao(2027);
    const volta = await importarXlsx(await exportarXlsx(dados, config), 2027);
    expect(forma(volta.dados)).toEqual(forma(dados));
  });
});
