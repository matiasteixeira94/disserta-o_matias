# SaneData — Manual de Apresentação para a Banca

**Universidade Federal de Pernambuco – Agreste**
**Programa de Pós-Graduação em Engenharia Civil e Ambiental (PPGECAM/CAA)**
**Projeto de Doutorado — Autor: Alisson Matias Teixeira**

Painel: https://sanerdata.vercel.app/

---

## 1. Para que serve este documento

Este manual não é a metodologia completa da tese — é um roteiro para você
**explicar o SaneData à banca**: o que ele é, por que cada decisão técnica foi
tomada daquele jeito, e como navegar pelas telas durante a arguição. Está
dividido em:

1. O problema que o painel resolve e para quem;
2. As fontes de dados e o que cada uma cobre (e não cobre);
3. Como o índice de priorização é calculado, com as três variações de peso;
4. Um roteiro tela por tela, com o que apontar em cada uma;
5. Limitações conhecidas — ditas de forma proativa, antes que a banca pergunte;
6. Perguntas prováveis da banca, com uma resposta pronta para cada uma.

---

## 2. O problema e a proposta

Municípios de Pernambuco carecem de um instrumento único que cruze **déficit
de saneamento básico** (água, esgoto, resíduos sólidos) com **carga de
doenças de veiculação hídrica/ambiental** (dengue, chikungunya, diarreia
aguda) para orientar a priorização de investimento público. Hoje esses dados
existem, mas estão espalhados em bases federais distintas (IBGE, DATASUS,
SINISA/SNIS), com formatos, granularidades e ciclos de atualização
diferentes — não há, antes do SaneData, uma ferramenta que já junte os 185
municípios de PE, ano a ano, num único índice comparável.

O SaneData é essa ferramenta: um painel público, gratuito, que qualquer
gestor, técnico ou pesquisador pode abrir no navegador (inclusive celular)
sem instalar nada, e que responde a uma pergunta central — **"dado o que se
sabe hoje sobre saneamento e saúde pública, quais municípios de PE deveriam
ser priorizados primeiro?"** — com transparência total sobre de onde vem
cada número.

**Regra de ouro do projeto, e o primeiro ponto a deixar claro para a banca:**
o painel nunca inventa ou estima um dado que não tenha fonte oficial. Quando
uma fonte ainda não foi apurada para um município/ano, o campo aparece como
"sem dado" — nunca como zero, média ou interpolação silenciosa. Isso é
verificável em qualquer célula do painel.

---

## 3. Fontes de dados — o que cada uma cobre

| Fonte | O que fornece | Cobertura em PE |
|---|---|---|
| **IBGE** (API de Localidades + SIDRA) | Lista oficial dos 185 municípios, população estimada, mesorregião | 100% dos municípios, 2015–2024 (anos de Censo interpolados linearmente a partir da própria série, nunca inventados) |
| **SINAN/DATASUS** (FTP público, arquivos `.dbc` nacionais) | Notificações de dengue e chikungunya, por município de residência | 100% dos municípios, todos os anos |
| **SIH-SUS/DATASUS** (FTP público, arquivos por UF) | Internações por diarreia aguda (proxy: CID-10 A00–A09, capítulo de doenças infecciosas intestinais) | 100% dos municípios, todos os anos |
| **Base dos Dados / BigQuery** (cópia tratada do antigo SNIS) | Déficit de água e esgoto | Até 2022 (SNIS foi descontinuado nesse ano) |
| **Painel público do SINISA** (sucessor do SNIS a partir de 2023) | Déficit de água, esgoto e, desde 2026, resíduos sólidos | Ano-base 2023 (é o ciclo mais recente publicado pelo Ministério das Cidades até o momento — 2024/2025 ainda não estão disponíveis em nenhuma fonte pública) |

