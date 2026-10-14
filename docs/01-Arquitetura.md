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

# 7.1 Base frontend inicial

O diretório `frontend/` contém a aplicação em React + TypeScript + Vite. No desenvolvimento, o Vite escuta somente em `127.0.0.1` e encaminha `/api` para `http://127.0.0.1:3000`, mantendo o Backend sem configuração de CORS. A interface de OS consome consultas de listagem, detalhe e eventos, altera a situação operacional e substitui atribuições nominais usando as rotas oficiais; autenticação, autorização e regras de negócio continuam no Backend.

# 8. Backend

Centralizará:

- regras de negócio;
- autenticação;
- autorização;
- integrações;
- acesso ao banco;
- APIs.

No aplicativo web, o primeiro recorte de autenticação foi implementado no Backend com sessão opaca mantida no servidor, timeout de oito horas por inatividade renovado a cada requisição autenticada válida e sem limite absoluto. A autorização por ação é decidida exclusivamente pelo Backend, com Administrador como autoridade máxima e permissões diretas por usuário. O processo local escuta somente em `127.0.0.1`. A migration de Auth foi aplicada no banco principal `gestor_os`; o seed inicial de Auth criou 24 permissões e o seed posterior de OS elevou o total do banco a 32, sem `admin.full`, `system.admin` ou perfil/usuário `Master`. O bootstrap local foi concluído e a segunda execução foi validada para abortar antes de solicitar credenciais quando já existe Administrador ativo; o controle transacional contra concorrência permanece no service. Os testes HTTP autenticados principais passaram: CSRF pré-login e login retornam sucesso, login e `/auth/me` expõem `publicId` sem `id` interno, `/people?page=1&pageSize=20` funciona para Admin, mutação sem CSRF retorna 403, logout retorna 204 e a sessão encerrada retorna 401. Sem paginação, a listagem de Pessoas retorna `INVALID_PAGINATION`; `page` e `pageSize` são obrigatórios. Isso valida o uso local, mas não libera o recorte para produção. Uma credencial administrativa foi exposta acidentalmente durante teste manual; por decisão de Marcos não será trocada agora e deverá ser substituída antes de uso real, em rede compartilhada, produção ou demonstração externa. O sistema continua somente de uso interno. Até haver 2FA e fronteira confiável implementados, não se deve classificar origem por IP, `X-Forwarded-For` ou outros headers de proxy. Qualquer proxy, VPN, túnel ou publicação externa exigirá nova decisão documental. A decisão está documentada em DA-018.

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

## Histórico operacional unificado da OS

O Backend mantém `ServiceOrderEvent` para eventos automáticos imutáveis e `ServiceOrderNote` para observações manuais sem edição. A projeção de leitura `/history` combina as duas fontes com paginação por cursor no Backend; `/events` permanece compatível e exclusivamente automático. A exclusão de uma nota usa transação Prisma para gravar seu snapshot integral no `AdminAuditLog` e depois removê-la. O Log Administrativo tem fronteira de leitura separada e não é fonte da linha do tempo comum.
