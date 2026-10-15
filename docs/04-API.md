# API
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir o padrão oficial para todas as APIs do Sistema Gestor OS.

# 2. Arquitetura

- API REST.
- Backend em NestJS.
- Comunicação via HTTPS.
- JSON como formato padrão.

# 3. Versionamento

A API deverá suportar versionamento (ex.: /api/v1).

# 4. Autenticação

O primeiro recorte de autenticação e autorização foi implementado no Backend, já foi versionado em commit local, ainda não enviado a origin nem liberado para produção. Usa sessão opaca mantida no servidor; o cookie contém apenas o segredo opaco e o banco armazena seu hash. A sessão expira após 8 horas de inatividade: cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. Logout revoga somente a sessão atual. JWT e OIDC ficam fora do recorte atual. A migration `20261008120000_auth_foundation` foi aplicada no banco principal `gestor_os`; o bootstrap local foi concluído, com um Administrador ativo e 32 permissões no estado atual, sem `admin.full`, `system.admin` ou perfil/usuário `Master`. A segunda execução do bootstrap aborta antes dos prompts de credenciais se já existe Administrador ativo; o controle transacional contra concorrência permanece no service. Os testes HTTP autenticados principais passaram localmente. O processo local escuta apenas em `127.0.0.1`. O sistema é considerado somente de uso interno e não está pronto para exposição externa operacional; não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo é proibido até 2FA e fronteira confiável estarem implementados. Proxy reverso, VPN, túnel ou publicação externa futura exige nova decisão documental. Uma credencial administrativa foi exposta acidentalmente durante teste manual e, por decisão de Marcos, não foi trocada nesta etapa; ela deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. O fluxo definitivo de troca/reset segue pendente.

Como a autenticação usa cookie, métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem proteção CSRF, inclusive `POST /api/v1/auth/login`; `GET` não exige token. Antes do login, o cliente obtém contexto temporário pela rota pública `GET /api/v1/auth/csrf`, que retorna o token e grava identificador opaco temporário em cookie `HttpOnly`, com validade de 15 minutos. O cliente envia o token em `X-CSRF-Token`. Após login bem-sucedido, o contexto pré-login é descartado e a sessão autenticada passa a usar seu próprio controle CSRF. O contexto é armazenado pela entidade Prisma `PreAuthCsrfContext`; sua tabela já existe no banco principal após a aplicação da migration de Auth.

As sete rotas atuais de Pessoas estão protegidas no código por autenticação e autorização por ação. Ausência de permissão nega acesso; uma rota protegida sem política explícita falha fechada. O Backend decide autorização. O Frontend não concede acesso nem substitui essa verificação. A migration e o seed já foram concluídos no banco principal; o bootstrap local e os principais testes autenticados foram concluídos, sem liberação para produção.

| Rota atual | Permissão exigida no código |
| --- | --- |
| `POST /api/v1/people` | `people.create` |
| `GET /api/v1/people` | `people.read` |
| `GET /api/v1/people/:publicId` | `people.read` |
| `POST /api/v1/people/:publicId/phones` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/phones` | `people.contacts.read` |
| `POST /api/v1/people/:publicId/emails` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/emails` | `people.contacts.read` |

O primeiro recorte implementa `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` e `GET /api/v1/auth/me`. Testes locais confirmaram `GET /auth/csrf` 200, login bem-sucedido, `/auth/me` autenticado 200, logout 204 e `/auth/me` após logout 401. Login e `/auth/me` retornam `data` com `publicId`, `username`, `isAdmin`, permissões efetivas, token CSRF da sessão e prazo de expiração; não expõem o `id` interno, hash de senha ou segredo de sessão. A rota de CSRF e o login são públicas, mas login exige token CSRF; falhas de login têm resposta genérica e não distinguem username existente de inexistente. Logout exige autenticação e CSRF e encerra somente a sessão atual; `/me` exige autenticação. Rotas públicas são identificadas explicitamente; não se presume pública nenhuma rota de negócio. Não há CRUD HTTP de usuários: o uso inicial é restrito ao Administrador bootstrapado e criação/gestão de contas por API ficam para recorte posterior. A consulta especializada de usuários atribuíveis a OS, documentada adiante, não cria nem administra contas.

Em termos gerais, requisição sem sessão autenticada recebe `401`; ausência de permissão ou falha de CSRF recebe `403`; falha de login usa resposta genérica sem indicar se o username existe. O contrato específico e os códigos por endpoint permanecem descritos nas seções correspondentes abaixo.

# 5. Padrão de Endpoints

Recursos utilizarão substantivos.

Exemplos:
GET /clientes
POST /clientes
PUT /clientes/{id}
DELETE /clientes/{id}

# 6. Respostas

Todas as respostas deverão seguir um padrão único.

Sucesso:
- dados
- paginação (quando aplicável)

Erro:
- código
- mensagem
- detalhes

# 7. Paginação

Listagens deverão suportar paginação.

# 8. Filtros

Filtros deverão ser padronizados para todos os módulos.

# 9. Upload de Arquivos

Uploads serão tratados por endpoints específicos.

# 10. Documentação

A API deverá possuir documentação centralizada e atualizada.

## 10.1 Regras de domínio para Cadastros

O Backend/API aplica as regras de duplicidade e normalização aprovadas em `docs/02-Regras-de-Negocio.md`. No primeiro recorte de Pessoas, CPF/CNPJ informado é validado e duplicidade bloqueia; sem documento, nome normalizado exatamente igual retorna aviso não bloqueante. Comparação por telefone/e-mail e regras de serial de Equipamento permanecem para os respectivos recortes futuros.

Para documentos de Pessoa, a API básica valida CPF numérico para PF e CNPJ numérico ou alfanumérico oficial para PJ. CPF aceita 11 dígitos ou máscara completa `000.000.000-00` na entrada, após remover espaços externos; letras e símbolos indevidos são rejeitados, e o valor é persistido somente com números. CNPJ é persistido sem pontuação e em maiúsculas, preservando letras do padrão oficial. Validade matemática, compatibilidade com Tipo de Pessoa e unicidade são verificadas no Backend.

A regra aprovada não permite Pessoa inativa em novos vínculos operacionais. Essa validação geral e as permissões por usuário/ação ainda deverão ser aplicadas nos fluxos futuros correspondentes. Nas rotas de contatos, a troca de principalidade já é implementada em transação.

### 10.2 Primeiro recorte implementado de Pessoas

