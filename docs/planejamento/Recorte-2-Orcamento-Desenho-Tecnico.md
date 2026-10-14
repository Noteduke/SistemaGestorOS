# Recorte 2 — Cadastro de Serviços e orçamento simplificado da OS

**Status:** regras funcionais aprovadas por Marcos e primeira fatia implementada. Cadastro de Serviços e itens de Serviço/Mão de obra (cadastrada ou avulsa) e Peça avulsa possuem schema, migrations, API e interface. As migrations `20261014120000_service_catalog` e `20261015120000_service_order_budget_items` foram aplicadas somente em `gestor_os_opening_test`, nunca no banco principal nesta etapa. A seção “Implementação realizada” abaixo registra o estado físico e comportamental efetivo; as propostas técnicas subsequentes são histórico de desenho e não prevalecem quando divergirem desse registro. Peça de estoque e catálogo de peças permanecem futuros.

## Implementação realizada

- **Persistência:** `ServiceOrderBudgetItem` relaciona diretamente à OS, sem entidade Budget ou status/ciclo próprio. Os tipos/origens são `SERVICE_LABOR` + `REGISTERED|MANUAL` e `MANUAL_PART` + `MANUAL`. Há descrição exibida e chave normalizada binária para itens manuais, quantidade `INT` de 1–999, preço unitário obrigatório e custo opcional, ambos `DECIMAL(15,2)`, versão, autoria e remoção lógica. Totais são calculados com `Prisma.Decimal`; não são armazenados nas linhas. FKs são restritivas, incluindo serviço cadastrado, de modo que qualquer vínculo histórico impede exclusão física do serviço.
- **Unicidade:** índices funcionais únicos limitam, por OS e somente enquanto ativo, serviço cadastrado, mão de obra avulsa normalizada e peça avulsa normalizada, separadamente. Inclusão duplicada retorna conflito com referência pública do item atual para destaque na tela; não soma quantidade.
- **Normalização e concorrência:** descrições são limpas e normalizadas por caixa, acentos e espaços, preservando pontuação como distinção. Mão de obra avulsa é comparada ao Cadastro de Serviços, inclusive desabilitados. A tabela técnica `service_order_budget_name_locks`, bloqueada por linha dentro da transação, serializa essa verificação com inclusão/renomeação concorrente no catálogo; não é entidade de negócio. Peça avulsa ainda não pode ser comparada com catálogo de peças inexistente.
- **Transações e permissões:** mutações bloqueiam a OS com `FOR UPDATE`, revalidam sua situação macro e permissões dentro da transação, e gravam item e evento atomicamente. Editar exige `service_orders.budget.update`; custo requer também `service_orders.budget.costs.read` e `service_orders.budget.costs.update`. Consulta usa as permissões normais de leitura da OS. Para situação NÃO AUTORIZADO, `withdrawBudget` retira todos os itens logicamente na mesma transação da mudança de situação e exige permissão de editar orçamento.
- **Histórico:** inclusão, remoção individual e retirada total têm eventos próprios. Cada salvamento de edição gera um evento `ITEM_ORCAMENTO_ALTERADO`, contendo todos os campos alterados com antes/depois. Snapshots e totais representam o instante da operação. Projeções usam allowlist; custo unitário, total de custo e mudanças de custo são omitidos, inclusive em estruturas aninhadas, sem permissão de leitura de custo.
- **API e interface:** estão implementadas consulta/inclusão/edição/retirada de itens, lista auxiliar de serviços ativos para seleção e painel de orçamento no detalhe da OS. A tela copia o preço padrão no lançamento, sem vínculo posterior do preço; permite quantidade/valor zero dentro dos limites aprovados, edição avulsa e remoção com confirmação simples. Macrostatus que não permite edição mantém os itens em consulta.
- **Validação:** migration, índices, API autenticada, CSRF, custos, duplicidade, concorrência, retirada individual e integral foram exercitados apenas em `gestor_os_opening_test`. O script operacional remove os registros temporários ao final. O banco principal não foi conectado nem modificado por esta etapa.

Peça de estoque, movimentações e validação de peça avulsa contra catálogo de peças continuam fora desta fatia. As invariantes que dependem de leitura/coordenação entre tabelas são garantidas pelo service transacional; não se deve inferir que o banco as impõe por CHECK.

## 1. Escopo aprovado e limites

A primeira fatia abrange Cadastro de Serviços, Serviço/Mão de obra (origens CADASTRADA e AVULSA) e Peça avulsa. Uma OS admite vários itens individuais, inclusive serviços cadastrados e mão de obra avulsa simultaneamente. Peça do estoque continua sendo o terceiro tipo oficial, mas será implementada depois. Não há tipo Outro, custo de serviço, entidade de aprovação, status/fluxo próprio de orçamento ou restauração automática.

