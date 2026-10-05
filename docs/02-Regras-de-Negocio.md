# REGRAS DE NEGÓCIO
# SISTEMA GESTOR OS

**Versão:** 1.0  
**Status:** Em evolução

# 1. Objetivo

Este documento reúne as regras de negócio oficiais do Sistema Gestor OS.
Toda implementação deverá seguir este documento.

# 2. Princípios Gerais

- As regras de negócio pertencem ao Backend.
- O Frontend apenas apresenta informações ao usuário.
- Nenhuma regra crítica deverá existir apenas na interface.

# 3. Cadastros

## Clientes e Fornecedores

Será utilizado um cadastro único.

Uma empresa ou pessoa poderá exercer mais de um papel.

Exemplos:

- Cliente
- Fornecedor
- Transportadora
- Prestador de Serviço

Transportadoras NÃO possuirão cadastro próprio.
Serão uma categoria do cadastro de Clientes/Fornecedores.

Cada cadastro poderá possuir:

- múltiplos telefones;
- múltiplos e-mails;
- uma pessoa de contato;
- endereços.

# 4. Produtos

O sistema permitirá:

- cadastro de produtos;
- categorias;
- fabricantes;
- marcas;
- clonagem de produtos.

A clonagem copiará todas as informações parametrizáveis, exigindo apenas os ajustes necessários.

# 5. Ordem de Serviço

Será o módulo principal do sistema.

Cada OS possuirá histórico completo.

Deverá permitir anexos, fotos e evolução cronológica.

As regras detalhadas serão documentadas posteriormente neste mesmo documento.

# 6. Financeiro

O sistema possuirá:

- Contas a Receber;
- Contas a Pagar;
- Fluxo de Caixa.

Contas a receber poderão gerar notificação por e-mail ao cliente antes do vencimento.

Inicialmente a ideia aprovada é avisar dois dias antes do vencimento.

# 7. Estoque

Controlará:

- entradas;
- saídas;
- movimentações;
- inventário.

A importação de XML poderá alimentar automaticamente o estoque.

# 8. XML

Será possível:

- importar XML manualmente;
- baixar automaticamente XMLs disponíveis para o CNPJ da empresa;
- lançar produtos;
- gerar movimentação de estoque;
- gerar lançamentos financeiros.

As regras detalhadas estarão em docs/modulos/Importacao-XML.md.

# 9. Boletos

Está prevista integração com:

- Stone;
- Banco Inter.

As especificações ficarão em docs/modulos/Boletos.md.

# 10. Clonagem

O sistema deverá permitir clonagem de:

- produtos;
- pedidos;
- orçamentos;
- faturamentos.

Novos módulos poderão aderir à clonagem futuramente.

# 11. Evolução

Este documento crescerá continuamente durante o desenvolvimento do projeto.

Nenhuma regra importante deverá permanecer apenas em conversas.

Toda decisão aprovada deverá ser registrada aqui ou em um documento específico do módulo correspondente.