- `POST /api/v1/people`: cria Pessoa básica ativa. Exige `personType` PF/PJ e `name`; aceita `document`, `tradeName` apenas para PJ, `stateRegistration`, `municipalRegistration` e `observations` como opcionais. A resposta contém `data` e `warnings`; documento repetido retorna conflito. Sem documento, nome normalizado idêntico pode gerar aviso não bloqueante.
- `GET /api/v1/people/:publicId`: consulta uma Pessoa pelo identificador público, inclusive se estiver inativa; retorna `data` ou erro de não encontrada.
- `GET /api/v1/people`: exige `page` e `pageSize` inteiros positivos; não há valores padrão automáticos; ausência ou valor inválido retorna `400 INVALID_PAGINATION`. `pageSize` é no máximo 100. Rejeita números fora do intervalo seguro e deslocamento de paginação inseguro. `search` pesquisa nome ou documento; inativos ficam ocultos por padrão e `includeInactive=true` os inclui. Retorna `data` e `pagination`, com ordenação estável por `name` e `id` interno. Teste local confirmou que a chamada sem paginação é rejeitada e `?page=1&pageSize=20` retorna 200 para Administrador.

As respostas de Pessoa expõem `publicId`, não o `id` interno. `name` e `tradeName` são limitados a 191 caracteres, `stateRegistration` e `municipalRegistration` a 50, e `observations` a 2000. O recorte não possui PUT, PATCH ou DELETE, nem edição, inativação/reativação ou exclusão. Telefones, e-mails, endereços, Pessoa de Contato, Aviso, histórico, Equipamentos e demais módulos continuam fora destas rotas. Contratos dos demais recortes de Cadastros ainda precisam ser detalhados.

### 10.3 Recorte implementado: telefones e e-mails de Pessoa