Quantidade obrigatória, inicialmente 1, inteira e positiva. Valor cobrado não negativo, inclusive zero; total calculado = quantidade × valor unitário. Total atual da OS = soma das linhas ativas, sem itens retirados, custo, desconto ou itens somente históricos. Valores monetários têm duas casas decimais; Backend calcula, totais não são entrada e não se usa float. A precisão física do DECIMAL permanece proposta. Peça avulsa admite custo unitário opcional não negativo: NULL desconhecido, zero conhecido; total de custo segue essa distinção. Nenhum custo em Serviço/Mão de obra nesta fatia.

OS ABERTA aceita inclusão/edição/retirada mesmo após autorização, com histórico, sem nova aprovação automática ou mudança de situação. FECHADA/CANCELADA é somente consulta; correções dependem da reabertura própria da OS. Não criar desconto, discountType, acréscimo ou financeiro no orçamento: desconto único no fechamento é FUTURO FATURAMENTO, em valor ou percentual.

## 2. Padrões observados no repositório

Consulta estática, sem banco nem execução funcional:

- Prisma: id interno inteiro e publicId UUID em CHAR(36), timestamps DATETIME(3), FKs restritivas e modelos mapeados para snake_case. `ServiceCatalog` e `ServiceOrderBudgetItem` estão no schema; o modelo de produto/estoque permanece futuro.
- EquipmentLookupService e DTOs de Pessoas: consulta paginada, filtro de ativos quando aplicável, ordenação estável com id interno como desempate e projeção pública sem expor id.
- normalizeGeneralText em Pessoas: trim, colapso de espaços e caixa alta pt-BR. A comparação exata de orçamento requer chave normalizada própria; não pressupor que a collation global tenha a mesma semântica.
- AuthPolicyService/guards: sessão, permissão explícita, Administrador e CSRF em mutações. `services.manage` protege o catálogo e as permissões de orçamento/custo protegem consulta, edição e custo.
- ServiceOrderOperationalSituationService: transação Prisma, bloqueio da OS por FOR UPDATE, revalidação de macrostatus/permissão e evento na mesma transação. Reaproveitar o padrão, não copiar autorização espalhada.
- ServiceOrderEventsReadService/ServiceOrderHistoryService: eventos paginados e allowlisted; a leitura de orçamento filtra custos sem permissão, inclusive em snapshots. Observações manuais são criadas/removidas por `/notes` e projetadas com eventos em `/history`; `/events` permanece somente eventos automáticos.
- Frontend: React/TypeScript, rotas por hash, cliente HTTP, estados de carregamento/erro e paginação; telas de OS e login existentes. A tela administrativa de Serviços está em `#/services`; não existe tela de itens de orçamento.
- Valores monetários devem ser DECIMAL conforme docs/03; não foi encontrado modelo monetário implementado que fixe precisão para esta fatia. O histórico existente usa eventos, não um mecanismo genérico de soft deletion para itens.

Não criar repositories que só repitam Prisma; domínio coordena transações e infraestrutura permanece genérica, conforme DA-017.

## 3. Comparação arquitetural

| Opção | Benefícios | Custo e adequação |
| --- | --- | --- |
| A: ServiceOrder → Budget → BudgetItem | Agrupa documento/revisões se houvesse identidade e ciclo próprios | Cria entidade extra sem comportamento aprovado; induz estados e restauração que não existem. Não necessária para retirar uma composição. |
| B: ServiceOrder → ServiceOrderBudgetItem + eventos | Itens ligados à OS; retirada por item, fotografia da composição no evento; novos ciclos são novos lançamentos | Requer transação para retirar conjunto e histórico consistente; não precisa Budget nem BudgetStatus. |

**Recomendação técnica: opção B.** Não criar tabela principal de orçamento. A composição atual é o conjunto de itens com removedAt nulo. Retirar todos marca os itens e grava uma fotografia da composição; novos lançamentos recebem novos publicIds e ficam no fim da ordem de inclusão. Não inventar número de ciclo, versão de orçamento, restauração ou status. Campo técnico de concorrência da composição não é estado de orçamento.

## 4. Cadastro de Serviços — persistência implementada

Entidade `ServiceCatalog`, tabela `service_catalog`. Distingui-la dos services NestJS e do tipo Serviço/Mão de obra. A migration está aplicada somente no banco isolado.

