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
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema e as duas migrations aplicadas estão versionados.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migrations `20261006120000_initial_core` e `20261007120000_person_basic` aplicadas, sem migrations pendentes. O histórico é controlado por `_prisma_migrations`. `PrismaModule` e `PrismaService` estão integrados ao NestJS; o primeiro recorte de Pessoa básica dispõe de criação, consulta por `publicId` e listagem paginada. Os demais módulos de negócio permanecem pendentes.
- Docker Compose.
- Autenticação.
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

A primeira implementação funcional de Cadastros cobre apenas Pessoa básica: criação, consulta por `publicId` e listagem/pesquisa paginada. Antes dos próximos recortes de Cadastros e OS, a modelagem e futuras migrations deverão refletir as demais regras aprovadas de catálogos, contatos, endereços, status, exclusões/inativações, histórico, permissões, confirmação e titularidade. Não haverá snapshot cadastral completo de Pessoa/Equipamento em cada OS. O schema aplicado continua parcialmente divergente: faltam Aviso, OS, histórico geral, status de Equipamento e de catálogos, além de tabelas próprias; endereço está limitado a um por Pessoa; `person_roles` é enum; Marca/Modelo são opcionais; e regras de principalidade e elegibilidade não estão garantidas pelo banco. Catálogos iniciais usarão seed idempotente sob comando controlado, sem execução automática no startup. Foram aprovados Administrador com poderes máximos, permissões por usuário/ação sem perfis rígidos, principal opcional único por coleção, múltiplos endereços do mesmo Tipo, bloqueio de Pessoa inativa em novos vínculos, comparação exata normalizada para duplicidade sem documento, validação inicial de telefone, vínculo histórico por qualquer registro persistido, renomeação com trilha histórica e histórico geral conceitual por entidade. Permanecem pendentes estrutura física e eventos finais do histórico, classificação sensível, filtros do histórico, contratos de API dos demais recortes, implementação das permissões, estratégia técnica do seed, pesquisa avançada, ciclo operacional além de Ativo/Inativo, múltiplos Avisos/leitura e regras fiscais detalhadas.

O próximo recorte de Cadastros tem **contrato técnico aprovado para implementação futura**, mas ainda não foi implementado: adicionar e listar telefones/e-mails por rotas diretas sob `/api/v1/people/:publicId/`. Todo `POST` exigirá `confirmPersonChange: true`; telefone fora do padrão entre 1 e 32 dígitos exigirá também `confirmNonstandardPhone: true`, com aviso e nenhuma gravação antes da confirmação específica. E-mail inválido ou repetido na mesma Pessoa bloqueia; repetido entre Pessoas grava com aviso genérico, sem confirmação extra. Pessoa inativa admite listagem, mas não inclusão de contato. Cada inclusão exigirá histórico mínimo especializado em futura `person_contact_events`; a primeira definição e toda troca de principal também gerarão evento, atomicamente. `public_id` único em contatos está aprovado se tecnicamente viável. A principalidade combinará transação e índice funcional customizado somente após validação em MySQL 8/Prisma 7.10.0; falha nessa validação interromperá a implementação para revisão. Uma nova migration dependerá de inspeção prévia de dados e aplicação controlada; as migrations anteriores permanecerão intactas. Edição, remoção, inativação e `label` funcional ficam fora. Seguem pendentes implementação, migration, histórico geral e integração do histórico mínimo, autenticação, guards, autorização por usuário/ação e frontend; as rotas não estão prontas para produção.

`people.person_type` PF/PJ obrigatório e os campos opcionais Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações foram aplicados pela migration de Pessoa básica. A API já valida e normaliza CPF numérico e CNPJ numérico ou alfanumérico oficial, impõe limites técnicos de entrada e ordena a listagem por nome e `id` interno sem expô-lo. As rotas ainda não têm autenticação/guards e não estão prontas para exposição operacional ou produção; autenticação e autorização por usuário/ação permanecem pendentes.

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
