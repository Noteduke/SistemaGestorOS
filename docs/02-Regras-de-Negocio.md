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

Dados textuais persistidos devem ser convertidos para MAIÚSCULAS no Backend antes de salvar, salvo exceção aprovada. E-mail é salvo em minúsculas após remover espaços no início e no fim, e a comparação de duplicidade usa minúsculas. Telefone e CEP são salvos somente com números; suas máscaras existem apenas na interface. CEP não é obrigatório. Telefone com 10 dígitos é aceito como fixo brasileiro; com 11 dígitos é aceito como celular se o primeiro dígito após o DDD for 9. Menos de 10, mais de 11 até 32 ou celular de 11 dígitos sem nono dígito geram aviso; após confirmação do operador, pode continuar. Telefone sem dígitos ou com mais de 32 é bloqueado no recorte aprovado. CPF/CNPJ segue a regra específica já definida. Essas normalizações são comportamento da aplicação, não alteração ou garantia do schema atual.

Administrador é o conceito máximo do sistema e possui poderes máximos. Técnico e Usuário comum são designações operacionais, não perfis rígidos; permissões são concedidas por usuário/ação. Uma ação indicada como restrita ao Administrador também pode ser executada por usuário com permissão explícita equivalente. Master não é um conceito ou papel do Sistema Gestor OS.

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

Cada Pessoa pode ter no máximo um telefone principal, um e-mail principal e um endereço principal, independentemente do Tipo do endereço. Uma coleção vazia ou com registros pode não ter principal. Ao marcar um registro como principal, o anterior da mesma coleção é desmarcado; remover ou inativar o principal pode deixar a coleção sem principal. É permitido ter vários endereços do mesmo Tipo de Endereço.

### Telefones e e-mails da Pessoa — recorte implementado

Telefones e e-mails são sub-recursos de Pessoa. O recorte permite apenas adicionar e listar cada coleção; edição, remoção e inativação de telefone/e-mail e edição geral de Pessoa permanecem fora. As rotas estão implementadas. O campo físico `label` não é aceito nem retornado e permanece nulo/sem uso. Telefones e e-mails têm `public_id` único para identificação nas respostas, sem expor `id` interno.

Telefone é obrigatório ao adicionar um telefone e será salvo somente com dígitos, com limite máximo de 32 dígitos. Valor vazio ou sem dígitos é inválido. Dez dígitos são aceitos como fixo brasileiro; onze dígitos são aceitos como celular brasileiro quando o primeiro dígito após o DDD é 9. Menos de dez, mais de onze até 32, ou onze dígitos sem esse 9 geram aviso não bloqueante: a API não grava sem `confirmNonstandardPhone: true` e retorna `409 PHONE_CONFIRMATION_REQUIRED` com mensagem, número normalizado e aviso `PHONE_NONSTANDARD_FORMAT`. No reenvio confirmado, pode gravar e registrar histórico. Mais de 32 dígitos são bloqueados mesmo com confirmação. A validação pertence ao Backend.

E-mail é obrigatório ao adicionar um e-mail; é salvo em minúsculas após `trim`, deve ser ASCII e tem limite de 254 caracteres. Exige exatamente um `@`; a parte local tem até 64 caracteres e aceita letras minúsculas, dígitos e `_ % + -`, com pontos somente entre segmentos não vazios. O domínio tem até 253 caracteres, pelo menos dois rótulos separados por ponto; cada rótulo tem 1 a 63 caracteres, aceita letras minúsculas, dígitos ou hífen e começa/termina por letra ou dígito. Formato inválido retorna `400 INVALID_EMAIL`. Não há verificação de existência da caixa postal nem de DNS/domínio. O mesmo e-mail normalizado na mesma Pessoa é bloqueado (`409 DUPLICATE_PERSON_EMAIL`); em Pessoas diferentes é gravado no primeiro envio válido, com aviso não bloqueante `EMAIL_SHARED_ACROSS_PEOPLE`, sem nova confirmação. O aviso não revela dados da outra Pessoa. Isso não altera o bloqueio de CPF/CNPJ repetido nem a regra de aviso de possível Pessoa duplicada sem documento.

Cada coleção pode permanecer sem principal. Criar um contato marcado como principal desmarca o principal anterior da mesma Pessoa e coleção, em transação, sem afetar a principalidade da outra coleção. Índices funcionais únicos no MySQL impedem dois principais simultâneos da mesma coleção para a mesma Pessoa, mantendo permitidos vários não principais. Pessoa inativa pode ter seus telefones/e-mails listados, mas não receber novos contatos; deve ser reativada antes, conforme as permissões futuras.

