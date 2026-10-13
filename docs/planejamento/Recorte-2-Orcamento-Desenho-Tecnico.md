# Recorte 2 — Cadastro de Serviços e orçamento simplificado da OS

**Status:** regras funcionais aprovadas por Marcos, consolidadas em [Regras de Negócio](../02-Regras-de-Negocio.md), seção “Orçamento simplificado da OS — decisões aprovadas”. Este desenho é SUGESTÃO TÉCNICA, sem schema, migration, Backend, Frontend ou seed implementados. Nomes físicos, rotas, DTOs, códigos de permissão, limites e constraints propostos dependem de revisão antes da implementação.

## 1. Escopo aprovado e limites

A primeira fatia abrange Cadastro de Serviços, Serviço/Mão de obra (origens CADASTRADA e AVULSA) e Peça avulsa. Uma OS admite vários itens individuais, inclusive serviços cadastrados e mão de obra avulsa simultaneamente. Peça do estoque continua sendo o terceiro tipo oficial, mas será implementada depois. Não há tipo Outro, custo de serviço, entidade de aprovação, status/fluxo próprio de orçamento ou restauração automática.

Quantidade obrigatória, inicialmente 1, inteira e positiva. Valor cobrado não negativo, inclusive zero; total calculado = quantidade × valor unitário. Peça avulsa admite custo unitário opcional não negativo: NULL desconhecido, zero conhecido; total de custo segue essa distinção. Nenhum custo em Serviço/Mão de obra nesta fatia.

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

**Recomendação técnica: opção B.** Não criar tabela principal de orçamento. A composição atual é o conjunto de itens com removedAt nulo. Retirar todos marca os itens e grava uma fotografia da composição; novos lançamentos recebem novos publicIds. Não inventar número de ciclo, versão de orçamento, restauração ou status. Campo técnico de concorrência da composição não é estado de orçamento.

## 4. Cadastro de Serviços — persistência sugerida

Entidade candidata ServiceCatalog, tabela service_catalog. Distingui-la dos services NestJS e do tipo Serviço/Mão de obra.

| Campo sugerido | Representação candidata | Finalidade |
| --- | --- | --- |
| id / publicId | INT / UUID CHAR(36) unique | Relações internas / identidade pública |
| name | VARCHAR(191), obrigatório | Nome imutável, normalizado conforme regra textual |
| normalizedName | VARCHAR(191), obrigatório | Correspondência exata, independente da exibição |
| defaultPrice | DECIMAL(15,2), obrigatório | Preço padrão alterável; sugere-se não negativo, inclusive zero, a confirmar para o cadastro |
| isActive | boolean | Habilitado/desabilitado; default proposto true |
| createdAt / updatedAt | DATETIME(3) | Instantes do servidor |
| createdByUserId / updatedByUserId | FK User | Autoria das operações |
| version | INT positivo | Controle otimista proposto contra edição perdida |

Campos/tamanhos são propostas, não limites funcionais já aprovados. Preço e ativação são editáveis; name e normalizedName não entram no DTO de alteração e não são mutáveis no service. Rejeitar tentativa de renomear em vez de ignorá-la. Mudança de nome exige outro cadastro. Ajuste de preço só altera defaultPrice, nunca itens existentes.

Auditoria sugerida: eventos de criação, alteração de preço, habilitação/desabilitação e exclusão sem vínculo no Log Administrativo existente, com publicId, ator, instante e before/after permitidos; não criar um segundo log administrativo. Exclusão só depois de consultar vínculos históricos, inclusive itens retirados. Manter snapshot do cadastro no log de exclusão sem FK obrigatória que inviabilize a exclusão permitida. Definir códigos e consulta desse log antes de implementar.

### 4.1 Duplicidade, índices e constraints