**Por que dois indicadores de saúde vêm de bases diferentes?** O SINAN só
recebe notificação individual de dengue e chikungunya. Diarreia aguda, no
SINAN, só é registrada quando há **surto** (Portaria GM/MS 204/2016) — não
existe uma série de casos individuais por município comparável às outras
duas doenças nessa base. Por isso o painel usa como proxy as internações
hospitalares (SIH-SUS) por diagnóstico principal do capítulo A00–A09, uma
escolha metodológica padrão na literatura de saúde ambiental quando o dado
de notificação direta não está disponível.

**Por que o déficit de resíduos sólidos é o indicador mais recente?** Até
julho de 2026 nenhuma fonte pública (nem o antigo SNIS, nem o SINISA) tinha
publicado esse indicador para os municípios de PE — o próprio Ministério das
Cidades o mantinha marcado como "em breve". Ele passou a existir apenas na
publicação do ano-base 2023 do SINISA, e por isso só tem cobertura a partir
desse ano.

---

## 4. O índice de priorização — como é calculado

### 4.1 Os cinco indicadores

O índice composto combina **cinco indicadores**, cada um normalizado para a
escala 0–1 (mín-máx, dentro do conjunto de municípios do ano):

1. Déficit de abastecimento de água (%)
2. Déficit de rede coletora de esgoto (%)
3. Taxa de dengue (casos / 100 mil hab.)
4. Taxa de chikungunya (casos / 100 mil hab.)
5. Taxa de diarreia aguda (internações / 100 mil hab.)

**O déficit de resíduos sólidos fica de fora do índice composto** — não por
ser menos importante, mas porque o índice precisa ser **comparável ao longo
da série 2015–2024**, e resíduos só tem dado a partir de 2023. Incluí-lo
quebraria a comparabilidade entre anos. Ele continua visível no painel (na
camada "Investimento" do mapa e na tabela de Comparações), só não entra na
conta do índice — essa é uma decisão metodológica explícita, documentada no
código-fonte, e um ótimo ponto para antecipar caso a banca questione "por que
só 5 indicadores, se saneamento são 3 componentes?".

### 4.2 Três esquemas de peso

Por padrão, os cinco indicadores têm **peso igual (20% cada)** — a opção mais
simples de defender, porque não exige nenhum julgamento de valor sobre qual
indicador "importa mais". O painel oferece duas alternativas, selecionáveis
pelo usuário (atrás de um botão "avançado", para não sobrecarregar quem só
quer consultar o ranking):

- **Peso pela variação dos dados (entropia de Shannon):** indicadores em que
  os municípios de PE variam mais entre si recebem peso maior — a lógica é
  que um indicador quase igual em todo lugar carrega pouca informação
  discriminante para priorização.
- **Peso pela análise estatística (PCA — Análise de Componentes Principais):**
  os pesos vêm do primeiro componente principal dos cinco indicadores
  normalizados — resume a variação conjunta entre eles, mas é mais sensível
  quando os indicadores se correlacionam fortemente entre si.

Ter as três opções lado a lado (e um card que mostra a média ponderada por
população junto da média simples) é uma forma de mostrar à banca que o
resultado do ranking **não muda drasticamente** dependendo do esquema de
peso escolhido — o que é, em si, um argumento de robustez metodológica que
vale a pena destacar na defesa.

### 4.3 Município precisa ter os 5 indicadores completos para entrar no índice

Um município só aparece no ranking do índice se tiver os cinco indicadores
apurados naquele ano — nunca uma média parcial. Os municípios sem essa
combinação continuam listados (todos os 185 aparecem sempre), só que sem
posição/pontuação, com uma nota indicando exatamente qual indicador falta.
No ano-base atual (2023), isso ocorre para 84 dos 185 municípios — o gargalo
é majoritariamente o indicador de esgoto, que tem cobertura parcial mesmo
nas fontes mais completas.

---

## 5. Roteiro de apresentação, tela por tela

### Tela Inicial
Abertura institucional (UFPE-Agreste, PPGECAM, autoria) e navegação. Pouco a
explicar aqui — é o cartão de visita do projeto.

### Dashboard — a tela principal
É onde a banca vai passar mais tempo. Sugestão de ordem ao apresentar:

1. **Cards do topo** (Municípios com dados completos / Maior prioridade /
   Maior déficit de água / Índice médio do painel) — são estatísticas **do
   painel inteiro**, não do município selecionado. Vale dizer isso em voz
   alta, porque é o ponto mais comum de confusão de quem vê o painel pela
   primeira vez.
2. **Ranking de priorização** — clicável: clique em qualquer município da
   lista (ou digite o nome no campo "Município" no topo da página, ou clique
   no mapa) e toda a seção "Município em foco", mais abaixo, atualiza para
   aquele município. Isso é uma boa demonstração ao vivo — selecione dois
   municípios bem diferentes (ex.: Fernando de Noronha e Petrolina) e mostre
   como os números do meio da página mudam.
3. **Mapa geográfico** — o mesmo índice, mas em coropletia sobre a malha real
   dos municípios de PE. O seletor "Camada exibida" troca entre o índice
   composto, cada déficit individual, cada indicador de saúde e as camadas
   de "Investimento" (cobertura, o inverso do déficit). Também é aqui que
   fica o "Modo curadoria" (ver seção 6).
4. **Decomposição do índice** — mostra, para o município selecionado, quantos
   pontos (de 0 a 100) cada um dos 5 indicadores contribuiu. É a resposta
   visual para "por que esse município está tão priorizado?".
5. **Distribuição do índice** (histograma) e **Índice médio por
   mesorregião** — ambos clicáveis: clicar numa barra filtra o ranking da
   lista acima só para aquela faixa de índice ou aquela mesorregião.
6. **Matriz de correlação** — Spearman entre cada déficit de saneamento e
   cada indicador de saúde, considerando todos os municípios do ano (célula
   fica "insuf." quando há menos de 4 municípios com o par de indicadores
   apurado — é o caso de resíduos, ainda com poucos meses de dado).
7. **Município em foco** — a seção que muda com a seleção: índice individual,
   posição no ranking, evolução do índice ao longo dos anos (2015–2024),
   comparação com a média do painel, e correlação/dispersão déficit×saúde
   com o município em destaque no gráfico.

### Relatórios
Ranking completo (os 185 municípios, não só o top 15) com exportação em CSV,
Excel, imagem (PNG do gráfico) e impressão/PDF — pensado para levar o dado
bruto para fora do navegador, útil se a banca pedir para "ver a planilha".

### Comparações
Dois municípios lado a lado, indicador por indicador, com a média do painel
como terceira referência — bom para responder perguntas do tipo "como X se
compara a Y?" na hora, sem precisar preparar slide antes.

---

## 6. Funcionalidade de destaque: pontos de atenção (modo curadoria)

Diferente dos indicadores agregados por município, o "Modo curadoria" no
mapa geográfico permite registrar **pontos específicos** (não o município
inteiro) que precisam de obra de infraestrutura — um endereço, categoria
(água/esgoto/resíduos/outro) e descrição. É uma curadoria manual da equipe
de pesquisa, não um cadastro público em tempo real: os pontos registrados na
sessão do navegador são exportados como JSON e substituídos manualmente no
repositório para publicação. Vale explicar essa distinção à banca — o painel
não é (ainda) uma plataforma de participação cidadã, é uma ferramenta de
apoio à decisão com uma trilha de curadoria controlada.

---

## 7. Limitações conhecidas — antecipe estes pontos

Dizer as limitações antes de a banca perguntar é sempre mais forte do que
ser questionado sobre elas. As principais:

1. **2024 e 2025 não têm dado de saneamento em nenhuma fonte pública ainda.**
   Testado e confirmado: o portal do SINISA serve um único ano-base fixo
   (2023) independente do parâmetro de ano na consulta — não é uma limitação
   do painel, é uma limitação da publicação de dados do Ministério das
   Cidades. O painel está pronto para incorporar o próximo ciclo assim que
   ele for publicado (o pipeline de coleta já existe e roda automaticamente).
2. **Déficit de resíduos sólidos só existe a partir de 2023** e, por isso,
   fica fora do índice composto (ver seção 4.1) — presente no painel, mas
   não na pontuação de priorização.