| Campo sugerido | Representação candidata | Finalidade |
| --- | --- | --- |
| id / publicId | INT / UUID CHAR(36) unique | Relações internas / identidade pública |
| name | VARCHAR(120), obrigatório | Nome imutável, apresentação preservada após limpeza de espaços |
| normalizedName | VARCHAR(191), obrigatório | Correspondência exata, independente da exibição |
| defaultPrice | DECIMAL(15,2), obrigatório, sem NULL | Preço padrão alterável; zero permitido, negativo proibido |
| isActive | boolean | Habilitado/desabilitado; default true |
| createdAt / updatedAt | DATETIME(3) | Instantes do servidor |
| createdByUserId / updatedByUserId | FK User | Autoria das operações |
| version | INT positivo | Controle otimista contra edição perdida |

Campos/tamanhos acima são o contrato implementado para o catálogo. Preço e ativação são editáveis, inclusive preço de serviço desabilitado; name e normalizedName não entram no DTO de alteração e não são mutáveis no service. Rejeitar tentativa de renomear em vez de ignorá-la. Mudança de nome exige outro cadastro. Ajuste de preço só altera defaultPrice, nunca itens existentes. Itens existentes continuam legíveis/editáveis após desativação do serviço; novos lançamentos exigem serviço ativo.

Auditoria implementada: eventos de criação, preço alterado, habilitação/desabilitação e exclusão no `admin_audit_log` existente, na mesma transação da mutação e sem justificativa obrigatória. Preço alterado guarda serviço/publicId, preço anterior e novo; ativação guarda situação anterior/nova; ambos registram ator e instante. Exclusão física guarda, **antes de excluir**, snapshot em `details_json` com publicId, nome e preço padrão vigente; `actor_user_id` e `occurred_at` registram usuário e hora. Não há FK do log para o serviço apagado. Soft delete com unique global manteria o nome reservado; a exclusão física libera a chave. A guarda por associação histórica e a FK restritiva dos itens ainda serão implementadas quando houver itens; não há associação hoje.

### 4.1 Duplicidade, índices e constraints

- Unique publicId e **unique global de normalizedName, sem filtrar por atividade**. A chave permanece ocupada pelo serviço desabilitado e é liberada apenas após exclusão física permitida. Reabilitar atualiza o cadastro existente, sem nova linha.
- Índices reais de consulta `(isActive, name, id)` e `(name, id)`, com busca pela chave normalizada inclusive entre inativos; a chave possui unique próprio.
- Nome obrigatório/não vazio até 120 caracteres após limpeza, preço padrão `DECIMAL(15,2) NOT NULL` e `>= 0`. A chave normalizada ignora caixa, acentos e diferenças de espaços, mas considera pontuação; `utf8mb4_bin` protege a comparação canônica. Migration e operações foram testadas no MySQL 8 isolado.
- Imutabilidade do nome fica no DTO/service e na revisão das operações administrativas; CHECK não compara valor antigo com novo. Nunca oferecer rename no contrato.
- Item → serviço tem FK `RESTRICT` na exclusão, mesmo para item retirado. O service também verifica o vínculo antes de excluir e retorna conflito amigável; a FK é a proteção final. Não usar CASCADE que apague histórico.
- Desabilitado fica disponível para consulta histórica e para bloquear avulso correspondente; novos lançamentos cadastrados exigem reabilitação. Preço padrão novo afeta somente lançamentos futuros.

## 5. Itens diretamente na OS — persistência sugerida

`ServiceOrderBudgetItem`, tabela `service_order_budget_items`, está no schema e na migration `20261015120000_service_order_budget_items`; a migration foi aplicada somente no banco isolado de validação.

| Campo sugerido | Representação candidata | Regra/uso |
| --- | --- | --- |
| id / publicId | INT / UUID CHAR(36) unique | Item identificável, inclusive após retirada |
| serviceOrderId | FK RESTRICT | OS oficial confirmada |
| itemType | SERVICE_LABOR ou MANUAL_PART nesta fatia | STOCK_PART reservado conceitualmente à fase posterior |
| origin | REGISTERED ou MANUAL | Origem não é quarto tipo |
| serviceCatalogId | FK nullable RESTRICT | Só serviço cadastrado; nunca vincular peça avulsa |
| description / normalizedDescription | Capacidade mínima de 255 caracteres após limpeza para avulsos; representação física a revisar | Snapshot do nome ou descrição livre e chave exata |
| quantity | INT, default 1 | Inteiro ≥1; valor inicial 1, teto técnico a aprovar |
| unitPrice | DECIMAL(15,2) | Valor cobrado ≥0 |
| unitCost | DECIMAL(15,2) nullable | Só MANUAL_PART; NULL e zero distintos |
| createdAt / updatedAt | DATETIME(3) | Instantes do servidor |
| removedAt / removedByUserId | DATETIME(3) nullable / FK nullable | Retirada da composição, preservando o registro |
| createdByUserId / updatedByUserId | FKs User | Autoria |
| version | INT positivo sugerido | Rejeição de edição obsoleta |

