# Recorte 1 de OS — desenho técnico preliminar

**Status:** proposta técnica para revisão, anterior à implementação.
**Data:** 08/10/2026.
**Escopo:** Backend NestJS + Prisma 7.10.0 + MySQL 8.
**Fonte normativa:** decisões aprovadas em `docs/02-Regras-de-Negocio.md`, `docs/07-Decisoes-Arquiteturais.md` e `docs/Especificacao-GestorOS.md`.

> Este documento propõe um modelo e contratos para implementação. Não altera o schema Prisma real, não cria migration e não declara qualquer parte do Recorte 1 como implementada. Campos, estados, endpoints e códigos HTTP marcados como candidatos ainda precisam ser revisados antes de codificar.

## 1. Conclusão executiva

O desenho fecha uma estratégia técnica recomendada para número global, reserva transacional, reuso da última reserva, limite de uma abertura em andamento por usuário, eventos e confirmação atômica. Ele é suficiente para iniciar a implementação do núcleo de numeração, abertura, confirmação, consulta e situação, após revisão do desenho.

Há uma decisão de ciclo de vida que precisa de aprovação explícita antes de implementar criação de Equipamento em rascunho: a recomendação é persistir o Equipamento como cadastro normal e não apagá-lo automaticamente quando a abertura for cancelada. Uma transferência de titularidade de equipamento existente deve permanecer apenas como intenção no rascunho e só produzir efeito na confirmação da OS. Se essa recomendação não for aprovada, a criação do equipamento precisa ser adiada até a confirmação ou receber outra regra explícita.

O documento também fixa uma interpretação operacional para “número maior usado”: número é considerado usado assim que a reserva é confirmada no banco e o número é exposto ao usuário. Essa interpretação decorre da emissão prévia do número para atendimento/etiqueta. Se Marcos entender “usado” como apenas OS oficialmente confirmada, a regra de reuso deverá ser ajustada antes da migration.

## 2. Escopo funcional

### Incluído

- Iniciar, persistir, retomar e cancelar abertura em andamento.
- Reservar o número visível durante o início da abertura.
- Limitar cada usuário a uma abertura em andamento.
- Confirmar cliente e equipamento e criar OS `ABERTA`/`TRIAGEM`.
- Criar Equipamento durante a abertura, condicionado à decisão de ciclo de vida acima.
- Tratar divergência de titularidade com escolha explícita e transferência autorizada.
- Capturar snapshots cadastrais JSON uma única vez na confirmação.
- Registrar eventos básicos, listar e consultar OS confirmadas, e alterar livremente situação operacional.

### Fora do Recorte 1

Correção administrativa de cliente/equipamento após confirmação; fechamento; cancelamento de OS oficial; reabertura; orçamento; serviços; peças; estoque; financeiro; Equipamento comprado/Doado; OS interna automática; checklist/recebimento; impressão; relatórios de auditoria; frontend completo.

## 3. Modelos e tabelas propostos

Os nomes seguem o padrão atual de `Int` autoincremental interno, `publicId` UUID público, `DateTime(3)`, nomes Prisma em camelCase e colunas MySQL em `snake_case`. As relações com `Person`, `Equipment` e `User` devem usar as entidades existentes. O fragmento conceitual abaixo não é schema executável nem foi validado pelo Prisma.

### 3.1 `ServiceOrderNumberControl`

Uma única linha de controle global, inicializada em `id = 1` na migration do módulo:

| Campo candidato | Uso |
| --- | --- |
| `id` (`Int`, PK fixa `1`) | Identifica a linha singleton que serializa operações de numeração. |
| `nextNumber` (`Int`) | Próximo número inteiro disponível para reserva. Inicia em `1`. |
| `highestIssuedNumber` (`Int`) | Maior número já reservado e exposto; inicia em `0` e nunca diminui. |
| `updatedAt` (`DateTime(3)`) | Auditoria operacional da última alteração do controle. |

A linha singleton é bloqueada com `SELECT ... FOR UPDATE` dentro de uma transação InnoDB/Prisma. Não calcular número com `MAX(number) + 1` nem usar somente `AUTO_INCREMENT`: o número precisa ser reservado antes da OS oficial e pode haver reuso apenas do último número.

### 3.2 `ServiceOrderNumberAllocation`

Registro único para cada número já emitido; funciona como reserva/registro central para impedir duplicidade entre aberturas, OS confirmadas e números cancelados que não podem ser reaproveitados.

| Campo candidato | Uso |
| --- | --- |
| `numberValue` (`Int`, PK) | Número inteiro global; formato visual é derivado na API. |
| `status` (`Enum`) | `RESERVED`, `CONFIRMED`, `CANCELED` ou `RELEASED`. |
| `openingId` (`Int?`, unique, FK) | Abertura proprietária da reserva atual ou da reserva consumida. Nulo para número liberado. |
| `createdAt`, `updatedAt` | Datas do registro e de sua situação atual. |

Na liberação, a linha permanece com estado `RELEASED`, sem `openingId`; uma nova abertura pode reativar essa linha com o mesmo número. A trilha anterior permanece nos eventos da abertura cancelada. Na confirmação, a linha muda para `CONFIRMED` e fica relacionada à OS pelo campo `ServiceOrder.numberValue`, que será FK para `ServiceOrderNumberAllocation.numberValue` e também `@unique`; a relação inversa é 1:0..1. A alocação mantém `openingId` para a tentativa que obteve a reserva. Assim, a OS não precisa de um segundo FK circular nem de duplicar a chave do número. Cardinalidade e nomes finais devem ser validados no schema Prisma e migration.