3. **Cobertura de esgoto é o gargalo do índice.** Mesmo nos anos com mais
   dado (2022–2023), menos da metade dos municípios de PE têm o indicador de
   esgoto apurado por alguma fonte pública — é o principal motivo de
   municípios saírem do ranking do índice composto.
4. **Mudança de metodologia entre SNIS (até 2022) e SINISA (2023 em diante).**
   O SNIS foi descontinuado e sucedido pelo SINISA como parte de uma mudança
   institucional do Ministério das Cidades — comparar 2022 com 2023 direto
   pode mostrar um salto que é efeito da troca de metodologia de coleta, não
   necessariamente uma mudança real na cobertura do serviço. Isso está
   documentado no pipeline e deve ser mencionado ao interpretar a série
   histórica completa.
5. **Diarreia aguda é medida por proxy (internação hospitalar), não por
   notificação direta** — uma escolha deliberada e justificada (seção 3),
   mas que subestima casos leves que não geram internação.

---

## 8. Perguntas prováveis da banca — respostas prontas

**"Por que só Pernambuco, e não Brasil inteiro?"**
Escopo definido pela pesquisa: aprofundar num recorte estadual permite
usar fontes municipais mais granulares (malha territorial, mesorregiões
oficiais do IBGE) e manter o volume de dado gerenciável para um doutorado.
A arquitetura do pipeline não é específica de PE — extrapolar para outro
estado ou o país inteiro é uma extensão de trabalho futuro, não uma
limitação estrutural do método.

**"Como vocês garantem que os dados são confiáveis?"**
Todas as fontes são oficiais (IBGE, DATASUS, Ministério das Cidades) e
públicas — nenhum dado vem de estimativa própria do pesquisador. Qualquer
número no painel pode ser rastreado até o dataset de origem (ver
`data/scripts/README.md`, que documenta cada fonte, cada verificação feita
antes de escrever cada script de coleta, e cada limitação encontrada).

**"Por que o índice não é uma média simples?"**
É, por padrão (peso igual) — mas o painel oferece duas alternativas
data-driven (entropia, PCA) precisamente para testar a robustez do
ranking diante de diferentes critérios de ponderação, sem exigir que o
pesquisador escolha pesos "à mão".

**"O ranking muda muito dependendo do peso escolhido?"**
Mostre ao vivo: troque entre os três esquemas de peso no Dashboard e
compare o topo do ranking. Historicamente os municípios mais críticos
permanecem entre os primeiros nos três esquemas — argumento de robustez.

**"Por que resíduos sólidos não entra no índice, já que é um componente do
saneamento básico?"**
Ver seção 4.1: comparabilidade temporal. Entra no índice assim que tiver
série histórica suficiente para não distorcer a comparação entre anos.

**"Isso é só uma visualização ou tem alguma inferência estatística?"**
Tem: correlação de Spearman entre cada déficit e cada indicador de saúde
(com interpretação automática de força e direção), e os dois esquemas de
peso data-driven (entropia de Shannon, PCA) usam inferência sobre a
variação/covariância dos indicadores, não são só uma tabela dinâmica.

**"O painel poderia virar uma ferramenta de gestão real, usada pela
prefeitura?"**
Sim, com ressalvas: hoje é um site estático (sem login, sem banco de dados)
por ser mantido dentro do escopo de um doutorado. Um uso institucional real
exigiria, no mínimo, atualização automática do pipeline em produção e uma
camada de autenticação — ambos fora do escopo atual, mas tecnicamente
viáveis a partir da mesma base de código.

---

## 9. Onde estão os detalhes técnicos, se pedirem para aprofundar

- `data/scripts/README.md` — cada fonte de dado, o que cada script de coleta
  faz, e por que cada decisão metodológica foi tomada daquele jeito
  (inclusive os becos sem saída investigados e descartados).
- `js/stats.js` — as fórmulas exatas de normalização, pesos e correlação.
- `js/data.js` — a definição dos cinco indicadores do índice e a lógica do
  ano padrão exibido ao abrir o painel.