Telefones e e-mails são sub-recursos diretos de Pessoa. As rotas implementadas são:

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/api/v1/people/:publicId/phones` | Adicionar telefone. |
| `GET` | `/api/v1/people/:publicId/phones` | Listar telefones. |
| `POST` | `/api/v1/people/:publicId/emails` | Adicionar e-mail. |
| `GET` | `/api/v1/people/:publicId/emails` | Listar e-mails. |

As rotas `/contacts/phones` e `/contacts/emails` não são usadas, para não confundir telefone/e-mail com Tipo de Contato ou Pessoa de Contato. `PATCH`, `PUT`, `DELETE`, edição geral de Pessoa e uso funcional de `label` ficam fora. `label` não é aceito na entrada nem retornado na saída; permanece nulo/sem uso. As respostas públicas expõem `publicId` próprio do contato e nunca o `id` interno. A listagem exige `page` e `pageSize`, com `data` e `pagination`.

#### Confirmações e avisos dos POST

Adicionar telefone ou e-mail a Pessoa existente é alteração cadastral. **Todo `POST` exige `confirmPersonChange: true`**. Sem esse valor verdadeiro, não grava contato nem histórico e retorna `409 PERSON_CHANGE_CONFIRMATION_REQUIRED`. O campo torna a confirmação explícita no contrato, mas não substitui autenticação nem comprova sozinho que a mensagem foi apresentada ao operador.

Telefone normalizado sem dígitos ou com mais de 32 dígitos é inválido. Dez dígitos, ou onze com 9 após o DDD, passam sem aviso de formato. Outros comprimentos entre 1 e 32, ou onze sem esse 9, exigem também `confirmNonstandardPhone: true`. Sem a confirmação específica, a API retorna `409 PHONE_CONFIRMATION_REQUIRED`, incluindo mensagem, número normalizado e aviso `PHONE_NONSTANDARD_FORMAT`, **sem gravar contato ou evento**. No reenvio, ambos `confirmPersonChange: true` e `confirmNonstandardPhone: true` são necessários; após nova validação, a API grava e registra o histórico. A confirmação não permite ultrapassar 32 dígitos.

E-mail é convertido para minúsculas após `trim`, deve ser ASCII e tem limite de 254 caracteres. A parte local tem até 64 caracteres, aceita letras minúsculas, dígitos e `_ % + -`, com pontos somente entre segmentos não vazios. O domínio tem até 253 caracteres e pelo menos dois rótulos separados por ponto; cada rótulo tem 1 a 63 caracteres, aceita letras minúsculas, dígitos ou hífen, e começa e termina com letra ou dígito. Exige exatamente um `@`. Não há consulta DNS nem verificação da caixa postal. E-mail inválido retorna `400 INVALID_EMAIL`. Repetição do mesmo e-mail normalizado na própria Pessoa retorna `409 DUPLICATE_PERSON_EMAIL`, sem gravação. Repetição em outra Pessoa **grava no primeiro envio válido** e retorna `201` com aviso não bloqueante `EMAIL_SHARED_ACROSS_PEOPLE`, sem confirmação extra. Mensagem: “Este e-mail também está cadastrado para outra Pessoa.” O aviso não revela nome, `publicId`, quantidade, estado nem outros dados da outra Pessoa; ainda assim, pode indicar que há outro cadastro e requer autenticação/guards antes de exposição em produção.

#### Respostas e efeitos por rota

| Rota | Entrada | Sucesso | Erros e efeitos |
| --- | --- | --- | --- |
| `POST /api/v1/people/:publicId/phones` | `number`; `isPrimary` opcional; `confirmPersonChange: true`; `confirmNonstandardPhone: true` apenas quando fora do padrão. | `201` com `data: { publicId, number, isPrimary, createdAt }` e `warnings` quando houver. | `400` para entrada inválida/sem dígitos/acima de 32; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `PHONE_CONFIRMATION_REQUIRED`. Gera `PHONE_CREATED` e, se o principal efetivo mudar, `PHONE_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/phones` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, number, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |
| `POST /api/v1/people/:publicId/emails` | `address`; `isPrimary` opcional; `confirmPersonChange: true`. | `201` com `data: { publicId, address, isPrimary, createdAt }` e `warnings` quando houver. | `400` para e-mail inválido/acima de 254; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `DUPLICATE_PERSON_EMAIL`. Gera `EMAIL_CREATED` e, se o principal efetivo mudar, `EMAIL_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/emails` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, address, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |

Marcar o novo contato como principal desmarca o anterior **da mesma Pessoa e coleção**, na mesma transação; telefone e e-mail são independentes. Sem `isPrimary: true`, o principal anterior permanece e nenhuma coleção é obrigada a ter principal. A migration `20261007183000_person_contacts` foi aplicada; o histórico mínimo é persistido atomicamente com a inclusão e a troca, e falha ao registrar evento cancela toda a operação. `person_contact_events` não possui rota pública. A migration cria FKs para Pessoa e para cada tabela de contato, mas não possui constraint CHECK que obrigue exatamente um entre `phone_id` e `email_id` ou valide a coerência de `event_type` com a FK; a coerência é aplicada pelo service e uma constraint física pode ser avaliada futuramente. Auth e guards estão implementados no código; a migration e o seed de permissões foram aplicados no banco principal, o bootstrap local foi concluído e os testes autenticados principais passaram. Testes específicos de criação de contato e autoria em `person_contact_events.user_id` permanecem pendentes.

### 10.4 Peças em Ordem de Serviço — integração com estoque futura

O cadastro de Produtos e o primeiro controle de estoque manual já existem, mas não há contrato implementado para lançar produto do estoque na OS, aplicar, retirar, cancelar ou baixar peça. A base atual usa movimentações como fonte do saldo em um local implícito e admite saldo negativo. A inclusão no orçamento continua sem alterar estoque; futura aplicação tornará indisponível somente a quantidade aplicada e o encerramento com reparo fará baixa definitiva. Remoção confirmada de peça aplicada deverá desfazer a aplicação/restaurar disponibilidade atomicamente, sem pendência administrativa; cancelamento com peça aplicada exige confirmação de retirada física. Esses fluxos OS/estoque ainda são futuros.

O Cadastro de Serviços está implementado na API administrativa sob `services.manage`: `GET /api/v1/services?page=1&pageSize=20&status=active|inactive|all&search=...`, `GET /api/v1/services/:publicId`, `POST /api/v1/services`, `PATCH /api/v1/services/:publicId` e `DELETE /api/v1/services/:publicId?expectedVersion=...`. A consulta auxiliar `GET /api/v1/services/available-for-order` exige `service_orders.budget.update` e retorna apenas serviços ativos. Itens são consultados em `GET /api/v1/service-orders/:publicId/budget-items`, incluídos por `POST` na mesma rota (união discriminada), alterados em `PATCH /api/v1/service-orders/:publicId/budget-items/:itemPublicId` e retirados logicamente em `DELETE` nessa rota. Sessão é obrigatória; mutações exigem CSRF. Leitura de itens usa `service_orders.read`; edição usa `service_orders.budget.update`; alterações de custo exigem também `service_orders.budget.costs.read` e `service_orders.budget.costs.update`. Valores monetários são strings com duas casas, totais são calculados pelo Backend, e respostas não expõem ids internos. As migrations dos itens e do catálogo foram validadas apenas em `gestor_os_opening_test`, permanecendo pendentes no banco principal.

Cada alteração de item gera um evento `ITEM_ORCAMENTO_ALTERADO` contendo todos os campos modificados na mesma operação. `GET /api/v1/service-orders/:publicId/events` remove custos e mudanças de custo da projeção para quem não pode lê-los. Ao alterar a situação para uma das opções NÃO AUTORIZADO, o DTO admite `withdrawBudget: true`; a retirada completa e a mudança de situação ocorrem na mesma transação e exigem `service_orders.situation.update` e `service_orders.budget.update`. A interface solicita confirmação antes do PATCH; não há endpoint de exclusão física nem restauração de itens.

Enquanto ABERTA, editar orçamento permite incluir/retirar/alterar itens e valores após autorização sem justificativa, nova aprovação automática ou mudança de situação. FECHADA/CANCELADA bloqueia mutações do orçamento, mas não a criação/exclusão autorizada de observações manuais da OS confirmada. Custo opcional de peça avulsa distingue NULL de zero: alteração exige visualizar custo e editar orçamento; API/eventos omitem custo de quem não pode ver, inclusive snapshots aninhados. Monetários têm duas casas; totais vêm do Backend e total atual considera linhas ativas. Serviço cadastrado repetido retorna conflito e publicId do item atual para destaque, sem criar linha nem somar quantidade. AGUARDANDO APROVAÇÃO DO ORÇAMENTO não exige itens. Item removido só fica no histórico; novo lançamento aparece ao fim. A observação manual opcional usa `/notes`; `GET /events` continua somente leitura. A consulta de serviços disponíveis mostra só ativos e exige edição do orçamento, sem conceder administração.

No encerramento com reparo, o fluxo futuro deverá comparar quantidades orçadas e aplicadas e exigir regularização explícita das diferenças, sem ajuste automático; depois, baixará a quantidade aplicada. Encerramento sem reparo desfaz aplicação e não cobra a peça. Não há regra aprovada para uma pendência administrativa por item devolvido: essa regra antiga foi substituída. Endpoints, contratos de erro, políticas técnicas, tabelas e implementação seguem futuros.

### 10.5 Situação e encerramento da OS — contrato futuro

A API futura deve tratar separadamente situação operacional, status macro ABERTA/FECHADA/CANCELADA e resultado/status-motivo de encerramento. A abertura inicia em TRIAGEM e não disponibiliza outra situação operacional. Deve suportar a lista inicial e as atribuições nominais explícitas. Nas situações com responsabilidade padrão da Administração, a situação identifica uma fila/grupo acessível aos Administradores ou usuários com permissão equivalente para a ação; a API não escolhe nem grava automaticamente um usuário específico em `service_order_assignments`. Situações futuras podem ser atribuídas a qualquer funcionário.

Ao salvar NÃO AUTORIZADO - REMONTAR EQUIPAMENTO ou NÃO AUTORIZADO - PRONTO PRA ENTREGA, se houver orçamento, o contrato futuro deve permitir retirar sua composição da apresentação principal da OS ou mantê-la. Retirar não apaga dados: preservar itens, valores, usuário, data/hora e contexto da decisão e eventual motivo informado no histórico. A operação não cria financeiro nem movimenta/reserva/baixa estoque. A escolha e as mudanças de situação/atribuição devem ser historizadas. Não há endpoints nem modelo físico aprovados nesta etapa.

### 10.6 Reabertura e mudanças de status macro — contrato futuro

Após a abertura, usuários autorizados na OS podem alterar livremente a situação operacional para qualquer situação ativa; não existe sequência rígida. O encerramento futuro deverá validar e exigir regularização explícita das diferenças de aplicação conforme as regras vigentes de estoque, sem criar a antiga pendência administrativa de devolução. Alterar o status macro para FECHADA ou CANCELADA exige Administrador ou permissão específica futura (`os.close` ou `os.cancel`); não permitir transição direta FECHADA→CANCELADA nem CANCELADA→FECHADA.

A reabertura simples (`os.reopen_text`) permite correções textuais sem alterar situação, status macro, faturamento ou pagamentos, e gera histórico. A reabertura completa (`os.reopen_full`) mantém a mesma OS/número, retorna a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO, cancela faturamento e retira pagamentos do financeiro ativo por cancelamento auditável. Aplica-se também a OS CANCELADA, exceto à OS externa encerrada como Equipamento comprado/Doado depois de criada sua OS interna; essa origem admite somente reabertura simples textual. Deve preservar histórico, registrar o motivo “reabertura completa da OS”, cancelar lançamentos financeiros vinculados sem exclusão física de seus rastros, reclassificar peças vinculadas como ORÇADA e notificar o dashboard do Administrador.

Para pagamento previamente registrado, o evento deve referenciar usuário, data/hora, OS, valor, forma quando houver e lançamento anterior. A reversão de aplicação, quando cabível, deverá restaurar disponibilidade por movimento compensatório/histórico apropriado, não por pendência administrativa; a forma física do estorno ainda depende do desenho de estoque. Operações sobre faturamento, financeiro, itens de estoque, OS e histórico precisarão de consistência transacional; o contrato técnico, tratamento de títulos liquidados/documento fiscal e movimentos físicos ainda não estão definidos. Nenhum endpoint, tabela ou migration de integração de estoque está aprovado nesta documentação.

### 10.7 Encerramento Equipamento comprado/Doado — contrato futuro

O encerramento de OS externa com esse resultado deve validar que existe uma única Pessoa ativa configurada como representante da própria empresa e elegível como titular de equipamento. Sem ela, rejeitar o encerramento e informar que a configuração administrativa é obrigatória. Somente Administrador pode definir, remover ou trocar a Pessoa configurada; a alteração gera histórico administrativo.

O fluxo aprovado fecha a OS externa, transfere a titularidade, cria OS interna ligada ao mesmo equipamento em ABERTA/TRIAGEM e persiste referências recíprocas entre as OS. As ações devem manter histórico com usuário/data/hora; a consistência contra conclusão parcial entre fechamento, transferência e criação será definida no desenho técnico. A nova OS identifica informações herdadas separadas de seus campos e itens operacionais; cobrança, pagamento, serviços cobrados, peças UTILIZADAS/BAIXADAS e pendências abertas da origem não são criados como registros ativos na interna.

A OS externa original não aceita movimentos técnicos após a geração da interna e só pode receber reabertura simples textual. A OS interna segue os fluxos gerais, exceto que não pode usar novamente o resultado Equipamento comprado/Doado. Não se registra valor pago ao cliente, forma de pagamento, saída financeira ou compra formal nesta etapa. Fiscal, pagamento futuro, modelo dos dados herdados, nomes/rotas e semântica de falha parcial seguem pendentes; nenhum endpoint, modelo físico ou migration está aprovado.

### 10.8 Abertura, consulta, situação e atribuições da OS — contrato técnico do Recorte 1, implementação parcial

A estrutura física de OS está aplicada no banco principal. A primeira fatia funcional de abertura implementou no Backend `POST /api/v1/service-orders/openings`, `GET /api/v1/service-orders/openings/current`, `GET /api/v1/service-orders/openings/:publicId` e `POST /api/v1/service-orders/openings/:publicId/cancel`. Essas rotas exigem sessão, permissão e CSRF nas mutações; reserva, reuso/consumo do número, cancelamento e eventos são transacionais. Em HTTP real com MySQL isolado, criação retornou `201`, consultas `200` e cancelamento `200` após correção do controller, conforme o contrato. Sem login houve `401`; mutação sem CSRF e criação sem permissão retornaram `403`. Usuário comum não consultou nem cancelou abertura alheia; usuário com `service_orders.opening.manage` conseguiu ambas as ações, com evento administrativo no cancelamento. Concorrência e rollback também passaram no banco isolado; a primeira fatia está tecnicamente validada, sem implicar conclusão do Recorte 1 inteiro. O contrato técnico consolidado de rotas, permissões, DTOs conceituais, erros, eventos, transações e testes está em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`; ele substitui as rotas candidatas antigas de `/service-order-openings`, `/situation` e `/history` para este recorte. A base planejada é `/api/v1/service-orders/openings` para aberturas e `/api/v1/service-orders` para OS confirmadas. Situação usa `/operational-situation`, atribuições nominais explícitas usam `PUT /assignments` e eventos usam `/events`. Os oito códigos `service_orders.*` foram incluídos no catálogo idempotente e aplicados ao banco principal pelo seed oficial, executado duas vezes sem duplicação. Aberturas persistidas não integram a lista de OS, e o número reservado não é definitivo antes da confirmação. Equipamento novo e transferência são efeitos da confirmação, nunca de uma rota de rascunho. O `PATCH /api/v1/service-orders/openings/:publicId` edita a abertura em andamento e retorna `200 OpeningView`, sem criar OS ou Equipment. Campo omitido preserva o valor; `null` limpa os opcionais permitidos. `equipmentDraft` exige `equipment.create`; `TRANSFER_TO_CUSTOMER` exige `equipment.transfer_ownership` ou Admin no PATCH, com nova verificação na confirmação. Edição administrativa de abertura alheia é registrada no Log Administrativo. As fatias de abertura, edição, confirmação, listagem, consulta, situação, atribuições e eventos foram validadas em HTTP/MySQL isolado; o Frontend oferece login visual, consultas de OS (lista, detalhe, snapshots e eventos), alteração básica da situação e gestão de atribuições nominais no detalhe. A primeira fatia visual permite iniciar, retomar e cancelar abertura, além de pesquisar e vincular/trocar cliente. Quando há cliente salvo, `GET /api/v1/service-orders/openings/current`, `GET /api/v1/service-orders/openings/:publicId` e `PATCH /api/v1/service-orders/openings/:publicId` incluem `customer: { publicId, name, documentHint }` (ou `null`), mantendo `customerPublicId` por compatibilidade. Quando há equipamento existente vinculado, os mesmos endpoints incluem `equipment: { publicId, type: { publicId, name }, brand: { publicId, name }, model, serialNumber, serialIdentificationStatus, owner: { publicId, name, documentHint } }` (ou `null`), mantendo `equipmentPublicId`. `documentHint` reutiliza a máscara de Pessoa; o contrato não expõe IDs internos, documento cru ou outros dados sensíveis. A tela de abertura permite selecionar/trocar equipamento existente e exibe esse resumo ao salvar e retomar; validação automatizada passou, e a validação operacional da seleção de equipamento foi concluída em 13/10/2026, conforme `docs/05-Frontend.md`, seção 10.11. Na primeira entrega visual, confirmação e criação de equipamento pela interface ainda estavam fora do escopo. O estado atual foi ampliado: a confirmação pela interface está implementada e validada, conforme `docs/05-Frontend.md`, seção 10.11. A informação de equipamento novo como rascunho na abertura está implementada no Frontend, coberta por testes automatizados e validada operacionalmente em 13/10/2026. Edição da abertura pela interface segue futura; transferência de titularidade continua fora desta etapa.

