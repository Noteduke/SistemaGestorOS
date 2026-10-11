# ROADMAP
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Ativo

# 1. Objetivo

Este documento registra o planejamento macro do desenvolvimento do Sistema Gestor OS.

O roadmap representa a visão de evolução do projeto e poderá ser ajustado conforme novas prioridades surgirem.

---

# FASE 1 — Fundação (Concluída)

- Definição da stack tecnológica.
- Preparação do ambiente.
- Git e GitHub.
- Docker.
- GOS Tools.
- Estrutura inicial da documentação.
- Estrutura do repositório.

Status: Concluída.

---

# FASE 2 — Engenharia (Em andamento)

- Constituição do Projeto.
- Arquitetura.
- Regras de Negócio.
- Banco de Dados.
- API.
- Frontend.
- Padrões de Código.
- Decisões Arquiteturais.
- Glossário.

Objetivo:
Transformar todas as decisões em documentação oficial.

---

# FASE 3 — Modelagem

- Modelagem do banco de dados.
- Definição das entidades.
- Relacionamentos.
- Migrations iniciais.

---

# FASE 4 — Implementação da Base

- Inicialização do Backend (NestJS): base mínima configurada e primeiro recorte do módulo Pessoas implementado; os demais módulos e endpoints permanecem pendentes.
- Frontend inicial criado com React + TypeScript + Vite; proxy local `/api` para o Backend, tela de login integrada à sessão Auth e primeira fatia de leitura de OS confirmadas implementada.
- Validação operacional do login visual (11/10/2026): formulário submetido no navegador local via Vite/proxy `/api`, com Backend real e conexão temporária exclusivamente ao banco isolado `gestor_os_opening_test`. O fluxo CSRF/login/identidade funcionou; lista com 71 OS (20 na primeira página), detalhe, snapshots e histórico/eventos foram exibidos. Senha incorreta foi rejeitada e limpa; logout e recarga retornaram ao login. A sessão foi usada via cookie `HttpOnly`; não foi encontrado armazenamento de senha/token sensível em `localStorage`/`sessionStorage`. A conta descartável terminou inativa e sem sessão ativa. Nenhum endpoint mutável de OS foi chamado; abertura e demais mutações pela interface continuam pendentes.
- Validação operacional da alteração de situação (11/10/2026): no navegador local com Vite/proxy `/api` e Backend real, a OS `OS-000131` (`63cdf79c-951f-427d-89ea-4309589725df`) mudou de `TRIAGEM` para `AGUARDANDO AVALIAÇÃO/ORÇAMENTO` usando `PATCH /api/v1/service-orders/:publicId/operational-situation` e `X-CSRF-Token`. Antes das operações, `DATABASE()` confirmou `gestor_os_opening_test` no MySQL 8.0.46; o banco principal não foi acessado. A mudança persistiu após recarga e gerou `SITUACAO_OPERACIONAL_ALTERADA` (`TRIAGE` → `AWAITING_EVALUATION_BUDGET`). `ABERTA`, snapshots versão 1, cliente e equipamento foram preservados. A opção atual desativou Salvar; sem `service_orders.situation.update`, a interface exibiu 403 e a OS não mudou. Nenhuma rota antiga de situação nem endpoint de abertura, atribuição, orçamento, peças, estoque ou financeiro foi chamado. `validacao.frontend` terminou desativado, sem permissão de alteração e sem sessão ativa. A interface básica de situação foi validada; atribuições nominais e abertura, confirmação e edição da OS pelo Frontend seguem pendentes.
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema e as três migrations anteriores aplicadas estão versionados; a migration Auth está aplicada no banco principal, mas já versionada localmente, ainda não publicada.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` aplicadas; a migration Auth `20261008120000_auth_foundation` também foi aplicada no banco principal; `prisma migrate status` indicava schema atualizado após Auth; a migration de OS foi aplicada ao banco principal em 09/10/2026; `prisma migrate status` indica banco atualizado. O histórico é controlado por `_prisma_migrations`. `PrismaModule` e `PrismaService` estão integrados ao NestJS; Pessoa básica e rotas para adicionar/listar telefones e e-mails estão implementadas e protegidas no código. O seed inicial de 24 permissões de Auth foi executado duas vezes; posteriormente, o seed oficial incluiu as oito permissões de OS e manteve 32 permissões no banco após duas execuções; bootstrap local e principais testes HTTP autenticados foram concluídos. Permanecem pendentes testes opcionais de falhas de login e autoria de eventos de contato, além dos demais módulos de negócio.
- Docker Compose.
- Autenticação e autorização: primeiro recorte implementado no Backend e já versionado localmente, ainda não enviado a origin; migration aplicada no banco principal, seed de permissões idempotente, com 32 códigos no banco após a inclusão dos oito de OS, primeiro Administrador ativo criado e principais testes HTTP autenticados locais aprovados. Ainda não está liberado para produção nem para acesso externo.
- Estrutura inicial dos módulos.

---

# FASE 5 — Desenvolvimento dos Módulos

Prioridade inicial:

1. Cadastros
2. Ordem de Serviço
3. Financeiro
4. Estoque
5. Compras
6. Vendas
7. Fiscal
8. Relatórios
9. Dashboard
10. Configurações

A implementação funcional de Cadastros cobre Pessoa básica e inclusão/listagem de telefones e e-mails; essas sete rotas estão protegidas por Auth no código, com a migration de Auth já aplicada no banco principal. Antes dos próximos recortes de Cadastros e OS, modelagem e futuras migrations deverão refletir as demais regras aprovadas de catálogos, endereços, status, exclusões/inativações, histórico geral e titularidade. Para OS, foram aprovados snapshots JSON próprios versionados (`snapshotVersion: 1`, `capturedAt`) e abertura em andamento persistida, uma por usuário, retomável após interrupção. O schema Prisma contém a base de OS, abertura, snapshots e eventos, validada em banco isolado e restaurado e aplicada ao banco principal. O seed oficial das oito permissões de OS também foi aplicado ao principal. O Backend implementa as rotas de abertura, confirmação, consulta/listagem, situação, atribuições e leitura paginada de eventos; os fluxos citados foram validados em testes isolados e HTTP/MySQL em `gestor_os_opening_test`, sem concluir todo o Recorte 1. Endereço está limitado a um por Pessoa; `person_roles` é enum; Marca/Modelo são obrigatórios também no banco principal após a migration de OS; e elegibilidade de proprietário não é garantida pelo banco. Índices funcionais garantem a principalidade única de telefones/e-mails. Catálogos iniciais usarão seed idempotente sob comando controlado, sem execução automática no startup. Permanecem pendentes os demais fluxos transacionais e contratos de OS, permissões para outros módulos ainda não implementados, execução e estratégia técnica dos seeds de catálogos, pesquisa avançada, ciclo operacional além de Ativo/Inativo, múltiplos Avisos/leitura e regras fiscais detalhadas.

Em 09/10/2026, a migration 20261008180000_service_order_foundation passou em gestor_os_migration_test após corrigir cinco CHECKs incompatíveis com FKs e ações referenciais no MySQL 8.0.46. As quatro migrations anteriores também aplicaram, e prisma migrate status indicou banco de teste atualizado. As invariantes condicionais removidas da DDL deverão ser implementadas nos services transacionais; naquele momento, a migration de OS ainda estava pendente no banco principal. Não houve seed, endpoints ou build de OS nesta etapa.

Em ensaio posterior no mesmo dia, um backup do principal guardado fora do Git foi restaurado em `gestor_os_restore_test`. A cópia coincidia com o principal antes da migration; `prisma validate`, `prisma migrate deploy` e `prisma migrate status` passaram no restore. A estrutura de OS e o contador inicial foram confirmados sem DDL parcial. Antes da aplicação no principal, havia quatro migrations concluídas, nenhuma tabela de OS e Marca/Modelo opcionais; `equipment` estava vazio na pré-checagem.

Em 09/10/2026, após autorização explícita e pré-checagem com backup confirmado fora do Git, `20261008180000_service_order_foundation` foi aplicada ao principal `gestor_os`. `prisma migrate status` indicou cinco migrations concluídas e banco atualizado. As seis tabelas de OS, índices, FKs, CHECK singleton, Marca/Modelo obrigatórios, `equipment.is_active` e contador inicial `(1, 1, 0)` foram conferidos, sem DDL parcial ou seed. O contrato técnico do Recorte 1 está proposto em `docs/planejamento/Recorte-1-OS-Contratos-e-Permissoes.md`; naquele momento, o módulo ainda dependia de services transacionais, controllers, autorização e testes antes de qualquer uso funcional; a validação posterior da primeira fatia está registrada abaixo.

O recorte de telefones e e-mails foi implementado como sub-recursos diretos em `/api/v1/people/:publicId/phones` e `/emails`, com `POST` e `GET`. A migration `20261007183000_person_contacts` foi aplicada ao banco local. Os contatos têm `public_id` único, e-mails são únicos por Pessoa, e índices funcionais MySQL garantem no máximo um principal por Pessoa e coleção sem restringir múltiplos não principais. Todo `POST` exige `confirmPersonChange: true`; telefone não padrão até 32 dígitos exige também `confirmNonstandardPhone: true`, sem gravação antes da confirmação específica. E-mail repetido na mesma Pessoa bloqueia; compartilhado entre Pessoas é permitido com aviso genérico. Inclusões e mudanças efetivas de principal registram eventos em `person_contact_events` na mesma transação. `label` permanece nulo/sem uso e fora da API; edição, remoção e inativação de contatos seguem fora do recorte. As sete rotas de Pessoas estão protegidas por Auth no código; testes autenticados locais confirmaram acesso Admin à listagem paginada e bloqueio CSRF de mutação. A integridade de `event_type` com `phone_id`/`email_id` é validada no service; uma constraint CHECK no banco pode ser avaliada em evolução futura. Testes específicos de criação de contato e autoria em `person_contact_events.user_id` continuam pendentes.

Em 10/10/2026, a primeira fatia de abertura/cancelamento foi validada em `gestor_os_opening_test`, banco descartável com cinco migrations, 32 permissões e usuários fictícios, incluindo Administrador; as senhas aleatórias ficaram somente em memória. A conexão confirmou o banco isolado antes das escritas; `gestor_os` não recebeu escrita nesta validação. O teste reutilizável `backend/test/service-order-openings.integration.mjs` cobriu HTTP real com sessão, CSRF, autorização própria e administrativa, duas criações concorrentes do mesmo usuário (`201`/`409`) e números distintos para usuários diferentes, consumo/liberação/reuso de números e rollback de abertura, alocação, contador e evento por falha injetada. A inspeção final encontrou zero duplicidades de número ou abertura ativa, zero alocações incoerentes e zero eventos órfãos. Os dados fictícios foram mantidos no banco isolado para diagnóstico. Corrigiu-se o cancelamento para responder `200`. Passaram `npm run prisma:validate`, `npm run build`, 11 testes isolados, teste de integração e verificações Git de whitespace. A fatia seguinte implementou `PATCH /api/v1/service-orders/openings/:publicId` para editar cliente, seleção de equipamento, rascunho novo, reclamação e intenção temporária de titularidade. A intenção exige `equipment.transfer_ownership` já no PATCH e é revalidada na confirmação. Testes HTTP/MySQL isolados cobriram semântica de PATCH, autorização e CSRF. Consulta de OS confirmada, alteração de situação, substituição nominal de atribuições e consulta paginada de eventos foram implementadas e validadas posteriormente; o Frontend agora possui base React/TypeScript/Vite e telas de leitura de OS confirmadas; os demais fluxos visuais continuam pendentes.

O comando manual idempotente `equipment:seed-unspecified-brand` garante a Marca controlada “Não informada” para confirmar abertura com equipamento novo. Exige confirmação explícita do banco de destino e não roda no startup. Foi executado duas vezes em `gestor_os`: criou `NÃO INFORMADA` com `publicId` `d0ac1a1e-347a-4aba-9541-74f87e67ac16` e depois reutilizou o registro, sem duplicação. O rascunho seleciona a Marca existente por `brandPublicId`; a confirmação não cria Marca. Modelo “Não informado” é texto controlado. A carga dos demais catálogos permanece pendente.

Em 11/10/2026, a confirmação `POST /api/v1/service-orders/openings/:publicId/confirm` foi implementada e validada por HTTP/MySQL no banco descartável `gestor_os_opening_test`. Cliente e equipamento são revalidados; Equipment novo só é criado na confirmação, Marca existente é exigida, transferência exige permissão novamente, e OS `ABERTA`/`TRIAGEM`, snapshots, número definitivo, eventos, atribuições explícitas e encerramento da abertura são gravados em uma transação. Foram exercitados CSRF, autorização própria/administrativa, dupla confirmação e rollback, inclusive por falha de gravação do evento. Não houve execução de migration ou seed nem escrita no banco principal nesta fatia. A consulta/listagem, situação operacional, substituição nominal de atribuições e consulta paginada de eventos foram implementadas posteriormente; a tela de leitura com lista, detalhe e histórico foi implementada. A alteração de situação agora também está disponível no Frontend; abertura, confirmação, edição e atribuições pela interface e os demais fluxos fora do recorte seguem pendentes.

`people.person_type` PF/PJ obrigatório e os campos opcionais Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações foram aplicados pela migration de Pessoa básica. A API já valida e normaliza CPF numérico e CNPJ numérico ou alfanumérico oficial, impõe limites técnicos de entrada e ordena a listagem por nome e `id` interno sem expô-lo. As rotas estão protegidas no código pelo primeiro recorte de Auth. A listagem exige `page` e `pageSize` e retorna `INVALID_PAGINATION` quando ausentes; teste autenticado confirmou `?page=1&pageSize=20` com Admin. Bootstrap e testes autenticados principais foram concluídos no ambiente local; isso não libera produção.

O primeiro recorte de Auth está implementado no código, incluindo endpoints de autenticação, sessão opaca, CSRF, guards, autorização, Log Administrativo, seed controlado e bootstrap do Administrador. O schema Prisma e a migration `20261008120000_auth_foundation` foram criados; a migration foi aplicada no banco principal `gestor_os`; a migration de OS criada posteriormente foi aplicada nele em 09/10/2026. O SQL foi validado funcionalmente em banco isolado/shadow, sem registro da migration em `_prisma_migrations` nesse shadow. O seed inicial de 24 permissões de Auth foi executado duas vezes no principal sem duplicação; o catálogo atual tem 32 após o seed de OS. Há um Administrador ativo e `admin.full`, `system.admin` e `Master` estão ausentes. O bootstrap aborta antes de solicitar credenciais quando já existe Administrador ativo; o controle transacional permanece no service. Os testes HTTP autenticados principais passaram localmente: login e `/auth/me` retornam `publicId` sem `id`, a listagem paginada de Pessoas funciona para Admin, mutação sem CSRF é bloqueada, logout encerra a sessão e a sessão revogada recebe 401. `users` contém a conta bootstrapada. Para avançar, faltam versionamento, teste real de concorrência do bootstrap, testes opcionais de cinco falhas de login e autoria de contato. O primeiro uso permanece restrito ao Administrador bootstrapado; CRUD HTTP de usuários continua fora; o Frontend possui login e oferece consultas de OS confirmadas. Recuperação/troca de senha, envio real de e-mail, 2FA e acesso externo também permanecem pendentes. Uma credencial administrativa foi exposta acidentalmente durante teste manual; por decisão de Marcos não foi trocada agora, mas deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. Não há fluxo definitivo de troca/reset. O backend escuta somente em `127.0.0.1`; o sistema segue de uso interno e acesso externo permanece proibido até 2FA e fronteira confiável. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem para classificar a rede. Vulnerabilidades high do `npm install` precisam ser avaliadas sem correção automática nesta etapa. A concessão MySQL antiga para `gestor_os` com `_` sem escape deve ser revisada em etapa administrativa separada.

Decisão funcional aprovada para peças controladas pelo estoque: DISPONÍVEL, ORÇADA, UTILIZADA e BAIXADA formam seu ciclo principal. ORÇADA não afeta o estoque; se o item for recusado/cancelado ainda nesse estado, altera-se o status do lançamento e preserva-se o histórico, sem movimentação. Usuários autorizados na OS podem marcar ORÇADA como UTILIZADA, registrando usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável; a peça fica indisponível para outro uso. Não utilização, remoção ou cancelamento/desfazimento/recusa após UTILIZADA exige pendência de conferência, resolvida somente por Administrador ou permissão específica futura `stock.pending_review.resolve`. O encerramento da OS baixa automaticamente itens UTILIZADOS; pendências abertas bloqueiam o encerramento e itens ORÇADOS não são baixados.

Peça avulsa é item manual financeiro/descritivo da OS, fora do cadastro e do ciclo de estoque: não tem saldo, não movimenta/reserva/baixa estoque, não gera pendência de conferência e não pode ser convertida em item de estoque. Usuários autorizados na OS podem visualizar e alterar custo interno e valor cobrado, inclusive após aprovação do orçamento. Toda alteração gera histórico com usuário, data/hora, OS, item, campo e valor anterior/novo. `finance.os_costs.manage` é apenas possibilidade futura para relatórios gerenciais, fechamento financeiro ou controle mais restrito, não requisito para alteração do item avulso. A diferença poderá apoiar cálculo futuro de margem/lucro. Modelo, histórico técnico, endpoints, controle, painel de conferência, apresentação visual e cálculo permanecem futuros.

Valores cobrados de qualquer item da OS (peça de estoque, peça avulsa, serviço/mão de obra ou outro) podem ser alterados por usuário autorizado mesmo após aprovação do orçamento, sem nova aprovação do cliente e sem motivo obrigatório. O histórico deve registrar usuário, data/hora, OS, item, tipo do item, campo alterado e valores anterior/novo. A aprovação do orçamento não congela automaticamente os valores; implementação e interface permanecem futuras.

A estrutura funcional aprovada da OS distingue situação operacional, status macro e resultado/status-motivo de encerramento. A situação inicial é TRIAGEM; as dez situações, responsabilidade padrão por fila administrativa e status macro/encerramento estão descritos na documentação oficial. A fila não escolhe Administrador nominal; atribuição individual exige ato explícito, e a lista pode permanecer vazia. Mudanças efetivas de situação e atribuições nominais geram histórico conforme seus efeitos; reenviar o valor vigente ou o mesmo conjunto de usuários não cria evento duplicado. A alteração da situação operacional está implementada pela rota oficial `PATCH /api/v1/service-orders/:publicId/operational-situation`, e a substituição nominal pela rota oficial `PUT /api/v1/service-orders/:publicId/assignments`; ambas exigem permissão específica, CSRF e persistência transacional de evento, e foram validadas em MySQL isolado. O Backend também implementa `GET /api/v1/users/assignable`, uma consulta auxiliar paginada e somente leitura de usuários ativos protegida por `service_orders.assignment.manage` ou Administrador; a resposta pública contém somente `publicId` e `username`. A tela do Frontend permite a alteração básica da situação e atualiza o detalhe; a interação sobre orçamento nas situações NÃO AUTORIZADO e a interface de atribuições nominais permanecem futuras. A consulta de eventos e a UI de leitura de OS estão implementadas; as demais telas de mutação e migrations de recortes posteriores permanecem futuras.

Foram aprovadas também as mudanças livres entre situações após TRIAGEM, o controle de FECHADA/CANCELADA, as reaberturas simples e completas, seus efeitos em pagamentos/faturamento/peças, a proibição de transições diretas FECHADA↔CANCELADA, o aviso no dashboard do Administrador e as regras de número visível e abertura em andamento. O Recorte 1 aprovado inclui abertura persistida, número e retomada/cancelamento, confirmação com cliente/equipamento, OS ABERTA/TRIAGEM e snapshots JSON, eventos principais, consulta/listagem, atribuição e alteração de situação. Correção administrativa, fechamento/cancelamento oficial, reabertura, orçamento, serviços, peças, estoque, financeiro, compra/doação, OS interna automática, checklist, impressão, auditoria em relatórios e frontend completo ficam fora. O plano de modelos prováveis, índices, endpoints, permissões, transações, testes e sequência está em `docs/Especificacoes-Nao-Documentadas.md`; trata-se de planejamento. A base Prisma e a migration do Recorte 1 já foram criadas. Os seis endpoints de abertura, incluindo a confirmação com captura dos snapshots, foram implementados e validados em HTTP/MySQL isolado. `GET /api/v1/service-orders` e `GET /api/v1/service-orders/:publicId` foram implementados e validados em HTTP/MySQL isolado; o detalhe expõe os snapshots armazenados sem recálculo. A alteração de situação, a substituição de atribuições nominais e a consulta paginada de eventos estão implementadas e validadas em MySQL isolado; a tela de leitura com lista, detalhe e histórico de eventos foi implementada, assim como a alteração básica de situação no detalhe. Abertura, edição, confirmação, atribuições e demais operações ainda não estão disponíveis no Frontend.

O fluxo Equipamento comprado/Doado também está aprovado: fecha a OS externa como FECHADA, transfere o equipamento à Pessoa da própria empresa e cria OS interna ABERTA/TRIAGEM com vínculo/histórico herdado. Todo esse fluxo fica fora do primeiro recorte, incluindo a transferência de titularidade específica da compra/doação, configuração da Pessoa da empresa, fechamento, Financeiro e Estoque. A transferência explícita de titularidade durante a abertura da OS, conforme a regra de divergência entre cliente e proprietário do equipamento, permanece no escopo do Recorte 1. A futura implementação de compra/doação depende de modelagem de origem/histórico herdado e estratégia contra estado parcial, além das pendências fiscais/financeiras documentadas.

Foi aprovada a captura única do retrato histórico cadastral parcial na confirmação da abertura, em JSON estruturado separado dos vínculos atuais, com `snapshotVersion: 1` e `capturedAt`; sua consulta no histórico e imutabilidade diante de mudanças cadastrais, reabertura ou correção também estão aprovadas. Tela e impressão padrão usam cadastros atuais. Correção pós-confirmação não exige motivo obrigatório, pode ocorrer em OS FECHADA/CANCELADA e exige histórico; não reabre a OS nem altera status, financeiro, estoque ou retrato. Divergências de titularidade exigem alerta e decisão explícita, e a correção conjunta pode ser atômica. Não há alerta obrigatório no painel do Administrador. A base da entidade OS já está no schema Prisma, e a confirmação com captura dos snapshots já foi implementada no Backend. A consulta/listagem de OS confirmadas e a exposição histórica dos snapshots no detalhe já foram implementadas no Backend; sua exibição no Frontend foi implementada no detalhe da OS como retrato histórico imutável. O checklist físico/recebimento é assunto independente.

---

# FASE 6 — Integrações

Integrações previstas:

- SEFAZ
- Stone
- Banco Inter
- Correios
- Dell TechDirect

---

# FASE 7 — Consolidação

- Testes
- Homologação
- Ajustes
- Documentação final
- Primeira versão estável

---

# Controle de Evolução

Cada fase concluída deverá ser registrada no Git através de commits e atualizações da documentação.

O roadmap é um documento vivo e deverá refletir a situação real do projeto.