Não é necessário persistir total atual da linha: calculá-lo no Backend, sem aceitar total no DTO. Snapshot de evento persiste os totais daquele instante para reconstrução histórica. Total cobrado da OS = soma dos totais de itens atuais, sem removidos, custo interno ou desconto. Custo total por item só quando informado; não somar desconhecido como zero nem oferecer total agregado de custo sem contrato próprio. Exibir itens atuais por `id ASC`, que reflete a inclusão; não adicionar `position`, reordenação manual ou drag-and-drop. Novo lançamento após retirada recebe novo id/publicId e aparece ao fim.

Serviço cadastrado: obter nome e preço do cadastro na transação, guardar description histórica imutável e FK. O formulário sugere o preço; unitPrice explicitamente informado é escolha do operador, não alteração do cadastro. Mudança posterior de defaultPrice não atualiza itens. Não aceitar description fornecida pelo cliente nesse tipo. Se o cadastro for desabilitado depois do lançamento, manter a linha e permitir editar quantidade/valor enquanto a OS estiver ABERTA, sem reaplicar a exigência de ativo a uma linha já existente. Um novo lançamento, mesmo na mesma OS, exige serviço reabilitado.

Mão de obra avulsa e peça avulsa: descrição manual editável enquanto ABERTA. Editar descrição reexecuta normalização, duplicidade e bloqueio contra cadastro. Não converter peça avulsa em estoque; não propor troca de tipo/origem/referência em PATCH, somente remoção e novo lançamento segundo regras aprovadas.

### 5.1 Coerência, índices e duplicidade

Sugestões de constraints:

- quantity ≥1; unitPrice ≥0; unitCost nulo ou ≥0; serviço sempre unitCost nulo.
- SERVICE_LABOR/REGISTERED exige serviceCatalogId; SERVICE_LABOR/MANUAL e MANUAL_PART/MANUAL não admitem esse vínculo. MANUAL_PART/REGISTERED é inválido.
- removedAt e removedBy devem ser ambos nulos ou preenchidos; version positivo; FKs para OS, serviço e atores, sem cascade destrutivo.
- Nome cadastrado inalterável; macrostatus ABERTA; correspondência contra catálogo; valores copiados e histórico atômico são invariantes de domínio. CHECK não consulta outras tabelas.
- Índices (serviceOrderId, removedAt, id) para itens atuais/históricos e (serviceCatalogId) para vínculo histórico/exclusão.
- Unique condicional de (serviceOrderId, serviceCatalogId) só para serviço cadastrado ATUAL; itens removidos não bloqueiam relançamento manual. Uma constraint incondicional impediria os ciclos aprovados. Em tentativa duplicada, retornar conflito com publicId do item atual para o Frontend destacá-lo; nunca somar quantidade automaticamente.
- Unique condicional para descrição avulsa normalizada na composição atual, separada por categoria: mão de obra avulsa e peça avulsa podem ter a mesma descrição entre si, mas não podem duplicá-la dentro da mesma categoria.
- Índices funcionais/chaves condicionais têm precedente nas migrations de principalidade de contatos. A expressão física e compatibilidade MySQL/Prisma devem ser validadas futuramente em banco isolado; não criar SQL nesta etapa.

Cada item removido permanece armazenado. Um novo lançamento do mesmo serviço depois da retirada é novo item, não restauração. Histórico e FK impedem excluir o serviço que já teve associação.

### 5.2 Normalização e impedimento de contorno

O helper do catálogo limpa espaços externos/duplicados e preserva caixa, acentos e pontuação no nome exibido; a chave canônica remove acentos, uniformiza caixa e espaços, mas mantém pontuação significativa. Não há fuzzy nem sinônimos. Descrição manual futura segue a mesma semântica, obrigatória e limitada a 255 caracteres após limpeza. Usar comparação exata da chave em collation binária; a estratégia física dos itens ainda requer revisão.

Ao criar/editar mão de obra avulsa, procurar chave correspondente em TODO Cadastro de Serviços, inclusive inativos. Ao criar/editar peça avulsa, a regra equivalente exige TODO catálogo de peças/produtos, inclusive inativos.

**Limitação temporal da primeira fatia:** ainda não existe catálogo/estoque de peças consultável para verificar correspondência de peça avulsa. Não inventar catálogo parcial nem afirmar que a regra definitiva foi implementada. Nesta fatia, a checagem contra cadastro de peças inexiste por falta de fonte; quando o catálogo/estoque estiver disponível, a validação passará a ser obrigatória também para registros inativos. A regra de negócio permanece válida e a limitação deve aparecer no escopo de entrega. Mão de obra avulsa já pode ser comparada ao Cadastro de Serviços desta fatia. A eventual revisão de peças avulsas criadas antes do catálogo requer decisão posterior; não alterar retroativamente seus registros por inferência.