`POST /api/v1/service-orders/openings/:publicId/confirm` foi implementado no Backend para transformar uma abertura `IN_PROGRESS` em OS `ABERTA`/`TRIAGEM`. Aceita somente `intakeObservations?` e `assignedUserPublicIds?`; cliente, equipamento, reclamação e intenção de transferência vêm da abertura. Exige sessão, CSRF, `service_orders.create` e permissão de abertura própria ou de gestão alheia. Equipamento novo exige `equipment.create`; transferência revalida `equipment.transfer_ownership`; atribuições explícitas exigem `service_orders.assignment.manage`. A confirmação usa uma transação para Equipment novo ou transferência, OS, número `CONFIRMED`, snapshots, eventos, atribuições e abertura terminal sem marcador ativo. Sem atribuição explícita, TRIAGEM nasce sem funcionário nominal. A resposta `201` contém OS e referências públicas, sem IDs internos. Testes HTTP/MySQL no banco isolado `gestor_os_opening_test` cobriram os principais caminhos, autorização, CSRF e rollback; a consulta/listagem de OS confirmadas, alteração de situação, substituição posterior de atribuições nominais e consulta paginada de eventos foram implementadas posteriormente.

`GET /api/v1/service-orders` e `GET /api/v1/service-orders/:publicId` consultam somente OS oficiais confirmadas, exigem sessão e `service_orders.read` (ou Administrador), e não exigem CSRF. A lista requer `page` e `pageSize` inteiros positivos, com `pageSize` até 100 e deslocamento seguro; retorna `data` e `pagination`, ordenada por número decrescente. Aberturas em andamento ou canceladas ficam fora. O detalhe retorna dados atuais do cliente/equipamento e os JSON históricos `customerSnapshotJson` e `equipmentSnapshotJson` exatamente como armazenados, sem recálculo, além de número visível, estados, datas e atribuições públicas. `numberValue` é string decimal; IDs internos não são expostos. Paginação inválida retorna `400 INVALID_PAGINATION`; OS inexistente retorna `404 SERVICE_ORDER_NOT_FOUND`. Testes HTTP/MySQL isolados cobriram `401`, `403`, paginação, exclusão de aberturas e preservação dos snapshots após alteração dos cadastros atuais.

