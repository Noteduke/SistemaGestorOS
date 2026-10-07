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

- Inicialização do Backend (NestJS): base mínima configurada; módulos e endpoints permanecem pendentes.
- Inicialização do Frontend (React).
- Prisma 7.10.0: CLI, configuração, generator e geração do Client preparados; schema inicial existente e migration inicial versionada.
- MySQL local: Community Server 8.0.46 mantido nesta fase; banco `gestor_os` e usuário local `gestor_os` criados, com `DATABASE_URL` configurada apenas no `.env` local ignorado pelo Git. Conexão real validada.
- Persistência: migration inicial `20261006120000_initial_core` aplicada por `prisma migrate deploy` e estrutura validada contra o servidor real. O histórico passou a ser controlado por `_prisma_migrations`, e o banco deixou de estar vazio em estrutura. `PrismaModule` e `PrismaService` integrados à aplicação NestJS, com conexão, leitura e encerramento validados; módulos de negócio e endpoints permanecem pendentes.
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

Antes da implementação funcional de Cadastros, a modelagem e uma migration deverão refletir as regras aprovadas em 07/10/2026 para campos de Pessoa, os catálogos iniciais de Tipos de Contato/Contribuinte/Endereço, o ciclo de vida dos catálogos auxiliares, a regra de duplicidade de Pessoa e endereços múltiplos. O schema aplicado ainda diverge dessas regras. Permanecem pendentes os critérios exatos de similaridade, normalização e algoritmo para busca de possíveis duplicatas sem documento, a preservação de snapshot do nome antigo de opções auxiliares editadas, e regras/códigos fiscais detalhados.

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
