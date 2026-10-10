# Recorte 1 de OS — desenho técnico preliminar

**Status:** desenho de referência; schema Prisma e migration aplicados no banco principal; primeiro fluxo de abertura implementado no Backend, com validação de integração pendente.
**Data:** 08/10/2026.
**Escopo:** Backend NestJS + Prisma 7.10.0 + MySQL 8.
**Fonte normativa:** decisões aprovadas em `docs/02-Regras-de-Negocio.md`, `docs/07-Decisoes-Arquiteturais.md` e `docs/Especificacao-GestorOS.md`.

> A estrutura de persistência do Recorte 1 está no schema Prisma e na migration `20261008180000_service_order_foundation`, validada em `gestor_os_migration_test` e `gestor_os_restore_test` e aplicada ao banco principal em 09/10/2026. Os oito códigos de permissão de OS constam do catálogo idempotente e foram aplicados ao banco principal pelo seed oficial. Quatro endpoints de abertura foram implementados no Backend; os demais fluxos, os testes de integração e o frontend continuam pendentes. O contrato HTTP está em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`.

## 1. Conclusão executiva

As decisões complementares aprovadas definem a reserva temporária de número, a consolidação tardia de equipamento novo, a transferência efetiva apenas na confirmação e a exibição da numeração com no mínimo seis dígitos, sem teto funcional em 999999. O schema Prisma e o banco principal já contêm a estrutura necessária; o service transacional de iniciar e cancelar abertura foi implementado. Confirmação e demais services continuam pendentes.

O Recorte 1 tem schema e migration aplicados e contrato técnico documentado para iniciar a implementação, com seed controlado das permissões já executado e testes ainda necessários antes de liberar endpoints. As transações mantêm confirmação, criação de equipamento novo, transferência, snapshots e eventos atômicos.

## 2. Escopo funcional

### Incluído

- Iniciar, persistir, retomar e cancelar abertura em andamento.
- Reservar o número visível durante o início da abertura.
- Limitar cada usuário a uma abertura em andamento.
- Confirmar cliente e equipamento e criar OS `ABERTA`/`TRIAGEM`.
- Guardar dados temporários de um novo Equipamento durante a abertura e criá-lo como cadastro definitivo apenas ao confirmar a OS.
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
| `nextNumber` (`BigInt`) | Próximo número inteiro disponível para reserva. Inicia em `1`. |
| `highestReservedNumber` (`BigInt`) | Maior número já reservado; inicia em `0` e não diminui, mesmo quando a reserva de ponta for liberada. |
| `updatedAt` (`DateTime(3)`) | Auditoria operacional da última alteração do controle. |

A linha singleton é bloqueada com `SELECT ... FOR UPDATE` dentro de uma transação InnoDB/Prisma. Não calcular número com `MAX(number) + 1` nem usar somente `AUTO_INCREMENT`: o número precisa ser reservado antes da OS oficial e pode haver reuso apenas do último número se nenhum número maior tiver sido reservado, confirmado ou consumido. Reserva em abertura ativa não é uso definitivo.

### 3.2 `ServiceOrderNumberAllocation`

Registro único para cada número já reservado; funciona como reserva/registro central para impedir duplicidade entre aberturas, OS confirmadas e números consumidos que não podem ser reaproveitados.

| Campo candidato | Uso |
| --- | --- |
| `numberValue` (`BigInt`, PK) | Número inteiro global; formato visual é derivado na API. |
| `status` (`Enum`) | `RESERVED`, `CONFIRMED`, `CONSUMED` ou `RELEASED`. |
| `openingId` (`Int?`, unique, FK) | Abertura proprietária da reserva atual ou da reserva consumida. Nulo para número liberado. |
| `createdAt`, `updatedAt` | Datas do registro e de sua situação atual. |

Na liberação, a linha permanece `RELEASED`, sem `openingId`; a sequência pode reativar essa linha com o mesmo número. A trilha da reserva anterior permanece nos eventos da abertura cancelada. Cancelamento que não permite reuso muda o estado para `CONSUMED`, preservando a abertura. Na confirmação, muda para `CONFIRMED` e fica relacionada à OS pelo campo `ServiceOrder.numberValue`, FK para `ServiceOrderNumberAllocation.numberValue` e também `@unique`; a relação inversa é 1:0..1. A alocação mantém `openingId` para a abertura que obteve a reserva.

### 3.3 `ServiceOrderOpening`

| Campo candidato | Uso |
| --- | --- |
| `id`, `publicId` | Chave interna e identificador público. |
| `status` | `IN_PROGRESS`, `CONFIRMED` ou `CANCELED`. |
| `initiatedByUserId` | Usuário autenticado que iniciou; não muda quando Admin assume. FK restritiva. |
| `activeForUserId` (`Int?`, unique) | Igual ao iniciador somente enquanto `IN_PROGRESS`; nulo em estado terminal. Garante a unicidade de rascunho por usuário. |
| `attemptedNumberValue` (`BigInt`) | Número recebido pela abertura para consulta histórica. Não é unique porque uma reserva liberada pode ser reutilizada por outra tentativa. |
| `customerId`, `equipmentId` (`Int?`) | Referências opcionais escolhidas na abertura; a confirmação exige cliente e equipamento. Para equipamento novo, o vínculo definitivo é preenchido na confirmação. |
| `complaint` (`String?`/`Text?`) | Reclamação temporária, opcional e vazia por padrão. |
| `equipmentDraftJson` (`Json?`) | Dados temporários de equipamento novo, sem linha em `equipment` enquanto a abertura estiver em andamento. |
| `equipmentDraftVersion` (`Int?`) | Versão do formato validado dos dados temporários de equipamento. |
| Dados de identificação no `equipmentDraftJson` | Tipo obrigatório; Marca e Modelo obrigatórios, aceitando as opções controladas exibidas como `Não informada` e `Não informado`; série informada ou marcada `Não identificado`. |
| `transferRequested` (`Boolean`) | Intenção temporária explícita de transferir titularidade na confirmação; não muda o proprietário durante o rascunho. |
| `transferRequestedByUserId` (`Int?`) | Usuário que registrou a intenção explícita de transferência. |
| `transferRequestedAt` (`DateTime(3)?`) | Instante em que a intenção temporária foi registrada. |
| `resumedAt`, `confirmedAt`, `canceledAt` (`DateTime(3)?`) | Instantes de retomada/terminalidade; evento continua sendo trilha canônica. |
| `createdAt`, `updatedAt` | Persistência e retomada após reinício. |

`activeForUserId` é um marcador nullable com unique index, não um índice parcial. Usuários comuns consultam/alteram somente suas linhas; Admin ou `service_orders.opening.manage` pode atuar sobre outra abertura. `attemptedNumberValue` aponta para o número reservado pela tentativa, mesmo que depois seja liberado; eventos preservam o resultado. Dados de equipamento novo ficam em `equipmentDraftJson` e só geram cadastro definitivo no commit da confirmação.

### 3.4 `ServiceOrder`

| Campo candidato | Uso |
| --- | --- |
| `id`, `publicId` | Chave interna e identificador público. |
| `numberValue` (`BigInt`, unique) | Número visível armazenado como inteiro de 64 bits, relacionado à alocação `CONFIRMED`. |
| `customerId`, `equipmentId` (`Int`, FKs) | Vínculos operacionais atuais com Pessoa e Equipamento. |
| `macroStatus` | No Recorte 1, único valor gravável: `ABERTA`. |
| `operationalSituation` | Enum aprovado; inicia `TRIAGEM` e pode mudar para as demais situações operacionais aprovadas. |
| `intakeObservations` (`Text?`) | Observações de entrada pertencem ao atendimento/OS, não ao cadastro permanente do Equipamento. |
| `newEquipmentSerialIdentificationStatus` (`Enum?`) | Guarda na OS se a série do equipamento criado na confirmação foi informada ou marcada `NOT_IDENTIFIED`; nulo quando a OS usa equipamento já cadastrado. |
| `complaint` (`String?`/`Text?`) | Reclamação opcional. |
| `customerSnapshotJson`, `equipmentSnapshotJson` (`Json`) | Snapshots históricos da confirmação; obrigatórios na OS oficial e imutáveis. |
| `createdByUserId`, `createdAt`, `updatedAt`, `openedAt` | Autoria e datas geradas pelo servidor. |

O número visível será formatado como `OS-` + número decimal com no mínimo seis dígitos, por exemplo `OS-000001`, `OS-999999` e `OS-1000000`. Usar `BigInt` no banco e string decimal na API, sem wraparound nem limite funcional em seis dígitos. O fragmento Prisma proposto está em `docs/planejamento/Recorte-1-OS-Schema-Proposto.md`.

### 3.5 `ServiceOrderAssignment`

Uma linha por funcionário nominalmente atribuído à OS, com `serviceOrderId`, `userId`, `assignedByUserId` e `assignedAt`; unique composto em `(serviceOrderId, userId)`. A regra funcional permite atribuir um ou mais funcionários, sem exigir que o conjunto permaneça não vazio. A responsabilidade padrão da Administração é uma fila/grupo derivado da situação operacional, não uma linha em `ServiceOrderAssignment` e não uma escolha automática de usuário. Na confirmação em TRIAGEM, a OS pode ficar sem funcionário nominal. Elegibilidade de usuários seguirá as regras centrais de usuários. Alterações nominais explícitas substituem atomicamente o conjunto atual e registram as listas anterior/nova no evento.

### 3.6 `ServiceOrderEvent`

| Campo candidato | Uso |
| --- | --- |
| `id` | Chave interna. |
| `serviceOrderId` (`Int?`, FK) | OS oficial associada, se já confirmada. |
| `openingId` (`Int?`, FK) | Abertura associada. Evento de confirmação pode referenciar ambas. |
| `actorUserId` (`Int`, FK) | Usuário autenticado que executou a ação; sempre derivado da sessão, nunca do payload. |
| `initiatingUserId` (`Int?`, FK) | Iniciador original quando a ação é de Admin/gestor. |
| `eventType` (`Enum` ou catálogo) | Tipo técnico do evento. |
| `numberValue` (`BigInt`) | Número relacionado, preservado mesmo se a reserva for liberada. |
| `occurredAt` (`DateTime(3)`) | Data/hora do servidor. |
| `payload` (`Json`) | Campos alterados, decisão de titularidade, estado anterior/novo e resultado de reuso quando aplicável. Não incluir segredos. |

Eventos são append-only na aplicação. FKs de usuários são restritivas porque contas são inativadas, não removidas. A migration pode permitir `openingId`/`serviceOrderId` nulos para evento associado a uma ou às duas entidades. Payload não substitui colunas para filtros essenciais.

### 3.6 Enumerações

- `ServiceOrderOpeningStatus`: `IN_PROGRESS`, `CONFIRMED`, `CANCELED`.
- `ServiceOrderNumberAllocationStatus`: `RESERVED`, `CONFIRMED`, `CONSUMED`, `RELEASED`.
- `ServiceOrderMacroStatus`: apenas `ABERTA` no primeiro recorte. Não implementar `FECHADA` ou `CANCELADA` como ações do módulo nesta etapa.
- `ServiceOrderOperationalSituation`: dez valores documentados em `docs/02-Regras-de-Negocio.md`; inicial `TRIAGEM`. A mudança é livre entre as situações aprovadas por usuário autorizado. Não implementar efeitos de orçamento/encerramento associados a recortes futuros.
- `ServiceOrderEventType` (códigos propostos): `ABERTURA_EM_ANDAMENTO_CRIADA`, `ABERTURA_RETOMADA`, `ABERTURA_RETOMADA_POR_ADMIN`, `ABERTURA_CONFIRMADA`, `ABERTURA_CANCELADA`, `ABERTURA_CANCELADA_POR_ADMIN`, `SITUACAO_OPERACIONAL_ALTERADA`, `ATRIBUICOES_ALTERADAS`, `EQUIPAMENTO_CRIADO_NA_CONFIRMACAO`, `TITULARIDADE_TRANSFERIDA_NA_CONFIRMACAO`.

Os códigos de eventos são proposta de implementação e podem ser enum Prisma ou strings controladas pelo domínio; manter compatibilidade com o Log Administrativo sem duplicar eventos do módulo no `admin_audit_log` quando forem eventos operacionais comuns.

## 4. Mecanismo de numeração e concorrência

### 4.1 Reserva de número

1. Abrir transação interativa Prisma com isolamento `READ COMMITTED` para as operações de alocação/reuso.
2. Bloquear a linha única de `ServiceOrderNumberControl` por PK com `SELECT ... FOR UPDATE`, via `tx.$queryRaw` parametrizado. Esse é o ponto global de serialização.
3. Consultar `activeForUserId` do iniciador. Se já existir abertura, não consumir número; concluir sem escrita e responder `409 OPENING_ALREADY_EXISTS`, incluindo somente o `publicId` e número visível da abertura atual.
4. Ler `nextNumber` como inteiro de 64 bits. Não bloquear no valor `999999`; o formato visual mantém no mínimo seis dígitos e cresce naturalmente. Como `nextNumber` precisa avançar após cada reserva, falhar fechado quando `nextNumber` alcançar o máximo de `BIGINT` assinado (`9223372036854775807`), antes de criar a reserva, para não causar overflow. Esse limite técnico não é um teto funcional de seis dígitos.
5. Criar abertura `IN_PROGRESS`, `activeForUserId = initiatedByUserId`, com número tentado. Criar alocação `RESERVED` para o número; se houver linha `RELEASED` nesse valor, reativá-la e associá-la à nova abertura.
6. Atualizar `nextNumber = n + 1` e `highestReservedNumber = max(highestReservedNumber, n)`. A reserva impede duplicidade, mas ainda não é uso definitivo. A checagem do limite ocorre antes de qualquer escrita da reserva.
7. Inserir `ABERTURA_EM_ANDAMENTO_CRIADA` e confirmar a transação. Falha em qualquer escrita reverte abertura, alocação e contador em conjunto.

Todas as ações que mudam alocação de número — iniciar, cancelar/liberar, confirmar — usam a mesma ordem de bloqueio: linha de controle, abertura, alocação, usuário/equipamento/pessoa e OS. Isso reduz deadlocks. A unique key em `activeForUserId`, PK da alocação e unique de `ServiceOrder.numberValue` são defesa final; o service traduz conflito de unicidade para erro de domínio.

### 4.2 Reuso e `ABERTURA CANCELADA`

Uma reserva de abertura em andamento não é uso definitivo. Porém, para decidir se uma tentativa cancelada pode liberar seu número, considera-se se já foi reservado, confirmado ou consumido algum número maior. `highestReservedNumber` registra a maior reserva commitada até então e não diminui; uma tentativa que falhou antes de commitar não avança esse contador.

- Ao cancelar uma abertura com número `n`, bloquear controle e alocação.
- Se `n == highestReservedNumber`, não existe número maior anteriormente reservado: marcar abertura `CANCELED`, limpar `activeForUserId`, marcar alocação `RELEASED`, remover sua associação ativa com a abertura e definir `nextNumber = n`. Gerar `ABERTURA_CANCELADA` com `numberReleased: true`; manter a tentativa consultável no histórico.
- Se `n < highestReservedNumber`, já existiu reserva maior commitada: marcar abertura `CANCELED`, limpar `activeForUserId`, marcar alocação `CONSUMED` e mantê-la associada à tentativa. O número não poderá ser reservado novamente. Gerar `ABERTURA_CANCELADA` com `numberReleased: false`.
- A abertura cancelada nunca aparece na listagem comum de OS. O número de OS confirmada continua único; tentativas cujo número foi liberado permanecem em eventos e não são registros de OS.

Esse critério permite reusar apenas a ponta atual da sequência. Não recua o high-water mark. Uma reserva maior commitada consome a possibilidade de reusar números menores, mesmo que depois a abertura maior seja cancelada e seu próprio número seja liberado.

### 4.3 Duas pessoas e falhas/reinícios

Transações concorrentes de início esperam pela mesma linha de controle. Após uma liberar o lock e commitar `n`, a próxima lê `n + 1`; nunca recebe o mesmo valor. Em falha antes do commit, o contador e reserva revertem, ficando o mesmo número disponível.

A abertura e reserva confirmadas persistem no banco. Queda do processo, navegador ou computador não apaga o rascunho nem a reserva. Após reinício, `GET .../openings/current` encontra o rascunho. Não há lease nem expiração obrigatória no Recorte 1; uma rotina futura não poderá liberar números sem seguir a regra de reuso e trilha histórica.

## 5. Uma abertura em andamento por usuário

### Defesa no banco

`activeForUserId Int? @unique` é preenchido com o ID do usuário iniciador em `IN_PROGRESS` e fica `NULL` em `CONFIRMED`/`CANCELED`. MySQL permite múltiplos `NULL` em um unique index, mas rejeita duas linhas com o mesmo usuário não nulo. Como MySQL não oferece unique index parcial `WHERE status = 'IN_PROGRESS'`, este marcador mantém a restrição diretamente no banco.

O primeiro ensaio da migration falhou com MySQL 3823: `active_for_user_id` e `initiated_by_user_id` participam de FKs com ações referenciais, incompatíveis com CHECK sobre essas colunas. A decisão técnica preserva as FKs e remove a CHECK condicional. O Backend deverá preencher/limpar o marcador, comparar com o iniciador e mudar o estado na mesma transação. A unique key é a garantia física contra dois marcadores iguais; a checagem do service melhora o erro e retorna a abertura existente.

### Comportamento de API/autorização

- Usuário autenticado inicia no máximo uma abertura própria. Tentativa de iniciar outra retorna `409 OPENING_ALREADY_EXISTS` com os dados públicos da existente.
- Usuário comum só lê, altera, retoma, confirma ou cancela a própria abertura.
- Administrador ou `service_orders.opening.manage` pode consultar, retomar/assumir ou cancelar abertura de outro usuário. A ação não altera `initiatedByUserId` nem a unicidade da abertura.
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
  "type": "tipo obrigatório",
  "brand": "marca obrigatória",
  "model": "modelo textual obrigatório",
  "serialNumber": "serial ou null",
  "mainIdentification": "identificação textual legível"
}
```

