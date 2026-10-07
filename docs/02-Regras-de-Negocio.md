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

Dados textuais persistidos devem ser convertidos para MAIÚSCULAS no Backend antes de salvar, salvo exceção aprovada. E-mail é salvo em minúsculas após remover espaços no início e no fim, e a comparação de duplicidade usa minúsculas. Telefone e CEP são salvos somente com números; suas máscaras existem apenas na interface. CEP não é obrigatório. A validação de telefone fora do formato esperado gera aviso não bloqueante; critérios técnicos completos, inclusive DDD e nono dígito, permanecem pendentes. CPF/CNPJ segue a regra específica já definida. Essas normalizações são comportamento da aplicação, não alteração ou garantia do schema atual.

# 3. Cadastros

## Clientes e Fornecedores

Será utilizado um cadastro único de Pessoas, com Tipo de Pessoa PF ou PJ e os dados cadastrais aprovados para cada cadastro.

Uma Pessoa poderá exercer mais de um papel simultaneamente. Esses papéis são denominados **Tipos de Contato** e serão mantidos em cadastro próprio.

Exemplos:

- Cliente
- Fornecedor
- Transportadora
- Prestador de Serviço
- Parceiro

O catálogo inicial contém esses cinco Tipos de Contato. Os significados aprovados são: Cliente, quem contrata serviços ou adquire produtos; Fornecedor, quem fornece produtos ou serviços; Transportadora, quem realiza transporte; Prestador de Serviço, quem presta serviços; e Parceiro, pessoa ou organização com relação de parceria comercial ou operacional. Os valores pertencem a cadastro próprio, não a enumeração fixa. Uma Pessoa pode ter vários Tipos de Contato simultaneamente.

Transportadoras NÃO possuirão cadastro próprio separado. Transportadora será um Tipo de Contato da Pessoa.

Cada cadastro poderá possuir:

- múltiplos telefones;
- múltiplos e-mails;
- zero ou uma Pessoa de Contato, que será outro cadastro completo de Pessoa;
- múltiplos endereços, cada um com Tipo de Endereço proveniente de cadastro próprio e opção de ser marcado como principal.

O catálogo inicial de Tipos de Endereço contém Principal, Cobrança, Entrega e Instalação. São valores de cadastro próprio, não uma enumeração fixa. Cada endereço deve ter um Tipo de Endereço e pode também ser marcado como principal. Uma Pessoa pode ter vários endereços; ainda não foi definida uma regra sobre permitir ou impedir mais de um endereço do mesmo tipo.

Os campos obrigatórios mínimos para salvar uma Pessoa são Tipo de Pessoa (PF ou PJ) e Nome/Razão Social. Todos os demais campos são opcionais no cadastro geral, salvo exigências específicas de fluxos futuros, como emissão fiscal. Além das regras de CPF/CNPJ descritas a seguir, não ficam estabelecidas outras obrigatoriedades ou formatos para os novos campos nesta etapa.

CPF/CNPJ é opcional no cadastro geral. Quando informado, deve ser armazenado somente com números, ser matematicamente válido, único e compatível com o Tipo de Pessoa: PF exige CPF com 11 dígitos e PJ exige CNPJ com 14 dígitos. A máscara é aplicada apenas na interface. Normalização, validação matemática, compatibilidade e duplicidade são regras do Backend/API; a validação visual do Frontend não é autoridade final.

Nome Fantasia aplica-se a PJ e é opcional. Para exibição, se a PJ não tiver Nome Fantasia, usa-se a Razão Social como referência principal. Nome Fantasia não se aplica a PF.

Inscrição Estadual e Inscrição Municipal são opcionais e aplicam-se principalmente a PJ. Nesta etapa não há validação fiscal específica por estado ou município; o valor informado é armazenado sem interpretação fiscal complexa.

Tipo de Contribuinte será uma classificação de cadastro próprio, opcional no cadastro geral de Pessoa e obrigatória quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). Não é obrigatório para OS sem emissão fiscal nem, inicialmente, para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.