### 3.3 `ServiceOrderOpening`

| Campo candidato | Uso |
| --- | --- |
| `id`, `publicId` | Chave interna e identificador público. |
| `status` | `IN_PROGRESS`, `CONFIRMED` ou `CANCELED`. |
| `initiatedByUserId` | Usuário autenticado que iniciou; não muda quando Admin assume. FK restritiva. |
| `activeForUserId` (`Int?`, unique) | Igual ao iniciador somente enquanto `IN_PROGRESS`; nulo em estado terminal. Garante a unicidade de rascunho por usuário. |
| `attemptedNumberValue` (`Int`) | Número recebido pela abertura para consulta histórica. Não é unique porque uma reserva liberada pode ser reutilizada por outra tentativa. |
| `customerId`, `equipmentId` (`Int?`) | Referências temporárias opcionais. A confirmação exige ambas. |
| `complaint` (`String?`/`Text?`) | Reclamação temporária, opcional e vazia por padrão. |
| `transferRequested` (`Boolean`) | Intenção explícita de transferir titularidade existente na confirmação; não muda o proprietário durante o rascunho. |
| `resumedAt`, `confirmedAt`, `canceledAt` (`DateTime(3)?`) | Instantes de retomada/terminalidade; evento continua sendo trilha canônica. |
| `createdAt`, `updatedAt` | Persistência e retomada após reinício. |

`activeForUserId` é um marcador nullable com unique index, não um índice parcial. Usuários comuns consultam/alteram somente suas linhas; Admin ou `os.opening.manage` pode atuar sobre outra abertura. `attemptedNumberValue` não define o número oficial depois de liberado; o evento conserva o número e o resultado da tentativa.

### 3.4 `ServiceOrder`

| Campo candidato | Uso |
| --- | --- |
| `id`, `publicId` | Chave interna e identificador público. |
| `numberValue` (`Int`, unique) | Número visível armazenado como inteiro, relacionado à alocação `CONFIRMED`. |
| `customerId`, `equipmentId` (`Int`, FKs) | Vínculos operacionais atuais com Pessoa e Equipamento. |
| `macroStatus` | No Recorte 1, único valor gravável: `ABERTA`. |
| `operationalSituation` | Enum aprovado; inicia `TRIAGEM` e pode mudar para as demais situações operacionais aprovadas. |
| `complaint` (`String?`/`Text?`) | Reclamação opcional. |
| `customerSnapshotJson`, `equipmentSnapshotJson` (`Json`) | Snapshots históricos da confirmação; obrigatórios na OS oficial e imutáveis. |
| `createdByUserId`, `createdAt`, `updatedAt`, `openedAt` | Autoria e datas geradas pelo servidor. |

O número visual será formatado como `OS-` + inteiro com seis dígitos (`String(numberValue).padStart(6, '0')`). Valores acima de `999999` não podem sofrer wraparound; a API deve bloquear nova reserva e exigir decisão de evolução.

### 3.5 `ServiceOrderAssignment`

Uma linha por funcionário atribuído à OS, com `serviceOrderId`, `userId`, `assignedByUserId` e `assignedAt`; unique composto em `(serviceOrderId, userId)`. A OS pode ter um ou mais funcionários atribuídos, conforme regra oficial. Atribuições padrão ao Administrador são iniciais e não exclusivas; o conjunto de funcionários disponíveis pode ser ampliado. Elegibilidade de usuários seguirá as regras centrais de usuários. Alterações substituem atomicamente o conjunto atual e registram as listas anterior/nova no evento. Não modelar efeitos de atribuição sobre transições ou dashboard além do que já estiver documentado.

### 3.6 `ServiceOrderEvent`

| Campo candidato | Uso |
| --- | --- |
| `id` | Chave interna. |
| `serviceOrderId` (`Int?`, FK) | OS oficial associada, se já confirmada. |
| `openingId` (`Int?`, FK) | Abertura associada. Evento de confirmação pode referenciar ambas. |
| `actorUserId` (`Int`, FK) | Usuário autenticado que executou a ação; sempre derivado da sessão, nunca do payload. |
| `initiatingUserId` (`Int?`, FK) | Iniciador original quando a ação é de Admin/gestor. |
| `eventType` (`Enum` ou catálogo) | Tipo técnico do evento. |
| `numberValue` (`Int`) | Número relacionado, preservado mesmo se a reserva for liberada. |
| `occurredAt` (`DateTime(3)`) | Data/hora do servidor. |
| `payload` (`Json`) | Campos alterados, decisão de titularidade, estado anterior/novo e resultado de reuso quando aplicável. Não incluir segredos. |

Eventos são append-only na aplicação. FKs de usuários são restritivas porque contas são inativadas, não removidas. A migration pode permitir `openingId`/`serviceOrderId` nulos para evento associado a uma ou às duas entidades. Payload não substitui colunas para filtros essenciais.

### 3.6 Enumerações

