# Importador de planilha → CRM Spotsales

Instruções para o Claude (desktop / Claude Code) assumir este projeto. Leia tudo antes de agir.

## Quem é o usuário e como trabalhar com ele

- O Adn **não é programador**. Ele quer que você execute tudo: git, GitHub, Vercel e testes. Não peça para ele editar código ou rodar comandos. Se uma ação dele for indispensável (login, aprovar acesso, colar uma credencial num painel), dê o passo a passo com o link exato e diga o que ele deve ver na tela.
- Responda em português do Brasil, de forma curta e objetiva.
- Peça confirmação antes de qualquer ação que crie dados no CRM de verdade (importar sem "Apenas validar"), que apague arquivos ou que altere o workflow em produção.
- **Nunca grave tokens ou senhas em arquivos do repositório.** O token da API do CRM só pode ficar em credencial do N8N ou em variável de ambiente.

## Objetivo

Um site onde o usuário envia uma planilha (.xlsx/.csv) de contatos. O site manda o arquivo para um workflow no N8N, que valida cada linha contra o CRM (pipelines/etapas, tags, campos personalizados), busca o ticket do contato na plataforma de atendimento e cria uma oportunidade (card no Kanban) para cada linha válida. No fim, o site mostra um relatório por linha.

```
Navegador (site na Vercel)
  └─ POST /api/importar-crm  (JSON: {file: base64, dryRun})
       └─ função Vercel repassa como multipart → N8N  POST /webhook/importar-crm
            └─ N8N responde {jobId} na hora e continua processando
  └─ GET /api/status?jobId=...  (a cada 4 s)
       └─ função Vercel → N8N  GET /webhook/importar-crm-status?jobId=...
            └─ {status:"processando"} até terminar, depois o relatório completo
```

## Endereços

| Item | Valor |
|---|---|
| Repositório GitHub | https://github.com/SpotSales-br/importador-crm (branch `main`; estava **público** — avaliar deixar privado) |
| Projeto Vercel | `importador-crm`, conta/time `spotsales-brs-projects` (importado do GitHub; publica sozinho a cada push na `main`) |
| Webhooks N8N (produção) | base `https://webhookapp3.spotsales.ai/webhook` |
| API do CRM | base `https://apicrm.spotsales.ai/v1` |
| Pasta local do projeto | `C:\Users\Desktop\sitesSpot\subircontatos_crm` (pode ter outro caminho real; confira) |

## Estrutura de arquivos (como deve ficar no repositório)

```
index.html                       site estático (uma página, sem build)
api/importar-crm.js              função serverless da Vercel: repassa o upload ao N8N
api/status.js                    função serverless da Vercel: consulta o status no N8N
n8n/workflow-importar-crm.json   workflow para importar no N8N (backup/versão)
CLAUDE.md                        este arquivo
```

Configuração da Vercel: Framework Preset **Other**, sem build command, sem output directory. As funções em `api/` são detectadas automaticamente. Variável de ambiente opcional `N8N_WEBHOOK_BASE` (se ausente, usa `https://webhookapp3.spotsales.ai/webhook`).

## Estado atual e problemas em aberto (23/10/2026)

1. **Erro no site: "Failed to fetch".** A versão antiga do site chamava o N8N direto do navegador. A causa provável é CORS ou o host do N8N não responder ao navegador, mas isso nunca foi confirmado. A versão nova usa o intermediário `api/` da Vercel, que não depende de CORS.
2. **No GitHub, `importar-crm.js` e `status.js` foram enviados na raiz, e não em `api/`.** A Vercel só reconhece funções dentro de `api/`. Corrija isto primeiro: mova os dois arquivos para `api/`, apague as cópias da raiz, faça commit e push.
3. Depois do push, confirme que o deploy da Vercel ficou **Ready** e que o navegador não está mostrando uma versão em cache (Ctrl+F5). A mensagem de erro antiga contém a palavra "CORS". A nova diz "Confira se o workflow do N8N está ativo."
4. O workflow N8N nunca foi executado de ponta a ponta. A lógica dos nodes Code foi testada fora do N8N com a planilha real e respostas simuladas da API.
5. O node do getTicket (busca do ticket pelo número na plataforma de atendimento) ainda é um **placeholder** e precisa ser trocado pelo node real do Adn.

