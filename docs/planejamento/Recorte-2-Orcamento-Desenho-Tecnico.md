# Recorte 2 — Cadastro de Serviços e orçamento simplificado da OS

**Status:** regras funcionais aprovadas por Marcos, consolidadas em [Regras de Negócio](../02-Regras-de-Negocio.md), seção “Orçamento simplificado da OS — decisões aprovadas”. Este documento fecha uma **proposta técnica para revisão**, sem schema, migration, Backend, Frontend ou seed implementados. Nomes físicos, rotas, DTOs, códigos de permissão, limites e constraints ainda não são contratos aprovados de implementação.

## 1. Escopo aprovado e limites

A primeira fatia abrange Cadastro de Serviços, Serviço/Mão de obra (origens CADASTRADA e AVULSA) e Peça avulsa. Uma OS admite vários itens individuais, inclusive serviços cadastrados e mão de obra avulsa simultaneamente. Peça do estoque continua sendo o terceiro tipo oficial, mas será implementada depois. Não há tipo Outro, custo de serviço, entidade de aprovação, status/fluxo próprio de orçamento ou restauração automática.

Quantidade obrigatória, inicialmente 1, inteira e positiva. Valor cobrado não negativo, inclusive zero; total calculado = quantidade × valor unitário. Total atual da OS = soma das linhas ativas, sem itens retirados, custo, desconto ou itens somente históricos. Valores monetários têm duas casas decimais; Backend calcula, totais não são entrada e não se usa float. A precisão física do DECIMAL permanece proposta. Peça avulsa admite custo unitário opcional não negativo: NULL desconhecido, zero conhecido; total de custo segue essa distinção. Nenhum custo em Serviço/Mão de obra nesta fatia.

OS ABERTA aceita inclusão/edição/retirada mesmo após autorização, com histórico, sem nova aprovação automática ou mudança de situação. FECHADA/CANCELADA é somente consulta; correções dependem da reabertura própria da OS. Não criar desconto, discountType, acréscimo ou financeiro no orçamento: desconto único no fechamento é FUTURO FATURAMENTO, em valor ou percentual.

## 2. Padrões observados no repositório

Consulta estática, sem banco nem execução funcional:

- Prisma: id interno inteiro e publicId UUID em CHAR(36), timestamps DATETIME(3), FKs restritivas e modelos mapeados para snake_case. Não há ServiceCatalog, item de orçamento ou modelo de produto/estoque.
- EquipmentLookupService e DTOs de Pessoas: consulta paginada, filtro de ativos quando aplicável, ordenação estável com id interno como desempate e projeção pública sem expor id.
- normalizeGeneralText em Pessoas: trim, colapso de espaços e caixa alta pt-BR. A comparação exata de orçamento requer chave normalizada própria; não pressupor que a collation global tenha a mesma semântica.
- AuthPolicyService/guards: sessão, permissão explícita, Administrador e CSRF em mutações. O catálogo atual não possui permissões de serviços/orçamento.
- ServiceOrderOperationalSituationService: transação Prisma, bloqueio da OS por FOR UPDATE, revalidação de macrostatus/permissão e evento na mesma transação. Reaproveitar o padrão, não copiar autorização espalhada.
- ServiceOrderEventsReadService: eventos paginados por occurredAt/id e payloads por allowlist. Ainda não trata custo, snapshots de itens nem inserção de observação manual.
- Frontend: React/TypeScript, rotas por hash, cliente HTTP, estados de carregamento/erro e paginação; telas de OS e login existentes. Não há tela administrativa genérica de Serviços pronta.
- Valores monetários devem ser DECIMAL conforme docs/03; não foi encontrado modelo monetário implementado que fixe precisão para esta fatia. O histórico existente usa eventos, não um mecanismo genérico de soft deletion para itens.

Não criar repositories que só repitam Prisma; domínio coordena transações e infraestrutura permanece genérica, conforme DA-017.

## 3. Comparação arquitetural

| Opção | Benefícios | Custo e adequação |
| --- | --- | --- |
| A: ServiceOrder → Budget → BudgetItem | Agrupa documento/revisões se houvesse identidade e ciclo próprios | Cria entidade extra sem comportamento aprovado; induz estados e restauração que não existem. Não necessária para retirar uma composição. |
| B: ServiceOrder → ServiceOrderBudgetItem + eventos | Itens ligados à OS; retirada por item, fotografia da composição no evento; novos ciclos são novos lançamentos | Requer transação para retirar conjunto e histórico consistente; não precisa Budget nem BudgetStatus. |

