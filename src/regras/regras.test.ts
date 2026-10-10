import { describe, expect, it } from 'vitest';
import type { Advogado, Estado, Periodo, TipoPeriodo } from '../dominio/tipos';
import { estadoInicial } from '../dominio/estado';
import { pascoa } from '../dominio/calendario';
import { agruparConsecutivos, diasNoAno, parseBR } from '../dominio/datas';
import { validar } from '.';
import { limiteEfetivo } from './util';

let seq = 0;
const per = (tipo: TipoPeriodo, inicio: string, fim: string): Periodo => ({ id: `p${++seq}`, tipo, inicio, fim });
const fer = (i: string, f: string) => per('ferias', `2027-${i}`, `2027-${f}`);
const pre = (i: string, f: string) => per('preFerias', `2027-${i}`, `2027-${f}`);

/** Estado com núcleos de tamanhos dados; cada advogado recebe os períodos da lista (por índice). */
function montar(tamanhos: Record<string, number>, periodos: Record<string, Periodo[]> = {}): Estado {
  const e = estadoInicial(2027);
  for (const [nuc, n] of Object.entries(tamanhos)) {
    e.nucleos.push({ id: nuc, nome: nuc });
    for (let i = 0; i < n; i++) {
      const id = `${nuc}-${i}`;
      e.advogados.push({ id, nome: `Adv ${id}`, nucleoId: nuc, observacao: '', periodos: periodos[id] ?? [] } as Advogado);
    }
  }
  return e;
}
const daRegra = (e: Estado, id: string) => validar(e).filter((c) => c.regraId === id);

describe('limiteEfetivo — arredondamento', () => {
  it('mais próximo (padrão): 2→1, 5→2, 16→5', () => {
    expect([2, 5, 16].map((n) => limiteEfetivo(n, 30, 'proximo', 1))).toEqual([1, 2, 5]);
  });
  it('para baixo: 2→1 (mínimo), 5→1, 16→4', () => {
    expect([2, 5, 16].map((n) => limiteEfetivo(n, 30, 'baixo', 1))).toEqual([1, 1, 4]);
  });
  it('para cima: 2→1, 5→2, 16→5; 10 a 30% = 3 exato', () => {
    expect([2, 5, 16, 10].map((n) => limiteEfetivo(n, 30, 'cima', 1))).toEqual([1, 2, 5, 3]);
  });
  it('mínimo nunca excede o efetivo', () => {
    expect(limiteEfetivo(1, 30, 'baixo', 2)).toBe(1);
    expect(limiteEfetivo(0, 30, 'proximo', 1)).toBe(0);
  });
});

describe('limite-nucleo-30pct', () => {
  it('núcleo de 2: dois afastados no mesmo dia excede (limite 1)', () => {
    const e = montar({ C: 2 }, { 'C-0': [fer('07-10', '07-20')], 'C-1': [pre('07-18', '07-25')] });
    const c = daRegra(e, 'limite-nucleo-30pct');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ inicio: '2027-07-18', fim: '2027-07-20', advogadoIds: ['C-0', 'C-1'] });
    expect(c[0].mensagem).toContain('18/07 a 20/07');
    expect(c[0].mensagem).toContain('limite 1 de 2');
  });
  it('núcleo de 5: 2 ok, 3 excede', () => {
    const ok = montar({ N: 5 }, { 'N-0': [fer('07-01', '07-10')], 'N-1': [fer('07-01', '07-10')] });
    expect(daRegra(ok, 'limite-nucleo-30pct')).toHaveLength(0);
    const ruim = montar({ N: 5 }, { 'N-0': [fer('07-01', '07-10')], 'N-1': [fer('07-01', '07-10')], 'N-2': [fer('07-10', '07-12')] });
    const c = daRegra(ruim, 'limite-nucleo-30pct');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ inicio: '2027-07-10', fim: '2027-07-10', detalhes: { afastados: 3, limite: 2 } });
  });
  it('núcleo de 16: 5 ok, 6 excede', () => {
    const p: Record<string, Periodo[]> = {};
    for (let i = 0; i < 6; i++) p[`E-${i}`] = [fer('03-01', '03-05')];
    expect(daRegra(montar({ E: 16 }, p), 'limite-nucleo-30pct')).toHaveLength(1);
    delete p['E-5'];
    expect(daRegra(montar({ E: 16 }, p), 'limite-nucleo-30pct')).toHaveLength(0);
  });
  it('agrupa dias consecutivos e separa quando o conjunto muda', () => {
    const e = montar({ C: 2 }, { 'C-0': [fer('01-01', '01-31')], 'C-1': [fer('01-05', '01-07'), pre('01-10', '01-11')] });
    const c = daRegra(e, 'limite-nucleo-30pct');
    expect(c.map((x) => [x.inicio, x.fim])).toEqual([['2027-01-05', '2027-01-07'], ['2027-01-10', '2027-01-11']]);
  });
  it('período cruzando meses e 1º/último dia do ano', () => {
    const e = montar({ C: 2 }, { 'C-0': [fer('01-01', '02-03'), fer('12-20', '12-31')], 'C-1': [pre('01-31', '02-01'), pre('12-31', '12-31')] });
    const c = daRegra(e, 'limite-nucleo-30pct');
    expect(c.map((x) => [x.inicio, x.fim])).toEqual([['2027-01-31', '2027-02-01'], ['2027-12-31', '2027-12-31']]);
  });
  it('mudança de núcleo recalcula', () => {
    const e = montar({ A: 2, B: 5 }, { 'A-0': [fer('05-01', '05-10')], 'B-0': [fer('05-01', '05-10')] });
    expect(daRegra(e, 'limite-nucleo-30pct')).toHaveLength(0);
    e.advogados.find((a) => a.id === 'B-0')!.nucleoId = 'A'; // A passa a ter 3 (limite 1), com 2 afastados
    const c = daRegra(e, 'limite-nucleo-30pct');
    expect(c).toHaveLength(1);
    expect(c[0].nucleoId).toBe('A');
  });
  it('a mesma pessoa com períodos sobrepostos conta uma vez', () => {
    const e = montar({ N: 5 }, { 'N-0': [fer('07-01', '07-10'), pre('07-05', '07-12')], 'N-1': [fer('07-01', '07-10')] });
    expect(daRegra(e, 'limite-nucleo-30pct')).toHaveLength(0);
  });
  it('licenças não contam por padrão; regra opcional as inclui', () => {
    const e = montar({ C: 2 }, { 'C-0': [fer('07-01', '07-10')], 'C-1': [per('licencaProgramada', '2027-07-05', '2027-07-06')] });
    expect(daRegra(e, 'limite-nucleo-30pct')).toHaveLength(0);
    e.config.regras['licencas-contam-limite'].ativa = true;
    expect(daRegra(e, 'licencas-contam-limite')).toHaveLength(1);
  });
});