Concorrência entre criação de cadastro e lançamento avulso precisa de um protocolo comum por chave normalizada (por exemplo, registro de chave bloqueável ou serialização coordenada) além do bloqueio da OS. A consulta de ausência isolada não impede corrida. Essa estratégia é proposta técnica a detalhar antes da implementação; não proibir retroativamente novos cadastros correspondentes a históricos sem decisão.

### 5.3 Precisão e limites propostos

Usar aritmética decimal no Backend e strings monetárias na API, nunca ponto flutuante binário como fonte de verdade. **A escala de duas casas decimais está aprovada**; preço/custo unitários usam `DECIMAL(15,2)`. Entradas com mais de duas casas são rejeitadas, sem arredondamento silencioso. Quantidade é `INT` de 1 a 999.

Calcular produtos e somas em decimal com faixa mais ampla; se persistir totais históricos tipados, propor DECIMAL(25,2) ou strings decimais no JSON. Validar overflow de quantidade × preço e da soma antes de gravar. Precisão total do DECIMAL, limites e formato textual da API ainda são propostas; não reabrir a escala aprovada de duas casas nem reutilizar limites de Pessoas como regra de orçamento.

## 6. Transações e concorrência

Proposta de sequência para mutações:

1. Autenticar e validar DTO por allowlist; resolver publicIds sem expor ids internos.
2. Abrir transação, bloquear OS, confirmar abertura oficial e macrostatus OPEN, reavaliar permissões.
3. Conferir expectedVersion do item/composição; sugerir `budgetItemsVersion` técnico na OS para detectar retirada baseada em tela antiga. Esse campo futuro não é status nem entidade de orçamento. Ao editar preço/ativação do cadastro, usar `version` ou bloqueio da linha para rejeitar edição obsoleta.
4. Bloquear serviço quando houver nova referência; verificar atividade, preço e vínculo. Em edição de linha já lançada, a posterior desabilitação do serviço não a invalida. Verificar as chaves de contorno/duplicidade conforme protocolo aprovado.
5. Calcular valores, escrever item/marcadores e evento com ator/instante do servidor.
6. Incrementar versão e confirmar atomicamente. Falha do histórico desfaz mutação; responder conflito para versão obsoleta/deadlock, sem sobrescrever escolha concorrente silenciosamente.

Todas as mutações futuras de fechamento/cancelamento precisam disputar o mesmo bloqueio da OS. Para duas edições do mesmo item, comparar sua versão sob bloqueio; para duas inclusões do mesmo serviço, bloquear OS e manter unique condicional como defesa final. Alteração de preço padrão concorrente com seleção do serviço usa leitura atual após bloquear o cadastro; um preço explicitamente enviado para a OS é valor próprio da linha. Excluir serviço concorrentemente à associação exige bloquear sua linha, verificar todos os itens históricos e contar com FK `RESTRICT` como proteção final. Retirada total e edição de item usam o mesmo bloqueio da OS e versão de composição, para que o snapshot corresponda exatamente às linhas retiradas. Não afirmar que locks eliminam erros: projetar 409 e releitura da tela. Repetição de requisição de retirada não deve criar segundo evento sem nova mudança.

## 7. Histórico, retirada total e situação

Usar `service_order_events` existente, com tipos sugeridos `ITEM_ORCAMENTO_CRIADO`, `ITEM_ORCAMENTO_ALTERADO`, `ITEM_ORCAMENTO_RETIRADO` e `ORCAMENTO_RETIRADO`. Um evento de alteração com campos alterados/before/after cobre quantidade, valor, descrição avulsa e custo; não é preciso um tipo separado para cada campo. Inclusão e remoção também registram item, ator e instante, sem justificativa obrigatória. `SITUACAO_OPERACIONAL_ALTERADA` já existe e continua registrando mudanças, inclusive autorização/recusa pela situação da OS. O `eventType` atual é String/VARCHAR(80), não enum; os novos valores e payloads continuam sugestões nesta tarefa. Reutilizar os índices existentes de eventos por OS/occurredAt e id como desempate; índice por item só se houver consulta concreta, sem inventar endpoint dedicado.

Payload proposto com versão, publicIds de OS/item, tipo/origem, descrição, quantidade, valores unitários/totais antes/depois; autoria e occurredAt em colunas do evento. Usar dados do servidor, não snapshot enviado pelo navegador. Na retirada total, capturar TODOS os itens atuais e total geral antes de marcar removedAt em todos, na mesma transação. Campos históricos e totais não são recalculados a partir do preço atual do catálogo.

