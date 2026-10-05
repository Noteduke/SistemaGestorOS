# CONSTITUIÇÃO DO PROJETO
# SISTEMA GESTOR OS

**Versão:** 1.0  
**Status:** Em desenvolvimento  
**Data de criação:** 04/10/2026

---

# 1. APRESENTAÇÃO

Este documento constitui a referência máxima do projeto Sistema Gestor OS.

Todas as decisões de arquitetura, desenvolvimento, documentação e implementação deverão respeitar este documento.

Caso exista conflito entre qualquer documentação, código, sugestão de Inteligência Artificial ou opinião técnica, prevalecerá o conteúdo deste documento até que uma nova decisão arquitetural seja oficialmente registrada.

Este documento deverá evoluir juntamente com o projeto.

# 2. OBJETIVO DO PROJETO

O Sistema Gestor OS é um ERP totalmente Web desenvolvido inicialmente para atender às necessidades operacionais da empresa NoteDuke.

Seu objetivo é centralizar os processos administrativos, financeiros, comerciais e técnicos em um único sistema.

A arquitetura deverá permitir evolução futura para um ambiente multiempresa, embora essa funcionalidade não faça parte da primeira versão.

# 3. PRINCÍPIOS

- Simplicidade.
- Clareza.
- Documentação antes da implementação.
- Código limpo.
- Baixo acoplamento.
- Alta coesão.
- Evolução contínua.
- Versionamento constante.

# 4. FILOSOFIA DE DESENVOLVIMENTO

Fluxo oficial:

Documentação → Revisão → Versionamento → Implementação → Testes → Atualização da documentação.

Nenhum módulo importante deverá ser implementado antes de sua documentação.

# 5. STACK TECNOLÓGICA OFICIAL

## Frontend
- React
- TypeScript

## Backend
- Node.js
- NestJS

## Banco de Dados
- MySQL 8

## ORM
- Prisma

## Containers
- Docker

## Versionamento
- Git
- GitHub

# 6. TECNOLOGIAS NÃO APROVADAS

- ASP.NET
- PHP
- Laravel
- Create React App

Qualquer alteração da stack deverá ser registrada como Decisão Arquitetural.

# 7. ARQUITETURA GERAL

- Sistema 100% Web.
- Frontend e Backend independentes.
- Backend concentra toda a regra de negócio.
- Frontend responsável pela interface.
- Comunicação via API REST.

# 8. DOCUMENTAÇÃO

A documentação oficial reside na pasta `docs/`.

Ela é parte integrante do software e constitui a fonte oficial de verdade do projeto.

# 9. UTILIZAÇÃO DE IA

ChatGPT:
- Arquitetura
- Documentação
- Regras de negócio

Codex:
- Implementação
- Refatorações
- Correções

Gemini:
- Pesquisas
- APIs
- Documentação externa

Nenhuma IA pode alterar regras do projeto sem aprovação.

# 10. VERSIONAMENTO

Utilizar Conventional Commits.

Exemplos:

- feat:
- fix:
- docs:
- refactor:
- chore:

# 11. MÓDULOS PREVISTOS

- Cadastros
- Ordem de Serviço
- Financeiro
- Compras
- Vendas
- Estoque
- Fiscal
- Dashboard
- Relatórios
- Integrações

# 12. CONSIDERAÇÕES FINAIS

Este documento é a Constituição do Sistema Gestor OS.

Todos os demais documentos deverão respeitar suas diretrizes.