O conjunto exato de valores opcionais é montado dos dados principais disponíveis e definidos em `docs/02-Regras-de-Negocio.md`. Observações de entrada pertencem à OS/atendimento e devem ser persistidas em campo próprio da OS, não no cadastro ou snapshot de Equipamento. Não copiar `id`, FK ou depender do cadastro atual para resolver o snapshot. Capturar ambos, dentro da transação de confirmação, no instante da confirmação — não usar somente `createdAt`, pois ele pode anteceder a confirmação. O serviço bloqueia leituras pertinentes ou usa leitura consistente na mesma transação para não compor um objeto com dados de momentos diferentes. Depois da gravação, nenhuma edição, correção de vínculos ou reabertura recria/edita os JSONs. Não indexar propriedades JSON no Recorte 1 sem consulta aprovada.

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
| `EQUIPAMENTO_CRIADO_NA_CONFIRMACAO` | Rascunho de equipamento é convertido em cadastro definitivo na confirmação | opening/OS, número, equipamento público, ator, proprietário. |
| `TITULARIDADE_TRANSFERIDA_NA_CONFIRMACAO` | Transferência aplicada na confirmação | equipamento, proprietário anterior/novo, ator, abertura/OS, número e confirmação explícita. |

Todos os eventos incluem `actorUserId`, `occurredAt`, `eventType`, número visível e payload JSON. Eventos administrativos incluem também usuário iniciador e ator que assumiu/cancelou. `ABERTURA_CONFIRMADA` relaciona evento à abertura e à OS. História é inserida na mesma transação da mudança que descreve; falha de evento reverte a operação. Não registrar edição campo a campo durante o rascunho.