`PATCH /api/v1/service-orders/:publicId/operational-situation` altera livremente uma das dez situações técnicas válidas da OS confirmada e aberta. Exige sessão, CSRF e `service_orders.situation.update` (ou Administrador). O corpo exige `operationalSituation` e aceita `withdrawBudget`; não aceita macrostatus. A atualização e o evento `SITUACAO_OPERACIONAL_ALTERADA`, com situação anterior/nova, ator, instante e número, são atômicos. Repetir a situação vigente retorna a consulta detalhada sem novo evento. O detalhe da OS é retornado sem IDs internos; macrostatus, snapshots, número, cliente e equipamento são preservados. Situação não altera atribuições nominais. O alias antigo `/api/v1/service-orders/:publicId/situation` não foi implementado. A rota foi validada por testes HTTP/MySQL em `gestor_os_opening_test`; a interface de detalhe agora permite selecionar e alterar situação por essa rota, mantendo CSRF e autorização no Backend.

`PUT /api/v1/service-orders/:publicId/assignments` substitui integralmente os responsáveis nominais de uma OS confirmada. Exige sessão, CSRF e `service_orders.assignment.manage` (ou Administrador). O corpo `AssignmentsPut` exige `userPublicIds`, uma lista de usuários existentes e ativos, sem duplicatas; lista vazia remove todos. A comparação considera conjuntos, então a mesma lista em ordem diferente não grava vínculos nem gera evento novo. Alterações efetivas atualizam apenas os vínculos nominais e `updatedAt`, e registram `ATRIBUICOES_ALTERADAS` com ator, instante, número e listas anterior/nova, na mesma transação. A resposta usa o detalhe atual da OS, incluindo `assignedUserPublicIds`, sem IDs internos; situação, macrostatus, snapshots, número, cliente e equipamento são preservados. Administração/grupo não é convertido em usuário nominal e a OS pode ficar sem atribuídos. `PATCH /api/v1/service-orders/:publicId/assignments` não foi implementado. Testes HTTP/MySQL isolados cobriram autorização, CSRF, validação, substituição, remoção, idempotência e preservação dos demais dados.

`GET /api/v1/users/assignable` é uma consulta auxiliar, somente leitura, para selecionar responsáveis nominais de OS; não é CRUD nem listagem administrativa de usuários. Exige sessão autenticada e `service_orders.assignment.manage` (ou Administrador). A query exige `page` e `pageSize` inteiros positivos, com `pageSize` até 100; `search` é opcional, limitado a 50 caracteres, e procura parcialmente por username após trim e conversão para minúsculas. Retorna apenas usuários ativos, ordenados de forma estável por username e id, com `{ data: [{ publicId, username }], pagination: { page, pageSize, total, totalPages } }`. O modelo `User` não possui nome de exibição; nenhum campo além de `publicId` e `username` é exposto. A permissão administrativa `users.read` continua reservada a uma futura consulta administrativa. A rota não altera OS, atribuições, permissões ou eventos.

`GET /api/v1/service-orders/:publicId/events` consulta somente eventos da OS confirmada e da abertura vinculada, exige sessão e `service_orders.events.read` (ou Administrador) e não exige CSRF. Exige `page` e `pageSize`, inteiros positivos, `pageSize` até 100 e deslocamento seguro; retorna `data` e `pagination`, ordenados do mais recente para o mais antigo por `occurredAt` e `id` como desempate estável. Cada item expõe tipo, instante, número visível/decimal, ator com `publicId` e username e payload allowlisted por tipo; IDs internos não são retornados e payloads desconhecidos ficam ocultos. A rota é somente leitura: não cria, edita nem exclui eventos. Testes HTTP/MySQL isolados cobriram autenticação, permissão, abertura não aceita como OS, paginação, eventos de confirmação/equipamento/titularidade/situação/atribuições, ordenação, sanitização e ausência de efeitos colaterais. A consulta e exibição de eventos, a alteração visual de situação e a gestão visual de atribuições nominais estão implementadas; filtros avançados e as demais interfaces de mutação permanecem futuros.

