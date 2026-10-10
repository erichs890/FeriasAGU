# PROMPT — Aplicação local de gerenciamento de férias (ano 2027)

Você é um engenheiro de software sênior. Construa, do zero, uma **aplicação web local** para planejar as férias dos advogados de uma unidade da AGU, com validação automática de regras, importação e exportação de planilha `.xlsx` idêntica à planilha de rascunho que já uso hoje.

Leia TUDO antes de escrever código. Depois de ler, faça um **plano curto** (arquitetura, estrutura de pastas, modelo de dados, lista de suposições) e só então implemente. Não me faça perguntas que você consegue resolver com uma suposição razoável: registre a suposição em `docs/SUPOSICOES.md` e deixe configurável sempre que possível. Pergunte apenas se algo for realmente bloqueante.

---

## 1. Contexto e objetivo

Hoje o planejamento das férias é feito numa planilha (arquivo modelo: `modelo/RASCUNHO_FÉRIAS_2026.xlsx`, **copie-o para essa pasta do projeto e analise-o programaticamente**, célula por célula, antes de implementar a importação e a exportação). A ideia é substituí-la por uma aplicação onde eu:

1. Cadastro advogados (nome, núcleo) e os períodos de **férias** e **pré-férias** de cada um (CRUD).
2. Vejo, em tempo real, se alguma regra foi violada, com alerta imediato e explicação do conflito.
3. Exporto tudo para um `.xlsx` **visualmente igual** ao modelo.
4. Importo um `.xlsx` nesse formato (o modelo ou um exportado pelo próprio app) e o app deixa tudo pronto para editar.
5. Tenho persistência automática (localStorage), histórico de alterações e a opção de limpar a sessão com dupla confirmação.

O ano de trabalho é **2027** (o modelo atual está nomeado 2026; o ano deve ser um **parâmetro configurável**, padrão 2027, e na importação o app deve perguntar/confirmar o ano). Eu vou enviar mais detalhes sobre o funcionamento das férias depois, então **o motor de regras precisa ser extensível** (ver seção 5).

---

## 2. Regras de negócio (as que já tenho)

### 2.1 Núcleos
Os advogados são lotados em núcleos. No modelo existem estes grupos (linhas de cabeçalho em cinza, em negrito):

- **Coordenação** (hoje 2 advogados)
- **NUG/CORESE** (hoje 5 advogados)
- **NUESP/CORESE** (hoje 16 advogados)
- **TRAB/CORESE** (hoje 2 advogados) — aparece na planilha, embora eu só tenha citado os três primeiros. Trate como um núcleo normal, com as mesmas regras.

Os núcleos devem ser **cadastráveis** (criar, renomear, reordenar, excluir com proteção se houver advogados). A ordem dos núcleos e dos advogados na exportação é a ordem de exibição do app (advogados em ordem alfabética por padrão, com possibilidade de reordenar manualmente).

### 2.2 Limite de afastamento simultâneo — 30% por núcleo
Em **qualquer dia** do ano, no máximo **30% dos advogados de cada núcleo** podem estar afastados ao mesmo tempo. "Afastado" = estar em **férias OU pré-férias** naquele dia (os dois tipos contam para o limite, pois o regime de pré-férias também é afastamento).

Arredondamento — **ponto que precisa estar explícito na interface**: 30% de 2 ou 5 pessoas não é inteiro. Pelo que observei no rascunho (Coordenação com no máx. 1 afastado simultâneo; NUG até 2; NUESP até 4; TRAB 1), adote como padrão **arredondar para o inteiro mais próximo (meio para cima), com mínimo de 1**. Resultado com os efetivos atuais: Coordenação (2) → 1; NUG (5) → 2; NUESP (16) → 5; TRAB (2) → 1.
- Torne isso configurável em "Configurações": percentual (padrão 30), modo de arredondamento (`mais próximo` | `para baixo` | `para cima`) e mínimo (padrão 1). Mostre sempre, ao lado de cada núcleo, o **limite efetivo calculado** ("NUG: limite 2 de 5 = 30%") e **diga na tela qual regra de arredondamento está em vigor**.
- Aviso importante: com o arredondamento padrão, o limite efetivo pode exceder 30% estrito (ex.: 2 de 5 = 40%). Mostre esse percentual real ao lado do limite, para eu decidir se mudo a regra.
- O limite é recalculado automaticamente quando o número de advogados do núcleo muda.