Sem restauração automática: consulta dos eventos + novos lançamentos manuais. Para múltiplos ciclos, o encadeamento de eventos e os publicIds dos itens preservados bastam. O item retirado não participa do total; a unicidade incide só sobre linhas ativas. Novos itens aparecem ao fim, por ordem de inclusão.

Custo fica em subestrutura sensível explicitamente tipada no payload persistido. Na projeção, allowlist por evento E permissão, inclusive objetos aninhados/listas da retirada total; jamais repassar JSON cru. Sem custo.read omitir chaves monetárias de custo, diferenças, total de custo e valores em mensagens/resumos. Não usar null como disfarce de falta de autorização: null visível a autorizado significa custo desconhecido. Evento exclusivamente de custo pode retornar apenas metadados neutros; formato ainda sujeito a aprovação. Também filtrar respostas de mutação, logs de erro e futuras exportações. Documento do cliente omite custo mesmo quando gerado por Administrador.

Na mudança para NÃO AUTORIZADO com orçamento atual, propor ampliar o DTO existente de situação com `budgetDisposition: KEEP | REMOVE` e `expectedBudgetVersion`; perguntar antes de salvar. Validar situação, composição atual e permissões, registrar mudança e, se REMOVE, retirada completa atomicamente. Se a composição mudar entre tela e envio, rejeitar conflito e pedir releitura. Manter comportamento atual quando não houver orçamento. Também permitir AGUARDANDO APROVAÇÃO DO ORÇAMENTO sem nenhum item: não criar pré-condição de composição não vazia. Revisar o no-op da rota atual quando a situação já está vigente; ele não pode retirar composição silenciosamente. Não criar endpoint público genérico para inserir eventos ou entidade de aprovação.

Retirar a composição exige a **única permissão de editar orçamento**, além da permissão atual de mudar a situação; quem só muda situação não recebe edição de orçamento por consequência. Nome/canal/evidência/assinatura/motivo não são obrigatórios. Observação manual opcional usa o contrato próprio `POST /service-orders/:publicId/notes`; não altera orçamento nem situação. A timeline `/history` combina notas ativas e eventos automáticos, enquanto `GET /events` permanece somente leitura de eventos. A aprovação do reparo usa o evento de mudança de situação existente, sem formulário ou evento de aprovação separado.

## 8. Permissões — catálogo e orçamento implementados

| Código | Capacidade funcional |
| --- | --- |
| `services.manage` | ÚNICA permissão administrativa: criar, mudar preço, habilitar, desabilitar e excluir serviço nunca usado |
| `service_orders.budget.update` | ÚNICA permissão normal de edição: incluir, editar e retirar itens, inclusive composição inteira quando aplicável |
| `service_orders.budget.costs.read` | Visualizar custo interno da peça avulsa |
| `service_orders.budget.costs.update` | Alterar custo interno da peça avulsa; pressupõe leitura |

As quatro permissões da tabela estão no catálogo fonte do Backend; permissões de custo foram seedadas somente no banco isolado de validação. Alterar custo exige leitura de custo e edição do orçamento. Administrador segue a política central existente.

Não criar permissão de leitura do orçamento nem permissão separada de preço cobrado. `service_orders.read` dá leitura dos itens e valores cobrados, mas não do custo; histórico usa `service_orders.events.read`. A consulta auxiliar de serviços ativos para OS usa `service_orders.budget.update`; não permite administrar catálogo. As permissões implementadas são `service_orders.budget.update`, `service_orders.budget.costs.read` e `service_orders.budget.costs.update`; Administrador segue a política central.

## 9. API e DTOs implementados

Todas as rotas abaixo sob /api/v1 exigem sessão e mutações exigem CSRF. Respostas públicas usam publicId, valores monetários string e datas ISO; nunca ids internos. As rotas de itens e a consulta de serviços disponíveis estão implementadas; a consulta chama-se `/services/available-for-order`.