Os catálogos auxiliares deste cadastro seguem uma regra geral: uma opção ainda não vinculada pode ser editada, inativada ou excluída; uma opção já utilizada pode ser editada ou inativada, mas não excluída fisicamente. Opções inativas não são oferecidas por padrão em novos cadastros e continuam válidas para registros históricos. Ainda será definido se editar a descrição de uma opção usada altera o nome exibido no histórico ou se o nome anterior deve ser preservado como snapshot. Uma regra específica aprovada para determinado catálogo poderá substituir esta regra geral.

CPF ou CNPJ informado é um critério forte de identidade; se já estiver cadastrado para outra Pessoa, bloqueia o novo cadastro. Quando não houver documento, uma possível duplicidade identificada por nome, telefone ou e-mail gera um aviso, mas não impede salvar e não é bloqueada automaticamente. Critérios exatos de similaridade, normalização e algoritmo de busca permanecem pendentes.

Observações são informação passiva do cadastro. Aviso é um único campo informativo da Pessoa. Nos contextos aprovados — visualizar o cadastro, abrir OS para a Pessoa e realizar venda para ela — se houver Aviso, o sistema pergunta: “Há informação a ser visualizada. Deseja visualizar agora?”. O conteúdo só é exibido se o operador escolher Sim. Se escolher Não, o sistema mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua normalmente. A pergunta ocorre a cada ocorrência do contexto, sem dispensa por sessão, atendimento ou usuário. O conteúdo nunca é exibido automaticamente na tela.

Não há log de leitura, registro da resposta Sim/Não, confirmação formal de ciência ou histórico de leituras nesta etapa. Usuário comum pode preencher o campo quando estiver vazio; se já houver conteúdo, não pode alterá-lo nem apagá-lo. Somente usuário administrador pode alterar ou apagar Aviso existente e também pode adicionar conteúdo. A definição técnica do perfil/permissão de administrador permanece pendente. Auditoria de alteração/apagamento, múltiplos Avisos e histórico de Avisos são evolução futura, não regras desta etapa.

Pessoa sem vínculo histórico pode ser excluída fisicamente. Pessoa com OS, venda, financeiro, compra, estoque ou outro vínculo histórico não pode ser excluída fisicamente, mas pode ser inativada. Pessoa inativa não aparece por padrão em novos lançamentos, pode ser localizada em pesquisa com filtro para incluir inativos e continua sendo exibida normalmente nos registros históricos. O mapeamento exato dos vínculos por entidade/tabela permanece pendente.

O proprietário atual de equipamento deve ser uma Pessoa cadastrada com Tipo de Contato Cliente. Pessoa sem esse Tipo de Contato não pode ser proprietária. Pessoa inativa não aparece como opção padrão para novo proprietário. A mesma elegibilidade se aplica ao cadastro inicial e a transferências.

Equipamento sem vínculo com OS ou histórico operacional pode ser excluído fisicamente. Com OS, venda, atendimento, histórico de titularidade ou outro vínculo, não pode ser excluído fisicamente, mas pode ser inativado. Equipamento inativo não aparece por padrão em novas OS, pode ser localizado com filtro para incluir inativos e continua sendo exibido nos históricos antigos. A elegibilidade do proprietário e as opções padrão para pessoas inativas também se aplicam a transferências.

A OS registra a Pessoa informada no atendimento no momento da abertura. Nesta etapa não há separação obrigatória entre Pessoa informada/cliente da OS, proprietário real do equipamento, responsável pelo atendimento ou terceiro que trouxe o equipamento; o sistema usa os dados informados no atendimento, sem exigir outro campo para indicar proprietário real diferente. A OS preserva o retrato histórico informado naquele momento. Alterações posteriores nos cadastros de Pessoa ou Equipamento não reescrevem esse retrato.

Transferir titularidade é permitido. O novo proprietário deve ser Pessoa cadastrada, possuir Tipo de Contato Cliente e estar ativa para aparecer como opção padrão. A transferência altera o proprietário atual e registra evento de titularidade, sem alterar OS antigas. Equipamento sem vínculo histórico pode ter o proprietário corrigido sem tratar a operação como transferência formal. Se já houver OS, venda, atendimento, histórico de titularidade ou outro vínculo operacional, a mudança deve ser registrada como transferência. Correção retroativa em equipamento com histórico é restrita a administrador e deverá exigir justificativa e auditoria, cuja estrutura e permissões finais permanecem pendentes.