## 8. Endpoints REST do Recorte 1

O contrato consolidado de rotas, request/response conceituais, erros e eventos está em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`. Esse documento substitui as rotas preliminares de abertura em `/service-order-openings`, situação em `/situation` e histórico em `/history`. A base física já está aplicada. O Backend contém quatro endpoints de abertura: iniciar, consultar a própria ativa, consultar por `publicId` e cancelar. Os demais endpoints e a validação HTTP/concorrência em MySQL isolado continuam pendentes.

## 9. Permissões propostas do Recorte 1

Usar a matriz em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`, com prefixo `service_orders.*` e permissões complementares `equipment.create` e `equipment.transfer_ownership`. Os oito códigos de OS foram adicionados ao catálogo idempotente e aplicados ao banco principal pelo seed oficial, executado duas vezes sem duplicação. O banco contém 32 permissões, incluindo `equipment.transfer_ownership` uma única vez. Admin mantém autoridade máxima conforme a política central; os antigos candidatos `os.*` desta proposta não são códigos paralelos para o Recorte 1.

## 10. Transações principais

Todas usam `PrismaService.$transaction` interativa. SQL raw é limitado a locking reads realmente necessários, parametrizado por tagged template via `tx.$queryRaw`; não usar `$queryRawUnsafe`, concatenar valores nem abrir conexão MySQL paralela. O Prisma v7 permite transações interativas e queries raw dentro da transação; MySQL/InnoDB permite bloquear a linha alvo com `SELECT ... FOR UPDATE`. O padrão de isolamento é explicitado para não depender de defaults ambientais.

