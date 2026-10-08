# ARQUITETURA DO SISTEMA GESTOR OS

**Versão:** 1.0  
**Status:** Em elaboração

# 1. Objetivo

Este documento descreve a arquitetura oficial do Sistema Gestor OS e complementa a Constituição do Projeto.

# 2. Visão Geral

O Gestor OS será um ERP 100% Web, dividido em Frontend e Backend independentes, comunicando-se por API REST.

# 3. Arquitetura em Camadas

- Frontend (React + TypeScript)
- Backend (NestJS)
- Persistência (Prisma)
- Banco de Dados (MySQL 8)

Toda regra de negócio ficará concentrada no Backend.

## 3.1 Fronteira de persistência

Toda comunicação do Backend com o MySQL deverá passar pelo Prisma ORM, conforme DA-017. O fluxo padrão será:

```text
Controller/API → Service de domínio → PrismaService → Prisma Client → MySQL
```

Quando um Repository tiver justificativa concreta, o fluxo poderá ser:

```text
Controller/API → Service de domínio → Repository → PrismaService → Prisma Client → MySQL
```

Repository não é uma camada obrigatória para todas as entidades. Services de domínio podem utilizar `PrismaService` diretamente. Regras de negócio e coordenação de fluxos permanecem nos services de domínio, fora da infraestrutura.

O `PrismaModule` fica em `backend/src/infrastructure/prisma/` junto com o `PrismaService`. Não é `@Global()`; cada módulo que precisar de persistência deverá importá-lo explicitamente. Módulos de negócio não deverão criar conexões MySQL próprias nem utilizar diretamente o driver interno do adapter Prisma.

# 4. Tecnologias Oficiais

## Frontend
- React
- TypeScript

## Backend
- Node.js
- NestJS

## ORM
- Prisma

## Banco
- MySQL 8

## Containers
- Docker

## Versionamento
- Git + GitHub

# 5. Estrutura Inicial do Repositório

SistemaGestorOS/
- backend/
- frontend/
- docs/
- docker/
- scripts/

# 6. Princípios Arquiteturais

- Separação de responsabilidades.
- Código limpo.
- Baixo acoplamento.
- Alta coesão.
- Componentização.
- Documentação antes da implementação.

# 7. Frontend

Responsável exclusivamente pela interface com o usuário.

Não conterá regras de negócio.

# 8. Backend

Centralizará:

- regras de negócio;
- autenticação;
- autorização;
- integrações;
- acesso ao banco;
- APIs.

No aplicativo web, o primeiro recorte de autenticação foi implementado no Backend com sessão opaca mantida no servidor, timeout de oito horas por inatividade renovado a cada requisição autenticada válida e sem limite absoluto. A autorização por ação é decidida exclusivamente pelo Backend, com Administrador como autoridade máxima e permissões diretas por usuário. O processo local escuta somente em `127.0.0.1`. A migration de Auth foi criada, mas está pendente no banco principal `gestor_os`; seed de permissões, bootstrap do primeiro Administrador e validação nesse banco também estão pendentes. Portanto, o recorte ainda não está liberado para produção. O sistema continua somente de uso interno. Até haver 2FA e fronteira confiável implementados, não se deve classificar origem por IP, `X-Forwarded-For` ou outros headers de proxy. Qualquer proxy, VPN, túnel ou publicação externa exigirá nova decisão documental. A decisão está documentada em DA-018.

# 9. Banco de Dados

MySQL 8 utilizando Prisma.

Toda alteração estrutural deverá ser feita através de migrations.

# 10. Integrações Previstas

- SEFAZ
- Stone
- Banco Inter
- Correios
- Dell TechDirect

# 11. Evolução

A arquitetura deverá permitir crescimento contínuo sem necessidade de reescrita completa do sistema.

# 12. Relação com outros documentos

- 00-Constituicao-do-Projeto.md
- 02-Regras-de-Negocio.md
- 03-Banco-de-Dados.md
- 04-API.md
