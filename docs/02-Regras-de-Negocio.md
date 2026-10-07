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

Será utilizado um cadastro único de Pessoas, com Tipo de Pessoa PF ou PJ e os dados cadastrais aprovados para cada cadastro.

Uma Pessoa poderá exercer mais de um papel simultaneamente. Esses papéis são denominados **Tipos de Contato** e serão mantidos em cadastro próprio.

Exemplos:

- Cliente
- Fornecedor
- Transportadora
- Prestador de Serviço

Transportadoras NÃO possuirão cadastro próprio separado. Transportadora será um Tipo de Contato da Pessoa.

Cada cadastro poderá possuir:

- múltiplos telefones;
- múltiplos e-mails;
- zero ou uma Pessoa de Contato, que será outro cadastro completo de Pessoa;
- múltiplos endereços, cada um com Tipo de Endereço proveniente de cadastro próprio e opção de ser marcado como principal.

Os Tipos de Endereço não serão limitados a uma enumeração fixa. Exemplos discutidos incluem Principal, Cobrança, Entrega e Instalação; o catálogo inicial permanece pendente.

Os campos obrigatórios mínimos para salvar uma Pessoa são Tipo de Pessoa (PF ou PJ) e Nome/Razão Social. Todos os demais campos são opcionais no cadastro geral, salvo exigências específicas de fluxos futuros, como emissão fiscal. Além das regras de CPF/CNPJ descritas a seguir, não ficam estabelecidas outras obrigatoriedades ou formatos para os novos campos nesta etapa.

CPF/CNPJ é opcional no cadastro geral. Quando informado, deve ser armazenado somente com números, ser matematicamente válido, único e compatível com o Tipo de Pessoa: PF exige CPF com 11 dígitos e PJ exige CNPJ com 14 dígitos. A máscara é aplicada apenas na interface. Normalização, validação matemática, compatibilidade e duplicidade são regras do Backend/API; a validação visual do Frontend não é autoridade final.

Nome Fantasia aplica-se a PJ e é opcional. Para exibição, se a PJ não tiver Nome Fantasia, usa-se a Razão Social como referência principal. Nome Fantasia não se aplica a PF.

Inscrição Estadual e Inscrição Municipal são opcionais e aplicam-se principalmente a PJ. Nesta etapa não há validação fiscal específica por estado ou município; o valor informado é armazenado sem interpretação fiscal complexa.

Tipo de Contribuinte será uma classificação de cadastro próprio, opcional no cadastro geral de Pessoa e obrigatória quando houver emissão de nota fiscal. Não é obrigatória para OS sem emissão fiscal nem, inicialmente, para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Valores, códigos, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.

Observações são informação passiva do cadastro. Aviso é informação operacional: quando preenchido, deve ser apresentado ao operador ao visualizar a Pessoa, realizar uma venda para ela ou abrir uma Ordem de Serviço para ela. A regra e os dados permanecem sob responsabilidade do Backend/API; o Frontend realiza a apresentação. Modalidade visual, confirmação de leitura, bloqueio, severidade, validade e histórico do Aviso permanecem pendentes.

Marca e Fabricante são o mesmo conceito para equipamentos e terão um único cadastro, denominado preferencialmente **Marca**.

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