| Método/rota candidata | Corpo/query proposto | Finalidade |
| --- | --- | --- |
| GET /services | page, pageSize, search, status=active/inactive/all | Lista administrativa implementada; exige `services.manage`, active por padrão |
| GET /services/available-for-order | — | Lookup alfabético de serviços ativos; exige `service_orders.budget.update` |
| GET /services/:publicId | — | Detalhe cadastral administrativo |
| POST /services | name, defaultPrice | Criar, nome definitivo |
| PATCH /services/:publicId | `defaultPrice` OU `isActive`, mais `expectedVersion` | Uma ação por chamada: preço ou habilitar/desabilitar; rejeitar name |
| DELETE /services/:publicId | expectedVersion obrigatório na query | Exclusão implementada; vínculo a qualquer item histórico bloqueia a exclusão |
| GET /service-orders/:publicId/budget-items | — | Exige `service_orders.read`; itens ativos em ordem de inclusão, total atual e indicador `canReadCosts` |
| POST /service-orders/:publicId/budget-items/service | servicePublicId, quantity, unitPrice opcional | Lançar serviço cadastrado ativo |
| POST /service-orders/:publicId/budget-items/manual-labor | description, quantity, unitPrice | Lançar mão de obra avulsa |
| POST /service-orders/:publicId/budget-items/manual-part | description, quantity, unitPrice, unitCost opcional/nulo | Lançar peça avulsa |
| PATCH /service-orders/:publicId/budget-items/:itemPublicId | expectedVersion e campos editáveis | Editar campos aplicáveis |
| DELETE /service-orders/:publicId/budget-items/:itemPublicId | — | Retirada lógica, evento e novo total; sem DELETE físico |
| PATCH /service-orders/:publicId/operational-situation (existente) | operationalSituation, `withdrawBudget` opcional | Manter/retirar orçamento ao mudar para NÃO AUTORIZADO |
| GET /service-orders/:publicId/events (existente) | page, pageSize | Histórico allowlisted, estendido com filtragem de custo |

**Contrato implementado do catálogo:** `PATCH /services/:publicId` aceita `defaultPrice` OU `isActive`, exatamente um campo mutável por requisição, além de `expectedVersion`; `name` nunca é mutável. Operação que não altera o valor retorna o cadastro sem nova auditoria nem incremento de versão; mudança efetiva registra evento. `services.manage` governa todas as rotas administrativas. A listagem é ordenada por nome exibido e id, com paginação obrigatória até 100 e filtro ativo por padrão. `/services/available` continua futura, para a missão de itens de orçamento.

Não criar rota autônoma Budget/status/restore/approve. Retirada total acontece pela decisão em situação NÃO AUTORIZADO, exigindo também edição de orçamento. Uma OS pode estar aguardando aprovação com lista vazia. Revisar tratamento de situação já vigente para não criar mutação oculta no atual no-op.

Exemplos de DTOs de criação sugeridos (quantidade efetiva obrigatória; interface inicia em 1):

- Serviço cadastrado: { itemType: "SERVICE_LABOR", origin: "REGISTERED", servicePublicId: UUID, quantity: 1, unitPrice: "150.00", expectedBudgetVersion: 3 }.
- Mão de obra avulsa: { itemType: "SERVICE_LABOR", origin: "MANUAL", description: "REPARO ESPECÍFICO", quantity: 1, unitPrice: "0.00", expectedBudgetVersion: 3 }.
- Peça avulsa: { itemType: "MANUAL_PART", origin: "MANUAL", description: "PEÇA ESPECÍFICA", quantity: 2, unitPrice: "25.00", unitCost: null, expectedBudgetVersion: 3 }.

Sem permissão de custo, cliente omite unitCost; Backend rejeita qualquer tentativa de escrevê-lo, inclusive null. Omissão na criação significa não informado; PATCH omitido preserva, null limpa somente com permissão. Serviço rejeita unitCost mesmo null. `defaultPrice` e `unitPrice` aceitam "0.00" e rejeitam negativos; apenas o primeiro não aceita NULL. Aceitar valores monetários com até duas casas, normalizar resposta em duas casas e calcular no Backend. Totais, autores, timestamps, normalizedName/Description e removedAt nunca são aceitos como entrada. O `PATCH` de serviço aceita exatamente um campo mutável por chamada; criação usa nome normalizado único globalmente.

Erros sugeridos: 400 formato/campo incompatível; 401 sessão; 403 permissão/CSRF; 404 OS/item/serviço; 409 OS não aberta, versão obsoleta, duplicidade, correspondência cadastral ou exclusão vinculada. Na duplicidade do mesmo serviço cadastrado ativo na OS, `409` sugere código próprio e publicId do item existente para destaque/navegação, **sem** criar linha ou incrementar quantidade. Não vazar custo interno em detalhes. Códigos definitivos e semântica de repetição dependem de contrato aprovado.

## 10. Histórico manual da OS — inspeção e dependência

O Backend atual tem somente `GET /api/v1/service-orders/:publicId/events`, protegido por `service_orders.events.read`, e registra eventos automáticos. Não há endpoint de escrita de observação/evento manual, permissão correspondente ou interface para lançá-lo. O sanitizador atual expõe apenas campos permitidos de tipos conhecidos. A observação voluntária “Cliente autorizou pelo WhatsApp” ainda não pode ser inserida pelo operador na aplicação.

