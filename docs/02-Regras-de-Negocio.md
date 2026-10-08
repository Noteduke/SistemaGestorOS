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

O recorte usa histórico mínimo especializado com eventos `PHONE_CREATED`, `EMAIL_CREATED`, `PHONE_PRIMARY_CHANGED` e `EMAIL_PRIMARY_CHANGED`. Cada `POST` bem-sucedido registra o evento de criação; quando o principal efetivo muda, registra também o evento correspondente de principalidade, inclusive na primeira definição de principal (contato anterior nulo). `person_contact_events` registra Pessoa, tipo, telefone/e-mail relacionado, valor criado, valores anterior/novo quando aplicável e data/hora. Não é criado usuário fictício; o schema Prisma e a migration Auth criada incluem autor opcional do evento, persistido na mesma transação da alteração de contato. A migration Auth foi aplicada no banco principal; eventos anteriores à autoria permanecem com `NULL`. Criação, troca de principal e eventos ocorrem na mesma transação; falha no histórico cancela a operação. Esse histórico mínimo não substitui o histórico geral definitivo e não tem rota pública. A tabela não possui CHECK para garantir que exatamente uma FK de contato esteja preenchida e que corresponda ao tipo de evento; o service valida essa coerência.

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

Permanecem pendentes a lista final de eventos do histórico operacional básico, a lista de eventos sensíveis/auditoria, estrutura física e filtros/pesquisa/layout do histórico, contratos finais de API, implementação técnica das permissões dos módulos ainda não implementados e estratégia técnica dos seeds de catálogos. Não há log de leitura de Aviso nesta etapa.

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

### Situação operacional, status macro e resultado de encerramento

A OS possui três conceitos independentes: **situação operacional**, que indica a etapa atual do trabalho; **status macro**, que indica se a OS está aberta, fechada ou cancelada; e **status/motivo de encerramento**, que registra o resultado final. Uma OS pode passar por várias situações enquanto seu status macro permanece ABERTA. Não tratar esses três conceitos como um único campo.

As situações operacionais iniciais aprovadas são:

1. **TRIAGEM** — situação inicial obrigatória de toda OS. Na abertura, nenhuma outra situação/status operacional fica disponível. Pode ser atribuída a um ou mais funcionários.
2. **AGUARDANDO AVALIAÇÃO/ORÇAMENTO** — pode ser atribuída a um ou mais funcionários.
3. **AGUARDANDO APROVAÇÃO DO ORÇAMENTO** — por padrão atribuída ao Administrador; podem ser atribuídos outros funcionários.
4. **AUTORIZADO REPARO** — pode ser atribuída a um ou mais funcionários.
5. **AGUARDANDO COMPRA DE PEÇA** — por padrão atribuída ao Administrador; podem ser atribuídos outros funcionários.
6. **AGUARDANDO CHEGADA DE PEÇA** — por padrão atribuída ao Administrador; podem ser atribuídos outros funcionários.
7. **PRONTO AVISAR CLIENTE** — por padrão atribuída ao Administrador; podem ser atribuídos outros funcionários.
8. **PRONTO CLIENTE AVISADO** — por padrão atribuída ao Administrador; podem ser atribuídos outros funcionários.
9. **NÃO AUTORIZADO - REMONTAR EQUIPAMENTO** — pode ser atribuída a um ou mais funcionários. Ao salvar, se houver orçamento na OS, perguntar se deseja removê-lo e colocá-lo no histórico.
10. **NÃO AUTORIZADO - PRONTO PRA ENTREGA** — pode ser atribuída a um ou mais funcionários. Se ainda houver orçamento na OS ao salvar, perguntar se deseja removê-lo e colocá-lo no histórico.

As atribuições padrão ao Administrador não impedem incluir outros funcionários. Situações operacionais criadas futuramente também poderão ser atribuídas a qualquer funcionário.

Os três status macro aprovados são:

- **ABERTA:** OS que está na loja e ainda não foi fechada nem cancelada.
- **FECHADA:** OS entregue e faturada nos fluxos usuais. A OS externa encerrada como Equipamento comprado/Doado também fica FECHADA por regra específica, mesmo sem pagamento ao cliente nesta etapa; o tratamento fiscal/financeiro dessa exceção permanece pendente.
- **CANCELADA:** OS entregue sem execução do serviço e sem cobrança. É considerada encerrada para fins operacionais, mas mantém o status macro CANCELADA.

