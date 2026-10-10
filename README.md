# Férias AGU

Aplicação local para planejar as férias e pré-férias dos advogados da unidade. Ela valida as regras em tempo real e importa/exporta a planilha `.xlsx` no mesmo layout do rascunho. Roda 100% offline: nenhum dado sai do computador.

## Instalação e uso

1. Instale o **Node.js LTS**: <https://nodejs.org/pt-br/download>
2. Dê dois cliques em **`start.bat`**. Na primeira vez ele instala as dependências (alguns minutos). Em todas as vezes ele gera a versão de produção, sobe o servidor em **http://localhost:5173** e abre o navegador.
3. Para encerrar, feche a janela preta do `start.bat`.

No Linux/macOS, use `./start.sh`.

> **Use sempre o mesmo endereço (`localhost:5173`).** Os dados ficam no navegador (localStorage), separados por endereço. Em outra porta, o app mostra uma sessão vazia. Por isso o `start.bat` **não** troca de porta: se a 5173 estiver ocupada, ele avisa. Em **Configurações** aparece o endereço em uso.

### Primeiros passos

- **Importar/Exportar → Importar planilha:** escolha o `.xlsx`, informe o ano (padrão 2027) e clique em **Ler arquivo**. A pré-visualização mostra núcleos, advogados, períodos e conflitos. Depois escolha **Mesclar** ou **Substituir** (dupla confirmação; um snapshot automático é criado antes).
- Ou use **Carregar exemplo** para testar com dados fictícios.
- **Planejamento:** é a grade igual à planilha. **Arraste** numa linha para criar um período (o tipo é escolhido no diálogo) e **clique** num período para editar ou excluir. Abaixo de cada núcleo, a linha **Ocupação** mostra quantos estão afastados por dia: verde abaixo do limite, amarelo no limite, vermelho acima.
- **Exportar:** gera `FERIAS_2027_AAAA-MM-DD_HHmm.xlsx` com feriados e fins de semana do ano, legenda e painéis congelados em B3.

### Telas

| Tela | O que faz |
|---|---|
| Planejamento | Grade anual com filtros por núcleo/advogado, zoom por mês, tooltips e destaque de conflitos (⚠ no nome, células hachuradas com "!") |
| Advogados | CRUD de núcleos (renomear, reordenar, excluir só se vazio, mostra o limite efetivo) e de advogados (núcleo, observação, saldo, períodos, ordem) |
| Conflitos | Lista agrupada por regra; clique para ir ao ponto na grade |
| Calendário | Feriados nacionais, de Recife, remessa e recesso (editáveis; o 15/10 vem desmarcado) |
| Importar/Exportar | `.xlsx`, backup JSON completo e dados de exemplo |
| Histórico | Desfazer/refazer, snapshots (criar, comparar, restaurar, excluir), log, limpar sessão |
| Configurações | Ano, % de afastamento, arredondamento, mínimo, regras liga/desliga e parâmetros, tema |

### Atalhos

| Tecla | Ação |
|---|---|
| `Ctrl+Z` | Desfazer |
| `Ctrl+Y` ou `Ctrl+Shift+Z` | Refazer |
| `Esc` | Fechar diálogo |
| `Enter` | Salvar o formulário aberto |

## Regras implementadas

| id | Padrão | O que verifica |
|---|---|---|
| `limite-nucleo-30pct` | ligada | No máximo X% do núcleo em férias **ou** pré-férias por dia. O arredondamento é configurável; o padrão é "mais próximo, mínimo 1": 2→1, 5→2, 16→5 |
| `max-dias-ferias-30` | ligada | Até 30 dias corridos de férias no ano |
| `max-dias-pre-ferias-21` | ligada | Até 21 dias corridos de pré-férias |
| `sem-sobreposicao-mesmo-advogado` | ligada | Um dia, um tipo por pessoa |
| `periodo-valido` | ligada | Campos preenchidos, fim ≥ início, dentro do ano |
| `max-periodos-ferias` | desligada | Máximo de blocos de férias |
| `bloco-minimo` | desligada | Tamanho mínimo de cada período |
| `inicio-em-dia-util` | desligada | Não iniciar em fim de semana ou feriado |
| `licencas-contam-limite` | desligada | Licenças entram no limite do núcleo |
| `antecedencia-minima` | desligada | Períodos futuros com N dias de antecedência |

Saldo incompleto (menos de 30/21 dias) **não** é conflito: aparece em laranja nas barras de saldo.

### Como adicionar uma regra nova

1. Crie `src/regras/minhaRegra.ts` exportando um objeto `Regra` (veja `src/regras/tipos.ts` e, como exemplo, `src/regras/opcionais.ts`):

   ```ts
   export const minhaRegra: Regra = {
     id: 'minha-regra',
     nome: 'Nome exibido',
     descricao: 'O que a regra exige.',
     ativa: true,                       // padrão
     parametros: { dias: 10 },          // editáveis em Configurações
     rotulos: { dias: 'Dias' },
     validar: (estado, p) => [/* Conflito[] */],
   };
   ```
2. Inclua a regra na lista `REGRAS` em `src/regras/index.ts`.
3. Adicione um caso em `src/regras/regras.test.ts` e rode `npm test`.

A regra recebe `{ config, nucleos, advogados, calendario }` e não depende da interface. Use os utilitários de `src/regras/util.ts` (`intervalosNoAno`, `diasUsados`, `limiteDoNucleo`) e de `src/dominio/datas.ts`.

## Desenvolvimento

```sh
npm install
npm run dev      # servidor de desenvolvimento em :5173
npm test         # testes (Vitest): regras, importação, exportação e round-trip
npm run build    # checagem de tipos + build de produção em dist/
```

Estrutura:

```
src/
  dominio/   tipos, datas (aritmética em dias inteiros UTC), calendário/feriados, estado e exemplo
  regras/    motor de regras puro + uma regra por arquivo + testes
  xlsx/      exportar.ts / importar.ts (ExcelJS) + testes
  ui/        store (estado, desfazer, autosave, snapshots), telas e diálogos
docs/SUPOSICOES.md   decisões e suposições adotadas
```

Se existir em `modelo/RASCUNHO_FERIAS_2026.xlsx`, o modelo real é usado por um teste extra (conferência de totais e round-trip). A pasta `modelo/` está no `.gitignore` porque contém nomes reais.