### Iniciar abertura

**Lê/bloqueia:** linha de controle global com `FOR UPDATE`; abertura ativa do usuário.
**Escreve:** abertura, alocação `RESERVED`, `nextNumber`, high-water mark e evento de criação.
**Rollback:** qualquer erro reverte todas as escritas e não consome número. Unique `activeForUserId` impede duplicidade mesmo em corrida.

### Cancelar abertura

**Lê/bloqueia:** controle, abertura e alocação na mesma ordem. Confere ownership ou permissão.
**Escreve:** status terminal, remove marcador ativo, libera o número somente quando `attemptedNumberValue == highestReservedNumber`; caso contrário marca alocação `CONSUMED`; registra `ABERTURA_CANCELADA` sempre e `ABERTURA_CANCELADA_POR_ADMIN` adicionalmente quando aplicável.
**Rollback:** nenhum cancelamento ou reuso parcial. Falha transitória de lock/deadlock admite retry limitado da transação inteira.

### Confirmar abertura

**Lê/bloqueia:** controle; abertura/alocação; Pessoa e equipamento existente, se selecionado; titularidade; dados de tipo/marca e contatos para snapshots. Validar ativo/elegível e permissões. Para transferência, bloquear equipamento e revalidar `equipment.transfer_ownership`; para equipamento novo, validar o JSON temporário e `equipment.create`. Se houver funcionários informados na confirmação, validar elegibilidade e `service_orders.assignment.manage`.
**Escreve:** se houver equipamento novo, cria então o cadastro definitivo e o vínculo com o cliente; cria OS `ABERTA/TRIAGEM`; snapshots JSON a partir dos cadastros finais; alocação `CONFIRMED`; abertura `CONFIRMED` e marcador ativo nulo; eventual transferência e `equipment_ownership_events`; eventos de confirmação/criação/transferência. Somente se informada explicitamente, grava atribuição nominal e seu evento na mesma transação; sem indicação, TRIAGEM fica sem funcionários nominais.
**Rollback:** qualquer falha cancela tudo, mantendo a abertura e reserva em andamento; não persiste OS, equipamento novo, snapshot, transferência ou evento parcial.