- `ServiceOrderOpeningStatus`: `IN_PROGRESS`, `CONFIRMED`, `CANCELED`.
- `ServiceOrderNumberAllocationStatus`: `RESERVED`, `CONFIRMED`, `CANCELED`, `RELEASED`.
- `ServiceOrderMacroStatus`: apenas `ABERTA` no primeiro recorte. Não implementar `FECHADA` ou `CANCELADA` como ações do módulo nesta etapa.
- `ServiceOrderOperationalSituation`: dez valores documentados em `docs/02-Regras-de-Negocio.md`; inicial `TRIAGEM`. A mudança é livre entre as situações aprovadas por usuário autorizado. Não implementar efeitos de orçamento/encerramento associados a recortes futuros.
- `ServiceOrderEventType` (códigos propostos): `ABERTURA_EM_ANDAMENTO_CRIADA`, `ABERTURA_RETOMADA`, `ABERTURA_RETOMADA_POR_ADMIN`, `ABERTURA_CONFIRMADA`, `ABERTURA_CANCELADA`, `ABERTURA_CANCELADA_POR_ADMIN`, `SITUACAO_OPERACIONAL_ALTERADA`, `ATRIBUICOES_ALTERADAS`, `EQUIPAMENTO_CRIADO_DURANTE_ABERTURA`, `TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA`.

Os códigos de eventos são proposta de implementação e podem ser enum Prisma ou strings controladas pelo domínio; manter compatibilidade com o Log Administrativo sem duplicar eventos do módulo no `admin_audit_log` quando forem eventos operacionais comuns.

## 4. Mecanismo de numeração e concorrência

### 4.1 Reserva de número

1. Abrir transação interativa Prisma com isolamento `READ COMMITTED` para as operações de alocação/reuso.
2. Bloquear a linha única de `ServiceOrderNumberControl` por PK com `SELECT ... FOR UPDATE`, via `tx.$queryRaw` parametrizado. Esse é o ponto global de serialização.
3. Consultar `activeForUserId` do iniciador. Se já existir abertura, não consumir número; concluir sem escrita e responder `409 OPENING_ALREADY_EXISTS`, incluindo somente o `publicId` e número visível da abertura atual.
4. Ler `nextNumber`. Se exceder `999999`, interromper com `409 OS_NUMBER_LIMIT_REACHED`.
5. Criar abertura `IN_PROGRESS`, `activeForUserId = initiatedByUserId`, com número tentado. Criar alocação `RESERVED` para o número; se houver linha `RELEASED` nesse valor, reativá-la e associá-la à nova abertura.
6. Atualizar `nextNumber = n + 1` e `highestIssuedNumber = max(highestIssuedNumber, n)`.
7. Inserir `ABERTURA_EM_ANDAMENTO_CRIADA` e confirmar a transação. Falha em qualquer escrita reverte abertura, alocação e contador em conjunto.

Todas as ações que mudam alocação de número — iniciar, cancelar/liberar, confirmar — usam a mesma ordem de bloqueio: linha de controle, abertura, alocação, usuário/equipamento/pessoa e OS. Isso reduz deadlocks. A unique key em `activeForUserId`, PK da alocação e unique de `ServiceOrder.numberValue` são defesa final; o service traduz conflito de unicidade para erro de domínio.

### 4.2 Reuso e `ABERTURA CANCELADA`

“Número maior usado” significa maior número cuja reserva foi confirmada e exposta ao usuário, não uma tentativa que falhou antes do commit. `highestIssuedNumber` é monotônico e não diminui.

- Ao cancelar uma abertura com número `n`, bloquear controle e alocação.
- Se `n == highestIssuedNumber`, não existe número maior já emitido: marcar abertura `CANCELED`, limpar `activeForUserId`, marcar alocação `RELEASED`, remover sua associação ativa com a abertura e definir `nextNumber = n`. Gerar `ABERTURA_CANCELADA` com `numberReleased: true`; manter a tentativa consultável no histórico.
- Se `n < highestIssuedNumber`, já houve número maior emitido: marcar abertura `CANCELED`, limpar `activeForUserId`, manter alocação `CANCELED` e associada à tentativa. O número não poderá ser reservado novamente. Gerar `ABERTURA_CANCELADA` com `numberReleased: false`.
- A abertura cancelada nunca aparece na listagem comum de OS. O número de OS confirmada continua único; tentativas cujo número foi liberado permanecem em eventos e não são registros de OS.

Esse critério permite reusar apenas a ponta atual da sequência. Não recua high-water mark. Uma reserva maior já exposta consome a possibilidade de reusar números menores, mesmo que depois a própria abertura maior seja cancelada.

### 4.3 Duas pessoas e falhas/reinícios

Transações concorrentes de início esperam pela mesma linha de controle. Após uma liberar o lock e commitar `n`, a próxima lê `n + 1`; nunca recebe o mesmo valor. Em falha antes do commit, o contador e reserva revertem, ficando o mesmo número disponível.

A abertura e reserva confirmadas persistem no banco. Queda do processo, navegador ou computador não apaga o rascunho nem a reserva. Após reinício, `GET .../openings/current` encontra o rascunho. Não há lease nem expiração obrigatória no Recorte 1; uma rotina futura não poderá liberar números sem seguir a regra de reuso e trilha histórica.

## 5. Uma abertura em andamento por usuário

### Defesa no banco