Adicionar telefone/e-mail a Pessoa existente é alteração cadastral. Todo `POST` exige `confirmPersonChange: true`; sem esse campo verdadeiro, a API não grava nem cria evento e retorna `409 PERSON_CHANGE_CONFIRMATION_REQUIRED`. Isso torna a confirmação explícita no contrato, mas não substitui autenticação nem prova, sozinho, que uma interface mostrou a mensagem ao operador. O telefone fora do padrão exige também `confirmNonstandardPhone: true`.

O recorte usa histórico mínimo especializado com eventos `PHONE_CREATED`, `EMAIL_CREATED`, `PHONE_PRIMARY_CHANGED` e `EMAIL_PRIMARY_CHANGED`. Cada `POST` bem-sucedido registra o evento de criação; quando o principal efetivo muda, registra também o evento correspondente de principalidade, inclusive na primeira definição de principal (contato anterior nulo). `person_contact_events` registra Pessoa, tipo, telefone/e-mail relacionado, valor criado, valores anterior/novo quando aplicável e data/hora. Não é criado usuário fictício; os eventos atuais não têm autor enquanto a autenticação não for implementada. No primeiro recorte de Auth, o ator autenticado será gravado opcionalmente na mesma transação da alteração de contato. Criação, troca de principal e eventos ocorrem na mesma transação; falha no histórico cancela a operação. Esse histórico mínimo não substitui o histórico geral definitivo e não tem rota pública. A tabela não possui CHECK para garantir que exatamente uma FK de contato esteja preenchida e que corresponda ao tipo de evento; o service valida essa coerência.

O catálogo inicial de Tipos de Endereço contém Principal, Cobrança, Entrega e Instalação. São valores de cadastro próprio, não uma enumeração fixa. Cada endereço deve ter um Tipo de Endereço e pode também ser marcado como principal. Uma Pessoa pode ter vários endereços, inclusive vários do mesmo Tipo; o Tipo classifica o endereço, mas não limita sua quantidade.

Os campos obrigatórios mínimos para salvar uma Pessoa são Tipo de Pessoa (PF ou PJ) e Nome/Razão Social. Todos os demais campos são opcionais no cadastro geral, salvo exigências específicas de fluxos futuros, como emissão fiscal. Além das regras de CPF/CNPJ descritas a seguir, não ficam estabelecidas outras obrigatoriedades ou formatos para os novos campos nesta etapa.

CPF/CNPJ é opcional no cadastro geral. CPF aplica-se a PF e, quando informado, é armazenado somente com números, deve possuir 11 dígitos e ser matematicamente válido. CNPJ aplica-se a PJ e aceita o formato numérico antigo ou o formato alfanumérico oficial da Receita Federal; quando informado, é armazenado sem pontuação, com letras em maiúsculas, e validado matematicamente conforme o algoritmo aplicável. CPF ou CNPJ informado deve ser único e compatível com o Tipo de Pessoa. A máscara é aplicada apenas na interface. Normalização, validação matemática, compatibilidade e duplicidade são regras do Backend/API; a validação visual do Frontend não é autoridade final.

Exemplos de armazenamento canônico: CPF `123.456.789-09` → `12345678909`; CNPJ numérico `12.345.678/0001-90` → `12345678000190`; CNPJ alfanumérico `00.000.000/E08G-12` → `00000000E08G12`. Ao normalizar CNPJ, a aplicação remove pontuação, preserva letras e converte-as para maiúsculas; não pode eliminar letras como se fossem caracteres inválidos.

Nome Fantasia aplica-se a PJ e é opcional. Para exibição, se a PJ não tiver Nome Fantasia, usa-se a Razão Social como referência principal. Nome Fantasia não se aplica a PF.

Inscrição Estadual e Inscrição Municipal são opcionais e aplicam-se principalmente a PJ. Nesta etapa não há validação fiscal específica por estado ou município; o valor informado é armazenado sem interpretação fiscal complexa.

Tipo de Contribuinte será uma classificação de cadastro próprio, opcional no cadastro geral de Pessoa e obrigatória quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). Não é obrigatório para OS sem emissão fiscal nem, inicialmente, para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.

