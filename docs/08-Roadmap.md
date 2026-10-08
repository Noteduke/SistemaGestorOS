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
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema e as três migrations aplicadas estão versionados.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` aplicadas, sem migrations pendentes. O histórico é controlado por `_prisma_migrations`. `PrismaModule` e `PrismaService` estão integrados ao NestJS; Pessoa básica e rotas para adicionar/listar telefones e e-mails estão implementadas. Os demais módulos de negócio permanecem pendentes.
- Docker Compose.
- Autenticação e autorização: decisões iniciais documentadas e aprovadas; implementação ainda não iniciada.
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

A implementação funcional de Cadastros cobre Pessoa básica e inclusão/listagem de telefones e e-mails. Antes dos próximos recortes de Cadastros e OS, modelagem e futuras migrations deverão refletir as demais regras aprovadas de catálogos, endereços, status, exclusões/inativações, histórico geral, permissões e titularidade. Não haverá snapshot cadastral completo de Pessoa/Equipamento em cada OS. O schema aplicado continua parcialmente divergente: faltam Aviso, OS, histórico geral, status de Equipamento e de catálogos, além de tabelas próprias; endereço está limitado a um por Pessoa; `person_roles` é enum; Marca/Modelo são opcionais; e elegibilidade de proprietário não é garantida pelo banco. Índices funcionais garantem a principalidade única de telefones/e-mails. Catálogos iniciais usarão seed idempotente sob comando controlado, sem execução automática no startup. Permanecem pendentes estrutura física e eventos finais do histórico geral, classificação sensível, filtros do histórico, contratos de API dos demais recortes, implementação das permissões, estratégia técnica do seed, pesquisa avançada, ciclo operacional além de Ativo/Inativo, múltiplos Avisos/leitura e regras fiscais detalhadas.

O recorte de telefones e e-mails foi implementado como sub-recursos diretos em `/api/v1/people/:publicId/phones` e `/emails`, com `POST` e `GET`. A migration `20261007183000_person_contacts` foi aplicada ao banco local; `prisma migrate status` confirmou que o schema está atualizado. Os contatos têm `public_id` único, e-mails são únicos por Pessoa, e índices funcionais MySQL garantem no máximo um principal por Pessoa e coleção sem restringir múltiplos não principais. Todo `POST` exige `confirmPersonChange: true`; telefone não padrão até 32 dígitos exige também `confirmNonstandardPhone: true`, sem gravação antes da confirmação específica. E-mail repetido na mesma Pessoa bloqueia; compartilhado entre Pessoas é permitido com aviso genérico. Inclusões e mudanças efetivas de principal registram eventos em `person_contact_events` na mesma transação. `label` permanece nulo/sem uso e fora da API; edição, remoção e inativação de contatos seguem fora do recorte. As rotas ainda não têm autenticação/guards e não estão prontas para produção. A integridade de `event_type` com `phone_id`/`email_id` é validada no service; uma constraint CHECK no banco pode ser avaliada em evolução futura.

`people.person_type` PF/PJ obrigatório e os campos opcionais Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações foram aplicados pela migration de Pessoa básica. A API já valida e normaliza CPF numérico e CNPJ numérico ou alfanumérico oficial, impõe limites técnicos de entrada e ordena a listagem por nome e `id` interno sem expô-lo. As rotas continuam sem autenticação/guards e não estão prontas para exposição operacional ou produção.

O desenho do recorte de Auth está documentado e aprovado; a implementação não começou. O desenho prevê sessão opaca no servidor, autorização por permissões diretas por usuário e Administrador como autoridade máxima, um único Log Administrativo e proteção das sete rotas atuais de Pessoas. O banco e o código ainda não possuem tabelas, migration ou módulo de autenticação/autorização. Permanecem pendentes a implementação, 2FA, método e recuperação do segundo fator, fronteira interna/externa, política final de senha, recuperação de senha, detalhes de sessões e logs e a implementação do Frontend. Acesso externo fica proibido até 2FA; enquanto a fronteira interna não estiver definida e aplicada, não se deve presumir que o modo sem 2FA esteja restrito à rede interna.

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