**Recomendação técnica: opção B.** Não criar tabela principal de orçamento. A composição atual é o conjunto de itens com removedAt nulo. Retirar todos marca os itens e grava uma fotografia da composição; novos lançamentos recebem novos publicIds e ficam no fim da ordem de inclusão. Não inventar número de ciclo, versão de orçamento, restauração ou status. Campo técnico de concorrência da composição não é estado de orçamento.

## 4. Cadastro de Serviços — persistência sugerida

Entidade candidata ServiceCatalog, tabela service_catalog. Distingui-la dos services NestJS e do tipo Serviço/Mão de obra.

| Campo sugerido | Representação candidata | Finalidade |
| --- | --- | --- |
| id / publicId | INT / UUID CHAR(36) unique | Relações internas / identidade pública |
| name | VARCHAR(191), obrigatório | Nome imutável, normalizado conforme regra textual |
| normalizedName | VARCHAR(191), obrigatório | Correspondência exata, independente da exibição |
| defaultPrice | DECIMAL(15,2), obrigatório, sem NULL | Preço padrão alterável; zero permitido, negativo proibido (regra aprovada); precisão física sugerida |
| isActive | boolean | Habilitado/desabilitado; default proposto true |
| createdAt / updatedAt | DATETIME(3) | Instantes do servidor |
| createdByUserId / updatedByUserId | FK User | Autoria das operações |
| version | INT positivo | Controle otimista proposto contra edição perdida |

Campos/tamanhos são propostas, não limites funcionais já aprovados. Preço e ativação são editáveis; name e normalizedName não entram no DTO de alteração e não são mutáveis no service. Rejeitar tentativa de renomear em vez de ignorá-la. Mudança de nome exige outro cadastro. Ajuste de preço só altera defaultPrice, nunca itens existentes. Serviço desabilitado continua referenciado pelas OS existentes; seus itens atuais permanecem editáveis enquanto a OS estiver ABERTA. Somente novos lançamentos exigem serviço ativo. Para voltar a lançar em outra OS, reabilitar o cadastro existente.

Auditoria sugerida: eventos de criação, preço alterado, habilitação/desabilitação e exclusão no `admin_audit_log` existente, todos na mesma transação da mutação e sem justificativa obrigatória. Preço alterado: serviço/publicId, preço anterior e novo, ator e instante. Ativação: serviço/publicId, ação, ator e instante. Exclusão física: guardar **antes de excluir** snapshot imutável em `details_json` com publicId, nome e preço padrão vigente; `actor_user_id` e `occurred_at` já registram usuário e hora. Não usar FK de `admin_audit_log` para o serviço apagado; o modelo atual só tem `target_user_id` para usuários. Soft delete com unique global manteria o nome reservado; liberá-lo exigiria uma exceção adicional na unicidade e no ciclo do cadastro. Exclusão física de serviço nunca associado, com snapshot administrativo preservado, atende diretamente à reutilização aprovada. A guarda transacional e a FK restritiva dos itens impedem excluir se houve qualquer associação, inclusive item retirado.

### 4.1 Duplicidade, índices e constraints

- Unique publicId e **unique global de normalizedName, sem filtrar por atividade**. A chave permanece ocupada pelo serviço desabilitado e é liberada apenas após exclusão física permitida. Reabilitar atualiza o cadastro existente, sem nova linha.
- Índice de consulta `(isActive, normalizedName, id)` e busca pela chave normalizada inclusive inativos. Avaliar redundância dos índices na migration para evitar duplicação inútil.
- Nome obrigatório/não vazio, preço padrão `NOT NULL` e `>= 0` com duas casas. O tamanho do nome, a precisão DECIMAL e a collation física continuam propostas. A chave deve aplicar exatamente a normalização aprovada, sem equivalência involuntária por collation acento insensível; testar no MySQL 8 isolado.
- Imutabilidade do nome fica no DTO/service e na revisão das operações administrativas; CHECK não compara valor antigo com novo. Nunca oferecer rename no contrato.
- Item → serviço com FK RESTRICT na exclusão, mesmo para item retirado. Checar vínculo e excluir na mesma transação; a FK é defesa final contra corrida com associação. Não usar CASCADE que apague histórico.
- Desabilitado fica disponível para consulta histórica e para bloquear avulso correspondente; novos lançamentos cadastrados exigem reabilitação. Preço padrão novo afeta somente lançamentos futuros.