- Unique publicId; índice de consulta (isActive, normalizedName, id); índice normalizedName para a busca de correspondência inclusive inativos.
- Unicidade de normalizedName ENTRE ATIVOS aprovada. Candidata: chave única condicional que só contribui quando isActive, sem bloquear vários inativos por hipótese.
- **DECISÃO PENDENTE DE MARCOS:** pode criar serviço ativo com mesmo nome de um desabilitado? Não há decisão localizada que resolva isso. Não propor unique global definitivo nem permitir reutilização implicitamente. A escolha afeta criação, reativação e migração; o índice condicional é apenas garantia mínima entre ativos.
- Propor validação de nome não vazio; faixa de preço, tamanho e CHECKs só após fechar limites. Imutabilidade do nome fica no domínio/DTO e testes, não presumir que CHECK assegure comparação com valor anterior.
- Item → serviço com FK RESTRICT na exclusão, mesmo para item retirado. Consulta e exclusão do cadastro devem ser transacionais e disputar o mesmo bloqueio do lançamento para impedir corrida entre excluir e associar.
- Excluir definitivamente cadastro nunca associado é permitido; desabilitar cadastro usado preserva referências. Não usar CASCADE que apague itens/histórico.
- Sugestão: somente ativos selecionáveis em novos itens; inativos legíveis em itens/histórico e presentes na verificação contra contorno. Confirmar este comportamento para o Cadastro de Serviços na aprovação técnica.

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
| quantity | INT, default 1 | Inteiro ≥1; teto técnico a aprovar |
| unitPrice | DECIMAL(15,2) | Valor cobrado ≥0 |
| unitCost | DECIMAL(15,2) nullable | Só MANUAL_PART; NULL e zero distintos |
| createdAt / updatedAt | DATETIME(3) | Instantes do servidor |
| removedAt / removedByUserId | DATETIME(3) nullable / FK nullable | Retirada da composição, preservando o registro |
| createdByUserId / updatedByUserId | FKs User | Autoria |
| version | INT positivo sugerido | Rejeição de edição obsoleta |

Não é necessário persistir total atual da linha: calculá-lo no Backend. Snapshot de evento persiste os totais daquele instante para reconstrução histórica. Total cobrado da OS = soma dos totais de itens atuais, sem desconto/acréscimo. Custo total por item só quando informado; não somar desconhecido como zero nem oferecer total agregado de custo sem contrato próprio.

Serviço cadastrado: obter nome e preço do cadastro na transação, guardar description histórica imutável e FK. O formulário sugere o preço; unitPrice explicitamente informado é escolha do operador, não alteração do cadastro. Mudança posterior de defaultPrice não atualiza itens. Não aceitar description fornecida pelo cliente nesse tipo.

Mão de obra avulsa e peça avulsa: descrição manual editável enquanto ABERTA. Editar descrição reexecuta normalização, duplicidade e bloqueio contra cadastro. Não converter peça avulsa em estoque; não propor troca de tipo/origem/referência em PATCH, somente remoção e novo lançamento segundo regras aprovadas.

### 5.1 Coerência, índices e duplicidade

Sugestões de constraints:

- quantity ≥1; unitPrice ≥0; unitCost nulo ou ≥0; serviço sempre unitCost nulo.
- SERVICE_LABOR/REGISTERED exige serviceCatalogId; SERVICE_LABOR/MANUAL e MANUAL_PART/MANUAL não admitem esse vínculo. MANUAL_PART/REGISTERED é inválido.
- removedAt e removedBy devem ser ambos nulos ou preenchidos; version positivo; FKs para OS, serviço e atores, sem cascade destrutivo.
- Nome cadastrado inalterável; macrostatus ABERTA; correspondência contra catálogo; valores copiados e histórico atômico são invariantes de domínio. CHECK não consulta outras tabelas.
- Índices (serviceOrderId, removedAt, id) para itens atuais/históricos e (serviceCatalogId) para vínculo histórico/exclusão.
- Unique condicional de (serviceOrderId, serviceCatalogId) só para serviço cadastrado ATUAL; itens removidos não bloqueiam relançamento manual. Uma constraint incondicional impediria os ciclos aprovados.
- Unique condicional para descrição avulsa normalizada na composição atual. **Pendente:** unicidade separada por tipo ou conjunta entre mão de obra avulsa e peça avulsa. Não fixar a chave antes da resposta.
- Índices funcionais/chaves condicionais têm precedente nas migrations de principalidade de contatos. A expressão física e compatibilidade MySQL/Prisma devem ser validadas futuramente em banco isolado; não criar SQL nesta etapa.