### Roteiro de verificação sugerido

1. Pelo navegador, abra `https://webhookapp3.spotsales.ai/webhook/importar-crm-status?jobId=teste`. Deve devolver `{"status":"processando","jobId":"teste"}`. Se devolver 404 ou "not registered", o workflow não está ativo ou não foi importado.
2. Com `curl`, teste o upload direto no N8N: `curl -F "file=@planilha.xlsx" -F "dryRun=true" https://webhookapp3.spotsales.ai/webhook/importar-crm`. Deve devolver `{"jobId":"imp_..."}`.
3. Teste a função da Vercel: `POST https://<dominio-vercel>/api/importar-crm` com JSON `{"file":"<base64>","dryRun":true}`.
4. Teste o site com a opção **Apenas validar** marcada. Só depois, e com o OK do Adn, faça uma importação real com 1 ou 2 linhas.

## API do CRM (resumo da documentação)

- Base: `https://apicrm.spotsales.ai/v1`. Header: `Authorization: Bearer <TOKEN>`. Respostas em JSON.
- Token: gerado no CRM → API (dá acesso à empresa inteira). O token atual chama "Prevtech Oportunidades". Ele apareceu em conversa com o Claude, então recomende **gerar um novo** e apagar o antigo.
- Limite: **100 requisições/minuto por token**, somando todos os endpoints. Ao exceder, a API devolve `429` com o código `rate_limited` e o header `Retry-After`.
- Para receber eventos, use Configurações → Webhooks do CRM, em vez de ficar consultando a API.

### POST /opportunities — cria um card

| Campo | Obrig. | Observação |
|---|---|---|
| `ticketRef` | sim | ID do ticket na plataforma de atendimento (vínculo permanente) |
| `userId` | sim | ID do usuário da plataforma que consta como criador (precisa existir na empresa) |
| `contactName` | sim | vira o título do card |
| `phone` | sim | telefone com DDI |
| `pipeline` **ou** `pipelineId` | sim | nome ou ID, nunca os dois |
| `column` **ou** `columnId` | sim | etapa, nome ou ID, nunca os dois |
| `tags` e/ou `tagIds` | não | listas; podem ser combinadas |
| `lossReasons` / `lossReasonIds` | depende | obrigatório se a etapa for de perda e a empresa tiver motivos cadastrados |
| `assigneeUserId` | não | responsável; se omitido, é o próprio `userId` |
| `email`, `contactCompany`, `channelId` | não | `channelId` omitido = conexão que reconheceu o ticket |
| `customFields` | não | `[{fieldId ou name, value}]`, no formato do tipo do campo |

- Os nomes ignoram maiúsculas, acentos e espaços sobrando, mas precisam ser completos. Mandar um ID no campo de nome dá 404.
- Resposta `201` com a oportunidade (`id`, `ticketRef`, `status`, `pipelineId`, `columnId`, `value`, `tags`, `createdAt`). O valor nasce 0 e não pode ser enviado. O card entra no fim da etapa.
- A API **não checa duplicidade**: cada chamada cria um card novo, inclusive para o mesmo ticket.
- Erros: `400` (falta campo, nome e ID enviados juntos, campo personalizado fora do formato ou arquivado), `404` (ticket, usuário, pipeline, etapa ou tag inexistente; a mensagem lista as opções válidas), `409` (dois itens com o mesmo nome: use o ID). Em qualquer erro, nada é criado.

### Outros endpoints