Recomendação: tratar a anotação manual como fatia própria do histórico da OS, com contrato de autorização, DTO textual, auditoria e projeção segura. Ela não bloqueia o registro automático da mudança de situação nem exige canal, evidência ou motivo para autorizar/recusar; porém, a experiência opcional prometida depende dessa fatia para ficar disponível. Não criar rota pública de evento genérico neste recorte por inferência.

## 11. Frontend proposto

Cadastro de Serviços: listagem paginada e pesquisa, ativo/inativo, criação com nome/preço (inclusive zero), nome somente leitura após salvar, alteração de preço, habilitar/desabilitar e exclusão condicionada a ausência histórica de vínculo. Se houver nome de serviço desabilitado, oferecer reabilitar o registro existente ao autorizado, sem criar duplicata. Explicar bloqueio sem oferecer renomear serviço usado; mostrar eventos de preço/ativação/exclusão via consulta administrativa futura.

Detalhe da OS: seção Orçamento com linhas individuais na ordem de inclusão, sem reordenação, quantidade iniciada em 1, unitário/total e total atual; Serviço/Mão de obra permite selecionar cadastrado (nome travado, preço sugerido) ou informar avulso. Peça avulsa com descrição livre e custo opcional somente se autorizado. Duplicidade de serviço cadastrado destaca/navega até a linha existente, sem somar quantidade. Novo item após retirada aparece ao final. A situação AGUARDANDO APROVAÇÃO não exige itens. Não mostrar peça do estoque como ação disponível nesta fatia; comunicar etapa futura sem criar quarto tipo.

Sem custo.read não montar campos, colunas ou tooltips de custo; com leitura mas sem alteração, somente consulta. OS FECHADA/CANCELADA em leitura. Confirmar retirada e permitir consultar histórico, sem “Restaurar”. Na situação NÃO AUTORIZADO, perguntar manter/retirar; sem justificativa obrigatória. Resolver 409 com releitura preservando contexto, sem sobrescrever silenciosamente.

## 12. Validações executadas

As migrations do catálogo e dos itens foram aplicadas no banco isolado `gestor_os_opening_test`, MySQL 8.0.46, e `prisma migrate status` confirmou o histórico atualizado nesse banco. A inspeção física confirmou as tabelas e os três índices funcionais únicos.

- Backend: `prisma validate`, `prisma generate`, teste unitário direto (9/9) e `npx tsc --noEmit` passaram. `npm run build` passou durante a implementação; a repetição final encontrou `EPERM` ao tentar limpar `backend/dist` enquanto processos Node locais estavam ativos. Não foram encerrados processos nem apagados artefatos manualmente.
- Frontend: 109 testes passaram em seis arquivos; typecheck e build de produção passaram.
- HTTP autenticado no banco isolado: leitura vazia, inclusão cadastrada e cópia do preço, serviço desabilitado, edição, mão de obra e peças, normalização/duplicidade, CSRF, custo nulo/zero/oculto/preservado, remoção e relançamento, concorrência de inclusão, bloqueio de exclusão de serviço vinculado, retirada integral com NÃO AUTORIZADO e snapshots de histórico. O script remove os registros descartáveis ao terminar.
- Nenhuma chamada usou o banco principal `gestor_os`; não houve estoque nem lançamento financeiro.

## 13. Decisões pendentes e ordem recomendada

1. A duplicidade de descrições avulsas foi decidida: separada por categoria, permitindo a mesma descrição entre categorias.
2. Os códigos técnicos das permissões, rotas, DTOs e modelo físico dos itens foram aprovados e implementados nesta fatia.
3. Os limites físicos aplicados são quantidade 1–999, valor/custo unitários até 999999.99 e `DECIMAL(15,2)`; as chaves normalizadas usam comparação binária e unicidade condicional para itens ativos.
4. Limitação temporal aceita no desenho: sem catálogo/estoque consultável na primeira fatia, não há como conferir peça avulsa equivalente; a regra definitiva será exigida quando houver catálogo. Detalhar futuramente o tratamento de peças avulsas anteriores, sem alterar registros por inferência.
5. Observação manual opcional já usa `/notes`; não criar aprovação estruturada nem endpoint genérico por inferência.
6. A consulta de seleção `GET /services/available-for-order` retorna somente serviços ativos em ordem alfabética e exige `service_orders.budget.update`; serviço desabilitado já usado permanece visível/editável na OS existente.
7. PDF/impressão, envio, validade e aprovação parcial continuam sem desenho aprovado. Não impor novo aceite automático. Estoque, fiscal, faturamento e desconto no fechamento seguem posteriores.

Próxima tarefa recomendada: auditoria técnica final e versionamento local. Aplicar as migrations no banco principal exige etapa separada e autorização explícita. A ausência temporal do catálogo de peças deve continuar visível no escopo e nos critérios da entrega.