Cada item removido permanece armazenado. Um novo lançamento do mesmo serviço depois da retirada é novo item, não restauração. Histórico e FK impedem excluir o serviço que já teve associação.

### 5.2 Normalização e impedimento de contorno

Propor helper compartilhável com semântica observada: trim → substituir sequências de espaços por um espaço → caixa alta pt-BR. Não remover acentos, pontuação nem fazer fuzzy/sinônimos por inferência. Usar comparação exata da chave; uma collation que ignore acentos pode equiparar nomes além da regra aprovada. Sugerir collation binária/adequada à chave canônica, sujeita a teste e escolha física posterior.

Ao criar/editar mão de obra avulsa, procurar chave correspondente em TODO Cadastro de Serviços, inclusive inativos. Ao criar/editar peça avulsa, a regra equivalente exige TODO catálogo de peças/produtos, inclusive inativos.

**Lacuna para implementação:** catálogo de peças ainda não existe; esta fatia não pode alegar enforcement completo dessa regra. Não criar catálogo improvisado nem transformar ausência de integração em exceção aprovada. Marcos deve fechar a estratégia de aplicação/etapa para essa proteção antes da entrega funcional de peça avulsa.

Concorrência entre criação de cadastro e lançamento avulso precisa de um protocolo comum por chave normalizada (por exemplo, registro de chave bloqueável ou serialização coordenada) além do bloqueio da OS. A consulta de ausência isolada não impede corrida. Essa estratégia é proposta técnica a detalhar antes da implementação; não proibir retroativamente novos cadastros correspondentes a históricos sem decisão.

### 5.3 Precisão e limites propostos

Usar aritmética decimal no Backend e strings monetárias na API, nunca ponto flutuante binário como fonte de verdade. Proposta: DECIMAL(15,2) para preço/custo unitários; rejeitar entrada com mais de duas casas, em vez de arredondar silenciosamente. Quantidade INT positivo com teto técnico explícito; validar também intervalo inteiro seguro de DTO/paginação.

Calcular produtos e somas em decimal com faixa mais ampla; se persistir totais históricos tipados, propor DECIMAL(25,2) ou strings decimais no JSON. Validar overflow de quantidade × preço e da soma antes de gravar. Precisão, limites, separador/formato da API e política de arredondamento são sugestões pendentes; não reutilizar limites de Pessoas como regra de orçamento.

## 6. Transações e concorrência

Proposta de sequência para mutações:

1. Autenticar e validar DTO por allowlist; resolver publicIds sem expor ids internos.
2. Abrir transação, bloquear OS, confirmar abertura oficial e macrostatus OPEN, reavaliar permissões.
3. Conferir expectedVersion da composição/item; sugerir budgetItemsVersion técnico na OS para detectar retirada baseada em tela antiga. Esse campo futuro não é status nem entidade de orçamento.
4. Bloquear serviço quando houver referência; verificar atividade, preço, vínculo e as chaves de contorno/duplicidade conforme protocolo aprovado.
5. Calcular valores, escrever item/marcadores e evento com ator/instante do servidor.
6. Incrementar versão e confirmar atomicamente. Falha do histórico desfaz mutação; responder conflito para versão obsoleta/deadlock, sem sobrescrever escolha concorrente silenciosamente.

Todas as mutações futuras de fechamento/cancelamento precisam disputar o mesmo bloqueio da OS. Corridas entre adicionar/retirar/editar/situação devem preservar snapshot e total. Não afirmar que locks eliminam erros: projetar 409 e releitura da tela. Repetição de requisição de retirada não deve criar segundo evento sem nova mudança.

## 7. Histórico, retirada total e situação