### 2.3 Quantidade de dias por advogado
- Cada advogado tem **30 dias de férias** (pintados de **vermelho** `#FF0000`).
- Cada advogado tem **21 dias de pré-férias** (pintados de **amarelo** `#FFFF00`).
- Os dias são contados em **dias corridos** (incluem sábados, domingos e feriados), como na planilha: um período é um intervalo `início → fim` inclusive.
- Os dias são distribuídos ao longo do ano conforme a escolha do advogado, em **um ou mais períodos** (ex.: 10 + 20, ou 3 blocos). Não imponha quantidade mínima/máxima de períodos nem tamanho mínimo de bloco por padrão (deixe como regra opcional desligada, ver seção 5).
- Cada advogado deve mostrar um **saldo**: `Férias: 30/30 · Pré-férias: 21/21` com barra de progresso, e o que falta/sobra.

### 2.4 O que é "conflito" (alerta imediato)
Qualquer um destes é um conflito e deve disparar alerta **imediatamente** (na hora em que o dado é digitado/alterado/importado), mencionando exatamente o que está errado:

1. **Excesso de afastamento no núcleo:** num dia D, o número de advogados do núcleo N em férias ou pré-férias excede o limite. A mensagem deve dizer: o núcleo, a(s) data(s) (agrupe dias consecutivos em intervalos, ex.: "12/07 a 18/07"), quantos estariam afastados vs. o limite, e **quais advogados** estão afastados naquele intervalo.
2. **Excesso de dias de férias:** advogado com mais de 30 dias de férias no ano (informar quantos a mais).
3. **Excesso de dias de pré-férias:** advogado com mais de 21 dias (informar quantos a mais).
4. **Sobreposição de períodos do mesmo advogado:** férias e pré-férias (ou dois períodos) cobrindo o mesmo dia — um dia só pode ter um tipo para a mesma pessoa.
5. **Período inválido:** fim antes do início, datas fora do ano de trabalho, campos vazios.

**Não é conflito, mas deve ser sinalizado como "pendente" (laranja/informativo):** advogado com menos de 30 dias de férias ou menos de 21 de pré-férias ainda não distribuídos. Isso é só progresso de planejamento.

### 2.5 Comportamento do alerta
- Ao criar/editar/excluir um período ou mudar o núcleo de alguém, rode a validação **imediatamente** e, se houver conflito **novo**, abra um **modal de alerta** descrevendo cada conflito (regra violada, núcleo, datas, pessoas, números). Botões: **"Voltar e corrigir"** (padrão) e **"Salvar mesmo assim"** (com confirmação extra, pois o conflito ficará registrado).
- Conflitos existentes ficam **sempre visíveis**: um painel/contador "⚠ N conflitos" no topo, com lista clicável (clicar leva ao advogado/período/dia no calendário), e destaque visual nas células/linhas envolvidas (borda vermelha, ícone).
- Na **importação**, valide tudo ao final e mostre o relatório de conflitos encontrados (é esperado que o rascunho antigo tenha algumas violações; mostre-as sem bloquear a importação).
- A validação deve ser **determinística e rápida** (365 dias × ~25 pessoas é trivial): recalcule sempre do zero a partir dos períodos, sem estado derivado persistido.

---

## 3. Formato da planilha (exportação e importação)

Analise o arquivo modelo com ExcelJS/openpyxl e reproduza fielmente. O que já descobri:

**Estrutura (aba `Planilha1`):**
- **Linha 1:** nomes dos meses (Janeiro…Dezembro), cada um **mesclado** sobre as colunas dos seus dias.
- **Linha 2:** `A2 = "Advogada(o) da União"`; a partir de `B2`, o número do dia do mês (1…31, etc.), uma coluna por dia do ano. São **365 colunas** de dias (`B` até `NB`) — em 2027 também são 365 (não é bissexto); trate bissextos corretamente por segurança.
- **Coluna A:** nomes. **Linhas de núcleo** (ex.: `Coordenação`, `NUG/CORESE`, `NUESP/CORESE`, `TRAB/CORESE`): negrito, linha toda com preenchimento cinza escuro (no modelo é tema 1 com tint 0.35 ≈ `#595959`; confira). **Linhas de advogados**: abaixo do seu núcleo, nome em negrito.
- **Células de dia por advogado:** vazias, só com **preenchimento de cor** (sem texto). Vermelho `FF0000` = férias; amarelo `FFFF00` = pré-férias.
- **Coluna após o último dia (`NC` no modelo):** observações livres por advogado. Exemplos reais: `"5 dias ano anterior"`, `"10 dias p/2027"`, `"de 04 a 13.01 + 10d"`, `"29.12 a 07.01"`. Isso indica **saldos/dias de ano anterior ou para o próximo ano**; modele como campo `observacao` (texto livre) por advogado e preserve-o na importação/exportação. Não tente interpretar esse texto automaticamente.
- **Linha 2, colunas de dia (cabeçalho do dia):** recebe cor conforme o calendário: Sábados e domingos `FFC000` (laranja), Feriados nacionais `92D050` (verde), Feriados em Recife `AEAAAA` (cinza). **Esses dias devem ser recalculados para o ano de trabalho** (no modelo são do calendário de 2026; não copie as cores do modelo, regenere para 2027).
- **Legenda** no rodapé (coluna A, com a respectiva cor de fundo em cada linha, texto em negrito), nesta ordem: `Legendas` · `Dia de Remessa` (azul claro `00B0F0`) · `Sábados e Domingos` (`FFC000`) · `Feriados Nacionais` (`92D050`) · `Feriados em Recife` (cinza `AEAAAA`) · `Férias ` (`FF0000`) · `Pré-férias` (`FFFF00`) · `Licenças não programadas` (roxo `7030A0`) · `Licenças Programadas` (azul `0070C0`) · `Recesso` (laranja claro, tema 5 tint 0.6 ≈ `F8CBAD`; confira no arquivo).
- Fonte Calibri 11; larguras: coluna A ≈ 43,5; colunas de dia estreitas (confira no modelo e replique); coluna de observações larga (≈ 18). Altura das linhas conforme o modelo. Confira também bordas, alinhamento e congelamento de painéis (o modelo não tem freeze; **adicione freeze em `B3`** na exportação para facilitar a leitura, é uma melhoria bem-vinda).

**Exportar:** gerar `.xlsx` com ExcelJS (suporta fills, merges, larguras) com as 365 colunas, meses mesclados, cores de legenda e fins de semana/feriados do ano de trabalho, um bloco por núcleo, advogados em cada núcleo, períodos pintados (vermelho/amarelo), licenças e remessa se cadastrados, observações, e a legenda no rodapé. Nome do arquivo: `FERIAS_2027_AAAA-MM-DD_HHmm.xlsx`. **Teste de aceitação:** exportar o estado importado do modelo e abrir os dois lado a lado; as células pintadas por advogado devem coincidir (após o ajuste de calendário).

**Importar:** ler `.xlsx` nesse formato e transformar em dados editáveis:
- Detectar meses pelos merges da linha 1 e dias pela linha 2 para mapear coluna → data (usando o ano escolhido).
- Detectar linhas de núcleo (negrito + fundo cinza escuro, sem dados de dia) e linhas de advogado (as que vêm abaixo, até o próximo núcleo ou até a linha em branco antes da legenda). Parar de ler advogados ao encontrar linha vazia / `Legendas`.
- Ler a **cor de preenchimento** de cada célula de dia (RGB `FFFF0000` → férias, `FFFFFF00` → pré-férias, `FF7030A0` → licença não programada, `FF0070C0` → licença programada, `FF00B0F0` → remessa se estiver em linha de advogado). Ignorar fundos brancos/tema e outros. Considere cores vindas de tema/tint do Excel de forma tolerante.
- **Agrupar dias consecutivos da mesma cor em períodos** (`início → fim`). Dias cobertos por fim de semana contam normalmente porque a contagem é em dias corridos.
- Ler a coluna de observações.
- Mostrar uma **pré-visualização** da importação (n advogados, n núcleos, n períodos, conflitos detectados) e perguntar se deseja **substituir** a sessão atual ou **mesclar**. Substituir exige a dupla confirmação da seção 4.4 e gera snapshot automático antes.
- Tolerar variações: espaços extras em nomes ("Férias "), linha de núcleo com nome ligeiramente diferente, advogados sem nenhuma célula pintada (ex.: um advogado com zero dias no modelo) — **importar mesmo assim**.
- Se a estrutura não for reconhecida, mostrar erro claro e específico (qual linha/coluna falhou).

