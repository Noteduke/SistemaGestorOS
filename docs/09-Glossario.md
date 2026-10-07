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
Classificação de cadastro próprio que representa um papel exercido por uma Pessoa no sistema. Catálogo inicial: Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro. Uma Pessoa pode possuir vários Tipos de Contato simultaneamente.

## Pessoa de Contato
Outra Pessoa, vinculada a um cadastro de Pessoa como contato. Cada Pessoa pode ter zero ou uma Pessoa de Contato; o vínculo não representa um cadastro simplificado nem um papel da Pessoa.

## Tipo de Contribuinte
Classificação de cadastro próprio associada à Pessoa para uso fiscal. Catálogo inicial: Contribuinte ICMS, Contribuinte Isento e Não Contribuinte. Códigos e regras fiscais detalhadas permanecem pendentes.

## Tipo de Endereço
Classificação de cadastro próprio associada a um endereço de Pessoa. Catálogo inicial: Principal, Cobrança, Entrega e Instalação. Um endereço pode ser marcado como principal independentemente do tipo.

## Parceiro
Tipo de Contato para pessoa ou organização com relação de parceria comercial ou operacional com a empresa.

## Observações
Informação passiva registrada no cadastro de Pessoa, sem comportamento obrigatório de exibição em outros fluxos.

## Aviso
Campo único e informativo do cadastro de Pessoa. Nos contextos aprovados, o sistema pergunta se o operador deseja ver o conteúdo; não o exibe automaticamente e não bloqueia operações. As regras de apresentação e permissão estão em `docs/02-Regras-de-Negocio.md`.

## Marca
Cadastro único de identificação da marca de um equipamento, representando também seu fabricante para fins do Sistema Gestor OS.

## Produto
Item controlado em estoque e comercializado.

## Serviço
Atividade executada pela empresa, não representando item de estoque.

## Equipamento
Bem cuja titularidade atual é vinculada a uma Pessoa com Tipo de Contato Cliente e que pode gerar uma Ordem de Serviço. A Pessoa informada na OS não precisa ser o proprietário real.

## Proprietário do Equipamento
Pessoa cadastrada que detém a titularidade atual do equipamento e possui Tipo de Contato Cliente.

## Pessoa informada na abertura da OS
Pessoa registrada como informada no atendimento no momento em que uma OS é aberta. A OS preserva o retrato histórico desse momento; não há separação obrigatória nesta etapa em relação ao proprietário real do equipamento.

## Transferência de titularidade
Operação que altera o proprietário atual de equipamento com vínculo histórico e registra evento de titularidade, sem reescrever OS anteriores.

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