## 5. Itens diretamente na OS — persistência sugerida

Entidade ServiceOrderBudgetItem, tabela service_order_budget_items. Não é schema Prisma pronto para aplicar.

| Campo sugerido | Representação candidata | Regra/uso |
| --- | --- | --- |
| id / publicId | INT / UUID CHAR(36) unique | Item identificável, inclusive após retirada |
| serviceOrderId | FK RESTRICT | OS oficial confirmada |
| itemType | SERVICE_LABOR ou MANUAL_PART nesta fatia | STOCK_PART reservado conceitualmente à fase posterior |
| origin | REGISTERED ou MANUAL | Origem não é quarto tipo |
| serviceCatalogId | FK nullable RESTRICT | Só serviço cadastrado; nunca vincular peça avulsa |
| description / normalizedDescription | VARCHAR(191) sugerido | Snapshot do nome ou descrição livre e chave exata |
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
- Unique condicional para descrição avulsa normalizada na composição atual. **Pendente:** unicidade separada por tipo ou conjunta entre mão de obra avulsa e peça avulsa. Não fixar a chave antes da resposta.
- Índices funcionais/chaves condicionais têm precedente nas migrations de principalidade de contatos. A expressão física e compatibilidade MySQL/Prisma devem ser validadas futuramente em banco isolado; não criar SQL nesta etapa.

Cada item removido permanece armazenado. Um novo lançamento do mesmo serviço depois da retirada é novo item, não restauração. Histórico e FK impedem excluir o serviço que já teve associação.

### 5.2 Normalização e impedimento de contorno

Propor helper compartilhável com semântica observada: trim → substituir sequências de espaços por um espaço → caixa alta pt-BR. Não remover acentos, pontuação nem fazer fuzzy/sinônimos por inferência. Usar comparação exata da chave; uma collation que ignore acentos pode equiparar nomes além da regra aprovada. Sugerir collation binária/adequada à chave canônica, sujeita a teste e escolha física posterior.

Ao criar/editar mão de obra avulsa, procurar chave correspondente em TODO Cadastro de Serviços, inclusive inativos. Ao criar/editar peça avulsa, a regra equivalente exige TODO catálogo de peças/produtos, inclusive inativos.

**Limitação temporal da primeira fatia:** ainda não existe catálogo/estoque de peças consultável para verificar correspondência de peça avulsa. Não inventar catálogo parcial nem afirmar que a regra definitiva foi implementada. Nesta fatia, a checagem contra cadastro de peças inexiste por falta de fonte; quando o catálogo/estoque estiver disponível, a validação passará a ser obrigatória também para registros inativos. A regra de negócio permanece válida e a limitação deve aparecer no escopo de entrega. Mão de obra avulsa já pode ser comparada ao Cadastro de Serviços desta fatia. A eventual revisão de peças avulsas criadas antes do catálogo requer decisão posterior; não alterar retroativamente seus registros por inferência.

Concorrência entre criação de cadastro e lançamento avulso precisa de um protocolo comum por chave normalizada (por exemplo, registro de chave bloqueável ou serialização coordenada) além do bloqueio da OS. A consulta de ausência isolada não impede corrida. Essa estratégia é proposta técnica a detalhar antes da implementação; não proibir retroativamente novos cadastros correspondentes a históricos sem decisão.

### 5.3 Precisão e limites propostos

Usar aritmética decimal no Backend e strings monetárias na API, nunca ponto flutuante binário como fonte de verdade. **A escala de duas casas decimais está aprovada**; DECIMAL(15,2) para preço/custo unitários continua proposta física. Rejeitar entrada com mais de duas casas, sem arredondar silenciosamente. Quantidade INT positivo com teto técnico explícito; validar também intervalo inteiro seguro de DTO/paginação.

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

Retirar a composição exige a **única permissão de editar orçamento**, além da permissão atual de mudar a situação; quem só muda situação não recebe edição de orçamento por consequência. Nome/canal/evidência/assinatura/motivo não são obrigatórios. Observação manual opcional no histórico é regra aprovada, mas o contrato de escrita ainda não existe e requer fatia própria; a atual GET /events não recebe escrita. A aprovação do reparo usa o evento de mudança de situação existente, sem formulário ou evento de aprovação separado.

## 8. Permissões — categorias aprovadas, códigos técnicos propostos