---

## 4. Funcionalidades da aplicação

### 4.1 CRUD
- **Advogados:** criar, editar (nome, núcleo, observação), excluir (com confirmação), mover de núcleo, reordenar.
- **Períodos de cada advogado:** criar/editar/excluir períodos com `tipo` (Férias | Pré-férias | Licença programada | Licença não programada), `início`, `fim` (selecionados em calendário e também digitáveis `dd/mm/aaaa`), e **contagem automática de dias** do período. Atalhos: informar início + quantidade de dias e calcular o fim; botão "usar saldo restante" que preenche a quantidade que falta.
- **Núcleos:** CRUD simples (ver 2.1).
- **Calendário global:** cadastro editável de feriados nacionais, feriados em Recife, dias de remessa e recesso (data ou intervalo, com descrição). Pré-popular para 2027: calcular feriados móveis (Páscoa 28/03/2027 → Sexta-feira Santa 26/03; Carnaval 08 e 09/02 e Quarta de Cinzas 10/02; Corpus Christi 27/05) e os fixos nacionais (01/01, 21/04, 01/05, 07/09, 12/10, 28/10 [Dia do Servidor Público, como ponto facultativo], 02/11, 15/11, 20/11, 25/12). Feriados em Recife a partir do que vi no modelo: 24/06, 16/07 e 08/12 (confirmável/editável). Tudo editável porque posso corrigir. Observação: o modelo marca 15/10 como feriado e não tenho certeza do motivo; deixe **desmarcado por padrão e fácil de ativar**.
- Feriados, fins de semana e recesso **não alteram a contagem** de dias (dias corridos) nem entram na regra dos 30%; servem como referência visual e na exportação.

### 4.2 Telas
Interface em **português (pt-BR)**, limpa, moderna, responsiva em desktop, com tema claro/escuro. Uma navegação simples com:

1. **Planejamento (principal):** visão em grade igual à planilha (advogados nas linhas agrupados por núcleo, dias nas colunas agrupados por mês, rolagem horizontal com coluna de nomes e cabeçalho fixos). Células vermelhas/amarelas refletem os períodos. Selecionar um intervalo arrastando na grade cria um período (perguntar o tipo). Clicar num período edita/exclui. Abaixo (ou no cabeçalho de cada núcleo) uma **linha de ocupação** que mostra por dia quantos do núcleo estão afastados vs. o limite, em cor (verde → amarelo perto do limite → vermelho acima). Filtros: por núcleo, por mês, por advogado; zoom (ano todo / mês).
2. **Advogados:** tabela CRUD com núcleo, saldo de férias/pré-férias (barras), nº de conflitos, observação e ações.
3. **Conflitos:** lista completa e agrupada por tipo, cada item explicando o conflito (regra, núcleo, datas, pessoas, números), clicável para navegar até ele.
4. **Calendário/Feriados:** cadastro descrito em 4.1.
5. **Importar/Exportar.**
6. **Histórico.**
7. **Configurações:** ano de trabalho, % de afastamento, arredondamento, mínimo, regras opcionais ligáveis/desligáveis, tema.

