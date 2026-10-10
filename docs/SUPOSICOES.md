# Suposições adotadas

Tudo que é configurável está indicado; o resto é decisão de implementação e pode mudar.

## Análise da planilha modelo (`modelo/RASCUNHO_FERIAS_2026.xlsx`)

- Aba `Planilha1`. Linha 1: meses mesclados (`B1:AF1`, `AG1:BH1`…). Linha 2: `A2 = "Advogada(o) da União"` e dias 1…31 de `B` a `NB` (365 colunas). Observações em `NC`.
- Linhas de núcleo: coluna A em negrito, fundo tema 1 + tint 0,35 = **`#595959`**. As linhas 3, 6, 12 e 33–43 têm mesclagens de 3 em 3 colunas sem conteúdo (resíduo de edição). **Não são reproduzidas**, pois não mudam o visual.
- Linhas de advogado: nome em negrito (Calibri 12); células de dia vazias, só com cor. Há também células com fundo branco de tema (tema 0); elas são ignoradas.
- Feriado em Recife em 06/03 (cinza no modelo; é a Data Magna de Pernambuco): **incluído** no padrão, além de 24/06, 16/07 e 08/12.
- Recesso na legenda: tema 5 + tint 0,6. O tema do arquivo é o Office 2023 (accent2 = `E97132`), o que resulta em **`#F6C6AD`**. Esse valor é usado na exportação. Na importação, `F8CBAD` (Office 2013) também é aceito.
- Na legenda do modelo, "Feriados em Recife" usa tema 0 −0,25 (`BFBFBF`), mas o cabeçalho usa `AEAAAA`. A exportação usa `AEAAAA` nos dois lugares.
- Colunas de dia usam a largura padrão do Excel; só `B` tem 10,18. Coluna A = 43,54; observações = 18,27.

## Regras

- **Arredondamento do limite:** padrão "mais próximo, meio para cima, mínimo 1" (2→1, 5→2, 16→5). O limite nunca passa do total de pessoas do núcleo. O percentual real (ex.: 2 de 5 = 40%) aparece ao lado de cada núcleo, com ⚠ quando passa do percentual configurado.
- Uma pessoa com férias e pré-férias sobrepostas conta **uma vez** no limite do núcleo (a sobreposição já é um conflito separado).
- Dias de um período fora do ano de trabalho geram o conflito `periodo-valido` e **não contam** nas demais regras (saldo e limite).
- Os conflitos de limite são agrupados por intervalo de dias consecutivos **com o mesmo conjunto de pessoas afastadas**. Quando o conjunto muda, abre-se um novo item.
- "Conflito novo" (o que abre o modal) = conflito que não existia antes da alteração, com mesma regra, núcleo, pessoas, datas e mensagem.
- As cotas das barras de saldo (30/21) são fixas. As regras de máximo têm o parâmetro `maxDias` editável em Configurações.
- Regra opcional `licencas-contam-limite`: só aponta os dias que excedem **por causa** das licenças, para não duplicar os alertas da regra principal.
- Regra opcional `antecedencia-minima`: compara com a data de hoje e ignora períodos já iniciados. A planilha não guarda a data do pedido.
- O feriado de 15/10 (marcado no rascunho, motivo desconhecido) vem **desativado** em Calendário. Basta marcar a caixa para ativá-lo.

## Importação / exportação

- O ano informado na importação mapeia cada coluna para dia/mês daquele ano. Assim, o rascunho 2026 é lido como 2027 com os mesmos dias e meses. Feriados e fins de semana **não** são lidos da planilha: são recalculados para o ano.
- Linha de núcleo = célula A com preenchimento escuro. Linha de advogado = célula A sem preenchimento. A leitura para na primeira linha vazia ou em `Legendas`.
- As cores são comparadas por proximidade (distância RGB < 40). Assim, tons levemente diferentes e cores de tema/tint são aceitos, e o laranja de fim de semana não vira pré-férias.
- **Remessa e recesso** pintados no cabeçalho ou em linhas de advogado vão para o **calendário global** (Calendário → Dias de remessa / Recesso). Não há "remessa por advogado" no modelo de dados.
- Na exportação, remessa e recesso têm prioridade sobre feriados no cabeçalho. Assim, um recesso que inclui o Natal volta inteiro na reimportação.
- **Limite do round-trip:** uma célula guarda só uma cor. Se o mesmo advogado tiver férias e pré-férias no mesmo dia (já é um conflito), a exportação pinta férias e a pré-férias desse dia se perde. Períodos adjacentes do mesmo tipo (ex.: 01–10 e 11–20) voltam fundidos num só (01–20), com os mesmos dias.
- Mesclar importação: núcleos e advogados são casados por nome normalizado (sem acento, caixa ou espaços extras). Períodos idênticos não se repetem. A observação existente é mantida.
- A exportação adiciona painéis congelados em `B3`. As mesclagens residuais do modelo não são copiadas.

## Persistência e histórico

- Chaves no localStorage: `feriasAGU:estado` (estado + histórico) e `feriasAGU:desfazer` (pilha de desfazer/refazer). A pilha é salva "enquanto couber": se faltar espaço, as entradas mais antigas são descartadas.
- O log de alterações guarda as últimas 1000 entradas. Os snapshots ficam limitados a 50 só para os **automáticos**. Os manuais nunca são descartados automaticamente; se forem muitos, o limite é ultrapassado.
- O snapshot automático "a cada N alterações" usa N = 20, contadas desde que a página foi aberta.
- O log não registra "quem", porque o app é monousuário e local.
- A configuração (ano, percentual, regras, tema) não entra no desfazer/refazer nem nos snapshots. "Limpar sessão" a mantém.
- Na segunda confirmação, para habilitar o botão, basta digitar `LIMPAR` **ou** esperar 3 s. "Apagar histórico" exige digitar `APAGAR HISTÓRICO`, sem espera.
- Importar substituindo, carregar o exemplo e restaurar um backup JSON usam a mesma dupla confirmação.