`activeForUserId Int? @unique` é preenchido com o ID do usuário iniciador em `IN_PROGRESS` e fica `NULL` em `CONFIRMED`/`CANCELED`. MySQL permite múltiplos `NULL` em um unique index, mas rejeita duas linhas com o mesmo usuário não nulo. Como MySQL não oferece unique index parcial `WHERE status = 'IN_PROGRESS'`, este marcador mantém a restrição diretamente no banco.

Acrescentar `CHECK` na migration garantindo que `active_for_user_id` não seja nulo em `IN_PROGRESS`, seja nulo em estados terminais e corresponda a `initiated_by_user_id`. CHECK é suportado/enforced no MySQL 8.0.16+; verificar compatibilidade do Prisma 7.10.0 e, se não for representável no schema, manter SQL customizado versionado na migration. A unique key é a garantia contra corrida; a checagem do service melhora o erro e retorna a abertura existente.

### Comportamento de API/autorização

- Usuário autenticado inicia no máximo uma abertura própria. Tentativa de iniciar outra retorna `409 OPENING_ALREADY_EXISTS` com os dados públicos da existente.
- Usuário comum só lê, altera, retoma, confirma ou cancela a própria abertura.
- Administrador ou `os.opening.manage` pode consultar, retomar/assumir ou cancelar abertura de outro usuário. A ação não altera `initiatedByUserId` nem a unicidade da abertura.
- O ator da sessão é gravado como `actorUserId`. Em ação administrativa, `initiatingUserId` permanece no evento; o ator Admin/gestor não substitui o iniciador original.
- Retomada por outro usuário gera evento `ABERTURA_RETOMADA_POR_ADMIN`. Retomada pelo iniciador pode gerar `ABERTURA_RETOMADA` para rastrear retomada explícita.

## 6. Snapshot cadastral

Armazenar nos campos Prisma `customerSnapshotJson Json` e `equipmentSnapshotJson Json`, mapeados a colunas `customer_snapshot_json` e `equipment_snapshot_json`. Os campos são obrigatórios para OS confirmada e inexistentes na abertura em andamento. Cada JSON é estruturado e não deve depender de ID interno para ser compreendido.

Estrutura mínima sugerida para cliente:

```json
{
  "snapshotVersion": 1,
  "capturedAt": "timestamp ISO 8601 do servidor",
  "name": "nome no momento da confirmação",
  "document": "documento formatado ou null",
  "primaryPhone": "telefone principal ou null",
  "primaryEmail": "e-mail principal ou null",
  "address": "endereço textual disponível ou null"
}
```

Estrutura mínima sugerida para equipamento:

```json
{
  "snapshotVersion": 1,
  "capturedAt": "timestamp ISO 8601 do servidor",
  "type": "tipo ou null",
  "brand": "marca ou null",
  "model": "modelo textual ou null",
  "serialNumber": "serial ou null",
  "observations": "observações/campos principais do equipamento disponíveis ou null",
  "mainIdentification": "identificação textual legível"
}
```

O conjunto exato de valores opcionais é montado dos dados principais disponíveis e definidos em `docs/02-Regras-de-Negocio.md`. Não copiar `id`, FK ou depender do cadastro atual para resolver o snapshot. Capturar ambos, dentro da transação de confirmação, no instante da confirmação — não usar somente `createdAt`, pois ele pode anteceder a confirmação. O serviço bloqueia leituras pertinentes ou usa leitura consistente na mesma transação para não compor um objeto com dados de momentos diferentes. Depois da gravação, nenhuma edição, correção de vínculos ou reabertura recria/edita os JSONs. Não indexar propriedades JSON no Recorte 1 sem consulta aprovada.

## 7. Eventos/histórico mínimos

| Evento | Quando | Payload mínimo |
| --- | --- | --- |
| `ABERTURA_EM_ANDAMENTO_CRIADA` | Reserva confirmada | número, iniciador, instante. |
| `ABERTURA_RETOMADA` | Iniciador retoma explicitamente | iniciador, ator, número. |
| `ABERTURA_RETOMADA_POR_ADMIN` | Admin/gestor assume | iniciador, ator, número. |
| `ABERTURA_CONFIRMADA` | Criação atômica da OS | opening/order public IDs, número, cliente/equipamento públicos, status/situação, timestamp do snapshot. |
| `ABERTURA_CANCELADA` | Todo cancelamento | iniciador, ator, número, `numberReleased`; motivo humano não obrigatório. |
| `ABERTURA_CANCELADA_POR_ADMIN` | Evento adicional quando Admin/gestor cancela a abertura de outra pessoa | iniciador, ator, número e `numberReleased`. O evento canônico `ABERTURA_CANCELADA` também é gravado para todo cancelamento. |
| `SITUACAO_OPERACIONAL_ALTERADA` | Situação muda | situação anterior/nova, ator, OS/número. |
| `ATRIBUICOES_ALTERADAS` | Conjunto de funcionários atribuídos muda | IDs públicos dos atribuídos anteriores/novos, ator, OS/número. |
| `EQUIPAMENTO_CRIADO_DURANTE_ABERTURA` | Equipamento é criado | opening, número, equipamento público, ator, proprietário. |
| `TITULARIDADE_TRANSFERIDA_DURANTE_ABERTURA` | Transferência aplicada na confirmação | equipamento, proprietário anterior/novo, ator, abertura/OS, número e confirmação explícita. |

