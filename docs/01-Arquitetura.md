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