### Guardar equipamento temporário durante abertura

**Lê/bloqueia:** abertura e autorização para cadastrar equipamento.
**Escreve:** valida e guarda apenas os campos temporários versionados em `equipmentDraftJson`; não cria registro definitivo em `equipment` nem evento de criação de Equipamento.
**Rollback:** falha deixa intacta a versão anterior do rascunho. Se a abertura for cancelada, os dados temporários são retidos somente conforme a política de retenção da abertura/eventos, sem equipamento ativo criado.

### Transferir titularidade durante abertura

Registrar escolha explícita como intenção temporária no rascunho, sem alterar `Equipment.ownerId`. Na confirmação, bloquear Equipamento existente, validar proprietário atual e permissão, atualizar `ownerId`, inserir `equipment_ownership_events` e evento OS na mesma transação da confirmação. Cancelar a abertura não transfere titularidade. Falha reverte a confirmação inteira.

### Alterar situação operacional

**Lê/bloqueia:** OS confirmada e autorização.
**Escreve:** situação atual e evento `SITUACAO_OPERACIONAL_ALTERADA` com anterior/nova, ator, instante e número. A situação define se a OS está na fila administrativa; não cria `ServiceOrderAssignment` nem escolhe Administrador nominal.
**Rollback:** a situação não muda se o evento não for persistido. Rejeitar a tentativa de gravar macrostatus de encerramento pelo endpoint.