- `GET /pipelines`: lista as pipelines com suas etapas (`columns`: `id`, `title`, `color`, `position`, `isWon`, `isLost`).
- `GET /tags`: lista as tags (`id`, `label`, `color`).
- `GET /custom-fields`: lista os campos personalizados (`id`, `name`, `type`, `options`, `archived`).
  - Tipos: `text`; `number` (ponto decimal); `boolean`; `date` (`AAAA-MM-DD`); `single_choice` (uma das `options`); `multiple_choice` (lista de `options`). `null` apaga o valor. Campo `archived` não aceita valores.
- Também existem `GET /opportunities`, `GET|PATCH|DELETE /opportunities/{id}`, `PATCH /opportunities/{id}/stage`, `/assignee` e `/tags` (com `add` e `remove`), além de uma aba "Motivos de perda". Esses não são usados neste projeto.

## Planilha

Colunas aceitas (o cabeçalho é comparado sem acento e sem maiúscula; sinônimos entre parênteses):

| Coluna | Vai para | Sinônimos aceitos |
|---|---|---|
| `nome` | `contactName` | nome contato, contato, cliente |
| `numero` | `phone` | telefone, whatsapp, celular |
| `pipeline` | `pipelineId` | funil |
| `etapa do funil` | `columnId` | etapa, coluna, estagio |
| `atendente vinculado` | `userId` (ID do usuário, ex.: 460) | atendente, responsavel |
| `empresa` | `contactCompany` | |
| `email` | `email` | |
| `tag de negociação` | `tagIds` | tag, tags; várias tags separadas por `;` ou `|` |
| `motivo de perda` | `lossReasons` | opcional |

- Qualquer outra coluna cujo nome seja igual a um campo personalizado ativo do CRM vira `customFields` (ex.: "Nome Aluno", "origem", "cargo"). Colunas sem correspondência são ignoradas e listadas no relatório.
- Número: só dígitos. Com 10 ou 11 dígitos, o fluxo acrescenta `55`. Aceita de 12 a 15 dígitos.
- Planilha de exemplo do Adn ("Importação Prog Ilha (21_10)"): 173 linhas e 163 números únicos (o mesmo responsável aparece com alunos diferentes, então cada linha vira um card). Todas usam a pipeline "Progressão Alunos Ativos", a etapa "NÃO CONTACTADO" e o atendente 460. São 8 tags diferentes ("Alunos 6º Ano", "Alunos 7º Ano", "Alunos 8º Ano", "Alunos 9º Ano", "Alunos 1001º", "Alunos 1002º", "Alunos 2001º", "Alunos 2002º").

## Workflow N8N (`n8n/workflow-importar-crm.json`)

Importe pelo menu do N8N (Import from file). São 24 nodes, com `executionOrder: v1`.

### Fluxo principal (POST `/webhook/importar-crm`)

1. **Webhook Upload**: POST, `responseMode: responseNode`, CORS `*`. Recebe o multipart com `file` (binário) e `dryRun` ("true"/"false").
2. **Criar job** (Code): gera o `jobId` (`imp_...`), lê o `dryRun` e repassa o binário.
3. **Responder jobId** (Respond to Webhook): devolve `{jobId, dryRun}` na hora, e o fluxo continua rodando.
4. **Ler planilha** (Extract from File, xlsx, cabeçalho na linha 1, `readAsString`).
5. **Normalizar** (Code): padroniza os cabeçalhos (sem acento/minúsculo), converte números grandes em texto, ignora linhas vazias e grava `_linha` (número da linha no Excel).
6. **GET Pipelines**, **GET Tags** e **GET Campos personalizados** (HTTP Request): `executeOnce` e `alwaysOutputData`, com credencial Header Auth **"CRM Spotsales - Bearer"**.
7. **Validar** (Code): resolve nomes para IDs (pipeline, etapa dentro da pipeline, tags) e formata os campos personalizados por tipo. Valida o telefone, bloqueia linhas duplicadas no arquivo e marca cada linha com `_acao`: `criar`, `erro` (com `_erro` explicando) ou `simulado` (quando `dryRun`). No topo do código há um objeto `CFG` com valores padrão (pipeline, etapa, userId, DDI).
8. **Criar no CRM?** (IF `_acao == "criar"`):
   - **Verdadeiro:**
     1. **COLOCAR AQUI - getTicket pelo número** (NoOp placeholder): **troque pelo node real da plataforma.** Ele deve buscar o ticket usando `{{ $json.numero }}` e precisa ter **Always Output Data** ligado.
     2. **Dados da plataforma** (Set): os campos `ticketRef` e `contactId` devem ser ajustados para o que o node getTicket devolve (hoje estão como `$json.ticketId ?? $json.id` e `$json.contactId ?? $json.contact?.id`). O `contactId` não é usado pela API do CRM; ele só aparece no relatório.
     3. **Montar payload** (Code, por item): junta a linha validada (`$('Validar').item`) com o ticket e monta o corpo do POST, usando IDs.
     4. **POST Oportunidade** (HTTP Request): `POST /opportunities`, com envio de 1 item a cada 800 ms (cerca de 75/min, abaixo do limite de 100), `fullResponse` e `neverError`.
     5. **Resultado** (Code, por item): `201` vira `criado` com o `id`; qualquer outro código vira `erro` com a mensagem da API.
   - **Falso:** **Sem criar** (Code, por item): monta o resultado das linhas com erro ou simuladas.