Os resultados/status-motivos de encerramento aprovados são **Devolvido sem Reparo**, **Devolvido Reparado** e **Equipamento comprado/Doado**. O último encerra a OS externa como FECHADA e aciona o fluxo de transferência e criação automática de OS interna descrito abaixo. A relação dos outros resultados com fechamento/cancelamento ainda será detalhada; nenhum deles substitui a situação operacional nem o status macro.

Cada mudança de situação e de atribuição deve gerar histórico com usuário que alterou, data/hora, OS e situação anterior/nova; registrar também funcionários atribuídos antes/depois quando aplicável. Ao salvar uma das duas situações NÃO AUTORIZADO, a decisão de remover ou manter o orçamento e colocá-lo no histórico deve ser registrada. Essa estrutura e os fluxos permanecem futuros; não implica implementação nesta etapa.

### Alteração de situação, status macro e reabertura

Depois de abrir em TRIAGEM, usuários autorizados na OS podem mudar livremente sua situação operacional para qualquer outra situação ativa disponível. Não há sequência rígida entre situações; toda mudança gera histórico. Essa liberdade não remove validações específicas: o encerramento continua bloqueado enquanto houver pendência aberta de conferência de estoque.

Somente Administrador ou usuário com permissão específica pode alterar o status macro para FECHADA ou CANCELADA. São permissões futuras sugeridas `os.close` e `os.cancel`. Mudanças de situação operacional continuam sujeitas às permissões de acesso à OS, sem exigir que o usuário tenha uma dessas permissões de status macro.

Há dois tipos distintos de reabertura:

- **Reabertura simples:** permite corrigir texto da OS — como observações, laudo, descrição, anotação interna ou texto administrativo — sem alterar status macro nem situação operacional, cancelar faturamento ou alterar pagamentos. Pode ser realizada por usuário autorizado na OS; gera histórico. Permissão futura sugerida: `os.reopen_text`.
- **Reabertura completa:** retorna a mesma OS (mesmo número) ao status macro ABERTA e à situação AGUARDANDO AVALIAÇÃO/ORÇAMENTO; não cria nova OS automaticamente. Cancela o faturamento vinculado e retira pagamentos do financeiro ativo por cancelamento, sem apagar seu rastro. Gera histórico e aviso no dashboard do Administrador. Exige Administrador ou permissão específica futura sugerida `os.reopen_full`. Exceção: após gerar a OS interna no fluxo Equipamento comprado/Doado, a OS externa original só permite reabertura simples textual.

A reabertura completa registra no histórico, no mínimo, usuário responsável, data/hora, OS, status macro e situação anteriores/novos e motivo da ação. Os eventos de pagamento e peça mantêm as referências e valores anteriores para auditoria.

Uma OS CANCELADA também pode ser reaberta completamente sob a mesma autorização. Se houver lançamento financeiro vinculado, deve ser cancelado/retirado do financeiro ativo, preservando o histórico; o dashboard do Administrador recebe aviso.

Na reabertura completa, todas as peças de estoque vinculadas à OS voltam ao estado ORÇADA, inclusive as que estavam UTILIZADAS ou BAIXADAS, até que um técnico ou usuário autorizado reavalie e atualize os itens. A mudança gera histórico com os estados anterior e novo e o motivo técnico “reabertura completa da OS”. Não se deve apagar movimentos ou históricos anteriores. A reconciliação de quantidade física/financeira para peças anteriormente BAIXADAS ainda precisa de definição técnica; o retorno do status do item a ORÇADA não define sozinho um novo movimento de estoque.

Não são permitidas transições diretas entre FECHADA e CANCELADA em nenhuma direção. Para OS que admitem reabertura completa, passar de FECHADA a CANCELADA exige reabrir completamente para ABERTA e então cancelar sob a permissão aplicável; passar de CANCELADA a FECHADA exige reabrir completamente para ABERTA, escolher a situação operacional adequada e então fechar normalmente. A OS externa encerrada como Equipamento comprado/Doado, após a criação da interna, é exceção e só admite reabertura simples textual. As permissões e o histórico correspondentes são aplicados em cada ação.