Os catálogos auxiliares deste cadastro seguem uma regra geral: uma opção ainda não vinculada pode ser editada, inativada ou excluída; uma opção já utilizada pode ser editada ou inativada, mas não excluída fisicamente. Opções inativas não são oferecidas por padrão em novos cadastros e continuam válidas para registros históricos. A edição de nome após uso é permitida; o cadastro exibe o nome atual, enquanto o histórico registra o valor anterior e o novo, data/hora e usuário responsável quando disponível. Uma regra específica aprovada para determinado catálogo poderá substituir esta regra geral.

CPF ou CNPJ informado é um critério forte de identidade; se já estiver cadastrado para outra Pessoa, bloqueia o novo cadastro. Como regra de negócio aprovada, quando não houver CPF/CNPJ a possível duplicidade será verificada por comparação exata normalizada de Nome/Razão Social (caixa alta e remoção de espaços extras), telefone (somente números) e e-mail (minúsculas após trim). Correspondência exata em qualquer desses dados gera aviso não bloqueante; o operador pode continuar. A implementação atual da criação de Pessoa aplica o aviso por nome; as verificações por telefone/e-mail ainda são futuras. Busca aproximada/fuzzy está fora desta etapa.

Observações são informação passiva do cadastro. Aviso é um único campo informativo da Pessoa. Nos contextos aprovados — visualizar o cadastro, abrir OS para a Pessoa e realizar venda para ela — se houver Aviso, o sistema pergunta: “Há informação a ser visualizada. Deseja visualizar agora?”. O conteúdo só é exibido se o operador escolher Sim. Se escolher Não, o sistema mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua normalmente. A pergunta ocorre a cada ocorrência do contexto, sem dispensa por sessão, atendimento ou usuário. O conteúdo nunca é exibido automaticamente na tela.

Não há log de leitura, registro da resposta Sim/Não, confirmação formal de ciência ou histórico de leituras nesta etapa. Usuário com permissão pode preencher o campo quando estiver vazio; alterar ou apagar Aviso existente e consultar seu histórico sensível exige Administrador ou permissão explícita equivalente. Múltiplos Avisos e histórico de leituras são evolução futura.

Pessoa nunca é excluída fisicamente, mesmo sem vínculo histórico ou quando cadastrada por engano. A única saída operacional é inativar. Inativação e reativação exigem Administrador ou permissão explícita equivalente. Pessoa inativa não aparece por padrão, pode ser localizada pelo filtro “incluir inativos” e consultada, mas não pode ser usada em novos vínculos operacionais, inclusive OS, venda ou como proprietária de novo Equipamento. Reativação é necessária antes de voltar a usá-la; históricos antigos continuam exibindo a Pessoa.

O proprietário atual de equipamento deve ser uma Pessoa cadastrada com Tipo de Contato Cliente. Pessoa sem esse Tipo de Contato não pode ser proprietária. Pessoa inativa não pode ser usada em novos vínculos nem como novo proprietário. A mesma elegibilidade se aplica ao cadastro inicial e a transferências.

Equipamento sem vínculo histórico pode ser excluído fisicamente por Administrador ou usuário com permissão equivalente. Há vínculo histórico se existir qualquer registro persistido relacionado ao Equipamento, incluindo OS, venda, orçamento, garantia, entrega/devolução, transferência de titularidade, movimentação técnica, financeiro ou histórico/auditoria. Com qualquer vínculo, não pode ser excluído fisicamente e somente pode ser inativado por Administrador ou permissão equivalente. Equipamento inativo não aparece por padrão em novas OS e continua sendo exibido nos históricos antigos.

Não haverá snapshot completo dos dados da Pessoa ou do Equipamento dentro de cada OS nesta etapa. A OS poderá consultar os dados atuais dos cadastros relacionados; alterações e movimentações relevantes devem ser registradas no histórico para permitir entender a evolução sem duplicar todos os dados cadastrais em cada OS. A OS registra a Pessoa informada no atendimento na abertura, sem exigir separação obrigatória do proprietário real do equipamento. Alterações posteriores não reescrevem eventos históricos já registrados.

Transferir titularidade é permitido. O novo proprietário deve ser Pessoa cadastrada, possuir Tipo de Contato Cliente e estar ativa. A transferência altera o proprietário atual e registra evento de titularidade, sem alterar OS antigas; pode ocorrer manualmente fora de OS ou durante atendimento/OS, e pode ter vínculo opcional com uma OS. Equipamento sem histórico pode ter o proprietário corrigido sem transferência formal; com histórico, a mudança deve ser transferência. Usuários com permissão para essas ações podem transferir e alterar Pessoa/Equipamento com ou sem histórico, sem justificativa obrigatória; o sistema registra a mudança automaticamente no histórico e pede confirmação antes de salvar.