Todos os eventos incluem `actorUserId`, `occurredAt`, `eventType`, número visível e payload JSON. Eventos administrativos incluem também usuário iniciador e ator que assumiu/cancelou. `ABERTURA_CONFIRMADA` relaciona evento à abertura e à OS. História é inserida na mesma transação da mudança que descreve; falha de evento reverte a operação. Não registrar edição campo a campo durante o rascunho.

## 8. Endpoints REST preliminares

Todos exigem sessão autenticada e CSRF em métodos mutáveis, conforme `docs/04-API.md`. O `userId` vem da sessão, nunca da entrada. As permissões abaixo são candidatos para seed controlada; Admin segue a política central do projeto. Respostas seguem envelope público `{ data, warnings? }`, sem expor `id` interno; listas usam paginação obrigatória conforme padrão existente.

| Método e rota candidata | Objetivo e permissão | Entrada mínima | Sucesso | Erros principais |
| --- | --- | --- | --- | --- |
| `POST /api/v1/service-order-openings` | Iniciar abertura e reservar número. Permissão candidata `os.open`. | Sem user ID; corpo vazio ou dados temporários opcionais. | `201` com `openingPublicId`, `visibleNumber`, estado e timestamps. | `409 OPENING_ALREADY_EXISTS`, `409 OS_NUMBER_LIMIT_REACHED`, `401`, `403`, conflito técnico de sequência. |
| `GET /api/v1/service-order-openings/current` | Consultar abertura própria persistida. Permissão candidata `os.read`. | Nenhuma. | `200` com abertura ou `404 OPENING_NOT_FOUND`. | `401`, `403`. Não escreve evento; retomada explícita usa rota abaixo. |
| `GET /api/v1/service-order-openings/:publicId` | Consultar a própria ou, com gestão, de outro usuário. `os.read`; além de ownership, `os.opening.manage` aprovado para gestão. | `publicId`. | `200` com abertura e número. | `404 OPENING_NOT_FOUND` para inexistente; `403 FORBIDDEN` para existente sem acesso (ou política uniforme `404`, a alinhar ao padrão de segurança). |
| `GET /api/v1/service-order-openings` | Listar aberturas pendentes administrativamente. `os.opening.manage`. | Filtros/paginação padrão. | `200` paginado; somente aberturas em andamento. | `401`, `403`, `400 INVALID_PAGINATION`. Não aparece na lista de OS. |
| `POST /api/v1/service-order-openings/:publicId/resume` | Retomar própria ou assumir abertura alheia. `os.read` para própria; `os.opening.manage` para outra. | `publicId`. | `200` com estado atualizado; gera evento de retomada/assunção. | `404`, `403`, `409 OPENING_NOT_IN_PROGRESS`. |
| `PATCH /api/v1/service-order-openings/:publicId` | Alterar dados temporários/cliente/equipamento e decisão explícita de titularidade. `os.open`; `os.opening.manage` para alheia. | Campos temporários opcionais e `ownershipDecision` quando houver divergência. | `200` com resumo da abertura. Não gera histórico detalhado de cada campo. | `400 VALIDATION_ERROR`, `403`, `404`, `409 OPENING_NOT_IN_PROGRESS`, `409 OWNERSHIP_DECISION_REQUIRED`. |
| `POST /api/v1/service-order-openings/:publicId/equipment` | Criar equipamento vinculado ao cliente da abertura. `equipment.create` e acesso à abertura. | DTO mínimo de cadastro de Equipamento aprovado. | `201` com `equipmentPublicId`; registra evento de criação. | `400`, `403`, `404`, `409 PERSON_INACTIVE` e erros de duplicidade atuais. Ciclo de vida após desistência requer decisão da seção 14. |
| `POST /api/v1/service-order-openings/:publicId/confirm` | Confirmar e criar OS, snapshot, histórico e eventual transferência em uma transação. `os.open`; `os.opening.manage` para abertura alheia; `equipment.transfer_ownership` se transferência. | `customerPublicId`, `equipmentPublicId`, decisão explícita de titularidade quando necessária. | `201` com `publicId`, `visibleNumber`, `macroStatus: ABERTA`, `operationalSituation: TRIAGEM`; snapshot não precisa ser devolvido integralmente. | `400`, `403`, `404`, `409 OPENING_NOT_IN_PROGRESS`, `409 CUSTOMER_REQUIRED`, `409 EQUIPMENT_REQUIRED`, `409 OWNERSHIP_DECISION_REQUIRED`, `409 TRANSFER_PERMISSION_REQUIRED`, conflito transacional. |
| `POST /api/v1/service-order-openings/:publicId/cancel` | Cancelar/desistir da abertura. `os.open`; `os.opening.manage` para outra. | Sem motivo obrigatório. | `200` com estado, número e `numberReleased` boolean. | `403`, `404`, `409 OPENING_NOT_IN_PROGRESS`; erro de conflito/retry limitado. |
| `GET /api/v1/service-orders` | Listar somente OS confirmadas. `os.read`. | `page`, `pageSize` obrigatórios; filtros futuros não obrigatórios. | `200` paginado, ordenação estável por número. | `400 INVALID_PAGINATION`, `401`, `403`. Nunca inclui rascunho ou abertura cancelada. |
| `GET /api/v1/service-orders/:publicId` | Consultar OS confirmada. `os.read`. | `publicId`. | `200` com número, dados atuais, status/situação e referência de consulta ao snapshot. | `404 SERVICE_ORDER_NOT_FOUND`, `401`, `403`. |
| `PATCH /api/v1/service-orders/:publicId/situation` | Alterar livremente situação aprovada. `os.update_situation` (candidato documentado). | `operationalSituation`. | `200` com situação atualizada e evento. | `400 INVALID_SITUATION`, `404`, `401`, `403`. Não executa fechamento/cancelamento/orçamento. |
| `PUT /api/v1/service-orders/:publicId/assignments` | Substituir funcionários atribuídos. `os.assign` (candidato documentado). | Lista de `userPublicIds`. | `200` com atribuições atuais; evento contém lista anterior/nova. | `400 VALIDATION_ERROR`, `404`, `401`, `403`, `409 USER_NOT_ELIGIBLE`. |
| `GET /api/v1/service-orders/:publicId/history` | Consultar eventos básicos da OS. `os.read` ou permissão de histórico a definir. | Paginação padrão. | `200` paginado, ator público/data/tipo/payload permitido. | `404`, `401`, `403`, `400 INVALID_PAGINATION`. |