Quando pagamentos tiverem sido registrados antes da reabertura completa, o cancelamento no financeiro ativo deve preservar histórico/auditoria com, no mínimo, usuário responsável, data/hora, OS, valor cancelado, forma de pagamento quando houver, referência do lançamento anterior e motivo técnico “reabertura completa da OS”. Não apagar pagamentos sem rastro. A relação da reabertura com documentos fiscais, estornos/devoluções efetivas e valores já liquidados continua sujeita às regras financeiras específicas ainda pendentes.

Os efeitos acima são regras funcionais aprovadas; permissões citadas são sugestões futuras. Persistência, contratos de API, operações financeiras/estoque, histórico físico e avisos ainda precisam de desenho e implementação próprios.

### Encerramento como Equipamento comprado/Doado e OS interna

Quando uma OS de cliente externo for encerrada com resultado **Equipamento comprado/Doado**, a OS original fica FECHADA e o equipamento passa à Pessoa configurada como representante da própria empresa. Esse resultado define FECHADA para este fluxo específico; nenhum valor pago ao cliente é registrado nesta etapa e o efeito fiscal/financeiro da classificação fica pendente. No mesmo fluxo, o sistema abre automaticamente uma nova OS interna, vinculada ao mesmo equipamento e à Pessoa da empresa, em macrostatus ABERTA e situação TRIAGEM. A OS interna referencia obrigatoriamente a OS original, e a original referencia a OS interna. Encerramento, transferência, criação e vínculo geram histórico com usuário responsável e data/hora.

O sistema permite configurar uma única Pessoa como representante da própria empresa. Somente Administrador pode definir, remover ou trocar essa configuração; cada mudança gera histórico administrativo. A Pessoa escolhida deve estar ativa e atender aos critérios vigentes para titular de equipamento, incluindo Tipo de Contato Cliente. Se não houver Pessoa configurada, o encerramento como Equipamento comprado/Doado é bloqueado com aviso de que a configuração é obrigatória. A configuração pode ser corrigida por Administrador antes de repetir o encerramento.

Não se registra pagamento ao cliente nesse fluxo nesta etapa. Valor pago, forma de pagamento, saída financeira e compra formal do equipamento permanecem futuros; a classificação da OS como FECHADA não autoriza inferir lançamento financeiro ou documento fiscal ainda não especificado.

Após a OS interna ser criada, a original não recebe movimentações técnicas posteriores. Ela conserva o histórico da negociação/encerramento e o vínculo com a OS interna; só admite reabertura simples para correção textual conforme regra geral. A OS interna recebe os trabalhos futuros do equipamento e segue as regras normais de situação, fechamento, cancelamento e reabertura, exceto que não pode ser encerrada novamente com resultado Equipamento comprado/Doado. Esse resultado só se aplica a OS de cliente externo, evitando cadeia de OS internas.

Na OS interna, as informações herdadas ficam identificadas e consultáveis em área histórica separada dos novos campos operacionais. Incluir: número e referência da OS original; cliente original; equipamento; defeito/reclamação; observações internas; laudo técnico; orçamento anterior; peças e serviços orçados; resultado Equipamento comprado/Doado; data/hora e usuário do encerramento. Dados atuais da empresa/equipamento continuam referenciados pelos cadastros, sem transformar os dados herdados em campos operacionais ativos da nova OS.

Não copiar como itens ativos para a OS interna: cobrança, pagamentos, serviços cobrados, peças UTILIZADAS/BAIXADAS ou pendências abertas da OS original. Esses registros podem constar apenas como histórico herdado de consulta e não podem criar cobrança, pagamento, movimento de estoque, pendência financeira ou item ativo na OS interna. A operação deve preservar referências e histórico das duas OS; a garantia contra estado parcial entre fechamento, transferência e criação da OS interna requer definição técnica antes da implementação.

### Ciclo da peça vinculada à OS

- **DISPONÍVEL:** peça parada no estoque, sem previsão de uso.
- **ORÇADA:** lançamento de peça de estoque em orçamento de uma OS. Não altera o estoque nem reduz disponibilidade. Pode representar peça física existente ou previsão de compra vinculada ao estoque. Peça avulsa não integra este ciclo e segue regra própria.
- **UTILIZADA:** peça retirada do estoque, instalada ou em processo de instalação. Fica imediatamente indisponível para outra OS ou venda, mas ainda não é baixa definitiva.
- **BAIXADA:** baixa definitiva quando a OS é encerrada; a peça não está mais na empresa e representa consumo/venda na OS.