Número de série é opcional. Quando informado, é o principal critério de duplicidade e a validação considera o proprietário atual: serial repetido para o mesmo proprietário bloqueia o cadastro; serial repetido para proprietário diferente gera aviso, permite cadastrar outro equipamento e não sugere transferência. Serial não informado permite salvar normalmente e não dispara busca automática de duplicidade por proprietário, tipo, Marca e Modelo. O valor é armazenado em caixa alta, sem remover ou alterar espaços (inclusive no início/fim), pontos, traços, barras ou outros símbolos; por exemplo, `abc-123` vira `ABC-123`, enquanto `ABC-123` e `ABC123` são diferentes. Não se aplica normalização específica de símbolos nesta etapa, nem bloqueio global de serial.

O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Tipo de Equipamento e Marca são cadastros próprios; Marca também representa Fabricante. Modelo é obrigatório e número de série é opcional.

Equipamento possui somente os status Ativo e Inativo nesta etapa. Novo Equipamento inicia Ativo. Ativo aparece normalmente para abertura de OS; Inativo não aparece como opção padrão, mas pode ser localizado com filtro para incluir inativos. Históricos antigos continuam exibindo o equipamento. Não ficam definidos nesta etapa status operacionais adicionais como vendido, descartado, baixado, emprestado, perdido ou em garantia.

Tipo de Equipamento e Marca seguem o ciclo de vida dos cadastros auxiliares: sem uso, podem ser editados, inativados ou excluídos fisicamente; já usados, podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não são opções padrão em novos equipamentos, e equipamentos antigos continuam exibindo a referência ao cadastro, cujo nome atual pode mudar. O histórico registra renomeações com valor anterior e novo, data/hora e usuário quando disponível; isso não cria snapshot completo em cada equipamento ou OS. Catálogo inicial de Tipo de Equipamento: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Catálogo inicial de Marca: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. São valores de cadastros próprios, não enum fixo; novos valores poderão ser adicionados.

Dados textuais persistidos são convertidos para MAIÚSCULAS antes de salvar, exceto e-mail, que é salvo em minúsculas após remoção de espaços no início e no fim. Telefone e CEP são salvos somente com números; máscaras são apenas visuais. CEP é opcional. Telefone com 10 dígitos é aceito como fixo brasileiro; 11 dígitos são aceitos como celular se o primeiro após o DDD for 9. Menos de 10, mais de 11 até 32 ou celular sem nono dígito gera aviso, mas permite continuar após confirmação. Sem dígitos ou acima de 32, o telefone é bloqueado no recorte aprovado. A normalização específica de telefone/CEP prevalece sobre a regra geral de caixa alta.

Equipamentos podem ser pesquisados ou filtrados por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca textual exata ou parcial; status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem com filtro para incluí-los. Pesquisa serve para localizar registros e não bloqueia cadastro; a duplicidade continua sendo verificada pela regra própria de serial. Sem serial, não há alerta nem bloqueio pela combinação proprietário + tipo + Marca + Modelo. Detalhes finais de pesquisa avançada e filtros combinados permanecem pendentes.

Usuários com permissão para editar Equipamento podem corrigir Tipo, Marca, Modelo e Número de Série com ou sem histórico. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, a mudança deve ocorrer por transferência. Alterações não exigem justificativa obrigatória e são registradas automaticamente no histórico. Esta regra de permissão sobre a ficha não altera o ciclo de vida próprio dos cadastros auxiliares de Tipo e Marca.

Transferência de titularidade pode ocorrer manualmente fora de OS ou durante atendimento/OS. Pode ser vinculada a uma OS, mas esse vínculo é opcional. A transferência nunca altera OS antigas. O schema atual não possui entidade OS nem campo de vínculo da transferência com OS.

Os catálogos iniciais serão carregados por seed idempotente, executado por comando controlado; não será executado automaticamente na inicialização do Backend. A execução repetida não duplica valores, cria os ausentes, usa identificadores estáveis quando aplicável e não desfaz renomeações manuais permitidas.

O sistema terá histórico geral por entidade, capaz conceitualmente de registrar alterações de campo e eventos/movimentações, valores anterior e novo quando aplicável, entidade afetada, data/hora e usuário responsável quando disponível. A estrutura física permanece pendente de modelagem.