Usar service_order_events existente, com tipos sugeridos ITEM_ORCAMENTO_CRIADO, ITEM_ORCAMENTO_ALTERADO, ITEM_ORCAMENTO_RETIRADO e ORCAMENTO_RETIRADO. Alteração pode registrar campos quantidade, valor, descrição avulsa e custo com before/after. SITUACAO_OPERACIONAL_ALTERADA já existe e continua registrando mudanças. O eventType atual é String/VARCHAR(80), não enum; os novos valores e payloads continuam sugestões nesta tarefa. Reutilizar os índices existentes de eventos por OS/occurredAt e considerar id como desempate; índice por item só se houver consulta concreta, sem inventar endpoint dedicado.

Payload proposto com versão, publicIds de OS/item, tipo/origem, descrição, quantidade, valores unitários/totais antes/depois; autoria e occurredAt em colunas do evento. Usar dados do servidor, não snapshot enviado pelo navegador. Na retirada total, capturar TODOS os itens atuais e total geral antes de marcar removedAt em todos, na mesma transação. Campos históricos e totais não são recalculados a partir do preço atual do catálogo.

Sem restauração automática: consulta dos eventos + novos lançamentos manuais. Para múltiplos ciclos, o encadeamento de eventos e os publicIds dos itens preservados bastam. O item retirado não participa do total.

Custo fica em subestrutura sensível explicitamente tipada no payload persistido. Na projeção, allowlist por evento E permissão, inclusive objetos aninhados/listas da retirada total; jamais repassar JSON cru. Sem custo.read omitir chaves monetárias de custo, diferenças, total de custo e valores em mensagens/resumos. Não usar null como disfarce de falta de autorização: null visível a autorizado significa custo desconhecido. Evento exclusivamente de custo pode retornar apenas metadados neutros; formato ainda sujeito a aprovação. Também filtrar respostas de mutação, logs de erro e futuras exportações. Documento do cliente omite custo mesmo quando gerado por Administrador.

Na mudança para NÃO AUTORIZADO com orçamento atual, propor ampliar o DTO existente de situação com budgetDisposition KEEP ou REMOVE e expectedBudgetVersion; perguntar antes de salvar. Validar situação, composição atual e permissões, registrar mudança e, se REMOVE, retirada completa atomicamente. Se a composição mudar entre tela e envio, rejeitar conflito e pedir releitura. Manter comportamento atual quando não houver orçamento. Não criar endpoint público genérico para inserir eventos ou entidade de aprovação.

Permissão adicional para retirar deve ser acordada (sugestão: edição do orçamento além de situação); não concedê-la implicitamente a quem só altera situação. Nome/canal/evidência/assinatura/motivo não são obrigatórios. Observação manual opcional no histórico é regra aprovada, mas o contrato de escrita ainda não existe e requer etapa própria; a atual GET /events não recebe escrita.

## 8. Permissões propostas — NÃO aprovadas

| Código candidato | Capacidade sugerida |
| --- | --- |
| services.read | Consultar Cadastro de Serviços |
| services.create | Criar serviço |
| services.price.update | Alterar preço padrão |
| services.activation.manage | Habilitar/desabilitar |
| services.delete_unlinked | Excluir nunca associado a OS |
| service_orders.budget.read | Consultar composição |
| service_orders.budget.update | Incluir, editar e retirar itens/retirar composição |
| service_orders.budget.costs.read | Ver custo interno da peça avulsa |
| service_orders.budget.costs.update | Alterar custo interno da peça avulsa |

Marcos ainda precisa aprovar TODOS os códigos, granularidade e concessões; permissões do Cadastro de Serviços não estão aprovadas. A separação funcional visualizar/alterar custo já está aprovada, e alterar pressupõe visualizar. Propor política central: costs.update implica capacidade efetiva costs.read, sem conceder edição geral por consequência; escrita de custo exige também budget.update. Revogação/concessão deve preservar essa dependência. Administrador segue política central existente.

Não criar permissão separada de preço cobrado. Combinar consultas com service_orders.read, histórico com service_orders.events.read e mutação da situação com service_orders.situation.update, conforme contrato final; os códigos existentes não autorizam orçamento automaticamente. Avaliar lookup de serviços para quem edita orçamento sem acesso à administração do catálogo. Não adicionar permissões ao seed neste trabalho.

## 9. API e DTOs propostos — contratos a revisar