### 4.3 Persistência e histórico
- **Autosave em localStorage** a cada alteração (com debounce curto), com versão de schema (`schemaVersion`) e migração; carregar automaticamente ao abrir. Tratar `QuotaExceeded` e dados corrompidos sem perder a sessão (avisar e oferecer baixar backup JSON).
- **Histórico:**
  - **Log de alterações** (quem/o quê/quando: "Adicionou férias 12/07–31/07 a Fulano", "Excluiu advogado X", "Importou planilha Y") navegável.
  - **Snapshots** completos do estado: automáticos (a cada importação, antes de limpar sessão, antes de restaurar, e periodicamente a cada N alterações) e **manuais com nome** ("versão enviada ao chefe"). Permitir **visualizar, restaurar e excluir** snapshots e comparar com o estado atual (resumo do que mudou).
  - **Desfazer/Refazer** (Ctrl+Z / Ctrl+Y) ilimitado dentro da sessão, com pilha persistida enquanto couber.
  - Limite de snapshots (ex.: 50) com descarte dos mais antigos automáticos, nunca dos manuais sem avisar.
- **Backup/Restore em JSON** (exportar e importar o estado completo, incluindo histórico) como proteção extra além do xlsx.

### 4.4 Limpar sessão atual — dupla confirmação obrigatória
Botão "Limpar sessão" (em local discreto, estilo perigo):
1. **Primeira confirmação:** modal explicando o que será apagado (n advogados, n períodos) e que será criado um snapshot automático antes.
2. **Segunda confirmação:** outro modal exigindo **digitar a palavra `LIMPAR`** (ou clicar em "Sim, apagar tudo" após 3 s de espera). O botão só habilita com o texto correto.
3. Só então: criar snapshot "Antes de limpar sessão", apagar os dados da sessão atual (advogados, períodos, calendário editado), **manter** o histórico/snapshots e as configurações. Oferecer separadamente "Apagar também o histórico" (outra dupla confirmação, mais severa).
Aplicar a mesma dupla confirmação a "Importar substituindo a sessão atual" e "Restaurar snapshot" (neste último, uma confirmação já basta, já que existe snapshot automático).

---

## 5. Motor de regras extensível (importante)

Vou te passar novas regras depois. Implemente a validação como um **motor de regras puro** (sem dependência de UI), no qual cada regra é um módulo com: `id`, `nome`, `descricao`, `ativa` (configurável), `parametros` e uma função `validar(estado) → Conflito[]`, onde `Conflito = { regraId, gravidade, mensagem, nucleoId?, advogadoIds[], inicio, fim, detalhes }`. Adicionar uma regra nova deve ser **criar um arquivo e registrá-lo** numa lista.

Regras implementadas agora (ligadas): `limite-nucleo-30pct`, `max-dias-ferias-30`, `max-dias-pre-ferias-21`, `sem-sobreposicao-mesmo-advogado`, `periodo-valido`.

Regras **opcionais, já esboçadas e desligadas por padrão**, só para eu poder testar no futuro: número máximo de períodos de férias por advogado; tamanho mínimo de bloco; férias/pré-férias não podem iniciar em sábado/domingo/feriado; licenças contam (ou não) para o limite do núcleo; antecedência mínima.

Regras 100% desacopladas da UI e **cobertas por testes unitários** (Vitest): casos de borda do limite (2 pessoas, 5, 16), dias consecutivos, períodos que cruzam meses, 1º e último dia do ano, mudança de núcleo, importação com excesso, arredondamento nos três modos.

---

## 6. Requisitos técnicos

- **Stack sugerida:** Vite + React + TypeScript, ExcelJS (leitura e escrita de .xlsx com estilos, funciona no navegador), Zustand (ou useReducer) para estado, Vitest para testes. CSS limpo (Tailwind ou CSS modules). Evite dependências pesadas e de nuvem. Tudo roda **offline** depois da primeira instalação. Nenhum dado sai da máquina; **nenhuma chamada a API externa**.
- **Datas:** trabalhe com datas como string ISO `YYYY-MM-DD` e aritmética em UTC/inteiros, para **nunca ter bug de fuso horário ou horário de verão**. Exiba em `dd/mm/aaaa`.
- **Estado:** `{ schemaVersion, config, nucleos[], advogados[{id,nome,nucleoId,observacao,periodos[{id,tipo,inicio,fim}]}], calendario{feriadosNacionais[],feriadosRecife[],remessa[],recesso[]}, historico{log[],snapshots[]} }`. IDs estáveis (UUID).
- **Performance:** a grade renderiza ~25 linhas × 365 colunas com fluidez (virtualização ou células leves), validação memoizada.
- **Acessibilidade e UX:** foco visível, atalhos de teclado básicos, cores com legenda (não depender só da cor: use ícones/padrões nos conflitos), mensagens de erro claras, estados vazios com instruções, tooltips mostrando "Fulano — Férias — 12/07 a 31/07 (20 dias)" ao passar o mouse na grade.
- **Dados de exemplo:** botão "Carregar exemplo" que gera uma sessão fictícia pequena (**sem** usar os nomes reais) para teste. Não commite o xlsx real com nomes reais num repositório público; adicione `modelo/` ao `.gitignore`.