#### Consultas auxiliares somente leitura para a futura abertura

As rotas abaixo apoiam a seleção na abertura da OS. Todas exigem sessão autenticada e `service_orders.opening.create` (ou Administrador pela política central); não exigem CSRF por serem `GET`. São consultas operacionais restritas a esse fluxo, não CRUDs administrativos. `people.read` e `equipment.read` permanecem reservadas às futuras consultas gerais de Cadastros. Todas as listagens exigem `page` e `pageSize` inteiros positivos, com `pageSize` até 100; `search` é opcional, trim, até 100 caracteres. Retornam `{ data, pagination: { page, pageSize, total, totalPages } }`, com ordenação estável e sem IDs internos.

| Rota | Seleção e resposta pública | Efeito |
| --- | --- | --- |
| `GET /api/v1/people/customers` | Pessoas ativas com papel `CUSTOMER`. Pesquisa parcial por nome, documento compacto ou telefone numérico. Cada item contém `publicId`, `personType`, `name` e `documentHint` mascarado (somente os dois últimos dígitos). | Somente leitura; não cria nem altera Pessoa, OS, abertura ou evento. |
| `GET /api/v1/equipment/opening-search` | Equipamentos ativos, sem restringir ao proprietário do cliente selecionado, para permitir detectar titularidade divergente. Pesquisa parcial por modelo, série, tipo, marca ou nome do proprietário. Cada item contém `publicId`, tipo e marca (`publicId`, `name`), `model`, `serialNumber` e `owner` (`publicId`, `name`). `serialIdentificationStatus` é uma projeção: `IDENTIFIED` quando há série cadastrada e `NOT_IDENTIFIED` quando `serialNumber` é nulo; não afirma que o status foi persistido separadamente no cadastro do Equipamento. | Somente leitura; não altera equipamento nem titularidade, não cria OS/abertura ou evento. O frontend compara `owner.publicId` com o cliente selecionado e apresenta a decisão explícita prevista nas regras. |
| `GET /api/v1/equipment-types` | Todos os tipos cadastrados, opcionalmente pesquisados por nome; itens `{ publicId, name }`. | Somente leitura. O modelo atual não tem `isActive`; a rota não filtra nem declara estado ativo/inativo. |
| `GET /api/v1/equipment-brands` | Todas as marcas cadastradas, opcionalmente pesquisadas por nome; itens `{ publicId, name }`. A marca `NÃO INFORMADA` aparece se estiver cadastrada. | Somente leitura. O modelo atual não tem `isActive`; não cria marca nem executa seed. |

A retomada oficial da abertura própria em andamento pelo usuário comum é `GET /api/v1/service-orders/openings/current`, que recupera o rascunho persistido sem evento ou escrita. `POST /api/v1/service-orders/openings/:publicId/resume` não faz parte do contrato aprovado nem está implementado. A listagem administrativa `GET /api/v1/service-orders/openings` permanece futura e não foi implementada. As quatro consultas auxiliares acima não alteram OS, abertura, Pessoa, Equipamento, catálogo ou histórico. A tela de abertura no Frontend permite iniciar, retomar, cancelar e selecionar/trocar cliente e equipamento existente, além de confirmar a OS pela rota oficial. Seleção de equipamento e confirmação foram validadas operacionalmente em 13/10/2026, conforme `docs/05-Frontend.md`, seção 10.11. A interface permite salvar `equipmentDraft` durante a abertura; a confirmação e cancelamento continuam sob autoridade do Backend, sem criação antecipada. Transferência de titularidade pela interface e edição geral da abertura continuam indisponíveis.

Validação operacional HTTP concluída em 12/10/2026: os quatro endpoints foram exercitados com Backend real e conexão exclusivamente a `gestor_os_opening_test`; antes de criar o usuário de teste ou fazer consultas de preparação, `DATABASE()` confirmou esse nome. O banco principal `gestor_os` não recebeu consultas nem escritas. Cada rota retornou `401` sem sessão, `403` com sessão sem `service_orders.opening.create` e `200` com essa permissão. Listagens e buscas respeitaram paginação; as respostas dos quatro lookups usaram `publicId`, omitiram IDs internos e campos sensíveis, clientes eram ativos e elegíveis como `CUSTOMER` com documentos mascarados, e equipamentos ativos incluíram o proprietário atual. Tipos e marcas foram consultados sem filtro de atividade, inexistente no modelo; a marca `NÃO INFORMADA` cadastrada foi retornada. As contagens de Pessoas, equipamentos, tipos, marcas, titularidades, OS, aberturas, eventos de OS e eventos de contato permaneceram iguais. Nenhum endpoint mutável de OS foi chamado; para autenticação foram usados somente `GET /api/v1/auth/csrf` e `POST /api/v1/auth/login`, cujo fluxo pode registrar o contexto pré-login e a auditoria normal de autenticação no banco isolado. O usuário descartável `codex.lookup.b85b5bae` terminou inativo, sem sessões ativas e sem a permissão temporária; sua senha aleatória não foi registrada. O teste HTTP como Administrador não foi executado; a política central de Admin continua coberta por teste focado, e evidência HTTP específica fica como ajuste futuro.


**Atualização da interface — decisão de titularidade na abertura (13/10/2026):** a tela agora envia `ownershipDecision` no PATCH oficial de abertura. `CANCEL_SELECTION` limpa equipamento/intenção; `USE_CURRENT_OWNER` atualiza o cliente da abertura para o proprietário atual; `TRANSFER_TO_CUSTOMER` grava somente intenção, exige `equipment.transfer_ownership` ou Admin, e só transfere na confirmação. O PATCH não muda titularidade e cancelar a abertura não transfere. Confirmação e transferência são aplicadas atomicamente pelo Backend. Validação operacional exclusiva em `gestor_os_opening_test`; o registro está em `docs/05-Frontend.md`, seção 10.11. Esta atualização substitui a afirmação anterior desta seção de que transferência pela interface estava indisponível.

### 10.9 Retrato cadastral implementado e correção de vínculos da OS futura

Na confirmação, a API captura uma única vez um retrato histórico cadastral parcial, nunca durante a abertura em andamento. O retrato inclui no mínimo nome do cliente e identificação principal do equipamento; quando disponíveis, documento, telefone/e-mail principais, endereço, tipo, marca, modelo e serial. A captura ocorre junto à confirmação da OS. Para equipamento novo, o `brandPublicId` do rascunho aponta para Marca já existente, inclusive a opção controlada “Não informada”; a confirmação não cria Marca. O Modelo “Não informado” permanece texto controlado. Reabertura e correção de vínculo não recriam nem substituem o retrato.