| Código candidato | Capacidade funcional aprovada |
| --- | --- |
| `services.manage` | ÚNICA permissão administrativa: criar, mudar preço, habilitar, desabilitar e excluir serviço nunca usado |
| `service_orders.budget.update` | ÚNICA permissão normal de edição: incluir, editar e retirar itens, inclusive composição inteira quando aplicável |
| `service_orders.budget.costs.read` | Visualizar custo interno da peça avulsa |
| `service_orders.budget.costs.update` | Alterar custo interno da peça avulsa; pressupõe leitura |

As quatro **categorias e sua granularidade estão aprovadas**; os códigos acima são proposta de nomenclatura, ainda não adicionada ao catálogo ou seed. A separação funcional visualizar/alterar custo já está aprovada. Política central sugerida: `costs.update` pressupõe capacidade efetiva `costs.read`, sem conceder edição geral por consequência; escrita de custo exige também `budget.update`. Concessão/revogação deve preservar essa dependência. Administrador segue política central existente.

Não criar permissão de leitura do orçamento nem permissão separada de preço cobrado. `service_orders.read` dá leitura de itens, descrições, quantidades, valores cobrados e total atual, mas não do custo; histórico usa `service_orders.events.read` e mutação da situação usa `service_orders.situation.update`. Consulta administrativa do catálogo usa `services.manage`; a consulta auxiliar de serviços ativos para a OS usa `service_orders.budget.update` e não permite administrar catálogo. O guard atual exige TODAS as permissões declaradas: não modelar “manage OU budget.update” como uma chamada simples a `@RequirePermissions`. Administrador segue a política central. Não adicionar permissões ao seed neste trabalho.

## 9. API e DTOs propostos — contratos a revisar

Todas as rotas abaixo sob /api/v1, sessão obrigatória e CSRF em mutações. Respostas públicas com publicId, valores monetários string e datas ISO; nunca ids internos. Listas paginadas com page/pageSize obrigatórios, máximo sugerido 100 e deslocamento seguro, ordenação estável. Não implementar rotas nesta tarefa.

| Método/rota candidata | Corpo/query proposto | Finalidade |
| --- | --- | --- |
| GET /services | page, pageSize, search, includeInactive | Lista administrativa; exige `services.manage` |
| GET /services/available | page, pageSize, search | Lookup de ativos para editor da OS; exige `service_orders.budget.update` |
| GET /services/:publicId | — | Detalhe cadastral administrativo |
| POST /services | name, defaultPrice | Criar, nome definitivo |
| PATCH /services/:publicId | `defaultPrice` OU `isActive`, mais `expectedVersion` | Uma ação por chamada: preço ou habilitar/desabilitar; rejeitar name |
| DELETE /services/:publicId | expectedVersion a definir no contrato | Exclusão somente nunca associado |
| GET /service-orders/:publicId/budget-items | page, pageSize | Exige `service_orders.read`; itens atuais em ordem de inclusão, total de TODA composição e versão |
| POST /service-orders/:publicId/budget-items | união discriminada descrita abaixo | Criar item |
| PATCH /service-orders/:publicId/budget-items/:itemPublicId | quantity, unitPrice, description avulsa, unitCost se permitido, expectedVersion | Editar campos aplicáveis |
| POST /service-orders/:publicId/budget-items/:itemPublicId/remove | expectedVersion | Retirada lógica, evento e novo total; sem DELETE físico |
| PATCH /service-orders/:publicId/operational-situation (existente) | situação + budgetDisposition/expectedBudgetVersion propostos | Manter/retirar orçamento no não autorizado |
| GET /service-orders/:publicId/events (existente) | page, pageSize | Histórico allowlisted, estendido com filtragem de custo |

**Escolha de contrato candidata:** `PATCH /services/:publicId` com allowlist de `defaultPrice` OU `isActive`, um campo mutável por requisição, é mais simples que rotas separadas `/price`, `/enable` e `/disable` e gera evento administrativo inequívoco por ação. `name` nunca é mutável. O mesmo `services.manage` governa todas as mutações administrativas. A separação entre listagem administrativa e `/services/available` evita regra “OU” no guard atual e impede que o editor do orçamento consulte inativos pela rota auxiliar. Ordenar listagens por nome normalizado e id; limite de paginação e validação devem seguir os padrões existentes. Os nomes de rota/DTO ainda precisam de aprovação contratual.

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

## 12. Testes futuros e validação operacional

Nenhum teste funcional será executado nesta tarefa documental.

