# DECISÕES ARQUITETURAIS
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Ativo

# 1. Objetivo

Registrar oficialmente todas as decisões arquiteturais permanentes do Sistema Gestor OS.

Cada decisão deverá possuir um identificador único (DA-XXX), motivação, alternativas avaliadas, impactos e data de aprovação.

---

# DA-001

## Título
Sistema 100% Web.

## Situação
Aprovada.

## Motivação
Permitir acesso de qualquer computador da empresa sem instalação local, facilitar manutenção e futuras evoluções.

## Alternativas avaliadas
- Desktop
- Híbrido

## Consequências
Todo acesso ocorrerá por navegador.

---

# DA-002

## Título
Frontend em React + TypeScript.

## Situação
Aprovada.

## Motivação
Separação clara entre interface e regras de negócio.

---

# DA-003

## Título
Backend em NestJS.

## Situação
Aprovada.

## Motivação
Arquitetura modular, escalabilidade e integração com TypeScript.

---

# DA-004

## Título
Prisma como ORM.

## Situação
Aprovada.

## Motivação
Versionamento de migrations, tipagem e integração com MySQL.

---

# DA-005

## Título
Banco de Dados MySQL 8.

## Situação
Aprovada.

## Motivação
Tecnologia já dominada pela equipe e aderente aos requisitos do projeto.

---

# DA-006

## Título
Documentação antes da implementação.

## Situação
Aprovada.

## Motivação
Reduzir retrabalho e garantir consistência entre regras de negócio e código.

---

# Estrutura de novas decisões

Toda nova decisão deverá seguir o formato:

- Identificador (DA-XXX)
- Título
- Contexto
- Problema
- Alternativas avaliadas
- Decisão adotada
- Justificativa
- Impactos
- Data
- Responsável

---

# Evolução

Este documento deverá ser atualizado sempre que uma decisão permanente for aprovada.