### Alterar atribuições

**Lê/bloqueia:** OS confirmada e usuários indicados, validando existência, elegibilidade e permissão do ator.
**Escreve:** substitui o conjunto em `ServiceOrderAssignment` e insere `ATRIBUICOES_ALTERADAS` com atribuídos anteriores/novos.
**Rollback:** se qualquer vínculo ou evento falhar, preservar integralmente o conjunto anterior. A regra oficial permite atribuir um ou mais funcionários, sem exigir mínimo permanente; a fila administrativa segue a situação configurada independentemente das atribuições nominais.

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

- formatação com mínimo de seis dígitos: `OS-000001`, `OS-999999`, `OS-1000000`, usando valor acima da faixa segura de Number como string na API;
- algoritmo de reserva, reuso da ponta e número consumido quando maior foi reservado;
- política de estados/retomada/cancelamento;
- composição/versionamento/captura temporal dos snapshots;
- autorização própria/Admin/`service_orders.opening.manage`/transferência.

### Integração em MySQL isolado

- duas pessoas iniciando simultaneamente recebem números distintos;
- requisições simultâneas do mesmo usuário deixam somente uma abertura e traduzem a outra para `OPENING_ALREADY_EXISTS`;
- unique `activeForUserId`, PK/unique da alocação, unique do número da OS e CHECK do singleton são enforced; coerência condicional deve ser testada nos services transacionais;
- queda/reinício não perde abertura nem reserva;
- cancelar a última reserva libera o número e qualquer reserva maior commitada torna definitiva a tentativa cancelada anterior;
- duas confirmações da mesma abertura não criam OS duplicada;
- número da OS referencia exatamente uma alocação confirmada, sem ciclo de FKs;
- falha no histórico, snapshot ou transferência reverte OS inteira;
- antes da confirmação não existe linha definitiva para equipamento novo; cancelar a abertura deixa zero equipamento ativo criado por ela; confirmar cria equipamento, OS e eventos atomicamente;
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