O retrato é preservado sem recálculo e já está disponível na consulta detalhada para usuário com permissão de visualizar a OS, identificado como dados cadastrais no momento da abertura; a tela de detalhe já exibe os retratos históricos do cliente e do equipamento. A tela e a impressão padrão devem obter dados atuais dos cadastros vinculados; não se exige aviso automático de divergência e não haverá impressão própria do retrato. O retrato não representa checklist ou recebimento físico.

Após a confirmação, corrigir o cliente ou equipamento vinculado será operação controlada, não uma nova abertura. Exige Administrador ou permissão específica futura sugerida (`os.correct_customer` ou `os.correct_equipment`, conforme o vínculo) e deve registrar obrigatoriamente usuário, data/hora, campo, valor anterior e novo valor. Motivo não é obrigatório; pode existir futuramente como campo opcional. A correção pode ocorrer com a OS FECHADA ou CANCELADA, sem reabri-la ou alterar o status macro, número ou retrato original. Pode ocorrer mesmo com faturamento, cobrança ou pagamento vinculado, mas não altera automaticamente registros financeiros nem estoque; eventual ajuste financeiro usa operação própria. Não há alerta obrigatório no painel do Administrador.

### 10.10 Cadastro básico de Produtos — primeira etapa implementada

As rotas de consulta de catálogo exigem sessão e `products.manage` ou `products.stock.manage`; criação e alteração exigem `products.manage` e mutações também exigem CSRF. A API não oferece exclusão física. Identificadores internos não são expostos.

| Rota | Contrato |
| --- | --- |
| `GET /api/v1/products?page=1&pageSize=20&status=active|inactive|all&search=...&category=PART|RESALE_GOOD` | Lista paginada, ordenada por descrição e `id`, com busca por código ou descrição. `status` padrão `active`; `category` opcional. Retorna `{ data, pagination }`. |
| `GET /api/v1/products/:publicId` | Consulta por UUID público, incluindo produto inativo. |
| `POST /api/v1/products` | Cria `{ internalCode?, description, category, salePrice?, acquisitionCost? }`; preços aceitam string decimal não negativa ou `null`. Informar `acquisitionCost` exige `products.manage` e `products.cost.update`. Inicializa ativo. Retorna `201`. |
| `PATCH /api/v1/products/:publicId` | Altera um ou mais campos dentre `internalCode`, `description`, `category`, `isActive`, `salePrice`, `acquisitionCost`, sempre com `expectedVersion`. Alterar `acquisitionCost` exige `products.manage` e `products.cost.update`; quando o ator não tem leitura, não recebe o valor atual na resposta. |

Categoria aceita `PART` ou `RESALE_GOOD`. Código interno é opcional, único quando informado, normalizado em caixa alta e limitado a 64 caracteres. Descrição é obrigatória, normalizada em caixa alta e limitada a 255 caracteres; categoria também é obrigatória. Busca tem limite de 120 caracteres; `pageSize` máximo é 100. A tentativa de repetir código retorna `409 DUPLICATE_PRODUCT_CODE`; versão obsoleta retorna `409 PRODUCT_VERSION_CONFLICT`; UUID inválido retorna `400 INVALID_PUBLIC_ID` e registro ausente `404 PRODUCT_NOT_FOUND`. Campos desconhecidos são rejeitados.

Preço de venda padrão e custo de aquisição usam precisão `DECIMAL(15,2)`, são opcionais, aceitam zero e rejeitam valores negativos. A API usa strings decimais para evitar perda de precisão. `NULL` significa não informado para o preço e custo desconhecido para o custo. `products.cost.read` controla separadamente custo e `grossProfitEstimate`, calculado como preço menos custo somente quando ambos são conhecidos; usuários sem essa permissão não recebem as propriedades. `products.cost.update` controla alterações, sempre junto com `products.manage`; quem tem apenas alteração pode substituir/limpar o custo sem receber o valor atual na resposta. Administrador (`isAdmin`) recebe acesso efetivo conforme a política central; não há papel Master separado. As permissões `service_orders.budget.costs.read/update` não se aplicam ao custo de Produto.

Criação e alteração/inativação geram `PRODUCT_CREATED` e `PRODUCT_UPDATED` no Log Administrativo na mesma transação, com ator, instante do servidor e valores anterior/novo, inclusive para preço e custo. Não existe endpoint de leitura desse log neste recorte; qualquer projeção futura deverá aplicar `products.cost.read` aos valores de custo. Alterar preço na OS não modifica o produto.

### 10.11 Controle inicial de estoque — implementado

As consultas exigem sessão e `products.manage` ou `products.stock.manage`; todas as mutações exigem sessão, CSRF e `products.stock.manage`. Administrador (`isAdmin`) tem acesso efetivo pela política central. `products.manage` sozinho não permite movimentar estoque; `products.stock.manage` permite consultar produtos e estoque, mas não criar/alterar o cadastro.

| Rota | Contrato |
| --- | --- |
| `GET /api/v1/products/:publicId/stock` | Retorna `data.productPublicId` e saldo derivado `{ total, applied, defective, available }`. |
| `GET /api/v1/products/:publicId/stock/movements?page=1&pageSize=20` | Lista paginada, mais recente primeiro, com tipo, origem, quantidade, deltas, instante e usuário. |
| `POST /api/v1/products/:publicId/stock/entries` | Corpo `{ quantity }`, inteiro positivo; cria entrada manual. |
| `POST /api/v1/products/:publicId/stock/adjustments` | Corpo `{ quantityDelta }`, inteiro não nulo com sinal; ajuste negativo pode levar o saldo não classificado a negativo. |
| `POST /api/v1/products/:publicId/stock/defective/classifications` | Corpo `{ quantity }`; classifica somente unidades disponíveis. |
| `POST /api/v1/products/:publicId/stock/defective/returns` | Corpo `{ quantity }`; retorna unidades defeituosas à disponibilidade. |
| `POST /api/v1/products/:publicId/stock/defective/disposals` | Corpo `{ quantity, confirmed: true }`; descarte exige confirmação explícita. |

