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
- Inicialização do Frontend (React).
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema e as três migrations anteriores aplicadas estão versionados; a migration Auth está aplicada no banco principal, mas já versionada localmente, ainda não publicada.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` aplicadas; a migration Auth `20261008120000_auth_foundation` também foi aplicada no banco principal; `prisma migrate status` indica schema atualizado, sem pendências. O histórico é controlado por `_prisma_migrations`. `PrismaModule` e `PrismaService` estão integrados ao NestJS; Pessoa básica e rotas para adicionar/listar telefones e e-mails estão implementadas e protegidas no código. O seed de 24 permissões foi executado duas vezes e validado como idempotente; bootstrap local e principais testes HTTP autenticados foram concluídos. Permanecem pendentes testes opcionais de falhas de login e autoria de eventos de contato, além dos demais módulos de negócio.
- Docker Compose.
- Autenticação e autorização: primeiro recorte implementado no Backend e já versionado localmente, ainda não enviado a origin; migration aplicada no banco principal, seed de 24 permissões idempotente, primeiro Administrador ativo criado e principais testes HTTP autenticados locais aprovados. Ainda não está liberado para produção nem para acesso externo.
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

A implementação funcional de Cadastros cobre Pessoa básica e inclusão/listagem de telefones e e-mails; essas sete rotas estão protegidas por Auth no código, com a migration de Auth já aplicada no banco principal. Antes dos próximos recortes de Cadastros e OS, modelagem e futuras migrations deverão refletir as demais regras aprovadas de catálogos, endereços, status, exclusões/inativações, histórico geral e titularidade. Não haverá snapshot cadastral completo de Pessoa/Equipamento em cada OS; foi aprovado um retrato histórico parcial dos dados principais no momento da confirmação, ainda sem modelo físico. O schema aplicado continua parcialmente divergente: faltam Aviso, OS, retrato histórico, histórico geral, status de Equipamento e de catálogos, além de tabelas próprias; endereço está limitado a um por Pessoa; `person_roles` é enum; Marca/Modelo são opcionais; e elegibilidade de proprietário não é garantida pelo banco. Índices funcionais garantem a principalidade única de telefones/e-mails. Catálogos iniciais usarão seed idempotente sob comando controlado, sem execução automática no startup. Permanecem pendentes estrutura física e eventos finais do histórico geral, classificação sensível, filtros do histórico, contratos de API dos demais recortes, permissões para módulos ainda não implementados, execução dos seeds e estratégia técnica dos catálogos, pesquisa avançada, ciclo operacional além de Ativo/Inativo, múltiplos Avisos/leitura e regras fiscais detalhadas.

O recorte de telefones e e-mails foi implementado como sub-recursos diretos em `/api/v1/people/:publicId/phones` e `/emails`, com `POST` e `GET`. A migration `20261007183000_person_contacts` foi aplicada ao banco local. Os contatos têm `public_id` único, e-mails são únicos por Pessoa, e índices funcionais MySQL garantem no máximo um principal por Pessoa e coleção sem restringir múltiplos não principais. Todo `POST` exige `confirmPersonChange: true`; telefone não padrão até 32 dígitos exige também `confirmNonstandardPhone: true`, sem gravação antes da confirmação específica. E-mail repetido na mesma Pessoa bloqueia; compartilhado entre Pessoas é permitido com aviso genérico. Inclusões e mudanças efetivas de principal registram eventos em `person_contact_events` na mesma transação. `label` permanece nulo/sem uso e fora da API; edição, remoção e inativação de contatos seguem fora do recorte. As sete rotas de Pessoas estão protegidas por Auth no código; testes autenticados locais confirmaram acesso Admin à listagem paginada e bloqueio CSRF de mutação. A integridade de `event_type` com `phone_id`/`email_id` é validada no service; uma constraint CHECK no banco pode ser avaliada em evolução futura. Testes específicos de criação de contato e autoria em `person_contact_events.user_id` continuam pendentes.

`people.person_type` PF/PJ obrigatório e os campos opcionais Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações foram aplicados pela migration de Pessoa básica. A API já valida e normaliza CPF numérico e CNPJ numérico ou alfanumérico oficial, impõe limites técnicos de entrada e ordena a listagem por nome e `id` interno sem expô-lo. As rotas estão protegidas no código pelo primeiro recorte de Auth. A listagem exige `page` e `pageSize` e retorna `INVALID_PAGINATION` quando ausentes; teste autenticado confirmou `?page=1&pageSize=20` com Admin. Bootstrap e testes autenticados principais foram concluídos no ambiente local; isso não libera produção.

O primeiro recorte de Auth está implementado no código, incluindo endpoints de autenticação, sessão opaca, CSRF, guards, autorização, Log Administrativo, seed controlado e bootstrap do Administrador. O schema Prisma e a migration `20261008120000_auth_foundation` foram criados; a migration foi aplicada no banco principal `gestor_os`, e `prisma migrate status` indica schema atualizado. O SQL foi validado funcionalmente em banco isolado/shadow, sem registro da migration em `_prisma_migrations` nesse shadow. O seed de 24 permissões foi executado duas vezes no principal sem duplicação; há um Administrador ativo e `admin.full`, `system.admin` e `Master` estão ausentes. O bootstrap aborta antes de solicitar credenciais quando já existe Administrador ativo; o controle transacional permanece no service. Os testes HTTP autenticados principais passaram localmente: login e `/auth/me` retornam `publicId` sem `id`, a listagem paginada de Pessoas funciona para Admin, mutação sem CSRF é bloqueada, logout encerra a sessão e a sessão revogada recebe 401. `users` contém a conta bootstrapada. Para avançar, faltam versionamento, teste real de concorrência do bootstrap, testes opcionais de cinco falhas de login e autoria de contato. O primeiro uso permanece restrito ao Administrador bootstrapado; CRUD HTTP de usuários e Frontend continuam fora. Recuperação/troca de senha, envio real de e-mail, 2FA e acesso externo também permanecem pendentes. Uma credencial administrativa foi exposta acidentalmente durante teste manual; por decisão de Marcos não foi trocada agora, mas deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. Não há fluxo definitivo de troca/reset. O backend escuta somente em `127.0.0.1`; o sistema segue de uso interno e acesso externo permanece proibido até 2FA e fronteira confiável. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem para classificar a rede. Vulnerabilidades high do `npm install` precisam ser avaliadas sem correção automática nesta etapa. A concessão MySQL antiga para `gestor_os` com `_` sem escape deve ser revisada em etapa administrativa separada.

Decisão funcional aprovada para peças controladas pelo estoque: DISPONÍVEL, ORÇADA, UTILIZADA e BAIXADA formam seu ciclo principal. ORÇADA não afeta o estoque; se o item for recusado/cancelado ainda nesse estado, altera-se o status do lançamento e preserva-se o histórico, sem movimentação. Usuários autorizados na OS podem marcar ORÇADA como UTILIZADA, registrando usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável; a peça fica indisponível para outro uso. Não utilização, remoção ou cancelamento/desfazimento/recusa após UTILIZADA exige pendência de conferência, resolvida somente por Administrador ou permissão específica futura `stock.pending_review.resolve`. O encerramento da OS baixa automaticamente itens UTILIZADOS; pendências abertas bloqueiam o encerramento e itens ORÇADOS não são baixados.

Peça avulsa é item manual financeiro/descritivo da OS, fora do cadastro e do ciclo de estoque: não tem saldo, não movimenta/reserva/baixa estoque, não gera pendência de conferência e não pode ser convertida em item de estoque. Usuários autorizados na OS podem visualizar e alterar custo interno e valor cobrado, inclusive após aprovação do orçamento. Toda alteração gera histórico com usuário, data/hora, OS, item, campo e valor anterior/novo. `finance.os_costs.manage` é apenas possibilidade futura para relatórios gerenciais, fechamento financeiro ou controle mais restrito, não requisito para alteração do item avulso. A diferença poderá apoiar cálculo futuro de margem/lucro. Modelo, histórico técnico, endpoints, controle, painel de conferência, apresentação visual e cálculo permanecem futuros.

Valores cobrados de qualquer item da OS (peça de estoque, peça avulsa, serviço/mão de obra ou outro) podem ser alterados por usuário autorizado mesmo após aprovação do orçamento, sem nova aprovação do cliente e sem motivo obrigatório. O histórico deve registrar usuário, data/hora, OS, item, tipo do item, campo alterado e valores anterior/novo. A aprovação do orçamento não congela automaticamente os valores; implementação e interface permanecem futuras.

A estrutura funcional aprovada da OS distingue situação operacional, status macro e resultado/status-motivo de encerramento. A situação inicial é TRIAGEM; as dez situações, atribuições padrão e status macro/encerramento estão descritos na documentação oficial. Mudanças de situação e atribuições geram histórico. As duas situações NÃO AUTORIZADO perguntam se o orçamento existente deve ser removido e guardado no histórico. Schema, API, UI, regras técnicas de transição e migrations permanecem futuros.

Foram aprovadas também as mudanças livres entre situações após TRIAGEM, o controle de FECHADA/CANCELADA, as reaberturas simples e completas, seus efeitos em pagamentos/faturamento/peças, a proibição de transições diretas FECHADA↔CANCELADA, o aviso no dashboard do Administrador e as regras de número visível e abertura em andamento. A análise atualizada em `docs/Especificacoes-Nao-Documentadas.md` recomenda para o recorte 1 a numeração/reserva do número e o fluxo de iniciar/confirmar/desistir da abertura com cliente e equipamento, além de consulta, atribuição, mudanças de situação e histórico — sem fechamento, cancelamento de OS oficial, reabertura, financeiro ou estoque. O desenho técnico segue recomendação, não implementação nem aprovação de schema/API. Não há implementação autorizada nesta atualização documental.

O fluxo Equipamento comprado/Doado também está aprovado: fecha a OS externa como FECHADA, transfere o equipamento à Pessoa da própria empresa e cria OS interna ABERTA/TRIAGEM com vínculo/histórico herdado. Ele fica fora do primeiro recorte, junto com configuração da Pessoa da empresa, transferência, encerramento, Financeiro e Estoque. Sua futura implementação depende de modelagem de origem/histórico herdado e estratégia contra estado parcial, além das pendências fiscais/financeiras documentadas.

Foi aprovada a captura única do retrato histórico cadastral parcial na confirmação da abertura, sua consulta no histórico e sua imutabilidade diante de mudanças cadastrais, reabertura ou correção de vínculo. Tela e impressão padrão usam cadastros atuais. Correção pós-confirmação não exige motivo obrigatório, pode ocorrer em OS FECHADA/CANCELADA e exige histórico; não reabre a OS nem altera status, financeiro, estoque ou retrato. Divergências de titularidade exigem alerta e decisão explícita, e a correção conjunta pode ser atômica. Não há alerta obrigatório no painel do Administrador. A estrutura física, API e implementação seguem futuras; o checklist físico/recebimento é assunto independente.

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