Permanecem pendentes a lista final de eventos do histórico operacional básico, a lista de eventos sensíveis/auditoria, estrutura física e filtros/pesquisa/layout do histórico, contratos finais de API, implementação técnica das permissões e estratégia técnica do seed. Não há log de leitura de Aviso nesta etapa.

## Histórico e permissões iniciais de Cadastros

Não será adotado snapshot completo da Pessoa ou do Equipamento dentro de cada OS. O histórico registra alterações de campo e eventos/movimentações relevantes de Pessoa, Equipamento, OS e entidades relacionadas, sem duplicar todos os dados cadastrais em cada OS. A OS poderá consultar cadastros atuais, e o histórico permitirá acompanhar mudanças ocorridas ao longo do tempo.

O histórico comporta dois tipos principais: **alteração de campo**, quando há valor anterior e novo valor; e **evento/movimentação**, quando a ação relevante não é apenas troca de valor. Quando aplicável, a alteração registra entidade, campo, valor anterior, novo valor, data/hora e usuário responsável quando o módulo de usuários estiver definido. Exemplos de alteração são Modelo do Equipamento `LATITUDE 3490` → `LATITUDE 3400`, telefone da Pessoa `21999990000` → `2126733006` e Aviso `CLIENTE RETIRA COM TERMO` → vazio. Eventos incluem, por exemplo, adicionar/remover telefone ou endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade e cancelar OS. A transferência pode registrar proprietário anterior e novo. Exemplos não fecham a lista final de eventos.

O histórico é exibido no contexto da entidade: no cadastro de Pessoa, no cadastro de Equipamento e dentro da OS. Usuários com permissão correspondente podem ver o histórico operacional básico de Pessoa, Equipamento e OS. Administrador pode ver o histórico completo, inclusive dados sensíveis e auditoria. Histórico de Aviso e histórico técnico/auditoria exigem Administrador ou permissão explícita equivalente; detalhes sobre quais eventos são básicos/sensíveis permanecem pendentes. Uma visão administrativa geral poderá existir futuramente.

Técnico e Usuário comum não são perfis rígidos; as permissões são atribuídas por usuário/ação. Usuários com permissões correspondentes podem criar e alterar Pessoa e Equipamento mesmo quando já houver histórico e transferir titularidade. Inativar/reativar Pessoa ou Equipamento, excluir Equipamento sem vínculo e alterar/apagar Aviso existente exigem Administrador ou permissão explícita equivalente; Administrador tem poderes máximos. Alterações não exigem justificativa obrigatória e são registradas automaticamente. Antes de salvar alteração em Pessoa ou Equipamento, o sistema apresenta: “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra; cancelar não salva. O histórico registra valores anterior e novo quando aplicável, data/hora e usuário responsável quando disponível.

Pessoa nunca pode ser excluída fisicamente. Inativação/reativação de Pessoa ou Equipamento e exclusão de Equipamento sem vínculo exigem Administrador ou permissão explícita equivalente. Equipamento com qualquer registro persistido relacionado não pode ser excluído fisicamente; com vínculo, somente pode ser inativado/reativado por autorização correspondente. Equipamento inativo fica fora das opções padrão de nova OS e pode ser localizado com filtro de inativos.

Usuários com permissão podem preencher Aviso vazio; alterar/apagar Aviso existente e visualizar histórico sensível também exige a permissão correspondente. Administrador tem poderes máximos. Técnico e Usuário comum não possuem poderes fixos por designação; as permissões são atribuídas por usuário/ação e o módulo técnico permanece futuro.

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

# 12. Usuários, autenticação e autorização

Usuários do Sistema Gestor OS são contas distintas dos cadastros de Pessoa. O identificador de login será username obrigatório e único: após `trim`, será armazenado em minúsculas, terá de 3 a 50 caracteres e obedecerá a `^[a-z0-9._-]{3,50}$`. E-mail de contato de Pessoa não é identificador de login, pois pode ser compartilhado. Contas serão criadas somente por Administrador, sem auto-registro público. O primeiro recorte não terá CRUD HTTP de usuários e o uso inicial ficará restrito ao Administrador criado por bootstrap controlado. O sistema não pode permitir qualquer alteração que deixe zero Administradores ativos; `isAdmin` representa o nível máximo. O bootstrap aborta se já houver Administrador ativo, não promove conta existente, usa transação com controle efetivo de concorrência para impedir execuções simultâneas e registra o evento no Log Administrativo.

