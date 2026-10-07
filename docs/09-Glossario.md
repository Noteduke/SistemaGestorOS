# GLOSSÁRIO
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Padronizar toda a terminologia utilizada no Sistema Gestor OS.

Este documento é a referência oficial de nomenclatura para documentação, banco de dados, código-fonte, interfaces e comunicações.

---

# 2. Regras Gerais

- Cada termo possuirá apenas um significado oficial.
- Evitar sinônimos para conceitos do sistema.
- Novos termos deverão ser registrados antes de serem utilizados em documentação ou código.

---

# 3. Termos Oficiais

## ERP
Sistema integrado de gestão empresarial.

## OS (Ordem de Serviço)
Registro principal utilizado para controlar o atendimento técnico de um equipamento.

## Cliente
Pessoa física ou jurídica que contrata serviços ou adquire produtos.

## Fornecedor
Pessoa física ou jurídica que fornece produtos ou serviços ao Gestor OS.

## Tipo de Pessoa
Classificação do cadastro unificado como Pessoa Física (PF) ou Pessoa Jurídica (PJ).

## Transportadora
Tipo de Contato que classifica uma Pessoa como transportadora. Não possui cadastro de Pessoa separado.

## Tipo de Contato
Classificação de cadastro próprio que representa um papel exercido por uma Pessoa no sistema, como Cliente, Fornecedor, Transportadora ou Prestador de Serviço. Uma Pessoa pode possuir vários Tipos de Contato simultaneamente.

## Pessoa de Contato
Outra Pessoa, vinculada a um cadastro de Pessoa como contato. Cada Pessoa pode ter zero ou uma Pessoa de Contato; o vínculo não representa um cadastro simplificado nem um papel da Pessoa.

## Tipo de Contribuinte
Classificação de cadastro próprio associada à Pessoa para uso fiscal. Valores e regras fiscais ainda estão pendentes.

## Tipo de Endereço
Classificação de cadastro próprio associada a um endereço de Pessoa. O catálogo inicial ainda está pendente; um endereço pode ser marcado como principal.

## Observações
Informação passiva registrada no cadastro de Pessoa, sem comportamento obrigatório de exibição em outros fluxos.

## Aviso
Informação operacional do cadastro de Pessoa que deve ser apresentada ao operador ao visualizar a Pessoa, realizar uma venda para ela ou abrir uma Ordem de Serviço para ela. A forma visual e demais comportamentos ainda estão pendentes.

## Marca
Cadastro único de identificação da marca de um equipamento, representando também seu fabricante para fins do Sistema Gestor OS.

## Produto
Item controlado em estoque e comercializado.

## Serviço
Atividade executada pela empresa, não representando item de estoque.

## Equipamento
Bem pertencente ao cliente que poderá gerar uma Ordem de Serviço.

## Orçamento
Proposta comercial apresentada ao cliente antes da execução ou venda.

## Faturamento
Conversão de uma venda aprovada em documento financeiro.

## XML
Arquivo eletrônico utilizado para importação de documentos fiscais.

## API
Interface de comunicação entre Frontend, Backend e integrações externas.

## Migration
Alteração versionada da estrutura do banco de dados realizada pelo Prisma.

---

# 4. Evolução

Este glossário deverá crescer continuamente durante o desenvolvimento do projeto.

Toda nova nomenclatura aprovada deverá ser registrada neste documento.