Todas as rotas abaixo sob /api/v1, sessão obrigatória e CSRF em mutações. Respostas públicas com publicId, valores monetários string e datas ISO; nunca ids internos. Listas paginadas com page/pageSize obrigatórios, máximo sugerido 100 e deslocamento seguro, ordenação estável. Não implementar rotas nesta tarefa.

| Método/rota candidata | Corpo/query proposto | Finalidade |
| --- | --- | --- |
| GET /services | page, pageSize, search, includeInactive | Lista por nome normalizado/id |
| GET /services/:publicId | — | Detalhe cadastral |
| POST /services | name, defaultPrice | Criar, nome definitivo |
| PATCH /services/:publicId | defaultPrice e/ou isActive, expectedVersion | Preço/ativação; rejeitar name |
| DELETE /services/:publicId | expectedVersion a definir no contrato | Exclusão somente nunca associado |
| GET /service-orders/:publicId/budget-items | page, pageSize | Itens atuais, total geral de TODA composição e versão |
| POST /service-orders/:publicId/budget-items | união discriminada descrita abaixo | Criar item |
| PATCH /service-orders/:publicId/budget-items/:itemPublicId | quantity, unitPrice, description avulsa, unitCost se permitido, expectedVersion | Editar campos aplicáveis |
| POST /service-orders/:publicId/budget-items/:itemPublicId/remove | expectedVersion | Retirada lógica, evento e novo total |
| PATCH /service-orders/:publicId/operational-situation (existente) | situação + budgetDisposition/expectedBudgetVersion propostos | Manter/retirar orçamento no não autorizado |
| GET /service-orders/:publicId/events (existente) | page, pageSize | Histórico allowlisted, estendido com filtragem de custo |

Não criar rota autônoma Budget/status/restore/approve. Retirada total acontece pela decisão em situação NÃO AUTORIZADO. Revisar tratamento de situação já vigente para não criar mutação oculta no atual no-op.

Exemplos de DTOs de criação sugeridos (quantidade efetiva obrigatória; interface inicia em 1):

- Serviço cadastrado: { itemType: "SERVICE_LABOR", origin: "REGISTERED", servicePublicId: UUID, quantity: 1, unitPrice: "150.00", expectedBudgetVersion: 3 }.
- Mão de obra avulsa: { itemType: "SERVICE_LABOR", origin: "MANUAL", description: "REPARO ESPECÍFICO", quantity: 1, unitPrice: "0.00", expectedBudgetVersion: 3 }.
- Peça avulsa: { itemType: "MANUAL_PART", origin: "MANUAL", description: "PEÇA ESPECÍFICA", quantity: 2, unitPrice: "25.00", unitCost: null, expectedBudgetVersion: 3 }.

Sem permissão de custo, cliente omite unitCost; Backend rejeita qualquer tentativa de escrevê-lo, inclusive null. Omissão na criação significa não informado; PATCH omitido preserva, null limpa somente com permissão. Serviço rejeita unitCost mesmo null. Totais, autores, timestamps, normalizedName/Description e removedAt nunca são aceitos como entrada.

Erros sugeridos: 400 formato/campo incompatível; 401 sessão; 403 permissão/CSRF; 404 OS/item/serviço; 409 OS não aberta, versão obsoleta, duplicidade, correspondência cadastral ou exclusão vinculada. Não vazar preço interno/custo em detalhes. Códigos definitivos e semântica de repetição dependem de contrato aprovado.

## 10. Frontend proposto

Cadastro de Serviços: listagem paginada e pesquisa, ativo/inativo, criação com nome/preço, nome somente leitura após salvar, alteração de preço, habilitar/desabilitar e exclusão condicionada a ausência histórica de vínculo. Explicar bloqueio sem oferecer renomear serviço usado.

Detalhe da OS: seção Orçamento com linhas individuais, quantidade iniciada em 1, unitário/total e total atual; Serviço/Mão de obra permite selecionar cadastrado (nome travado, preço sugerido) ou informar avulso. Peça avulsa com descrição livre e custo opcional somente se autorizado. Não mostrar peça do estoque como ação disponível nesta fatia; comunicar etapa futura sem criar quarto tipo.