### Execução local — `start.bat`
Crie um **`start.bat`** na raiz que:
1. Verifica se o Node.js está instalado; se não estiver, mostra mensagem clara com o link de download e pausa.
2. Na primeira execução (ou se `node_modules` não existir), roda `npm install` (mostrando progresso).
3. Sobe o app (modo dev **ou**, melhor, faz `npm run build` e serve a build estática com `vite preview`/servidor simples numa porta fixa, ex. **`http://localhost:5173`**, com fallback para outra porta se ocupada).
4. **Abre o navegador padrão** automaticamente na URL.
5. Mantém a janela aberta mostrando logs e instrução "feche esta janela para encerrar o servidor".
Detalhe importante: o localStorage é por **origem** (`host:porta`); portanto use **sempre a mesma porta fixa** para não "perder" os dados quando a porta mudar, e avise na tela de Configurações qual origem está em uso. Se a porta fixa estiver ocupada, **avise** em vez de trocar silenciosamente, pois trocar de porta significaria enxergar um localStorage vazio. Inclua também um `start.sh` simples (opcional) e um `README.md` em pt-BR com instalação, uso, atalhos e como atualizar as regras.

---

## 7. Critérios de aceitação (confira todos antes de dizer que terminou)

1. `start.bat` abre o app no navegador sem passos manuais além de ter Node instalado.
2. Importar o modelo `RASCUNHO_FÉRIAS_2026.xlsx` (informando o ano 2027) carrega todos os núcleos, advogados e períodos; os totais de dias pintados por advogado batem com o que há na planilha; e o relatório de conflitos aparece (esperado, p.ex., advogados com mais de 30 dias de férias pintados).
3. Exportar e reimportar o resultado devolve **exatamente o mesmo estado** (round-trip sem perda).
4. Criar um período que faça um núcleo passar do limite dispara o modal de alerta com núcleo, datas, números e nomes; "Voltar e corrigir" desfaz; "Salvar mesmo assim" mantém e registra o conflito.
5. Estourar 30 dias de férias ou 21 de pré-férias gera alerta com o excesso exato; sobrepor férias e pré-férias do mesmo advogado gera alerta.
6. Fechar e reabrir o navegador mantém tudo (localStorage). Histórico, desfazer/refazer e snapshots funcionam e restauram corretamente.
7. "Limpar sessão" exige as duas confirmações, cria snapshot antes e preserva o histórico.
8. Testes unitários do motor de regras e do importador/exportador passam (`npm test`).
9. Sem erros no console, sem avisos de TypeScript, build de produção funcionando.

---

## 8. Como trabalhar

- Primeiro: analise o modelo xlsx e imprima um resumo do que encontrou (colunas, merges, cores, linhas de núcleo/advogado, observações). Depois apresente o plano e as suposições.
- Implemente em etapas verificáveis: (1) modelo de dados + motor de regras + testes; (2) importador/exportador + testes de round-trip; (3) UI de CRUD e grade; (4) alertas, conflitos, histórico, limpar sessão; (5) `start.bat`, README e polimento.
- Rode os testes e o build a cada etapa e corrija antes de seguir. No final, entregue um resumo com: o que foi feito, suposições adotadas, o que ficou como opcional e como adicionar uma nova regra.
- Código limpo, comentários objetivos em português nas regras de negócio, nomes de domínio em português (`advogado`, `nucleo`, `ferias`, `preFerias`).

Quando eu mandar novas regras de funcionamento, vou colá-las em uma nova mensagem — **adicione-as ao motor de regras sem reescrever o que já funciona**.