- Cadastro: nome obrigatório/imutável em PATCH, normalização, unicidade entre ativos E desabilitados, reabilitação da mesma linha, preço padrão obrigatório/zero aceito/negativo rejeitado, mudança sem propagação retroativa, exclusão real sem associação liberando nome versus vínculo histórico retirado impedindo exclusão, habilitação/desabilitação e auditoria administrativa de preço/ativação/exclusão com ator/instante sem justificativa.
- Itens: os dois tipos da fatia, as duas origens do serviço sem quarto tipo, múltiplas linhas diferentes, duplicidade de serviço com conflito/destaque sem incremento automático, avulsos sem duplicata em cada tipo, bloqueio por cadastro ativo/inativo na criação/edição de avulso, item cadastrado já lançado ainda editável após desabilitação, ausência de sinônimos/fuzzy, peças sem conversão/estoque e limitação temporal documentada enquanto o catálogo de peças inexiste.
- Quantidade/valores: 1 inicial na tela, zero/negativo/fração rejeitados na quantidade, cobrança zero aceita, monetários com duas casas, cálculos exatos sem float nem total informado pelo cliente, custo null diferente de zero, custo negativo rejeitado, serviço sem custo, total atual só com itens ativos e overflow/limites conforme contrato final.
- Segurança: 401/403/CSRF, uma só permissão administrativa para todas as mutações do cadastro, leitura do orçamento por `service_orders.read` sem custo, custo ausente de consulta/resposta de mutação/histórico aninhado/erros/documento do cliente para quem não pode ver; alteração de custo pressupõe leitura e edição de orçamento; nome/total/ator manipulados rejeitados.
- Ciclo: AGUARDANDO APROVAÇÃO permitido sem itens, editar após autorizado sem mudar situação/reaprovar nem justificar; FECHADA/CANCELADA bloqueiam mutações; remover item preserva snapshot e retira do total; retirar tudo conserva total/itens históricos; novo ciclo manual sem restauração, ordenado pela inclusão.
- Transações/concorrência: dois lançamentos iguais, editar/retirar, mudar situação/retirar todos com nova linha concorrente, fechar/editar, excluir cadastro/associar, criar cadastro/avulso; falha de evento reverte dados.
- Frontend: permissão e estados carregando/vazio/erro, paginação/total geral independente da página, preço sugerido editável, nome travado, custo invisível/readonly/editável, escolha não autorizado, histórico seguro e conflito.
- Operacional futura: HTTP e navegador com banco descartável explicitamente identificado; conferir eventos, saldos inalterados e ausência de financeiro; nunca usar principal por inferência. Migration futura deve testar FKs, CHECKs e uniques condicionais no MySQL isolado antes de autorização de deploy.

## 13. Decisões pendentes e ordem recomendada

1. Marcos: duplicidade de descrições avulsas **entre** Mão de obra avulsa e Peça avulsa; dentro de cada categoria o bloqueio já está aprovado.
2. Revisão do contrato proposto: códigos técnicos das quatro permissões, rotas, DTOs, erros, consulta auxiliar de serviços, transação de manter/retirar e edição concorrente. Categorias e granularidade funcional de permissão já estão aprovadas.
3. Aprovação física: comprimentos e máximos de quantidade/valores, precisão DECIMAL além da escala aprovada de duas casas, collation da chave normalizada e garantia concorrente. Zero/negativo do preço padrão e do valor cobrado já estão decididos.
4. Limitação temporal aceita no desenho: sem catálogo/estoque consultável na primeira fatia, não há como conferir peça avulsa equivalente; a regra definitiva será exigida quando houver catálogo. Detalhar futuramente o tratamento de peças avulsas anteriores, sem alterar registros por inferência.
5. Fatia futura de observação manual opcional no histórico da OS; hoje há apenas eventos automáticos e GET. Não criar aprovação estruturada nem endpoint genérico por inferência.
6. Confirmar detalhes técnicos ainda sugeridos, como default de atividade e máximo do nome. Seleção de desabilitado para novo lançamento está vedada pela decisão aprovada; reabilitar antes.
7. PDF/impressão, envio, validade e aprovação parcial continuam sem desenho aprovado. Não impor novo aceite automático. Estoque, fiscal, faturamento e desconto no fechamento seguem posteriores.

Próxima tarefa recomendada: revisar o contrato proposto e decidir a duplicidade entre os dois tipos avulsos. Em seguida, aprovar modelo físico/migration sob autorização específica. A ausência temporal do catálogo de peças deve continuar visível no escopo e nos critérios da primeira entrega.