As rotas de abertura seguem a forma documentada `/service-order-openings`; as rotas de OS e situação seguem `/service-orders/:publicId/situation` e `/history`. São contratos preliminares, sujeitos a harmonização com o prefixo e envelope real de `docs/04-API.md`. Os nomes aprovados `os.opening.manage`, `equipment.transfer_ownership` e os candidatos já documentados `os.open`, `os.read`, `os.update_situation` e `os.assign` são preferidos aqui; qualquer novo código exige aprovação e inclusão idempotente no seed. Usar `409` para conflitos de estado de negócio, nunca retornar IDs numéricos internos.

## 9. Permissões mínimas propostas

- `os.open`: iniciar/editar/confirmar abertura própria, como nome candidato já registrado na documentação.
- `os.read`: consultar abertura própria e listar/consultar OS conforme escopo aprovado.
- `os.opening.manage`: assumir/consultar/cancelar abertura de terceiros; identificador aprovado para gestão de abertura.
- `os.update_situation`: alterar situação operacional, candidato já registrado.
- `os.assign`: atribuir funcionários, candidato já registrado.
- `equipment.create`: criar equipamento usando permissão existente de cadastro.
- `equipment.transfer_ownership`: transferência explícita durante a confirmação.

`isAdmin` mantém autoridade máxima pela política central; não criar permissão `admin.full`, `system.admin` ou perfil Master. Nomes ainda candidatos precisam ser conferidos com o catálogo Auth e incluídos em seed idempotente aprovado antes de proteger endpoints.

## 10. Transações principais

Todas usam `PrismaService.$transaction` interativa. SQL raw é limitado a locking reads realmente necessários, parametrizado por tagged template via `tx.$queryRaw`; não usar `$queryRawUnsafe`, concatenar valores nem abrir conexão MySQL paralela. O Prisma v7 permite transações interativas e queries raw dentro da transação; MySQL/InnoDB permite bloquear a linha alvo com `SELECT ... FOR UPDATE`. O padrão de isolamento é explicitado para não depender de defaults ambientais.

### Iniciar abertura

**Lê/bloqueia:** linha de controle global com `FOR UPDATE`; abertura ativa do usuário.
**Escreve:** abertura, alocação `RESERVED`, `nextNumber`, high-water mark e evento de criação.
**Rollback:** qualquer erro reverte todas as escritas e não consome número. Unique `activeForUserId` impede duplicidade mesmo em corrida.

### Cancelar abertura

**Lê/bloqueia:** controle, abertura e alocação na mesma ordem. Confere ownership ou permissão.
**Escreve:** status terminal, remove marcador ativo, libera o número somente quando `attemptedNumberValue == highestIssuedNumber`; caso contrário marca alocação `CANCELED`; registra `ABERTURA_CANCELADA` sempre e `ABERTURA_CANCELADA_POR_ADMIN` adicionalmente quando aplicável.
**Rollback:** nenhum cancelamento ou reuso parcial. Falha transitória de lock/deadlock admite retry limitado da transação inteira.

### Confirmar abertura

**Lê/bloqueia:** controle; abertura/alocação; Pessoa e Equipamento; titularidade; telefone/e-mail/endereço/tipo/marca usados nos snapshots. Validar ativo/elegível e permissão. Para transferência, bloquear equipamento e revalidar `equipment.transfer_ownership`.
**Escreve:** OS `ABERTA/TRIAGEM`; snapshots JSON; alocação `CONFIRMED`; abertura `CONFIRMED` e marcador ativo nulo; eventual mudança de proprietário e `equipment_ownership_events`; evento de confirmação, transferência e demais eventos necessários.
**Rollback:** qualquer falha cancela tudo, mantendo a abertura/reserva em andamento e sem OS, snapshot, transferência ou evento parcial.

### Criar Equipamento durante abertura

**Lê/bloqueia:** abertura, cliente e regras de cadastro/serial já existentes.
**Escreve:** Equipamento como cadastro válido, com cliente como proprietário, mais evento de equipamento criado durante abertura.
**Rollback:** cadastro e evento juntos. Se abertura for cancelada depois, recomendação é manter Equipamento; não apagar automaticamente. Este ponto depende da decisão da seção 14.

### Transferir titularidade durante abertura