A autenticação do aplicativo web usará sessão opaca mantida no servidor. O cookie contém somente o segredo opaco; o banco deverá armazenar somente o hash desse segredo. JWT e provedor externo OIDC ficam fora do recorte atual. A sessão expira após 8 horas de inatividade; cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não haverá limite absoluto de duração da sessão no primeiro recorte. Sessões podem ser revogadas, simultâneas e auditadas; logout revoga somente a sessão atual. Um recurso para encerrar todas as sessões poderá ser considerado futuramente. Cookies devem usar `HttpOnly`, `Secure` em ambiente HTTPS e política `SameSite` adequada. Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`), inclusive login, exigem CSRF; `GET` não exige token. Antes do login, `GET /api/v1/auth/csrf` cria contexto temporário, retorna token e grava identificador opaco em cookie `HttpOnly` por 15 minutos. Login envia o token em `X-CSRF-Token`; após sucesso, o contexto pré-login é descartado e a sessão usa seu próprio controle CSRF.

Neste momento, o sistema será considerado somente de uso interno e o Backend não está pronto para exposição externa operacional. Não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos para classificar a rede. Acesso externo continua proibido até 2FA e fronteira confiável estarem implementados. Proxy reverso, VPN, túnel ou publicação externa no futuro exigirá nova decisão documental. O método e a recuperação do segundo fator continuam pendentes.

A senha terá no mínimo 10 caracteres, será armazenada com Argon2id e não exigirá troca periódica. Recuperação de senha fica fora do primeiro recorte; troca manual por Administrador pode ser considerada em etapa posterior.

As falhas consecutivas são contadas por username normalizado, inclusive quando não existe usuário. Ao atingir cinco falhas, registra-se evento no `admin_audit_log`; isso não bloqueia a conta nem impede tentativas posteriores. Uma autenticação bem-sucedida zera o contador do usuário existente. Para username inexistente, registra-se somente o evento da tentativa, sem criar usuário ou contador persistente. No primeiro recorte a notificação será somente pelo Log Administrativo, sem envio de e-mail. Registrar IP remoto, origem e user-agent quando disponíveis, sem usar esses dados para classificar a rede interna ou externa. A política não revela ao solicitante se o username existe.

Administrador é a autoridade máxima. As permissões são granulares e atribuídas diretamente por usuário/ação, sem papel “Master” nem perfis rígidos obrigatórios para Técnico ou Usuário comum. O Backend é a autoridade final; ausência de permissão nega acesso, e uma rota protegida sem política explícita deve falhar fechada. O Frontend pode refletir permissões, como ocultar ações indisponíveis, mas não decide autorização.

Catálogo inicial aprovado para o primeiro desenho:

- Pessoas: `people.read`, `people.create`, `people.update`, `people.inactivate`, `people.reactivate`.
- Contatos: `people.contacts.read`, `people.contacts.add`.
- Avisos: `people.notice.create`, `people.notice.update`, `people.notice.delete`.
- Histórico: `people.history.read.operational`, `people.history.read.sensitive`.
- Equipamentos: `equipment.read`, `equipment.create`, `equipment.update`, `equipment.inactivate`, `equipment.reactivate`, `equipment.delete_unlinked`, `equipment.transfer_ownership`.
- Usuários: `users.read`, `users.create`, `users.update`, `users.permissions.grant`, `users.permissions.revoke`.

OS, Estoque e Financeiro terão permissões próprias; sua matriz não está fechada nesta etapa. O Log Administrativo será o único conceito de log para eventos administrativos e de segurança, com retenção inicialmente indefinida e sem exclusão automática neste primeiro desenho. Deve registrar, no mínimo, login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado, permissão concedida/revogada e alterações administrativas relevantes.

Os eventos de `person_contact_events` terão vínculo opcional com o usuário executor no primeiro recorte de Auth; eventos existentes permanecem com `NULL`, e a gravação do ator ocorre na mesma transação da alteração do contato. Usuários não devem ser excluídos fisicamente, mas inativados. Se exclusão física vier a existir, o comportamento preferencial da FK é equivalente a `ON DELETE SET NULL`, preservando o evento. As sete rotas atuais de Pessoa e contatos deverão exigir autenticação e autorização no primeiro recorte de implementação de Auth; permanecem impróprias para produção enquanto não forem protegidas.

# 13. Evolução

Este documento crescerá continuamente durante o desenvolvimento do projeto.

Nenhuma regra importante deverá permanecer apenas em conversas.

Toda decisão aprovada deverá ser registrada aqui ou em um documento específico do módulo correspondente.