Todos os usuários autorizados na OS podem mudar uma peça de ORÇADA para UTILIZADA. A transição registra histórico com usuário, data/hora, OS, peça, status anterior e novo, além de motivo quando aplicável.

Uma peça ORÇADA que permaneça nesse estado quando orçamento, item ou OS for recusado/cancelado não gera movimentação nem impacto no estoque. O sistema altera o status do lançamento da peça na OS e preserva seu histórico; não há retorno a DISPONÍVEL porque a peça não deixou a disponibilidade real.

Peça UTILIZADA não volta automaticamente a DISPONÍVEL. Se não for usada, se for removida da OS ou se serviço/OS for cancelado, desfeito ou recusado, deve ser criada uma pendência de conferência de estoque. O técnico ou usuário operacional pode informar que a peça não foi usada, mas não pode resolver a pendência sozinho. Somente Administrador ou usuário com permissão específica de conferência pode resolvê-la. Após conferência, a peça pode voltar a DISPONÍVEL, permanecer UTILIZADA ou ser BAIXADA por motivo administrativo. A permissão futura sugerida é `stock.pending_review.resolve`.

Ao encerrar uma OS, todas as peças de estoque vinculadas que estiverem UTILIZADAS passam automaticamente para BAIXADA; peças ORÇADAS não são baixadas. Peças avulsas não geram baixa. O encerramento fica bloqueado enquanto houver qualquer pendência de conferência de estoque aberta vinculada à OS.

Essas regras funcionais não aprovam ainda tabelas, histórico físico, movimentações, endpoints, telas ou implementação de estoque; permanecem futuros.

### Peça avulsa na OS

Peça avulsa é lançada manualmente na OS para descrição, orçamento e cobrança. Não pertence ao cadastro de estoque, não tem saldo, não reserva nem reduz disponibilidade, não gera movimentação, baixa ou pendência de conferência e não percorre o ciclo DISPONÍVEL/ORÇADA/UTILIZADA/BAIXADA. É um item financeiro/descritivo da OS, de natureza diferente da peça vinculada ao estoque.

A peça avulsa permanece avulsa e não pode ser convertida em peça de estoque. Se a empresa comprar uma peça para controlá-la no estoque, deverá cadastrá-la separadamente e lançá-la na OS como peça de estoque.

A peça avulsa pode ter custo interno separado do valor cobrado ao cliente. O custo interno representa o valor pago ou estimado pela empresa; o valor cobrado integra o orçamento/cobrança da OS. Usuários autorizados na OS podem visualizar, informar e alterar o custo interno e alterar o valor cobrado, inclusive depois da aprovação do orçamento pelo cliente. A aprovação não trava esses valores. Cada alteração deve gerar histórico com, no mínimo, usuário, data/hora, OS, item/peça avulsa, campo alterado e valores anterior e novo. A diferença entre custo e valor cobrado poderá apoiar futuramente o cálculo de margem/lucro. `finance.os_costs.manage` poderá ser avaliada futuramente para relatórios gerenciais, fechamento financeiro ou controle mais restrito, mas não é requisito para visualizar ou alterar os valores do item avulso na OS.

### Alteração de valores após aprovação do orçamento

A aprovação do orçamento não congela automaticamente os valores cobrados dos itens da OS. Usuário autorizado na OS, conforme permissões do módulo, pode corrigir ou alterar o valor cobrado de peça de estoque, peça avulsa, serviço/mão de obra ou qualquer outro item cobrado, mesmo após a aprovação do cliente. A alteração não exige nova aprovação do cliente, não é bloqueada pela aprovação anterior e não exige motivo obrigatório.

Toda alteração de valor cobrado deve gerar histórico com, no mínimo, usuário, data/hora, OS, item alterado, tipo do item (peça de estoque, peça avulsa, serviço/mão de obra ou outro), campo alterado, valor anterior e valor novo. O controle dessa mudança é feito pela rastreabilidade, sem aprovação adicional obrigatória.

Os demais fluxos e estados da OS serão detalhados posteriormente neste documento.

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