Registrar escolha explícita no rascunho, sem alterar `Equipment.ownerId` ainda. Na confirmação, bloquear Equipamento, validar proprietário atual e permissão, atualizar `ownerId`, inserir `equipment_ownership_events` e evento OS na mesma transação da confirmação. Cancelar a abertura antes de confirmar não transfere titularidade. Falha reverte a confirmação inteira.

### Alterar situação operacional

**Lê/bloqueia:** OS confirmada e autorização.
**Escreve:** situação atual e evento `SITUACAO_OPERACIONAL_ALTERADA` com anterior/nova, ator, instante e número.
**Rollback:** a situação não muda se o evento não for persistido. Rejeitar a tentativa de gravar macrostatus de encerramento pelo endpoint.

### Alterar atribuições

**Lê/bloqueia:** OS confirmada e usuários indicados, validando existência, elegibilidade e permissão do ator.
**Escreve:** substitui o conjunto em `ServiceOrderAssignment` e insere `ATRIBUICOES_ALTERADAS` com atribuídos anteriores/novos.
**Rollback:** se qualquer vínculo ou evento falhar, preservar integralmente o conjunto anterior. A regra oficial permite um ou mais funcionários e prevê histórico; atribuições padrão seguem a situação configurada e não são exclusivas.

## 11. Validações indispensáveis

- Requisição autenticada, CSRF em mutações, permissão explícita e ownership no Backend.
- `userId`/ator sempre obtido da sessão.
- Uma única abertura ativa por iniciador, garantida por unique nullable no banco e validada no service.
- Número alocado dentro da transação, único no registro central, inteiro no limite e formatado pelo servidor.
- Cliente e Equipamento existentes, ativos e elegíveis na confirmação.
- Cliente/equipamento obrigatórios para confirmar; reclamação e dados temporários não são obrigatórios.
- Titularidade coerente; sem coerência, exigir escolha explícita e permissão para transferir; nunca alterar titularidade silenciosamente.
- Revalidar permissão na confirmação, mesmo que a escolha de transferência tenha sido salva antes.
- Nenhum snapshot no rascunho; dois snapshots válidos e versão 1 no commit da confirmação.
- OS confirmada é distinta de abertura; rascunhos e canceladas nunca entram em `GET /service-orders`.
- Abertura cancelada/confirmada não pode ser retomada nem confirmada de novo.
- Mudança de situação restrita às situações operacionais aprovadas; não executar ações de orçamento/fechamento.
- Atribuições aceitam somente funcionários elegíveis; alterações gravam conjunto anterior/novo e ator no mesmo commit; valores padrão não impedem atribuições adicionais.
- Evento e mudança correspondente persistem atomicamente; timestamps do servidor.
- Payload JSON validado pelo domínio, sem segredos e sem confiar em integridade tipada nativa do MySQL JSON.

## 12. Testes mínimos recomendados

### Unidade

- formatação de inteiro em `OS-000001` e limite `999999`;
- algoritmo de reserva, reuso da ponta e número consumido quando maior foi emitido;
- política de estados/retomada/cancelamento;
- composição/versionamento/captura temporal dos snapshots;
- autorização própria/Admin/`os.opening.manage`/transferência.

### Integração em MySQL isolado

- duas pessoas iniciando simultaneamente recebem números distintos;
- requisições simultâneas do mesmo usuário deixam somente uma abertura e traduzem a outra para `OPENING_ALREADY_EXISTS`;
- unique `activeForUserId`, `CHECK`, PK/unique da alocação e unique do número da OS são enforced;
- queda/reinício não perde abertura nem reserva;
- cancelar a última reserva libera o número e um número maior emitido impede liberação de anterior;
- duas confirmações da mesma abertura não criam OS duplicada;
- número da OS referencia exatamente uma alocação confirmada, sem ciclo de FKs;
- falha no histórico, snapshot ou transferência reverte OS inteira;
- equipamento criado e evento ficam consistentes;
- rascunhos e canceladas não aparecem na listagem comum;
- mudança de situação gera evento com estado anterior/novo;
- cancelamento sempre gera evento, inclusive quando o número é liberado; cancelamento administrativo também identifica ator e iniciador;
- atribuir um ou mais funcionários registra conjuntos anterior/novo e não torna os padrões exclusivos;
- Admin/gestor consegue atuar em abertura alheia, usuário comum recebe negação.

### E2E HTTP autenticado

- iniciar → current → retomar após nova sessão → confirmar → consulta/lista;
- tentativa de segundo rascunho por mesmo usuário;
- cancelar e validar `numberReleased`;
- transferência negada sem permissão e aplicada somente na confirmação quando autorizada;
- situação altera livremente sem alterar macrostatus;
- erro de autenticação, CSRF, autorização, validação e conflitos de estado.

Testes de concorrência precisam usar MySQL/InnoDB real em ambiente isolado, não SQLite nem mocks para provar locking, unique nullable ou rollback.

## 13. Arquivos prováveis na implementação futura

- `backend/prisma/schema.prisma` e uma nova migration em `backend/prisma/migrations/`.
- Seed controlada e idempotente para permissões OS, se os códigos forem aprovados.
- `backend/src/app.module.ts` para registrar o módulo.
- `backend/src/modules/service-orders/service-orders.module.ts`.
- Controllers: `service-order-openings.controller.ts`, `service-orders.controller.ts`.
- Services: abertura, numeração, confirmação, OS/situação e eventos; manter `PrismaService` como infraestrutura.
- Domínio para alocação/estados e snapshots; DTOs separados para iniciar, atualizar, confirmar, cancelar, criar equipamento, consulta/listagem, situação e atribuições.
- Repositories somente se consultas complexas/reutilizadas justificarem, conforme `docs/06-Padroes-de-Codigo.md`.
- Testes unitários, integração MySQL e e2e autenticados em locais definidos pelo padrão real de testes do Backend.