- `backend/prisma/schema.prisma` e a migration `20261008180000_service_order_foundation` já criados, validados em bancos isolado e restaurado e aplicados no principal.
- Oito códigos de permissões OS acrescentados ao catálogo idempotente e aplicados ao banco principal pelo seed oficial, executado duas vezes com total estável de 32 permissões.
- `backend/src/app.module.ts` para registrar o módulo.
- `backend/src/modules/service-orders/service-orders.module.ts`.
- Controllers: `service-order-openings.controller.ts`, `service-orders.controller.ts`.
- Services: abertura, numeração, confirmação, OS/situação e eventos; manter `PrismaService` como infraestrutura.
- Domínio para alocação/estados e snapshots; DTOs separados para iniciar, atualizar, confirmar, cancelar, criar equipamento, consulta/listagem, situação e atribuições.
- Repositories somente se consultas complexas/reutilizadas justificarem, conforme `docs/06-Padroes-de-Codigo.md`.
- Testes unitários, integração MySQL e e2e autenticados em locais definidos pelo padrão real de testes do Backend.

Os caminhos de código de aplicação acima são previsões, não arquivos criados nesta etapa. SQL raw fica restrito ao locking da linha de controle, parametrizado e documentado.

## 14. Riscos e decisões para revisar

1. **Reserva temporária.** Reserva impede duplicidade durante abertura, mas não é uso definitivo. Confirmação torna o número definitivo; cancelamento só consome a tentativa se já houver reserva maior commitada.
2. **Equipamento novo.** Dados temporários ficam na abertura; cadastro ativo definitivo só nasce na confirmação. Cancelamento não deixa Equipamento ativo criado por essa abertura.
3. **Transferência.** A intenção pode ser registrada durante abertura, mas mudança de titularidade e evento só ocorrem na confirmação. Cancelamento não transfere.
4. **Unique nullable e marcador de usuário.** MySQL permite vários `NULL` em unique index, então é possível ter um marcador `activeForUserId` único sem índice parcial. Os services transacionais devem manter a correlação do marcador com o estado e limpar o valor em todos os caminhos terminais; não há CHECK física para essa condição.
5. **Prisma/DDL customizada.** A migration mantém somente a CHECK do singleton. Cinco CHECKs condicionais foram removidos após MySQL 3823, pois envolviam colunas de FKs com ações referenciais preservadas. Essas invariantes exigem validação no Backend e testes de integração.
6. **Lock global.** A linha singleton serializa início/cancelamento/confirmação para preservar sequência; é simples e seguro para o volume inicial, mas pode virar gargalo se a carga aumentar. Transações devem ser curtas e não fazer chamadas de rede.
7. **Deadlocks/timeout.** Lock order fixo, índices adequados, timeout limitado e retry curto somente para deadlock/conflito transitório conhecido. Não repetir operações arbitrárias de modo automático.
8. **Prisma + raw SQL.** `$queryRaw` só para `SELECT ... FOR UPDATE`, dentro do `tx` e com tagged template; evitar interpolação de nomes e quaisquer métodos `Unsafe`.
9. **Precisão numérica.** Usar `BigInt` e string decimal na API para crescer além de seis dígitos sem perda de precisão JSON. Existe limite técnico de `BIGINT` assinado no MySQL; ele não é o limite funcional de seis dígitos e seu tratamento deve falhar fechado se algum dia se tornar alcançável.
10. **JSON.** Banco garante tipo JSON, não o contrato interno; validação e evolução por `snapshotVersion` pertencem ao domínio. Snapshots contêm dados pessoais, então respostas/lista devem expor somente o necessário e respeitar permissão de leitura. Dados temporários de equipamento também precisam de retenção compatível com o ciclo da abertura.
11. **Histórico como dado obrigatório.** Evento ausente não pode deixar OS/transferência/situação parcialmente atualizadas; todos ficam no mesmo commit transacional.
12. **Índices.** Índices propostos devem acompanhar filtros e FKs. Locking reads precisam usar PK/índices adequados; tabela sem índice em consulta bloqueante pode ampliar locks.
13. **Migration de OS aplicada no principal.** A autorização explícita, a pré-checagem e o backup precederam o deploy; as seis tabelas, índices, FKs, CHECK singleton e contador foram verificados. A estrutura não libera os fluxos funcionais sem services transacionais.

