# MÓDULO — IMPORTAÇÃO DE XML
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Documentar a especificação funcional do módulo de Importação de XML do Sistema Gestor OS.

Este documento complementa as regras gerais descritas em:

- 02-Regras-de-Negocio.md
- 03-Banco-de-Dados.md
- 04-API.md

# 2. Escopo

O módulo deverá permitir:

- Importação manual de arquivos XML.
- Download automático dos XMLs disponíveis para o CNPJ da empresa.
- Validação dos arquivos recebidos.
- Armazenamento do XML original.
- Extração dos dados fiscais.
- Integração com Estoque.
- Integração com Financeiro.
- Integração com Compras.

# 3. Fontes de Importação

## Manual

Seleção de um ou mais arquivos XML pelo usuário.

## Automática

Consulta periódica aos documentos fiscais disponíveis para o CNPJ da empresa, utilizando os serviços oficiais definidos para esta integração.

# 4. Fluxo Geral

1. Obter XML.
2. Validar estrutura.
3. Identificar emitente e destinatário.
4. Verificar duplicidade.
5. Armazenar XML.
6. Extrair informações.
7. Permitir conferência.
8. Gerar movimentações de estoque.
9. Gerar lançamentos financeiros.
10. Registrar auditoria.

# 5. Integrações

O módulo poderá integrar-se com:

- Estoque
- Compras
- Financeiro
- Cadastro de Produtos
- Cadastro de Fornecedores

# 6. Auditoria

Toda importação deverá registrar:

- Data e hora
- Usuário
- Origem
- Situação
- Resultado

# 7. Regras Gerais

- Nunca sobrescrever um XML existente.
- Manter o XML original armazenado.
- Registrar erros de importação.
- Permitir reprocessamento quando aplicável.

# 8. Evolução

As especificações técnicas detalhadas levantadas para integração com serviços fiscais deverão ser incorporadas gradualmente a este documento, mantendo este arquivo como a referência oficial do módulo.