As falhas consecutivas são contadas por username normalizado, inclusive quando não existe usuário. Ao atingir cinco falhas, registra-se evento no `admin_audit_log`; isso não bloqueia a conta nem impede tentativas posteriores. Uma autenticação bem-sucedida zera o contador do usuário existente. Para username inexistente, registram-se eventos no Log Administrativo para cada tentativa e, na quinta falha, para o limiar atingido, sem criar usuário ou contador persistente. No primeiro recorte a notificação será somente pelo Log Administrativo, sem envio de e-mail. Registrar IP remoto, origem e user-agent quando disponíveis, sem usar esses dados para classificar a rede interna ou externa. A política não revela ao solicitante se o username existe.

Administrador é a autoridade máxima. As permissões são granulares e atribuídas diretamente por usuário/ação, sem papel “Master” nem perfis rígidos obrigatórios para Técnico ou Usuário comum. O Backend é a autoridade final; ausência de permissão nega acesso, e uma rota protegida sem política explícita deve falhar fechada. O Frontend pode refletir permissões, como ocultar ações indisponíveis, mas não decide autorização.

Catálogo inicial aprovado para o primeiro desenho:

- Pessoas: `people.read`, `people.create`, `people.update`, `people.inactivate`, `people.reactivate`.
- Contatos: `people.contacts.read`, `people.contacts.add`.
- Avisos: `people.notice.create`, `people.notice.update`, `people.notice.delete`.
- Histórico: `people.history.read.operational`, `people.history.read.sensitive`.
- Equipamentos: `equipment.read`, `equipment.create`, `equipment.update`, `equipment.inactivate`, `equipment.reactivate`, `equipment.delete_unlinked`, `equipment.transfer_ownership`.
- Usuários: `users.read`, `users.create`, `users.update`, `users.permissions.grant`, `users.permissions.revoke`.

OS, Estoque e Financeiro terão permissões próprias; sua matriz não está fechada nesta etapa. O Log Administrativo será o único conceito de log para eventos administrativos e de segurança, com retenção inicialmente indefinida e sem exclusão automática neste primeiro desenho. Deve registrar, no mínimo, login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado, permissão concedida/revogada e alterações administrativas relevantes.

O primeiro recorte de Auth está implementado no código do Backend, já versionado localmente, ainda não enviado a origin. Ele cobre sessão opaca, login, CSRF, contagem de falhas, permissões e Log Administrativo. O bootstrap do primeiro Administrador foi concluído no banco local principal; o ambiente validado tem um Administrador ativo e 24 permissões, sem `admin.full`, `system.admin` ou perfil/usuário `Master`. A segunda execução do bootstrap foi validada para abortar antes de solicitar username e senha quando já há Administrador ativo; o controle transacional contra concorrência permanece no service, mas a concorrência real ainda não foi testada. Os testes HTTP autenticados principais passaram: login, `/auth/me`, `/people?page=1&pageSize=20` como Admin, rejeição CSRF em mutação, logout e rejeição da sessão revogada. Login e `/auth/me` retornam `publicId`, sem expor `id` interno. A listagem sem `page` e `pageSize` retorna `INVALID_PAGINATION`; não há paginação automática. O uso inicial fica restrito ao Administrador bootstrapado e não há CRUD HTTP de usuários. Não há endpoints de inativação ou rebaixamento de Administrador neste recorte; a proteção operacional do último Administrador deve ser garantida quando essas operações forem implementadas. A migration `20261008120000_auth_foundation` foi aplicada no banco principal; o seed de 24 permissões foi executado duas vezes e validado como idempotente. Estes testes validam o ambiente local, não liberam produção. Uma credencial administrativa foi exposta acidentalmente durante teste manual; Marcos decidiu não trocá-la nesta etapa, mas ela deverá ser substituída antes de uso real, em rede compartilhada, produção ou demonstração externa. O fluxo definitivo de troca/reset de senha permanece pendente. A autoria opcional de `person_contact_events` é gravada na mesma transação; eventos anteriores permanecem com `NULL`. Usuários devem ser inativados, não excluídos fisicamente; se exclusão vier a existir, a FK preserva eventos com comportamento equivalente a `ON DELETE SET NULL`. O acesso externo continua proibido até 2FA e fronteira confiável.

# 13. Evolução

Este documento crescerá continuamente durante o desenvolvimento do projeto.

Nenhuma regra importante deverá permanecer apenas em conversas.

Toda decisão aprovada deverá ser registrada aqui ou em um documento específico do módulo correspondente.