describe('máximos de dias', () => {
  it('férias: 35 dias → 5 a mais; 30 ok', () => {
    const e = montar({ C: 1 }, { 'C-0': [fer('01-01', '01-20'), fer('06-01', '06-15')] });
    const c = daRegra(e, 'max-dias-ferias-30');
    expect(c).toHaveLength(1);
    expect(c[0].mensagem).toContain('35 dias');
    expect(c[0].mensagem).toContain('5 a mais');
    expect(daRegra(montar({ C: 1 }, { 'C-0': [fer('01-01', '01-30')] }), 'max-dias-ferias-30')).toHaveLength(0);
  });
  it('pré-férias: 22 dias → 1 a mais', () => {
    const c = daRegra(montar({ C: 1 }, { 'C-0': [pre('02-01', '02-22')] }), 'max-dias-pre-ferias-21');
    expect(c[0].detalhes).toMatchObject({ excesso: 1 });
  });
});

describe('sobreposição e validade', () => {
  it('férias e pré-férias no mesmo dia', () => {
    const c = daRegra(montar({ C: 1 }, { 'C-0': [fer('07-01', '07-10'), pre('07-10', '07-15')] }), 'sem-sobreposicao-mesmo-advogado');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ inicio: '2027-07-10', fim: '2027-07-10' });
  });
  it('fim antes do início, vazio, fora do ano', () => {
    const e = montar({ C: 1 }, {
      'C-0': [fer('07-10', '07-01'), per('ferias', '', '2027-01-01'), per('preFerias', '2026-12-30', '2027-01-02')],
    });
    const c = daRegra(e, 'periodo-valido');
    expect(c).toHaveLength(3);
    expect(c[0].mensagem).toContain('antes do início');
  });
  it('dias fora do ano não contam no saldo', () => {
    const e = montar({ C: 1 }, { 'C-0': [per('ferias', '2026-12-01', '2027-01-31')] });
    expect(daRegra(e, 'max-dias-ferias-30')).toHaveLength(1); // 31 dias dentro de 2027
  });
});

describe('opcionais e datas', () => {
  it('opcionais vêm desligadas', () => {
    const e = montar({ C: 1 }, { 'C-0': [fer('01-02', '01-02'), fer('01-03', '01-03'), fer('01-04', '01-04'), fer('01-05', '01-05')] });
    expect(daRegra(e, 'max-periodos-ferias')).toHaveLength(0);
    e.config.regras['max-periodos-ferias'].ativa = true;
    e.config.regras['bloco-minimo'].ativa = true;
    e.config.regras['inicio-em-dia-util'].ativa = true;
    expect(daRegra(e, 'max-periodos-ferias')).toHaveLength(1);
    expect(daRegra(e, 'bloco-minimo')).toHaveLength(4);
    expect(daRegra(e, 'inicio-em-dia-util').length).toBe(2); // 02/01/2027 sáb, 03/01 dom
  });
  it('Páscoa e bissextos', () => {
    expect(pascoa(2027)).toBe('2027-03-28');
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(diasNoAno(2027)).toBe(365);
    expect(diasNoAno(2028)).toBe(366);
  });
  it('utilitários de data', () => {
    expect(parseBR('5/7/2027')).toBe('2027-07-05');
    expect(parseBR('31/02/2027')).toBeNull();
    expect(agruparConsecutivos([1, 2, 3, 5, 7, 8])).toEqual([{ inicio: 1, fim: 3 }, { inicio: 5, fim: 5 }, { inicio: 7, fim: 8 }]);
  });
});