Esses caminhos são previsões, não arquivos criados nesta tarefa. SQL raw fica restrito ao locking da linha de controle, parametrizado e documentado.

## 14. Riscos e decisões para revisar

1. **Reuso depende do significado de “usado”.** Proposta: reserva commitada e mostrada ao operador conta como emissão; high-water mark nunca diminui. Isso protege etiquetas e evita reutilizar número já visto em atendimento. Confirmar interpretação antes de codificar.
2. **Equipamento criado e rascunho cancelado.** Recomendação: manter o Equipamento como cadastro normal; cancelamento não o apaga. Aprovar essa consequência antes de habilitar criação de Equipamento em abertura persistida.
3. **Transferência efetiva.** Recomendação: registrar intenção no rascunho, mas mudar titularidade somente junto da confirmação da OS. Isso evita transferência órfã se abertura for cancelada. Confirmar se está de acordo com a decisão de “transferência durante abertura”.
4. **Unique nullable e marcador de usuário.** MySQL permite vários `NULL` em unique index, então é possível ter um marcador `activeForUserId` único sem índice parcial. Garantir que todos os caminhos terminais limpem o marcador; CHECK customizado protege correlação com estado.
5. **Prisma/DDL customizada.** Prisma não deve ser presumido como capaz de representar todo CHECK customizado na versão fixada. Verificar suporte durante implementação e manter SQL da constraint no arquivo versionado da migration se necessário.
6. **Lock global.** A linha singleton serializa início/cancelamento/confirmação para preservar sequência; é simples e seguro para o volume inicial, mas pode virar gargalo se a carga aumentar. Transações devem ser curtas e não fazer chamadas de rede.
7. **Deadlocks/timeout.** Lock order fixo, índices adequados, timeout limitado e retry curto somente para deadlock/conflito transitório conhecido. Não repetir operações arbitrárias de modo automático.
8. **Prisma + raw SQL.** `$queryRaw` só para `SELECT ... FOR UPDATE`, dentro do `tx` e com tagged template; evitar interpolação de nomes e quaisquer métodos `Unsafe`.
9. **Limite numérico.** Ao chegar ao teto de seis dígitos, falhar fechado. Aumentar o formato requer decisão e compatibilidade de impressão/etiqueta.
10. **JSON.** Banco garante tipo JSON, não o contrato interno; validação e evolução por `snapshotVersion` pertencem ao domínio. Snapshots contêm dados pessoais, então respostas/lista devem expor somente o necessário e respeitar permissão de leitura.
11. **Histórico como dado obrigatório.** Evento ausente não pode deixar OS/transferência/situação parcialmente atualizadas; todos ficam no mesmo commit transacional.
12. **Índices.** Índices propostos devem acompanhar filtros e FKs. Locking reads precisam usar PK/índices adequados; tabela sem índice em consulta bloqueante pode ampliar locks.
13. **Schema atual não tem OS.** Não aplicar `db push` nem migration até schema proposto, DDL customizada, auditoria e testes em shadow serem revisados e autorizados.

## 15. Sequência recomendada para implementar

1. Marcos aprova a interpretação de número “usado”, a consequência do Equipamento criado em rascunho cancelado e o momento da transferência efetiva.
2. Revisar nomes de permissões e envelopes HTTP com Auth/API existentes; aprovar estados/eventos.
3. Converter tabelas propostas em schema Prisma compilável, incluindo relações a Person/Equipment/User, nullable unique, CHECK customizada e alocação central.
4. Revisar SQL final e constraints; criar migration somente após aprovação do schema e da migration.
5. Testar primeira migration e constraints em banco isolado MySQL 8.0.46; nunca usar o banco principal nessa validação.
6. Implementar serviço de sequência/reserva e testes concorrentes do mesmo usuário e usuários distintos.
7. Implementar ciclo de abertura persistida, consulta/retomada/cancelamento e eventos.
8. Implementar criação opcional de Equipamento e decisão de titularidade conforme as aprovações, sem transferência prematura.
9. Implementar confirmação atômica, OS, snapshots JSON, eventos e listagem/detalhe.
10. Implementar alteração de situação e de atribuições com eventos.
11. Executar testes unitários, integração MySQL isolado, e2e Auth/CSRF e auditoria focada do Recorte 1.
12. Revisar status/diff/migration e solicitar autorização separada antes de qualquer aplicação no banco principal.

## Referências técnicas oficiais

- [MySQL 8.0 — Locking Reads (`SELECT ... FOR UPDATE`)](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
- [MySQL 8.0 — `CREATE INDEX` e unique indexes (múltiplos `NULL` permitidos)](https://dev.mysql.com/doc/refman/8.0/en/create-index.html)
- [MySQL 8.0 — CHECK constraints, disponíveis e enforced a partir de 8.0.16](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html)
- [Prisma ORM 7 — transactions e níveis de isolamento](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
- [Prisma ORM 7 — raw queries parametrizadas dentro de transação](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries)
