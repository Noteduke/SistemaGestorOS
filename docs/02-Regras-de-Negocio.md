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

Não há log de leitura, registro da resposta Sim/Não, confirmação formal de ciência ou histórico de leituras nesta etapa. Usuário comum pode preencher o campo quando estiver vazio; se já houver conteúdo, não pode alterá-lo nem apagá-lo. Somente administrador pode alterar ou apagar Aviso existente e também pode adicionar conteúdo. O histórico de alterações do Aviso é sensível e restrito a administrador. A definição técnica do perfil/permissão permanece pendente; múltiplos Avisos e histórico de leituras são evolução futura.

Pessoa nunca é excluída fisicamente, mesmo sem vínculo histórico ou quando cadastrada por engano. A única saída operacional é inativar. Inativação e reativação são ações de administrador; usuário comum não pode executá-las. Pessoa inativa não aparece por padrão em novos lançamentos, pode ser localizada com o filtro “incluir inativos” e continua sendo exibida normalmente no histórico.

O proprietário atual de equipamento deve ser uma Pessoa cadastrada com Tipo de Contato Cliente. Pessoa sem esse Tipo de Contato não pode ser proprietária. Pessoa inativa não aparece como opção padrão para novo proprietário. A mesma elegibilidade se aplica ao cadastro inicial e a transferências.

Equipamento sem vínculo histórico pode ser excluído fisicamente. Com OS, transferência de titularidade, venda, orçamento, garantia, entrega ou outra movimentação operacional, comercial, financeira ou técnica, não pode ser excluído fisicamente e somente pode ser inativado. Equipamento inativo não aparece por padrão em novas OS, pode ser localizado com filtro para incluir inativos e continua sendo exibido nos históricos antigos. A elegibilidade do proprietário e as opções padrão para pessoas inativas também se aplicam a transferências.

Não haverá snapshot completo dos dados da Pessoa ou do Equipamento dentro de cada OS nesta etapa. A OS poderá consultar os dados atuais dos cadastros relacionados; alterações e movimentações relevantes devem ser registradas no histórico para permitir entender a evolução sem duplicar todos os dados cadastrais em cada OS. A OS registra a Pessoa informada no atendimento na abertura, sem exigir separação obrigatória do proprietário real do equipamento. Alterações posteriores não reescrevem eventos históricos já registrados.

Transferir titularidade é permitido. O novo proprietário deve ser Pessoa cadastrada, possuir Tipo de Contato Cliente e estar ativa para aparecer como opção padrão. A transferência altera o proprietário atual e registra evento de titularidade, sem alterar OS antigas; pode ocorrer manualmente fora de OS ou durante atendimento/OS, e pode ter vínculo opcional com uma OS. Equipamento sem histórico pode ter o proprietário corrigido sem transferência formal; com histórico, a mudança deve ser transferência. Usuário comum pode realizar a transferência e alterações de Pessoa/Equipamento mesmo com histórico, sem justificativa obrigatória; o sistema registra a mudança automaticamente no histórico e pede confirmação antes de salvar.

Número de série é opcional. Quando informado, é o principal critério de duplicidade e a validação considera o proprietário atual: serial repetido para o mesmo proprietário bloqueia o cadastro; serial repetido para proprietário diferente gera aviso, permite cadastrar outro equipamento e não sugere transferência. Serial não informado permite salvar normalmente e não dispara busca automática de duplicidade por proprietário, tipo, Marca e Modelo. O valor é armazenado em caixa alta, sem remover ou alterar espaços (inclusive no início/fim), pontos, traços, barras ou outros símbolos; por exemplo, `abc-123` vira `ABC-123`, enquanto `ABC-123` e `ABC123` são diferentes. Não se aplica normalização específica de símbolos nesta etapa, nem bloqueio global de serial.

O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Tipo de Equipamento e Marca são cadastros próprios; Marca também representa Fabricante. Modelo é obrigatório e número de série é opcional.

Equipamento possui somente os status Ativo e Inativo nesta etapa. Novo Equipamento inicia Ativo. Ativo aparece normalmente para abertura de OS; Inativo não aparece como opção padrão, mas pode ser localizado com filtro para incluir inativos. Históricos antigos continuam exibindo o equipamento. Não ficam definidos nesta etapa status operacionais adicionais como vendido, descartado, baixado, emprestado, perdido ou em garantia.

Tipo de Equipamento e Marca seguem o ciclo de vida dos cadastros auxiliares: sem uso, podem ser editados, inativados ou excluídos fisicamente; já usados, podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não são opções padrão em novos equipamentos, e equipamentos antigos continuam exibindo o Tipo/Marca utilizados. Catálogo inicial de Tipo de Equipamento: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Catálogo inicial de Marca: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. São valores de cadastros próprios, não enum fixo; novos valores poderão ser adicionados. Ainda está pendente se a edição do nome de Tipo/Marca usado deve preservar um snapshot do nome anterior.