Quantidades são inteiras e limitadas a `2.147.483.647` por operação. Movimento incompatível com o saldo classificado retorna `409`; dados inválidos retornam `400`. Cada POST bloqueia a linha do Produto, agrega o livro e grava o movimento e o Log Administrativo na mesma transação. O histórico de estoque não retorna custos. Não há DELETE, ajuste retroativo, compra, inventário ou rotas de aplicação/baixa de peças em OS nesta etapa.

Ao trocar o equipamento, se seu proprietário atual divergir do cliente da OS, a API deverá exigir decisão explícita: cancelar a correção, corrigir também o cliente com a permissão correspondente ou transferir a titularidade. Ao trocar o cliente, se o equipamento continuar vinculado ao cliente anterior, deverá exigir escolha explícita sobre transferência. Transferência exige Administrador ou permissão específica `equipment.transfer_ownership`; não pode ser silenciosa. Se a transferência necessária não for autorizada ou aceita, cancelar a correção. Correção conjunta de cliente/equipamento pode ser uma operação atômica: ou todos os vínculos, eventual transferência e históricos são persistidos, ou nada é alterado. Cada campo alterado fica registrado separadamente no histórico. Rotas, payloads, autorização composta, formato de persistência e transação permanecem sem contrato aprovado; esta regra não aprova endpoint, modelo físico ou migration.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.

## Observações manuais e linha do tempo unificada

`POST /api/v1/service-orders/:publicId/notes` recebe somente `{ "text": "..." }`, exige sessão, CSRF e `service_orders.update` ou Administrador. Aceita uma única linha não vazia de até 255 caracteres e apenas OS confirmada; não existe rota para abertura provisória. A resposta contém a nota criada com `publicId`, instante, autor, texto e `kind: MANUAL_NOTE`. Não há PATCH/PUT de nota.

`DELETE /api/v1/service-orders/:publicId/notes/:notePublicId` exige sessão e CSRF. O Backend confere o par OS/nota e permite ao autor excluir a própria nota ou a usuário com `service_orders.notes.delete_any`/Administrador excluir a de terceiros. Segunda exclusão ou nota de outra OS retorna 404. A exclusão grava snapshot integral em `admin_audit_log` e remove a nota na mesma transação. Nenhuma rota DELETE opera sobre `ServiceOrderEvent`.

`GET /api/v1/service-orders/:publicId/history` exige `service_orders.events.read` ou Administrador e recebe `pageSize` obrigatório (1 a 100) e `cursor` opcional. Retorna `{ data, nextCursor, hasMore }` com eventos automáticos e notas ativas em ordem descendente por instante, precedência técnica fixa de evento antes de nota e ID da fonte como desempate. O cursor opaco é validado e vinculado à OS. `SYSTEM_EVENT` expõe `kind`, instante, ator, tipo, número visível e payload filtrado; `MANUAL_NOTE` expõe `kind`, `publicId`, instante, autor, texto e `canDelete` calculado no Backend. O Log Administrativo e notas excluídas não entram na resposta. O GET `/events` mantém seu contrato anterior, incluindo `page`/`pageSize`, resposta, filtro e somente eventos automáticos.

O cursor é válido por uma hora no processo atual; reiniciar o Backend invalida cursores anteriores e a interface deve recarregar a primeira página. Inserções mais recentes surgem numa nova consulta inicial; a navegação por cursor mantém a ordem dos itens sobreviventes entre páginas mesmo com exclusões.

## Controle de edição da OS

As rotas abaixo pertencem à OS confirmada e exigem sessão autenticada. `GET /api/v1/service-orders/:publicId/edit-control` também exige `service_orders.read`; retorna se a OS é editável, se há controle ativo, username público do detentor, validade, se o token enviado identifica o contexto atual, se o controle pertence à mesma pessoa, se o contexto atual expirou e a geração do controle. OS diferente de ABERTA retorna `orderEditable: false`; o Backend recusa aquisição, heartbeat, takeover e mutações protegidas. `POST` na mesma rota adquire uma OS aberta livre; `POST /:publicId/edit-control/heartbeat` renova o prazo; `DELETE` na rota libera somente o controle do próprio contexto; `POST /:publicId/edit-control/takeover` transfere o controle quando há lease ativo. Todas as mutações exigem CSRF. O token UUID por aba/contexto é enviado no cabeçalho `X-Service-Order-Edit-Token`; somente o hash é persistido. O registro também referencia a sessão autenticada, e o logout limpa os controles dessa sessão na mesma transação da revogação.

Adquirir exige autorização normal para editar OS. O Backend permite `takeover` entre contextos do mesmo usuário sem permissão especial; de outra pessoa, exige autorização normal e **Assumir edição de OS** (`service_orders.edit.takeover`) ou Administrador. A interface confirma a transferência. Takeover sem lease ativo e tentativa de transferir para o próprio contexto são recusados com conflito. Somente takeover entre pessoas cria `SERVICE_ORDER_EDIT_TAKEOVER` no Log Administrativo; não cria `ServiceOrderEvent`. Heartbeat, aquisição normal, transferência da mesma pessoa, liberação e expiração não geram eventos ou logs. As rotas de alteração de situação, atribuições e todos os comandos de orçamento exigem o controle válido e `X-Service-Order-Revision`, contendo o `updatedAt` da OS lida. Revisão ausente ou inválida retorna 400. Toda alteração efetiva avança a revisão na mesma transação. Se outra operação atualizar a OS antes do salvamento, o Backend recusa a gravação integral com `409 SERVICE_ORDER_DATA_CONFLICT`; nenhuma parte da tentativa é persistida. Observações manuais continuam fora do controle e da revisão de edição.

O contrato não combina alterações automaticamente nem oferece resolução campo a campo. Não há comparação de valores originais para merge, escolha de valores em conflito, reconstrução de itens removidos ou confirmação para combinar composições. `expectedVersion` do item continua protegendo contra alteração daquele registro, enquanto a revisão global protege toda a OS. Uma revisão desatualizada exige consultar os dados atuais e reaplicar manualmente a intenção desejada com controle válido e revisão atual. O Frontend preserva o rascunho para consulta/cópia, mantém claramente separados os dados atuais e os valores locais e não salva automaticamente ao recuperar o controle. Descartar o rascunho exige ação explícita do usuário.

Itens removidos permanecem removidos logicamente e não são restaurados. Uma inclusão posterior é um novo POST e uma nova escolha explícita. As permissões de custo são verificadas em cada operação; respostas de composição e histórico omitem custos de quem não pode lê-los. Observações manuais continuam independentes do controle exclusivo. Salvamentos de situação, atribuições e orçamento mantêm suas transações atômicas: se a operação falhar, nenhuma parte dela é gravada.
