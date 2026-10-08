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
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema e as três migrations anteriores aplicadas estão versionados; a migration Auth está aplicada no banco principal, mas ainda não versionada.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` aplicadas; a migration Auth `20261008120000_auth_foundation` também foi aplicada no banco principal; `prisma migrate status` indica schema atualizado, sem pendências. O histórico é controlado por `_prisma_migrations`. `PrismaModule` e `PrismaService` estão integrados ao NestJS; Pessoa básica e rotas para adicionar/listar telefones e e-mails estão implementadas e protegidas no código. O seed de 24 permissões foi executado duas vezes e validado como idempotente; bootstrap local e principais testes HTTP autenticados foram concluídos. Permanecem pendentes testes opcionais de falhas de login e autoria de eventos de contato, além dos demais módulos de negócio.
- Docker Compose.
- Autenticação e autorização: primeiro recorte implementado no Backend e ainda não versionado; migration aplicada no banco principal, seed de 24 permissões idempotente, primeiro Administrador ativo criado e principais testes HTTP autenticados locais aprovados. Ainda não está liberado para produção nem para acesso externo.
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

A implementação funcional de Cadastros cobre Pessoa básica e inclusão/listagem de telefones e e-mails; essas sete rotas estão protegidas por Auth no código, com a migration de Auth já aplicada no banco principal. Antes dos próximos recortes de Cadastros e OS, modelagem e futuras migrations deverão refletir as demais regras aprovadas de catálogos, endereços, status, exclusões/inativações, histórico geral e titularidade. Não haverá snapshot cadastral completo de Pessoa/Equipamento em cada OS. O schema aplicado continua parcialmente divergente: faltam Aviso, OS, histórico geral, status de Equipamento e de catálogos, além de tabelas próprias; endereço está limitado a um por Pessoa; `person_roles` é enum; Marca/Modelo são opcionais; e elegibilidade de proprietário não é garantida pelo banco. Índices funcionais garantem a principalidade única de telefones/e-mails. Catálogos iniciais usarão seed idempotente sob comando controlado, sem execução automática no startup. Permanecem pendentes estrutura física e eventos finais do histórico geral, classificação sensível, filtros do histórico, contratos de API dos demais recortes, permissões para módulos ainda não implementados, execução dos seeds e estratégia técnica dos catálogos, pesquisa avançada, ciclo operacional além de Ativo/Inativo, múltiplos Avisos/leitura e regras fiscais detalhadas.

O recorte de telefones e e-mails foi implementado como sub-recursos diretos em `/api/v1/people/:publicId/phones` e `/emails`, com `POST` e `GET`. A migration `20261007183000_person_contacts` foi aplicada ao banco local. Os contatos têm `public_id` único, e-mails são únicos por Pessoa, e índices funcionais MySQL garantem no máximo um principal por Pessoa e coleção sem restringir múltiplos não principais. Todo `POST` exige `confirmPersonChange: true`; telefone não padrão até 32 dígitos exige também `confirmNonstandardPhone: true`, sem gravação antes da confirmação específica. E-mail repetido na mesma Pessoa bloqueia; compartilhado entre Pessoas é permitido com aviso genérico. Inclusões e mudanças efetivas de principal registram eventos em `person_contact_events` na mesma transação. `label` permanece nulo/sem uso e fora da API; edição, remoção e inativação de contatos seguem fora do recorte. As sete rotas de Pessoas estão protegidas por Auth no código; testes autenticados locais confirmaram acesso Admin à listagem paginada e bloqueio CSRF de mutação. A integridade de `event_type` com `phone_id`/`email_id` é validada no service; uma constraint CHECK no banco pode ser avaliada em evolução futura. Testes específicos de criação de contato e autoria em `person_contact_events.user_id` continuam pendentes.

`people.person_type` PF/PJ obrigatório e os campos opcionais Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações foram aplicados pela migration de Pessoa básica. A API já valida e normaliza CPF numérico e CNPJ numérico ou alfanumérico oficial, impõe limites técnicos de entrada e ordena a listagem por nome e `id` interno sem expô-lo. As rotas estão protegidas no código pelo primeiro recorte de Auth. A listagem exige `page` e `pageSize` e retorna `INVALID_PAGINATION` quando ausentes; teste autenticado confirmou `?page=1&pageSize=20` com Admin. Bootstrap e testes autenticados principais foram concluídos no ambiente local; isso não libera produção.

O primeiro recorte de Auth está implementado no código, incluindo endpoints de autenticação, sessão opaca, CSRF, guards, autorização, Log Administrativo, seed controlado e bootstrap do Administrador. O schema Prisma e a migration `20261008120000_auth_foundation` foram criados; a migration foi aplicada no banco principal `gestor_os`, e `prisma migrate status` indica schema atualizado. O SQL foi validado funcionalmente em banco isolado/shadow, sem registro da migration em `_prisma_migrations` nesse shadow. O seed de 24 permissões foi executado duas vezes no principal sem duplicação; há um Administrador ativo e `admin.full`, `system.admin` e `Master` estão ausentes. O bootstrap aborta antes de solicitar credenciais quando já existe Administrador ativo; o controle transacional permanece no service. Os testes HTTP autenticados principais passaram localmente: login e `/auth/me` retornam `publicId` sem `id`, a listagem paginada de Pessoas funciona para Admin, mutação sem CSRF é bloqueada, logout encerra a sessão e a sessão revogada recebe 401. `users` contém a conta bootstrapada. Para avançar, faltam versionamento, teste real de concorrência do bootstrap, testes opcionais de cinco falhas de login e autoria de contato. O primeiro uso permanece restrito ao Administrador bootstrapado; CRUD HTTP de usuários e Frontend continuam fora. Recuperação/troca de senha, envio real de e-mail, 2FA e acesso externo também permanecem pendentes. Uma credencial administrativa foi exposta acidentalmente durante teste manual; por decisão de Marcos não foi trocada agora, mas deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. Não há fluxo definitivo de troca/reset. O backend escuta somente em `127.0.0.1`; o sistema segue de uso interno e acesso externo permanece proibido até 2FA e fronteira confiável. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem para classificar a rede. Vulnerabilidades high do `npm install` precisam ser avaliadas sem correção automática nesta etapa. A concessão MySQL antiga para `gestor_os` com `_` sem escape deve ser revisada em etapa administrativa separada.

Decisão funcional aprovada para OS/Estoque: usuários autorizados podem mudar peça de ORÇADA para UTILIZADA, com histórico de data, usuário, OS e peça; a peça fica indisponível para outra OS ou venda. Cancelamento, desfazimento, recusa ou não utilização gera pendência de conferência; o técnico pode informar a não utilização e o Administrador confirma o retorno à disponibilidade. Essa regra deve entrar no futuro recorte de OS/Estoque. Modelo de dados, movimentações, API e interface ainda não foram implementados nem definidos completamente.

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