Dados textuais persistidos são convertidos para MAIÚSCULAS antes de salvar, exceto e-mail, que é salvo em minúsculas após remoção de espaços no início e no fim. Telefone e CEP são salvos somente com números; máscaras são apenas visuais. CEP é opcional. Telefone fora do formato esperado gera aviso e permite continuar; critérios técnicos finais de formato, incluindo DDD e nono dígito, permanecem pendentes. A normalização específica de telefone/CEP prevalece sobre a regra geral de caixa alta.

Equipamentos podem ser pesquisados ou filtrados por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca textual exata ou parcial; status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem com filtro para incluí-los. Pesquisa serve para localizar registros e não bloqueia cadastro; a duplicidade continua sendo verificada pela regra própria de serial. Sem serial, não há alerta nem bloqueio pela combinação proprietário + tipo + Marca + Modelo. Detalhes finais de pesquisa avançada e filtros combinados permanecem pendentes.

Na ficha do Equipamento, usuário comum pode corrigir Tipo, Marca, Modelo e Número de Série com ou sem histórico. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, a mudança deve ocorrer por transferência. Alterações comuns não exigem justificativa obrigatória e são registradas automaticamente no histórico. Esta regra de permissão sobre a ficha não altera o ciclo de vida próprio dos cadastros auxiliares de Tipo e Marca.

Transferência de titularidade pode ocorrer manualmente fora de OS ou durante atendimento/OS. Pode ser vinculada a uma OS, mas esse vínculo é opcional. A transferência nunca altera OS antigas. O schema atual não possui entidade OS nem campo de vínculo da transferência com OS.

Permanecem pendentes a carga inicial dos catálogos auxiliares, o snapshot do nome anterior de Tipo/Marca usado, critérios técnicos de vínculo histórico, lista final de eventos do histórico operacional básico, lista de eventos sensíveis/auditoria, estrutura técnica do histórico, filtros/pesquisa/layout do histórico, permissões finais e perfil técnico de administrador, critérios finais de validação de telefone e pesquisa avançada/filtros combinados. Não há log de leitura de Aviso nesta etapa.

## Histórico e permissões iniciais de Cadastros

Não será adotado snapshot completo da Pessoa ou do Equipamento dentro de cada OS. O histórico registra alterações de campo e eventos/movimentações relevantes de Pessoa, Equipamento, OS e entidades relacionadas, sem duplicar todos os dados cadastrais em cada OS. A OS poderá consultar cadastros atuais, e o histórico permitirá acompanhar mudanças ocorridas ao longo do tempo.

O histórico comporta dois tipos principais: **alteração de campo**, quando há valor anterior e novo valor; e **evento/movimentação**, quando a ação relevante não é apenas troca de valor. Quando aplicável, a alteração registra entidade, campo, valor anterior, novo valor, data/hora e usuário responsável quando o módulo de usuários estiver definido. Exemplos de alteração são Modelo do Equipamento `LATITUDE 3490` → `LATITUDE 3400`, telefone da Pessoa `21999990000` → `2126733006` e Aviso `CLIENTE RETIRA COM TERMO` → vazio. Eventos incluem, por exemplo, adicionar/remover telefone ou endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade e cancelar OS. A transferência pode registrar proprietário anterior e novo. Exemplos não fecham a lista final de eventos.

O histórico é exibido no contexto da entidade: no cadastro de Pessoa, no cadastro de Equipamento e dentro da OS. Usuário comum pode ver o histórico operacional básico de Pessoa, Equipamento e OS. Administrador pode ver o histórico completo, inclusive dados sensíveis e auditoria. Histórico de Aviso e histórico técnico/auditoria são restritos ao administrador; detalhes sobre quais eventos são básicos/sensíveis permanecem pendentes. Uma visão administrativa geral poderá existir futuramente.

Usuário comum pode criar Pessoa e Equipamento, alterar os demais dados cadastrais mesmo quando já houver histórico e transferir titularidade. Essa permissão não inclui inativar/reativar Pessoa ou Equipamento nem alterar/apagar Aviso existente. Alterações comuns não exigem justificativa obrigatória e são registradas automaticamente. Antes de salvar alteração em Pessoa ou Equipamento, o sistema apresenta: “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra; cancelar não salva. O histórico registra valores anterior e novo quando aplicável, data/hora e usuário quando disponível.

Pessoa nunca pode ser excluída fisicamente. Usuário comum não pode inativar nem reativar Pessoa; administrador pode inativar e reativar. Equipamento pode ser excluído fisicamente somente por administrador e somente sem qualquer vínculo histórico; usuário comum não pode excluir. Com vínculo histórico, financeiro, comercial ou técnico, Equipamento não pode ser excluído e só pode ser inativado por administrador. Apenas administrador pode inativar ou reativar Equipamento. Equipamento inativo fica fora das opções padrão de nova OS e pode ser localizado com filtro de inativos.

Usuário comum pode preencher Aviso vazio, mas não alterar/apagar Aviso existente nem visualizar histórico sensível. Administrador pode criar e alterar Pessoa/Equipamento, transferir titularidade, inativar/reativar Pessoa e Equipamento, excluir Equipamento sem histórico, preencher/alterar/apagar Aviso e visualizar histórico completo. A matriz orienta a regra funcional inicial; perfis técnicos e permissões finais dependem do módulo de segurança/usuários.

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