9. **Juntar** (Merge, append) → **Finalizar** (Code): consolida o resultado de todas as linhas. Uma linha que sumiu no getTicket é marcada como erro. O relatório vai para o **static data** do workflow (`$getWorkflowStaticData('global').jobs[jobId]`), e jobs com mais de 48 h são apagados.

### Fluxo de status (GET `/webhook/importar-crm-status?jobId=...`)

**Webhook Status** → **Ler status** (Code): lê o static data e devolve o relatório, ou `{status:"processando"}` se ainda não terminou. Depois vai para **Responder status**.

Formato do relatório: `{status:"concluido", jobId, dryRun, total, criados, erros, simulados, colunasIgnoradas:[...], finalizadoEm, detalhes:[{linha, nome, numero, status, id, contactId, ticketRef, mensagem}]}`.

### Pontos de atenção do N8N

- O static data **só é salvo no fim da execução** e **só em execuções de produção**: o workflow precisa estar ativo e ser chamado pela URL `/webhook/`, não pela `/webhook-test/`. Por isso o status fica em "processando" até o fim; não há progresso parcial.
- Se a execução falhar no meio, o site espera até o tempo limite e mostra um aviso. Nesse caso, verifique as Executions no N8N.
- Os 4 nodes HTTP usam a credencial Header Auth com Name `Authorization` e Value `Bearer <TOKEN>`. Depois de importar, selecione a credencial em cada um.

## Site (`index.html`)

- É uma página estática: SheetJS (cdnjs, `xlsx@0.18.5`) e a fonte Nunito (Google Fonts), com cores claras.
- O site lê a planilha no navegador, mostra uma prévia das 5 primeiras linhas e regrava o arquivo como .xlsx com todas as células em texto (para não perder os dígitos do telefone).
- Envia para `/api/importar-crm` e consulta `/api/status` a cada 4 s. O tempo limite é cerca de 1,3 s por linha, mais 120 s.
- A opção "Apenas validar" (`dryRun`) não cria nada no CRM.
- O relatório traz filtros (todas / criadas / prontas / erros) e permite baixar um CSV.
- A função da Vercel aceita até cerca de 4,5 MB por requisição. Como o arquivo vai em base64, planilhas acima de ~3 MB precisarão de outra estratégia (ex.: dividir em lotes).

## Rotina para atualizar o site

1. Altere os arquivos na pasta local, que é um clone do repositório (se ainda não for, faça `git clone https://github.com/SpotSales-br/importador-crm.git`).
2. Faça `git add`, `git commit` e `git push` para a branch `main`.
3. Acompanhe o deploy na Vercel (aba Deployments) até ficar **Ready** e teste a URL de produção.
4. Conte ao Adn, em uma frase, o que mudou.
