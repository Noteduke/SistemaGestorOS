# Recorte 1 de OS — proposta de schema Prisma

**Status: estrutura incorporada ao schema Prisma; migration validada em bancos isolado e restaurado e aplicada ao banco principal.**

Os modelos abaixo serviram de base para `backend/prisma/schema.prisma` e para a migration `20261008180000_service_order_foundation`. O schema passou em `prisma validate`. Em 09/10/2026, o primeiro ensaio em `gestor_os_migration_test` falhou por incompatibilidade entre CHECK e ação referencial de FK no MySQL 8.0.46. Após remover somente os cinco CHECKs incompatíveis, o ensaio completo passou e `prisma migrate status` ficou atualizado nesse banco isolado. A migration foi aplicada ao banco principal em 09/10/2026, após ensaio em cópia restaurada e autorização explícita. Leia em conjunto com [o desenho técnico do Recorte 1](Recorte-1-OS-Desenho-Tecnico.md).

O schema implementado permanece a fonte dos nomes finais. Os blocos abaixo preservam o desenho de referência para Person, Equipment, User e EquipmentOwnership. Marca e Modelo são obrigatórios no schema Prisma e no banco principal após a migration. Os contratos e permissões propostos para o Recorte 1 estão em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`; implementação transacional e seed controlado continuam pendentes.

## Decisões incorporadas

- Uma abertura reserva número. A reserva evita duplicidade enquanto ativa, mas só se torna uso definitivo quando a OS é confirmada ou quando a abertura é cancelada após já existir número maior reservado.
- O número é BigInt no banco e string decimal na API. O formato é OS- mais no mínimo seis dígitos; a sequência não para em 999999. O contador falha fechado antes do limite máximo de BIGINT assinado para que o incremento de `nextNumber` não transborde; isso é um limite técnico distante, não um teto funcional de seis dígitos.
- Dados de equipamento novo ficam temporariamente na abertura. O cadastro definitivo é criado na mesma transação que confirma a OS.
- A intenção de transferir titularidade pode ser salva durante a abertura. A mudança de proprietário e o evento de titularidade ocorrem somente na confirmação.
- A confirmação cria atomicamente OS, vínculos, snapshots, eventual equipamento, eventual transferência e eventos.

O JSON temporário sugerido para equipamento novo contém `typePublicId` obrigatório; Marca e Modelo também são obrigatórios, admitindo as opções controladas exibidas como `Não informada` e `Não informado`; o número de série deve ser informado ou marcado `NOT_IDENTIFIED`. A opção de Marca é um registro controlado de `EquipmentBrand`, sem depender de ID numérico fixo no código. Modelo continua textual; ao escolher a opção controlada `Não informado`, persiste o valor normalizado previsto pela regra geral (`NÃO INFORMADO`). Para não guardar um texto fictício como número de série, a proposta mantém `serialNumber` nulo quando não identificado e armazena essa escolha como estado da OS, não como dado permanente do Equipamento. Observações de entrada pertencem à OS/atendimento e ficam em `ServiceOrder.intakeObservations`, fora do cadastro e do snapshot de Equipamento. O proprietário é o cliente escolhido na abertura e não é aceito do corpo do DTO. O conteúdo é validado e versionado antes de ser salvo.

Exemplo de opção “Não identificado” no JSON temporário:

~~~json
{
  "typePublicId": "identificador público do tipo",
  "brandPublicId": "identificador público da marca Não informada",
  "model": "NÃO INFORMADO",
  "serialIdentificationStatus": "NOT_IDENTIFIED",
  "serialNumber": null
}
~~~

## Extensões incorporadas às entidades existentes no schema Prisma

Os campos abaixo descrevem extensões já incorporadas ao schema Prisma e à migration de OS. O banco principal já contém essas extensões após a aplicação autorizada da migration.

### Person

~~~prisma
  serviceOrderCustomers        ServiceOrder[]        @relation("ServiceOrderCustomer")
  serviceOrderOpeningCustomers ServiceOrderOpening[] @relation("OpeningCustomer")
~~~

### Equipment

O schema anterior não representava o estado Ativo/Inativo e permitia marca e modelo opcionais. A migration aplicada tornou Marca e Modelo obrigatórios no banco principal e acrescentou `is_active`. A futura lógica do Backend deverá impedir a seleção de equipamento inativo em nova OS. Equipamentos novos criados na confirmação iniciam ativos.

~~~prisma
  brandId              Int                    @map("brand_id")
  brand                EquipmentBrand         @relation(fields: [brandId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  model                String                 @db.VarChar(191)
  isActive             Boolean                @default(true) @map("is_active")
  serviceOrders        ServiceOrder[]
  serviceOrderOpenings ServiceOrderOpening[]
~~~

### User

~~~prisma
  initiatedServiceOrderOpenings ServiceOrderOpening[]  @relation("OpeningInitiator")
  activeServiceOrderOpening    ServiceOrderOpening?   @relation("OpeningActiveUser")
  requestedOpeningTransfers    ServiceOrderOpening[]  @relation("OpeningTransferRequester")
  createdServiceOrders         ServiceOrder[]          @relation("ServiceOrderCreator")
  serviceOrderAssignments      ServiceOrderAssignment[] @relation("AssignmentUser")
  serviceOrderAssignmentsMade  ServiceOrderAssignment[] @relation("AssignmentActor")
  serviceOrderEvents           ServiceOrderEvent[]     @relation("ServiceOrderEventActor")
  initiatedServiceOrderEvents  ServiceOrderEvent[]     @relation("ServiceOrderEventInitiator")
  equipmentOwnershipChanges    EquipmentOwnership[]    @relation("EquipmentOwnershipActor")
~~~

### EquipmentOwnership

Na confirmação, transferência deve manter autoria e relação com a OS. Propor estes campos e relações:

~~~prisma
  serviceOrderId  Int?          @map("service_order_id")
  changedByUserId Int?          @map("changed_by_user_id")
  serviceOrder    ServiceOrder? @relation(fields: [serviceOrderId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  changedBy       User?         @relation("EquipmentOwnershipActor", fields: [changedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([serviceOrderId])
  @@index([changedByUserId, changedAt])
~~~

Adicionar também a relação inversa ownershipEvents EquipmentOwnership[] em ServiceOrder. Transferências feitas fora de uma OS mantêm serviceOrderId nulo. A migration futura deve preservar as relações existentes de titularidade.

## Enums propostos

~~~prisma
enum ServiceOrderOpeningStatus {
  IN_PROGRESS
  CONFIRMED
  CANCELED

  @@map("service_order_opening_status")
}

enum SerialIdentificationStatus {
  IDENTIFIED
  NOT_IDENTIFIED

  @@map("serial_identification_status")
}

enum ServiceOrderNumberAllocationStatus {
  RESERVED
  CONFIRMED
  CONSUMED
  RELEASED

  @@map("service_order_number_allocation_status")
}

enum ServiceOrderMacroStatus {
  OPEN @map("ABERTA")

  @@map("service_order_macro_status")
}

enum ServiceOrderOperationalSituation {
  TRIAGE                        @map("TRIAGEM")
  AWAITING_EVALUATION_BUDGET    @map("AGUARDANDO AVALIAÇÃO/ORÇAMENTO")
  AWAITING_BUDGET_APPROVAL      @map("AGUARDANDO APROVAÇÃO DO ORÇAMENTO")
  REPAIR_AUTHORIZED             @map("AUTORIZADO REPARO")
  AWAITING_PART_PURCHASE        @map("AGUARDANDO COMPRA DE PEÇA")
  AWAITING_PART_ARRIVAL          @map("AGUARDANDO CHEGADA DE PEÇA")
  READY_TO_NOTIFY_CUSTOMER       @map("PRONTO AVISAR CLIENTE")
  READY_CUSTOMER_NOTIFIED        @map("PRONTO CLIENTE AVISADO")
  NOT_AUTHORIZED_REASSEMBLE      @map("NÃO AUTORIZADO - REMONTAR EQUIPAMENTO")
  NOT_AUTHORIZED_READY_DELIVERY  @map("NÃO AUTORIZADO - PRONTO PRA ENTREGA")

  @@map("service_order_operational_situation")
}
~~~

Os nomes Prisma em inglês são identificadores técnicos; @map preserva os valores aprovados em português no banco. A situação contém as dez opções documentadas, mas o Recorte 1 não aciona regras futuras de orçamento ou encerramento. Eventos usam String VarChar(80), com códigos permitidos controlados pelo domínio em vez de enum MySQL.

## Modelos novos propostos

~~~prisma
model ServiceOrderNumberControl {
  id                    Int      @id
  nextNumber            BigInt   @default(1) @map("next_number")
  highestReservedNumber BigInt   @default(0) @map("highest_reserved_number")
  updatedAt             DateTime @updatedAt @map("updated_at") @db.DateTime(3)

  @@map("service_order_number_control")
}

model ServiceOrderNumberAllocation {
  numberValue BigInt                              @id @map("number_value")
  status      ServiceOrderNumberAllocationStatus
  openingId   Int?                                @unique @map("opening_id")
  createdAt   DateTime                            @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt   DateTime                            @updatedAt @map("updated_at") @db.DateTime(3)

  opening      ServiceOrderOpening? @relation(fields: [openingId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  serviceOrder ServiceOrder?

  @@index([status, updatedAt])
  @@map("service_order_number_allocations")
}

model ServiceOrderOpening {
  id                    Int                      @id @default(autoincrement())
  publicId              String                   @unique @default(uuid()) @map("public_id") @db.Char(36)
  status                ServiceOrderOpeningStatus @default(IN_PROGRESS)
  initiatedByUserId     Int                      @map("initiated_by_user_id")
  activeForUserId       Int?                     @unique @map("active_for_user_id")
  attemptedNumberValue  BigInt                   @map("attempted_number_value")
  customerId            Int?                     @map("customer_id")
  equipmentId           Int?                     @map("equipment_id")
  equipmentDraftJson    Json?                    @map("equipment_draft_json")
  equipmentDraftVersion Int?                     @map("equipment_draft_version")
  transferRequested     Boolean                  @default(false) @map("transfer_requested")
  transferRequestedByUserId Int?                 @map("transfer_requested_by_user_id")
  transferRequestedAt  DateTime?                @map("transfer_requested_at") @db.DateTime(3)
  complaint             String?                  @db.Text
  resumedAt             DateTime?                @map("resumed_at") @db.DateTime(3)
  confirmedAt           DateTime?                @map("confirmed_at") @db.DateTime(3)
  canceledAt            DateTime?                @map("canceled_at") @db.DateTime(3)
  createdAt             DateTime                 @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt             DateTime                 @updatedAt @map("updated_at") @db.DateTime(3)

  initiator        User                           @relation("OpeningInitiator", fields: [initiatedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  activeForUser    User?                          @relation("OpeningActiveUser", fields: [activeForUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  transferRequester User?                         @relation("OpeningTransferRequester", fields: [transferRequestedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  customer         Person?                        @relation("OpeningCustomer", fields: [customerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  equipment        Equipment?                     @relation(fields: [equipmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  numberAllocation ServiceOrderNumberAllocation?
  serviceOrder     ServiceOrder?
  events           ServiceOrderEvent[]

  @@index([initiatedByUserId, status, updatedAt])
  @@index([status, createdAt])
  @@index([customerId])
  @@index([equipmentId])
  @@index([attemptedNumberValue])
  @@map("service_order_openings")
}

model ServiceOrder {
  id                    Int                              @id @default(autoincrement())
  publicId              String                           @unique @default(uuid()) @map("public_id") @db.Char(36)
  openingId             Int                              @unique @map("opening_id")
  numberValue           BigInt                           @unique @map("number_value")
  customerId            Int                              @map("customer_id")
  equipmentId           Int                              @map("equipment_id")
  createdByUserId        Int                              @map("created_by_user_id")
  macroStatus           ServiceOrderMacroStatus          @default(OPEN) @map("macro_status")
  operationalSituation  ServiceOrderOperationalSituation @default(TRIAGE) @map("operational_situation")
  complaint             String?                          @db.Text
  intakeObservations    String?                          @map("intake_observations") @db.Text
  newEquipmentSerialIdentificationStatus SerialIdentificationStatus? @map("new_equipment_serial_identification_status")
  customerSnapshotJson  Json                             @map("customer_snapshot_json")
  equipmentSnapshotJson Json                             @map("equipment_snapshot_json")
  snapshotVersion       Int                              @default(1) @map("snapshot_version")
  snapshotCapturedAt    DateTime                         @map("snapshot_captured_at") @db.DateTime(3)
  openedAt              DateTime                         @default(now()) @map("opened_at") @db.DateTime(3)
  createdAt             DateTime                         @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt             DateTime                         @updatedAt @map("updated_at") @db.DateTime(3)

  opening          ServiceOrderOpening           @relation(fields: [openingId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  numberAllocation ServiceOrderNumberAllocation @relation(fields: [numberValue], references: [numberValue], onDelete: Restrict, onUpdate: Cascade)
  customer         Person                        @relation("ServiceOrderCustomer", fields: [customerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  equipment        Equipment                     @relation(fields: [equipmentId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  createdBy        User                          @relation("ServiceOrderCreator", fields: [createdByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  assignments      ServiceOrderAssignment[]
  events           ServiceOrderEvent[]
  ownershipEvents  EquipmentOwnership[]

  @@index([macroStatus, operationalSituation, openedAt])
  @@index([customerId, openedAt])
  @@index([equipmentId, openedAt])
  @@index([createdByUserId, openedAt])
  @@map("service_orders")
}
~~~

`intakeObservations` é dado da OS/atendimento e fica fora do cadastro e do snapshot de Equipamento. A migration futura deve aplicar a nulabilidade obrigatória de Marca/Modelo somente após definir como tratar registros existentes, sem inventar valores para dados históricos.

~~~prisma
model ServiceOrderAssignment {
  serviceOrderId   Int      @map("service_order_id")
  userId           Int      @map("user_id")
  assignedByUserId Int      @map("assigned_by_user_id")
  assignedAt       DateTime @default(now()) @map("assigned_at") @db.DateTime(3)

  serviceOrder ServiceOrder @relation(fields: [serviceOrderId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  user         User         @relation("AssignmentUser", fields: [userId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  assignedBy   User         @relation("AssignmentActor", fields: [assignedByUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@id([serviceOrderId, userId])
  @@index([userId, serviceOrderId])
  @@index([assignedByUserId, assignedAt])
  @@map("service_order_assignments")
}

model ServiceOrderEvent {
  id               Int      @id @default(autoincrement())
  serviceOrderId   Int?     @map("service_order_id")
  openingId        Int?     @map("opening_id")
  actorUserId      Int      @map("actor_user_id")
  initiatingUserId Int?     @map("initiating_user_id")
  eventType        String   @map("event_type") @db.VarChar(80)
  numberValue      BigInt   @map("number_value")
  occurredAt       DateTime @default(now()) @map("occurred_at") @db.DateTime(3)
  payload          Json?    @map("payload_json")

  serviceOrder   ServiceOrder?        @relation(fields: [serviceOrderId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  opening        ServiceOrderOpening? @relation(fields: [openingId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  actor          User                 @relation("ServiceOrderEventActor", fields: [actorUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  initiatingUser User?                @relation("ServiceOrderEventInitiator", fields: [initiatingUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([serviceOrderId, occurredAt])
  @@index([openingId, occurredAt])
  @@index([actorUserId, occurredAt])
  @@index([eventType, occurredAt])
  @@map("service_order_events")
}
~~~

## Restrições e comportamento no banco

O schema Prisma representa chaves, relações e índices convencionais. A migration preserva as FKs com ações referenciais e, no MySQL 8.0.46, mantém apenas a CHECK do singleton `service_order_number_control.id = 1`. As invariantes condicionais abaixo, inicialmente propostas como CHECKs, deverão ser validadas pelo Backend dentro das transações do Recorte 1:

1. Em abertura IN_PROGRESS, active_for_user_id = initiated_by_user_id; em CONFIRMED ou CANCELED, active_for_user_id IS NULL.
2. transfer_requested = 1 exige equipamento existente, cliente, usuário solicitante e instante da decisão; não pode coexistir com equipmentDraftJson. Quando transfer_requested = 0, os metadados da intenção ficam nulos.
3. Uma abertura não pode conter simultaneamente equipment_id e equipment_draft_json.
4. Alocação RESERVED, CONFIRMED ou CONSUMED exige opening_id; RELEASED exige opening_id IS NULL.
5. Evento precisa apontar para pelo menos uma entidade: opening_id ou service_order_id.
6. A tabela de controle contém somente a linha singleton id = 1; esta condição permanece como CHECK no MySQL.
7. No JSON de rascunho da abertura, `serialIdentificationStatus = IDENTIFIED` exige `serialNumber` informado; `NOT_IDENTIFIED` exige `serialNumber` nulo. Validar essa regra no DTO/domínio; a proposta não depende de CHECK SQL para inspecionar o JSON.

O unique nullable em activeForUserId permite vários NULL no MySQL e impede duas aberturas marcadas como ativas para a mesma conta. O Backend mantém o marcador coerente com estado e iniciador na transação e traduz violação de unicidade para conflito de domínio; o banco não valida essa correlação condicional.

As relações entre opening CONFIRMED e ServiceOrder, e entre alocação CONFIRMED e ServiceOrder, são invariantes entre tabelas e não podem ser garantidas por CHECK local. Criar, confirmar e mudar status de alocação na mesma transação, com FKs/uniqueness como garantias complementares.

A correspondência entre `ServiceOrder.newEquipmentSerialIdentificationStatus` e o `serialNumber` da linha `Equipment` criada também cruza tabelas, portanto não pode ser validada por CHECK local no MySQL. Na mesma transação de confirmação, copiar o estado do rascunho para a OS e gravar o serial no Equipamento quando `IDENTIFIED`; para `NOT_IDENTIFIED`, manter `Equipment.serialNumber` nulo. Quando a OS usa equipamento já existente, o campo de estado novo fica nulo.

## Numeração e JSON na API

- IDs internos não são retornados em contratos HTTP.
- numberValue, nextNumber e highestReservedNumber são BigInt no Prisma/MySQL. Serializar como strings decimais em requests/responses para não exceder a precisão segura de Number em JSON JavaScript.
- Formatar com OS- + numberValue.toString().padStart(6, '0'); padStart não trunca valores de sete ou mais dígitos.
- Antes de alocar, rejeitar `nextNumber >= 9223372036854775807`, pois o contador precisa armazenar `n + 1` em BIGINT assinado; não existe limite funcional em 999999.
- Campos JSON não devem conter BigInt; números visíveis dentro de snapshots/eventos também são strings.
- JSON temporário do equipamento valida DTO versionado no domínio. Na confirmação é convertido em cadastro definitivo; cancelamento não cria Equipment ativo, com retenção dos dados temporários segundo a política da abertura.

## Compatibilidade e etapas antes da implementação

- O schema real passou em `prisma format` e `prisma validate`; a migration corrigida aplicou em MySQL 8.0.46 isolado. O banco principal recebeu essa migration em 09/10/2026, com `prisma migrate status` atualizado.
- MySQL não oferece índice único parcial; nullable unique impede dois marcadores ativos iguais. A coerência do marcador com o status e o iniciador será mantida pelo Backend transacional.
- Cinco CHECKs que referenciavam colunas de FKs com ações referenciais foram removidos após falha MySQL 3823 no primeiro ensaio. A migration mantém a CHECK independente do singleton. Não usar `db push` como substituto da migration.
- A migration insere a linha singleton com id 1, next_number 1, highest_reserved_number 0 e updated_at no instante de criação.
- O seed/catálogo de Marca deverá garantir idempotentemente a opção controlada `Não informada`. `Não informado` é uma opção controlada do campo textual de Modelo, sem criar catálogo de modelos. Confirmar como identificar esses valores sem depender do ID numérico do seed.
- Concluído: testar em banco MySQL isolado e em cópia restaurada antes da aplicação autorizada no principal.
- Fechamento, cancelamento oficial, orçamento, inventário, financeiro e OS interna automática ficam fora do comportamento do Recorte 1.