Sem custo.read não montar campos, colunas ou tooltips de custo; com leitura mas sem alteração, somente consulta. OS FECHADA/CANCELADA em leitura. Confirmar retirada e permitir consultar histórico, sem “Restaurar”. Na situação NÃO AUTORIZADO, perguntar manter/retirar; sem justificativa obrigatória. Resolver 409 com releitura preservando contexto, sem sobrescrever silenciosamente.

## 11. Testes futuros e validação operacional

Nenhum teste funcional será executado nesta tarefa documental.

- Cadastro: nome obrigatório/imutável em PATCH, normalização, duplicidade entre ativos, cenários ativo/inativo após decisão de Marcos, preço alterável sem propagação retroativa, exclusão sem associação versus vínculo histórico retirado, habilitação/desabilitação e auditoria.
- Itens: os dois tipos da fatia, as duas origens do serviço sem quarto tipo, múltiplas linhas diferentes, duplicidade de serviço e avulso, bloqueio por cadastro ativo/inativo na criação/edição, ausência de sinônimos/fuzzy, peças sem conversão/estoque.
- Quantidade/valores: 1 default de tela, zero/negativo/fração rejeitados, cobrança zero aceita, cálculos exatos, custo null diferente de zero, custo negativo rejeitado, serviço sem custo, overflow/limites conforme contrato final.
- Segurança: 401/403/CSRF, custo sem leitura ausente de consultas/respostas de mutação/histórico aninhado/erros/documento do cliente; edição pressupõe leitura e edição de orçamento; nome/total/actor manipulados rejeitados.
- Ciclo: editar após autorizado sem mudar situação/reaprovar; FECHADA/CANCELADA bloqueiam toda mutação; remover item preserva snapshot e retira do total; retirar tudo conserva total/itens históricos; novo ciclo manual sem restauração.
- Transações/concorrência: dois lançamentos iguais, editar/retirar, mudar situação/retirar todos com nova linha concorrente, fechar/editar, excluir cadastro/associar, criar cadastro/avulso; falha de evento reverte dados.
- Frontend: permissão e estados carregando/vazio/erro, paginação/total geral independente da página, preço sugerido editável, nome travado, custo invisível/readonly/editável, escolha não autorizado, histórico seguro e conflito.
- Operacional futura: HTTP e navegador com banco descartável explicitamente identificado; conferir eventos, saldos inalterados e ausência de financeiro; nunca usar principal por inferência. Migration futura deve testar FKs, CHECKs e uniques condicionais no MySQL isolado antes de autorização de deploy.

## 12. Decisões pendentes e ordem recomendada

1. Marcos: novo serviço ativo com nome de desabilitado; criação/reativação e efeitos sobre seleção.
2. Marcos: duplicidade de descrições avulsas entre tipos diferentes ou por tipo; não alterar regra de correspondência exata.
3. Marcos: aprovar códigos/granularidade de permissões, lookup e combinação da retirada total com mudança de situação.
4. Aprovação técnica: comprimentos, máximos de quantidade/valores, DECIMAL, arredondamento, DTOs/erros/versões, collation e garantia concorrente das chaves.
5. Marcos: estratégia para fazer cumprir o bloqueio de peça avulsa equivalente quando catálogo/estoque ainda não está implementado; não tratá-lo como dispensado.
6. Contrato futuro de observação manual opcional no histórico; não criar formulário estruturado de aprovação nem inventar endpoint de eventos genérico.
7. Confirmar detalhes cadastrais sugeridos, incluindo default de ativo, seleção de inativos e faixa do preço padrão.
8. PDF/impressão, envio, validade e aprovação parcial continuam sem desenho aprovado. Não impor novas exigências de aceite. Estoque, fiscal, faturamento e desconto no fechamento seguem posteriores.

Próxima tarefa recomendada: revisar e fechar estes pontos e contratos, depois preparar o modelo físico/migration sob autorização específica. Não iniciar implementação enquanto os pontos que afetam unicidade, permissões e proteção contra contorno estiverem indefinidos.