## 15. Sequência recomendada para implementar

1. Concluído para a base física: schema e migration de OS aplicados. Contratos HTTP e permissões consolidados em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`; códigos no catálogo idempotente e seed executado. Início, consultas pontuais e cancelamento da abertura foram implementados no Backend; liberação funcional ainda depende de testes de integração.
2. Concluído: incorporar relações a Person/Equipment/User, nullable unique, CHECK do singleton, campos temporários de equipamento e alocação BigInt no schema real.
3. Concluído: revisar SQL e criar migration; as cinco CHECKs condicionais incompatíveis foram removidas, preservando FKs e ações referenciais.
4. Concluído: validar a cadeia em `gestor_os_migration_test` e no banco restaurado `gestor_os_restore_test`, aplicar a migration de OS no principal mediante autorização e validar sua estrutura.
5. Implementado serviço de sequência/reserva, com testes isolados; testes concorrentes do mesmo usuário e usuários distintos em MySQL isolado continuam pendentes.
6. Implementados início, consulta da própria abertura ativa, consulta por `publicId`, cancelamento e eventos; retomada explícita continua pendente.
7. Implementar salvamento temporário do novo equipamento e da intenção de transferência, sem efetivar cadastro/transferência antes da confirmação.
8. Implementar confirmação atômica, criação definitiva opcional do equipamento, OS, snapshots JSON, eventual transferência, eventos e listagem/detalhe.
9. Implementar alteração de situação e de atribuições com eventos.
10. Executar testes unitários, integração MySQL isolado, e2e Auth/CSRF e auditoria focada do Recorte 1.
11. Antes de liberar os endpoints, revisar status/diff, confirmar o resultado do seed já executado e dos testes; a migration de OS já foi aplicada ao banco principal e não deve ser reaplicada por este roteiro.

## Referências técnicas oficiais

- [MySQL 8.0 — Locking Reads (`SELECT ... FOR UPDATE`)](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
- [MySQL 8.0 — `CREATE INDEX` e unique indexes (múltiplos `NULL` permitidos)](https://dev.mysql.com/doc/refman/8.0/en/create-index.html)
- [MySQL 8.0 — CHECK constraints, disponíveis e enforced a partir de 8.0.16](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html)
- [Prisma ORM 7 — transactions e níveis de isolamento](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)
- [Prisma ORM 7 — raw queries parametrizadas dentro de transação](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries)