Número de série é opcional. Quando informado, é o principal critério de duplicidade e a validação considera o proprietário atual: serial repetido para o mesmo proprietário bloqueia o cadastro; serial repetido para proprietário diferente gera aviso, permite cadastrar outro equipamento e não sugere transferência. Serial não informado permite salvar normalmente e não dispara busca automática de duplicidade por proprietário, tipo, Marca e Modelo. O valor é armazenado em caixa alta, sem remover ou alterar espaços (inclusive no início/fim), pontos, traços, barras ou outros símbolos; por exemplo, `abc-123` vira `ABC-123`, enquanto `ABC-123` e `ABC123` são diferentes. Não se aplica normalização específica de símbolos nesta etapa, nem bloqueio global de serial.

O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Tipo de Equipamento e Marca são cadastros próprios; Marca também representa Fabricante. Modelo é obrigatório e número de série é opcional.

Equipamento possui somente os status Ativo e Inativo nesta etapa. Novo Equipamento inicia Ativo. Ativo aparece normalmente para abertura de OS; Inativo não aparece como opção padrão, mas pode ser localizado com filtro para incluir inativos. Históricos antigos continuam exibindo o equipamento. Não ficam definidos nesta etapa status operacionais adicionais como vendido, descartado, baixado, emprestado, perdido ou em garantia.

Tipo de Equipamento e Marca seguem o ciclo de vida dos cadastros auxiliares: sem uso, podem ser editados, inativados ou excluídos fisicamente; já usados, podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não são opções padrão em novos equipamentos, e equipamentos antigos continuam exibindo o Tipo/Marca utilizados. Catálogo inicial de Tipo de Equipamento: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Catálogo inicial de Marca: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. São valores de cadastros próprios, não enum fixo; novos valores poderão ser adicionados. Ainda está pendente se a edição do nome de Tipo/Marca usado deve preservar um snapshot do nome anterior.

Dados textuais persistidos são convertidos para MAIÚSCULAS antes de salvar, exceto e-mail, que é salvo em minúsculas após remoção de espaços no início e no fim. Telefone e CEP são salvos somente com números; máscaras são apenas visuais. CEP é opcional. Telefone fora do formato esperado gera aviso e permite continuar; critérios técnicos finais de formato, incluindo DDD e nono dígito, permanecem pendentes. A normalização específica de telefone/CEP prevalece sobre a regra geral de caixa alta.

Equipamentos podem ser pesquisados ou filtrados por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca textual exata ou parcial; status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem com filtro para incluí-los. Pesquisa serve para localizar registros e não bloqueia cadastro; a duplicidade continua sendo verificada pela regra própria de serial. Sem serial, não há alerta nem bloqueio pela combinação proprietário + tipo + Marca + Modelo. Detalhes finais de pesquisa avançada e filtros combinados permanecem pendentes.

Na ficha do Equipamento, Tipo, Marca, Modelo ou Número de Série sem histórico podem ser corrigidos por usuário comum; com histórico, somente administrador pode alterá-los. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, a mudança deve ocorrer por transferência. Alteração de dado permanente com histórico exigirá justificativa e auditoria a serem detalhadas futuramente. Os critérios técnicos exatos de vínculo histórico, permissões finais e implementação da auditoria permanecem pendentes. Esta regra de permissão sobre a ficha não altera o ciclo de vida próprio dos cadastros auxiliares de Tipo e Marca.

Transferência de titularidade pode ocorrer manualmente fora de OS ou durante atendimento/OS. Pode ser vinculada a uma OS, mas esse vínculo é opcional. A transferência nunca altera OS antigas. O schema atual não possui entidade OS nem campo de vínculo da transferência com OS.

Permanecem pendentes a carga inicial dos catálogos auxiliares, o snapshot do nome anterior de Tipo/Marca usado, critérios técnicos de vínculo histórico, auditoria detalhada, critérios finais de validação de telefone, pesquisa avançada/filtros combinados, implementação dos snapshots de OS e permissões finais de administrador/usuários. Não há log de leitura de Aviso nesta etapa.

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
