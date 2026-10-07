# Especificação Consolidada — Sistema Gestor OS

**Fonte exclusiva:** `conversa.md` fornecida para a reconstrução.  
**Natureza:** consolidação de decisões aprovadas e informações expressamente definidas na conversa.  
**Estado:** reconstrução documental; não significa que os requisitos estejam implementados, validados ou publicados.  
**Observação:** os identificadores RN/DA/RF/RNF abaixo são mantidos quando encontrados. A conversa reutiliza alguns números RN em assuntos diferentes; não foram renumerados aqui.

## Índice provisório da primeira leitura

1. Visão, objetivos e escopo
2. Fluxo, estado, status e operação da Ordem de Serviço
3. Clientes, contatos e equipamentos
4. Orçamentos, serviços, itens e garantia
5. Estoque, produtos e compras
6. Vendas, faturamento e financeiro
7. Usuários, segurança, permissões e auditoria
8. Interface, navegação, portal mobile e comunicação
9. Cadastros, configurações e parâmetros
10. Relatórios, consultas, lembretes e notificações
11. Integrações e documentos fiscais
12. Modelo de dados, API e arquitetura
13. Requisitos não funcionais, operação e backup
14. Lacunas, conflitos e decisões pendentes

Este índice foi estabelecido antes da redação após a leitura da estrutura completa da conversa. Ao final, cada tópico foi conferido contra a documentação e a cobertura é indicada no capítulo “Revisão de cobertura”.

## 1. Visão, objetivos e escopo

### 1.1 Propósito

O Sistema Gestor OS destina-se à gestão da assistência técnica da NoteDuke. Seu núcleo é a Ordem de Serviço, com gestão de clientes e equipamentos, execução técnica, estoque, compras, vendas e financeiro integrados.

O sistema substitui um aplicativo desktop baseado em MDB que, embora funcionalmente útil, apresenta lentidão severa com bases grandes e limita a incorporação de novos recursos. A motivação aprovada é superar essas limitações de desempenho e evolução. A forma web/responsiva aparece posteriormente como decisão tecnológica aprovada.

### 1.2 Usuários iniciais e papéis operacionais

A operação inicialmente informada tem quatro funcionários: um diretor e três técnicos. O cadastro de usuários é aprovado. A atribuição de técnico responsável à OS é opcional, pois a operação pode não necessitar desse controle em todos os atendimentos.

O produto deve comportar evolução de usuários e permissões sem presumir que os quatro usuários iniciais sejam o limite definitivo.

### 1.3 Escopo funcional consolidado

Os domínios aprovados ou explicitamente previstos incluem:

- OS, triagem, avaliação, autorização, execução, entrega e garantia;
- pessoas/clientes, contatos, equipamentos, produtos, serviços e cadastros auxiliares;
- estoque, solicitações/pedidos de compra, vendas, propostas comerciais e faturamentos;
- contas a receber e a pagar, recebimentos, pagamentos, condições e formas de pagamento;
- importação de NF-e/XML, boletos, integrações financeiras, logísticas e Dell;
- relatórios, dashboard, anexos, QR Code, portal mobile, comunicação e auditoria.

Nem toda funcionalidade mencionada está detalhada o suficiente para implementação. O capítulo de pendências registra as lacunas. O roadmap e a priorização da V1 não são reconstruídos integralmente como cronograma, pois a conversa contém planejamento e ideias de fases que variam ao longo do tempo.

## 2. Ordem de Serviço

### 2.1 Fluxo operacional

O atendimento começa quando o cliente traz um equipamento e informa o defeito/reclamação. Na maior parte dos casos, a equipe avalia o equipamento diante do cliente e prepara o orçamento na recepção. Quando não for possível avaliar de imediato, o equipamento pode entrar em triagem para encaminhamento.

Triagem identifica o setor de avaliação/destino: Laboratório de Sistemas (informática convencional, por exemplo travamento, memória ou SSD) ou Laboratório Eletrônico (indícios de defeito eletrônico, por exemplo equipamento que não liga). O encaminhamento pode mudar após avaliação. Setor/destino físico e situação/status da OS são conceitos distintos.

Após autorização, o equipamento segue para o laboratório adequado. O técnico determina o trabalho, solicita peças quando necessário, executa e testa o reparo. A equipe informa o cliente; quando ele retorna, testa o equipamento no balcão, a OS de saída é emitida, o valor é cobrado conforme o caso e o equipamento é entregue. A conclusão técnica não equivale ao encerramento administrativo/financeiro.

### 2.2 Status configuráveis e estado da OS

As situações/status operacionais são cadastráveis, não uma lista fixa imposta pelo sistema. Exemplos citados incluem Triagem, Avaliação do Laboratório Eletrônico, Avaliação do Laboratório de Sistemas, Autorizado Reparo em Laboratório Eletrônico/Sistemas, Aguardando Peças em cada laboratório, Pronto/cliente avisado e Equipamento sem reparo/cliente avisado.

O cadastro de status configura propriedades funcionais, incluindo:

- se o status permite abertura de OS;
- se indica equipamento/serviço pronto;
- se pode permitir o encerramento;
- se representa OS concluída ou não concluída;
- se o encerramento nesse status deve gerar cobrança/contas a receber.

Na configuração atual descrita, Triagem é situação permitida para abertura. A OS não pode ser encerrada em Triagem nem enquanto estiver em status de reparo/avaliação incompatível com entrega. Um status que permite fechamento deve representar uma condição operacional apropriada, por exemplo pronto e cliente avisado, ou sem reparo e cliente avisado.

“Estado da OS” (aberta, concluída ou cancelada) é separado do status operacional configurável. A situação operacional descreve o ponto do fluxo; o estado descreve a condição administrativa da OS. Conclusão técnica, prontidão, encerramento administrativo e cancelamento são eventos/conceitos separados.

### 2.3 Abertura e dados

Na abertura, seleciona-se o cliente por pesquisa parcial ou total de nome, CPF/CNPJ, telefone ou outros termos definidos para a pesquisa. É possível cadastrar cliente durante o fluxo. O sistema mostra equipamentos associados ao cliente para selecionar um existente ou cadastrar outro.

Dados da OS incluem cliente e equipamento; tipo, Marca (que representa também o fabricante), modelo e número de série/asset tag; bateria (campo textual livre, podendo registrar presente, ausente, serial ou observação); acessórios; estado geral/observações de entrada; defeito e reclamação informados pelo cliente; prioridade (normal, urgente, muito urgente ou baixa prioridade); técnico responsável opcional; e um ou dois campos personalizados previstos no levantamento inicial. A reclamação do cliente inicia vazia em cada nova OS. Condição, observações e acessórios são registrados por atendimento e não devem ser preenchidos automaticamente com dados históricos do equipamento.

Os dados permanentes identificadores do equipamento são exibidos inicialmente protegidos contra edição, com ação explícita “Alterar dados do equipamento”. Dados específicos daquele atendimento não sobrescrevem automaticamente o cadastro permanente.

### 2.4 Autorização, datas e encerramento

Qualquer pessoa pode autorizar o serviço em nome do cliente/empresa e qualquer usuário autorizado operacionalmente pode registrar a autorização e alterar o status. O registro de autorização inclui nome de quem autorizou, data e hora do registro e, quando aplicável, meio de autorização (presencial, telefone, e-mail ou WhatsApp). Não foi exigido anexo para a autorização.

A OS deve indicar visualmente que foi aprovada e mostrar a data de aprovação, permitindo ordenar/trabalhar pelas aprovações cronológicas. Alterar a data de aprovação provoca crítica/confirmação. Datas históricas devem ser preservadas e alterações auditadas. Data e hora autoritativas vêm do servidor, não do relógio da estação.

Encerrar a OS é o ato administrativo de devolver o equipamento e fechar o atendimento, podendo registrar valores finais, descontos e forma(s) de pagamento. Uma OS devolvida sem reparo não gera cobrança, ainda que possa conservar valores informativos/orçados no documento. A impressão de saída acompanha a devolução; quando houver serviço cobrado, a garantia deve ser expressa no documento de saída.

OS concluída/encerrada é protegida contra edição ordinária. As regras aprovadas admitem alteração excepcional de OS encerrada sob controle/auditoria; o detalhe de autorização e reabertura consta como pendência. Histórico após encerramento permanece preservado. OS não é excluída; cancelamento/retificação deve conservar rastreabilidade.

### 2.5 Histórico, prioridade e acompanhamento

Há histórico operacional visível, no qual usuários registram comentários/anotações e o sistema registra autor e data/hora. Há também log administrativo restrito a pessoas autorizadas, destinado a registrar alterações e apoiar investigação. A conversa aprovou histórico único da OS e registro de autorização, movimentações e eventos relevantes nele, mantendo a distinção de acesso ao log administrativo.

O sistema deve permitir localizar OS e visualizar seu status atual, prioridade, aprovação e histórico. O campo de prazo combinado com o cliente é opcional e informativo; não bloqueia o fluxo nem gera alerta automático na versão descrita. O destaque de OS em garantia é visual, informativo e aparece na tela e nas listas.

Decisões complementares: RN-148 aprova a data de prazo prometido como campo opcional, editável e informativo; não gera alerta automático nesta versão. RN-149 aprova o destaque visual da OS vinculada a atendimento em garantia, tanto na tela quanto nas listas. RN-150 aprova recebimento antecipado antes da conclusão da OS; o valor permanece vinculado à OS como crédito recebido e segue as regras financeiras mesmo se a OS for cancelada.

### 2.6 Numeração, duplicação e exclusão

OS e demais documentos possuem numeração/código interno gerados pelo sistema segundo padrão sequencial definido. O código interno de cliente também é previsto. O formato e escopo exatos dos contadores devem ser confirmados em implantação.

É permitida clonagem/duplicação de documentos quando aprovada para o módulo: a operação cria novo documento/cadastro, não altera o original. Clonagem de pedido de venda, proposta comercial e faturamento foi aprovada; dados fiscais e financeiros não são copiados na clonagem de faturamento. Produtos podem ser clonados sem código, SKU ou identificadores únicos. A padronização “duplicar” cria um novo registro, preservando a origem.

## 3. Clientes, contatos e equipamentos

### 3.1 Pessoas e clientes

Adota-se cadastro único de Pessoas, com Tipo de Pessoa PF ou PJ. Os campos obrigatórios mínimos para salvar são Tipo de Pessoa e Nome/Razão Social. Todos os demais campos são opcionais no cadastro geral, salvo regras específicas de fluxos futuros, como emissão fiscal. A Pessoa também contempla CPF/CNPJ, Nome Fantasia, Inscrição Estadual, Inscrição Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso.

CPF/CNPJ é opcional no cadastro geral. CPF aplica-se a PF, é armazenado somente com números em 11 dígitos e validado matematicamente quando informado. CNPJ aplica-se a PJ e aceita o formato numérico antigo ou o alfanumérico oficial; é armazenado sem pontuação, em maiúsculas, e validado matematicamente conforme o algoritmo aplicável. CPF/CNPJ informado deve ser único e compatível com o Tipo de Pessoa. A máscara é aplicada somente na interface. Normalização, validação matemática, compatibilidade e verificação de duplicidade são responsabilidades do Backend/API; validação visual do Frontend não é autoridade final.

Nome Fantasia não se aplica a PF e é opcional para PJ. Quando não informado para PJ, a Razão Social é a referência principal de exibição. Inscrição Estadual e Inscrição Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, não passam por validação fiscal específica por estado ou município; o valor informado é armazenado sem interpretação fiscal complexa.

Uma Pessoa pode ter vários Tipos de Contato simultaneamente. O catálogo inicial de cadastro próprio contém Cliente (contrata serviços ou adquire produtos), Fornecedor (fornece produtos ou serviços), Transportadora (realiza transporte), Prestador de Serviço (presta serviços) e Parceiro (mantém relação de parceria comercial ou operacional); não é uma enumeração fixa. Tipo de Contribuinte também será classificação de cadastro próprio, destinada inclusive ao uso fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). É opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal; não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.

Uma Pessoa poderá possuir zero ou uma Pessoa de Contato vinculada. A Pessoa de Contato é outro cadastro completo de Pessoa, não um conjunto simplificado de dados duplicados. A pessoa que autoriza uma OS pode ser qualquer membro de uma família/empresa, não necessariamente a Pessoa de Contato.

Uma Pessoa poderá possuir múltiplos endereços, inclusive vários do mesmo Tipo de Endereço; o Tipo classifica, mas não limita a quantidade. Cada endereço poderá ser principal. Telefones e e-mails também podem ser múltiplos. Em cada coleção há no máximo um principal, sem obrigação de haver um; marcar outro desmarca o anterior, e remover/inativar o principal pode deixar a coleção sem principal. A pesquisa de clientes e dados para segmentação/mala direta também foi aprovada.

Para catálogos auxiliares, uma opção não utilizada pode ser editada, inativada ou excluída; uma opção já utilizada pode ser editada ou inativada, mas não excluída fisicamente. Opções inativas não são oferecidas por padrão em novos cadastros e permanecem válidas nos históricos. Renomeações são permitidas; o cadastro mostra o nome atual e o histórico registra valor anterior/novo, data/hora e usuário responsável quando disponível. Uma regra específica futura pode substituir a regra geral.

Quando CPF/CNPJ for informado e já estiver associado a outra Pessoa, o cadastro é bloqueado. Sem CPF/CNPJ, a possível duplicidade compara exatamente Nome/Razão Social em caixa alta sem espaços extras, telefone somente numérico e e-mail em minúsculas após trim. Correspondência gera aviso não bloqueante e permite continuar; busca aproximada/fuzzy está fora desta etapa.

Observações são informação passiva. Aviso é um único campo informativo da Pessoa. Nos contextos aprovados — visualização do cadastro, abertura de OS e venda —, se houver conteúdo, o sistema pergunta “Há informação a ser visualizada. Deseja visualizar agora?”. Sim exibe o conteúdo; Não oculta-o naquele momento e mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua. A pergunta reaparece a cada ocorrência, sem dispensa por sessão, atendimento ou usuário; o conteúdo nunca é exibido automaticamente. Nesta etapa não há log de leitura, registro da resposta, confirmação formal de ciência ou histórico de leituras.

Usuário com permissão pode preencher Aviso quando o campo está vazio. Alterar ou apagar Aviso existente e consultar seu histórico sensível exige Administrador ou permissão explícita equivalente. Administrador tem poderes máximos; as permissões são atribuídas por usuário/ação, sem perfis rígidos de Técnico ou Usuário comum. Master não existe no sistema. Histórico de leitura, múltiplos Avisos e trilha técnica detalhada permanecem pendentes.

Pessoa nunca é excluída fisicamente, mesmo sem vínculo histórico ou se cadastrada por engano; a única saída é inativar. Inativar/reativar exige Administrador ou permissão explícita equivalente. Pessoa inativa pode ser localizada e consultada pelo filtro “incluir inativos”, mas não pode ser usada em novos vínculos operacionais, inclusive OS, venda ou como proprietário de Equipamento; continua visível no histórico. A OS registra a Pessoa informada no atendimento, sem exigir separação do proprietário real. Não haverá snapshot completo da Pessoa/Equipamento em cada OS; alterações/movimentações relevantes serão registradas no histórico.

### 3.2 Equipamentos

Equipamentos possuem cadastro permanente vinculado a um proprietário/cliente e histórico de titularidade. O proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Pessoa inativa não pode ser usada em novo vínculo. A OS usa a Pessoa informada no atendimento, sem campo obrigatório para declarar proprietário real diferente. Não há snapshot completo dos cadastros dentro da OS; dados atuais são complementados pelo histórico, sem reescrever eventos registrados. É possível reutilizar equipamento ao abrir OS e consultar seu histórico.

Equipamento pode ser excluído fisicamente somente por Administrador ou permissão equivalente e sem qualquer registro persistido relacionado. Vínculos de OS, venda, orçamento, garantia, entrega/devolução, transferência, movimentação técnica, financeiro ou histórico/auditoria impedem exclusão e permitem somente inativação autorizada. Inativo não aparece como opção padrão em novas OS e continua nos históricos. O schema atual não possui campo de status em `equipment`.

Tipo de Equipamento e Marca são cadastros próprios; Marca representa também Fabricante. O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Modelo é obrigatório; número de série/asset tag é opcional. Nesta etapa, status de Equipamento limita-se a Ativo/Inativo, e Equipamento novo inicia Ativo. Ativo aparece normalmente para abertura de OS; Inativo não é opção padrão, pode ser localizado por filtro de inativos e continua aparecendo nos históricos antigos. Outros estados operacionais não estão incluídos.

Número de série, quando informado, é o principal critério de duplicidade e a comparação considera o proprietário atual. Repetição para o mesmo proprietário bloqueia o cadastro. Repetição para proprietário diferente gera aviso não bloqueante, permite cadastrar outro Equipamento e não sugere transferência. Sem serial, o Equipamento pode ser salvo normalmente e não há busca automática por combinação de proprietário, tipo, Marca e Modelo; essa busca combinada foi reprovada. Não se definem normalização avançada, tratamento por Marca/Fabricante, fusão automática ou bloqueio global de serial nesta etapa.

Tipo de Equipamento e Marca seguem o ciclo de vida dos cadastros auxiliares: sem uso podem ser editados, inativados ou excluídos; usados podem ser editados ou inativados, mas não excluídos fisicamente. Renomeações após uso são permitidas; o cadastro exibe o nome atual e o histórico registra nome anterior/novo, data/hora e usuário quando disponível, sem snapshots completos nas referências. Os catálogos iniciais de Tipo de Equipamento e Marca são cadastros próprios expansíveis. O seed será idempotente, executado por comando controlado e não automaticamente no startup; cria valores ausentes, não duplica e não desfaz renomeações permitidas.

Transferência de titularidade é permitida: o novo proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente e ativa. A transferência altera o proprietário atual e registra evento no histórico, sem alterar OS antigas. Se o equipamento ainda não tiver vínculo histórico, o proprietário pode ser corrigido sem tratar a ação como transferência formal. Com histórico, a mudança deve ser transferência, realizada por usuário com a permissão correspondente, sem justificativa obrigatória. Pode ocorrer manualmente fora de OS ou durante atendimento/OS e poderá ser vinculada a uma OS, mas o vínculo é opcional.

Os catálogos iniciais de Tipo de Equipamento e Marca são listas de cadastros próprios expansíveis, não enums fixos no código. Tipos e marcas inativos não aparecem como opções padrão em novos equipamentos; valores usados não podem ser excluídos fisicamente.

Dados textuais persistidos são convertidos para MAIÚSCULAS no Backend antes de salvar, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números; máscaras são apenas visuais e CEP é opcional. Telefone com 10 dígitos é aceito como fixo; 11, como celular se o primeiro após o DDD for 9. Menos de 10, mais de 11 ou celular sem nono dígito gera aviso não bloqueante, permitindo continuar após confirmação. Endereço segue a caixa alta geral.

Número de série é salvo em caixa alta sem remover ou alterar espaços, inclusive no início/fim, pontos, traços, barras ou outros símbolos. Assim, `ABC-123` e `ABC123` são valores diferentes. A regra de duplicidade por proprietário continua separada dessa normalização.

A pesquisa de equipamentos localiza por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo permite busca textual; serial permite busca exata ou parcial; status filtra Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem mediante filtro. Pesquisa não bloqueia cadastro nem substitui a regra de duplicidade por serial; sem serial não existe alerta/bloqueio automático por proprietário + Tipo + Marca + Modelo. Detalhes de pesquisa avançada e filtros combinados permanecem pendentes.

Na ficha do Equipamento, usuário com permissão pode alterar Tipo, Marca, Modelo e Número de Série com ou sem histórico, sem justificativa obrigatória; as alterações são registradas automaticamente. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, exige transferência. Isso não altera o ciclo de vida dos cadastros auxiliares de Tipo e Marca.

Dados textuais persistidos são convertidos para MAIÚSCULAS no Backend, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números e usam máscara apenas visual; CEP é opcional. Telefone em formato inesperado gera aviso não bloqueante, mas critérios técnicos completos de validação permanecem pendentes. Serial é salvo em caixa alta sem remover ou alterar espaços, inclusive no início/fim, nem símbolos; valores como `ABC-123` e `ABC123` são diferentes.

A pesquisa de equipamento permite localizar por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; Status oferece Ativo, Inativo ou Todos, mantendo inativos ocultos por padrão. Pesquisa não bloqueia cadastro nem altera a regra de duplicidade de serial.

Na abertura rápida de OS, o usuário escolhe equipamento existente ou cria um. A consulta de histórico deve estar disponível no fluxo. Para Dell, foi aprovada/pesquisada integração futura de consulta do modelo pelo asset tag/serial; o asset tag Dell corresponde ao número de série.

### 3.3 Histórico e permissões de Cadastros

Não será adotado snapshot completo dos dados de Pessoa ou Equipamento dentro de cada OS. O sistema manterá histórico de alterações de campo e eventos/movimentações relevantes em Pessoa, Equipamento, OS e entidades relacionadas. Alteração de campo registra, quando aplicável, entidade, campo, valor anterior, novo valor, data/hora e usuário responsável quando o módulo de usuários estiver definido. Evento/movimentação registra ações relevantes que não sejam apenas troca de valor, como adicionar/remover telefone/endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade ou cancelar OS. A lista final de eventos básicos e sensíveis permanece pendente.

O histórico geral por entidade é exibido no contexto da Pessoa, Equipamento ou OS. Usuário com permissão pode consultar histórico operacional básico; histórico completo, Aviso e histórico técnico/auditoria exigem Administrador ou permissão explícita equivalente. Administrador tem poderes máximos. A estrutura física e a lista final de eventos básicos/sensíveis permanecem pendentes; uma visão administrativa geral poderá existir futuramente.

Permissões são atribuídas por usuário/ação; Técnico e Usuário comum não são perfis rígidos. Administrador tem poderes máximos, e permissões equivalentes para ações específicas podem ser atribuídas a outros usuários. A matriz de Cadastros define as ações autorizadas por regra funcional, sem criar o módulo técnico de usuários. Pessoa nunca é excluída fisicamente; Equipamento só pode ser excluído sem qualquer registro persistido relacionado e com permissão correspondente.

Antes de salvar qualquer alteração de Pessoa ou Equipamento, o sistema exibe: “Estas alterações serão registradas no histórico. Deseja continuar?”. Ao confirmar, salva e registra automaticamente; ao cancelar, não salva. Alterações não exigem justificativa obrigatória. Transferências feitas por usuário autorizado também geram evento automaticamente.

## 4. Orçamentos, serviços, itens e garantia

### 4.1 Orçamento e itens

O orçamento pode ser preparado na recepção durante a avaliação inicial ou ter origem posterior. O sistema registra sua origem. A aprovação do cliente protege o orçamento contra alteração ordinária; mudanças posteriores exigem o fluxo de revisão/aprovação definido pela RN-029, cuja política detalhada precisa ser preservada na implementação.

O orçamento/OS separa serviços/mão de obra, peças, componentes e itens avulsos. Tipos de item da OS incluem peças, componentes e serviços. Produto marcado como componente não deve ser confundido com peça de venda/estoque. É possível incluir item avulso sem cadastro de produto quando aprovado pelas regras correspondentes.

Há itens internos ocultos ao cliente e itens visíveis ao cliente. Custo interno não deve ser exposto a usuários sem permissão. Valores, descontos e preços na OS obedecem a permissões e auditoria; o custo de produto é controlado separadamente do preço de venda. Peças podem ser retiradas do cadastro/estoque ou lançadas como avulsas segundo a regra do módulo.

### 4.2 Serviços

Existe módulo de cadastro de serviços com dados e estrutura próprios, histórico de alterações e cadastros auxiliares. Serviços podem ser reutilizados no orçamento/OS. Não assumir catálogo pré-carregado além do que foi deliberado.

### 4.3 Garantia

O retorno de equipamento para atendimento em garantia deve ser identificado como tal e relacionado à OS/atendimento original. A garantia pertence ao atendimento/serviço executado, e a nova OS de retorno mantém sua própria identidade e histórico. O sistema deve destacar visualmente OS em garantia.

Existe garantia padrão configurável pela empresa e indicação expressa da garantia no documento de saída. O sistema deve apoiar a identificação/fluxo de retorno, sem presumir aprovação automática ou encerramento automático da garantia. Prazo, cobertura por tipo de serviço/peça, exceções, início da contagem e procedimento de garantia permanecem pendentes quando não explicitados.

## 5. Estoque, produtos e compras

### 5.1 Princípios do estoque

Estoque é controlado por movimentações, que são a fonte da verdade. Não se recalcula saldo por consulta indireta a OS. Toda movimentação tem documento de origem, auditoria e não pode ser apagada; correções são novas movimentações. Origens citadas: compra, venda, OS, ajuste, inventário, devolução e transferência.

Devem ser distinguidos estoque físico, reservado, disponível, aplicado e a caminho conforme as situações previstas no cadastro/visão de estoque. A simples inclusão de peça no orçamento não altera quantidade nem disponibilidade. Quando o técnico marca a peça efetivamente utilizada/aplicada à OS, ela fica indisponível para outros usos, mas ainda não ocorre baixa definitiva. A baixa definitiva se dá no encerramento/entrega do equipamento ao cliente, conforme decisão posterior e reiterada na conversa. Se o atendimento for desfeito antes da baixa, a reserva é liberada. Substituição libera a peça anterior e reserva a nova. Peça defeituosa não retorna ao saldo disponível; deve receber destino próprio (análise, sucata, garantia ou devolução ao fornecedor).

Estoque negativo é permitido conforme aprovação explícita. Movimentos de ajuste manual são permitidos conforme as permissões e auditoria. Alterações monetárias/custo não equivalem a movimento de quantidade. Nenhuma movimentação pode existir sem origem ou ser removida.

### 5.2 Produtos

Cadastro de produto contempla visão 360° com abas/informações gerais, estoque, compras, fornecedores, compradores, movimentações, estatísticas e histórico. Inclui custo, histórico de compras e navegação para documento de origem. Fornecedores e compradores são consultáveis no contexto do produto. Pesquisa inteligente suporta pesquisa por termos e expressão exata, com alternância de modo.

Cadastros auxiliares aprovados incluem categorias de produtos, unidades de medida, bancos, centros de custo e transportadoras. Foi aprovada estrutura padronizada para cadastros auxiliares. Cadastro de defeitos/problemas foi reprovado. Não reintroduzir sugestões rejeitadas como requisito.

### 5.3 Compras

Pedido/solicitação de compra registra fornecedor, itens, quantidades, totais, frete, datas, condição de pagamento e previsão de entrega. Para compras vinculadas a OS, foi aprovada relação de um pedido de compra por OS; necessidades adicionais da mesma OS são adicionadas ao pedido existente e solicitações de OS diferentes não são agrupadas no mesmo pedido.

O fluxo distingue solicitação de necessidade e aprovação/realização comercial. O responsável pode revisar fornecedor efetivo, quantidades, preço unitário, frete/outros custos, condição/forma de pagamento e previsão antes de marcar compra aprovada/realizada. Produto mantém histórico de compras e link para origem. Movimentação de entrada deve referenciar compra/documento de origem.

## 6. Vendas, faturamento e financeiro

### 6.1 Núcleo compartilhado

Vendas e OS compartilham cadastros, estoque e financeiro; não devem manter cópias divergentes dessas fontes. Estoque é compartilhado entre os módulos e as movimentações têm origem rastreável. O financeiro também é compartilhado. O princípio de fonte única da verdade vale para dados e processos comuns.

### 6.2 Contas a receber e recebimentos

O financeiro admite recebimentos parciais e múltiplas formas de recebimento em uma operação. Baixas parciais de contas a receber são aprovadas, assim como combinar várias formas em uma baixa. Há recebimento imediato e faturado/futuro, com condição de pagamento e parcelas. Recebimento antecipado de OS é permitido antes da conclusão, vinculado como crédito recebido à OS e refletido no fluxo de caixa; cancelamento da OS não apaga o recebimento, que segue o tratamento financeiro normal.

O fechamento da OS pode aplicar desconto e registrar uma ou mais formas de pagamento, por exemplo dinheiro, PIX, cartão ou boleto. Não se gera cobrança por OS encerrada sem reparo. Formas de pagamento são cadastros configuráveis/auxiliares. Contas a receber e contas a pagar têm movimentações como fonte de verdade financeira; não se deve inferir saldo apenas do estado de documentos comerciais.

Condições de pagamento, baixa parcial, recebimento faturado e pagamentos múltiplos foram aprovados. Parâmetros financeiros de juros e multa padrão são configuráveis. O fluxo de caixa deve suportar visão de títulos a pagar/receber e projeção, mas os critérios de inclusão e exibição da projeção não ficaram completamente fixados.

### 6.3 Contas a pagar, bancos e centros de custo

Contas a pagar são relacionadas a compras/documentos quando aplicável e contemplam vencimento, pagamento e auditoria. Bancos e centros de custo são cadastros aprovados. O sistema deve permitir navegação entre títulos e documentos de origem. Regras completas de conciliação, estorno, juros, multa, baixa e liquidação não estão integralmente definidas nesta conversa.

### 6.4 Vendas e documentos comerciais

O escopo inclui módulo de vendas, pedidos de venda, propostas comerciais e faturamento, compartilhando produtos/estoque/financeiro com OS. A clonagem de pedido de venda, proposta comercial e faturamento foi aprovada; o novo registro não reutiliza os dados fiscais/financeiros do faturamento original. A clonagem de produto omite identificadores únicos. Faturamento fiscal e emissão de documentos fiscais não devem ser presumidos como totalmente especificados apenas por haver importação de NF-e.

Regras de clonagem: RN-157 cria novo pedido de venda copiando dados comerciais reaproveitáveis (cliente, itens, quantidades, preços, descontos, observações e condição quando aplicável), sem número, datas, recebimentos, faturamento, situação, logs ou movimentações financeiras. RN-158 cria nova proposta, com nova numeração, data e situação inicial, mantendo itens e demais dados comerciais. RN-159 permite clonar faturamento apenas com dados comerciais reaproveitáveis, nunca dados fiscais ou financeiros. RN-160 permite clonar produto sem código, SKU ou identificadores únicos. RN-161 padroniza “Duplicar” como criação de novo documento/cadastro sem alterar o original.

## 7. Usuários, segurança, permissões e auditoria

### 7.1 Autenticação e sessão

Autenticação de usuários é requisito. Autenticação em dois fatores foi aprovada com diferenciação de contexto de acesso interno e externo à rede local. Tentativas de autenticação são controladas. Sessões simultâneas têm comportamento definido por decisão própria; a conversa aprovou permitir/gerir esse cenário conforme RN-065. Não foi aprovada a sugestão de “local confiável”.

### 7.2 Permissões e perfis

Administrador é o conceito máximo do sistema e possui poderes máximos. Técnico e Usuário comum são designações operacionais, não perfis rígidos; permissões são atribuídas individualmente por usuário/ação. Ações específicas podem ser concedidas a qualquer usuário sem torná-lo Administrador. Acesso ao Financeiro, visualização de valores e custos internos são controlados por permissões. Menções históricas a Master/Supervisor como papel de poder máximo estão obsoletas e não definem papel ativo no sistema.

Para incluir, alterar ou apagar Aviso e executar ações administrativas, a regra funcional exige Administrador ou permissão explícita equivalente para a ação. O módulo técnico de usuários/permissões ainda será implementado.

### 7.3 Auditoria e exclusão lógica

Auditoria completa de alterações é aprovada, incluindo inclusões, alterações, inativações e reativações, com usuário e data/hora autoritativa. Log administrativo restrito apoia investigação; não substitui o histórico operacional visível. Datas históricas são preservadas e alterações relevantes registradas. OS não é apagada; clientes e demais entidades preservam histórico via inativação/exclusão lógica conforme suas regras.

Movimentações de estoque e financeiras são imutáveis; correções são lançamentos compensatórios. Uma sugestão de exigir justificativa em toda alteração crítica foi rejeitada, portanto não é regra geral aprovada.

## 8. Interface, navegação, portal mobile e comunicação

### 8.1 Aplicação principal

Tela principal, tela inicial, dashboard operacional, acesso a módulos e padronização visual foram aprovados. O dashboard deve contemplar pendências, indicadores operacionais e atalhos rápidos. A interface por cards e submenus de módulos foi aprovada. As telas devem permitir navegação entre documentos relacionados e mostrar origem de compras, movimentações e títulos.

Módulos previstos na navegação incluem OS, clientes, equipamentos, estoque, compras, vendas, financeiro, serviços, configurações, cadastros auxiliares e relatórios. O detalhe final de rótulos/ordem pode ser ajustado em UI sem alterar regras de negócio.

### 8.2 Portal mobile e QR Code

Portal mobile da OS e sua evolução para tarefas de técnicos, balcão e compras foram aprovados. Clientes foram citados como implementação futura, não como requisito da versão inicial. O portal permite consultar/atualizar informações operacionais da OS e registrar entradas no histórico com autoria/data. QR Code para captura/acesso à OS foi aprovado; há também decisão sobre QR Code permanente. A política de dados expostos por QR e autenticação precisa seguir restrições de segurança e consta entre os pontos a detalhar.

### 8.3 Anexos e compartilhamento

Módulo simplificado de anexos aprovado para entidades como OS e cadastros/documentos relacionados. O cadastro guarda a referência do anexo e vínculo ao registro de origem. Caminho/armazenamento configurável foi aprovado. Limites de formato, tamanho, retenção e acesso permanecem pendentes.

Compartilhamento via WhatsApp foi aprovado em versão revisada. O usuário inicia o compartilhamento das informações/link/documento de OS conforme fluxo aprovado, preservando controle de acesso; não se deve presumir envio automático de conteúdo sensível sem confirmação do operador. E-mail de informações da OS também foi aprovado.

## 9. Cadastros, configurações e parâmetros

Configurações devem ser organizadas conforme necessidade, evitando parâmetros sem finalidade definida. Cadastro da empresa, garantia padrão, parâmetros financeiros, configuração de backup, caminho de anexos e organização das configurações foram aprovados. Preparação para multiempresa foi aprovada arquiteturalmente; não implica operação multiempresa já especificada para a primeira versão.

Cadastros previstos: Pessoas e seus Tipos de Contato, Tipos de Contribuinte, Pessoas de Contato, telefones, e-mails, Tipos de Endereço e endereços, equipamentos, tipos de equipamento, Marcas (incluindo fabricantes de equipamentos), produtos, categorias, unidades de medida, bancos, centros de custo, serviços, formas/condições de pagamento, status da OS e demais cadastros auxiliares aprovados. Tipo de Contato, Tipo de Contribuinte e Tipo de Endereço são classificações de cadastros próprios com catálogos iniciais definidos nesta especificação. O ciclo de vida geral dos valores auxiliares está aprovado; renomeações após uso são permitidas e registradas no histórico, enquanto o cadastro mostra o nome atual. Situações/status da OS são configuráveis e possuem propriedades operacionais.

## 10. Relatórios, consultas, lembretes e notificações

Relatórios têm layout fixo definido pelo sistema, sem ferramenta livre de montagem pelo usuário. Catálogo aprovado contempla grupos de OS, financeiro, estoque, comercial e gerencial. Foi explicitamente aprovado relatório diário de OS prontas aguardando retirada.

Pesquisa de clientes, produtos e OS foi aprovada. Pesquisa de produtos inteligente suporta termos e expressão exata. Navegação por documentos relacionados deve facilitar rastreabilidade de produto, OS, financeiro e estoque.

Agenda/lembretes vinculados à OS foram aprovados, com estrutura do lembrete, avisos e aba dedicada. Fluxo inclui criação, consulta e atualização/encerramento conforme o estado definido. Compromissos como módulo próprio e checklist/pendências de OS foram rejeitados como sugestões. Lembrete automático de vencimento de contas a receber/notificação por e-mail foi aprovado, com configurações e situações de supressão indicadas na RN-168. Janela de antecedência e critérios finais devem ser conferidos na regra detalhada, pois o histórico reutiliza o identificador RN-168.

## 11. Integrações e documentos fiscais

### 11.1 Dell

Foi solicitada pesquisa de integração para consultar equipamentos Dell pelo asset tag/serial, recuperar modelo/dados do equipamento e apoiar o cadastro/OS. O asset tag foi definido como número de série Dell. A pesquisa compara API oficial e alternativas e registra fluxo, cache, erros e limites. A integração Dell TechDirect também aparece como módulo/documento previsto. Credenciais, disponibilidade comercial, escopo de API e operação efetivamente contratada não foram comprovados como decisão final.

### 11.2 Correios e logística

Foi solicitada pesquisa de rastreamento de encomendas, APIs oficiais/alternativas, dados retornados, atualização automática, cache e erros. Módulo Logística e integração Correios constam na organização documental prevista. Isso comprova intenção/escopo de investigação, não uma integração de produção já aprovada com endpoint e contrato técnico fechados.

### 11.3 Importação de NF-e/XML e SEFAZ

Foram aprovados: consulta/importação de NF-e pela Receita Federal, importação manual por arquivo XML, assistente de importação, associação de produtos, entrada automática em estoque e geração de contas a pagar. A tarefa de pesquisa detalha consulta automática, certificado digital, download de XML, estrutura de XML, memória de associação, eventos, manifestação do destinatário, segurança e fluxo completo.

SEFAZ e módulo Importação de XML foram incluídos na documentação pretendida. As tarefas de pesquisa descrevem requisitos a investigar; trechos de pesquisa técnica/alternativas não devem ser tratados como decisão final até haver aprovação explícita. Regras de manifestação, deduplicação, eventos cancelados/devolução, armazenamento do certificado, autorização e estados de importação precisam de especificação final.

### 11.4 Integrações financeiras

Documentos de integração previstos: Banco Inter, Stone e boletos bancários. A tarefa de pesquisa de boletos abrange APIs oficiais, autenticação, emissão, consulta, alteração, cancelamento, baixa, liquidação, webhooks, conciliação, segunda via e PIX integrado ao boleto. Há também pagamentos/recebimentos via formas de pagamento. A presença de um documento/tarefa de pesquisa não resolve provedor contratado, homologação, escopo de operações, tarifas ou critérios de conciliação.

## 12. Modelo de dados, API e arquitetura

### 12.1 Stack aprovada

Decisões tecnológicas expressamente aprovadas na conversa:

- frontend React com TypeScript, responsivo;
- backend Node.js com NestJS;
- banco de dados MySQL 8;
- ORM Prisma;
- API REST sobre HTTPS;
- arquitetura em camadas, com interface, API, serviços/regras de negócio e persistência separados;
- regras de negócio centralizadas no backend e serviços orientados por domínio;
- API versionada e padronizada;
- UUID externo para identificação pública;
- exclusão lógica quando aplicável;
- datas padronizadas e migrações versionadas.

### 12.2 Persistência e integridade

O modelo deve sustentar entidades comuns com identificação, auditoria, histórico e log administrativo conforme RN-071. Estoque e financeiro são modelados por movimentos como fonte de verdade. A camada de persistência é separada das regras. Prisma é o ORM aprovado e schema/migrations são controlados por versão, conforme DA/RN citadas.

O princípio de fonte única da verdade evita cópias divergentes entre OS, vendas, estoque, compras e financeiro. A preparação multiempresa precisa estar contemplada no desenho de entidades e isolamento lógico, embora operação e segregação completas estejam pendentes.

### 12.3 API

API REST HTTPS, versionada, com padrões de resposta e erros. O backend aplica validações e regras de negócio; frontend não é fonte de autoridade para regras, saldo, permissões ou datas. Contratos específicos de endpoint, autenticação, paginação, filtros, idempotência, limites de taxa e compatibilidade ainda precisam ser definidos no documento de API.

## 13. Requisitos não funcionais, operação e backup

- Desempenho deve evitar a degradação severa observada no sistema desktop/MDB com bases grandes. Metas numéricas de tempo/carga não foram estabelecidas.
- A aplicação frontend é responsiva; comunicação entre cliente e backend é HTTPS.
- Dados de auditoria, financeiro e estoque precisam de integridade e rastreabilidade.
- Data/hora do servidor é autoritativa.
- Segurança inclui autenticação, 2FA nos contextos aprovados, controle de tentativas, sessões e permissões por usuário.
- Há configuração de backup aprovada e material de pesquisa sobre backup/replicação/alta disponibilidade. Alternativas e recomendações apresentadas não equivalem a decisão consolidada de topologia, RPO/RTO ou hospedagem.
- Armazenamento de anexos é configurável. Recuperação de desastre, retenção, criptografia, monitoramento e metas de disponibilidade não foram quantificados.

## 14. Revisão de cobertura do índice

| Assunto identificado na primeira leitura | Cobertura nesta especificação |
|---|---|
| Visão, objetivos, motivação e usuários | Cap. 1 |
| Fluxo da OS, triagem, status/estado, aprovação, conclusão, entrega e histórico | Cap. 2 |
| Clientes, contatos, equipamentos e histórico | Cap. 3 |
| Orçamentos, itens, serviços e garantia | Cap. 4 |
| Produtos, estoque, movimentos, compras e fornecedores | Cap. 5 |
| Vendas, faturamento, contas a pagar/receber e pagamentos | Cap. 6 |
| Autenticação, usuários, permissões e auditoria | Cap. 7 |
| Interface, portal mobile, QR, anexos e comunicação | Cap. 8 |
| Cadastros e configurações | Cap. 9 |
| Relatórios, busca, lembretes e notificações | Cap. 10 |
| NF-e/XML, SEFAZ, Dell, Correios, Banco Inter, Stone e boletos | Cap. 11 |
| Banco, API, tecnologias e arquitetura | Cap. 12 |
| Desempenho, segurança, datas, backup e operação | Cap. 13 |
| Ambiguidades e decisões não fechadas | `Especificacoes-Nao-Documentadas.md` |

**Resultado da revisão:** todos os domínios identificados no índice provisório estão representados. Assuntos de Git, GitHub, GOSTools, instalação de ferramentas, VS Code, exportação do ChatGPT e problemas técnicos alheios ao produto foram excluídos conforme instrução da fonte. Itens aprovados mas descritos somente em nível de intenção foram registrados com essa limitação e encaminhados ao documento de lacunas, sem completar regras por inferência.

## Complemento de regras aprovadas recuperadas

Este complemento registra regras aprovadas que foram identificadas no catálogo de regras e não estavam expressas com detalhe suficiente nesta especificação.

### Estoque e pedidos de compra

- O estoque inicial terá **um único local**. O saldo inicial pode ser lançado gradualmente; não é necessário completar todo o cadastro/saldo na implantação.
- O estoque atende peças e insumos usados em reparo e produtos para revenda. A distinção inicial entre esses usos é feita por categoria, sem regras de estoque separadas.
- Entradas manuais são um caminho normal de operação, além da importação por XML. No primeiro escopo, ajustes simples não obrigam informar motivo.
- O recebimento parcial de pedido de compra é permitido por item. Itens recebidos entram no estoque; quantidades ainda não recebidas permanecem “a caminho”.
- O progresso da compra é acompanhado por item. Um pedido pode conter itens em etapas diferentes (por exemplo, um comprado e outro aguardando compra).

### Financeiro

- Em contas a receber, a multa por atraso é um percentual único sobre a parcela vencida; os juros são calculados ao mês, proporcionalmente aos dias de atraso. Há parâmetros padrão por tipo/condição de pagamento e o financeiro pode alterá-los manualmente no faturamento.
- Para recebimentos por cartão, o recebimento do cliente é considerado imediato. O sistema não controla repasses parcelados futuros da operadora. Registra-se o valor bruto e, no dia seguinte, importa-se o relatório do sistema Raio X para apurar taxas e valor líquido. O vínculo entre transações do relatório e recebimentos pode ser automático ou manual.
- O financeiro mantém caixas e contas bancárias separados. Transferir valores entre contas gera saída na origem e entrada no destino, sem afetar o resultado.
- Contas a pagar podem ser lançadas manualmente (por exemplo, despesas recorrentes) ou geradas por compras. A compra gera a obrigação no momento em que é realizada, ainda que a mercadoria não tenha chegado. Compras parceladas geram títulos com vencimentos independentes.
- Pagamentos de contas a pagar podem ser parciais e utilizar contas/caixas diferentes. Juros, multa e desconto do pagamento são lançados manualmente.

### Dashboard operacional e atualização do histórico

- O dashboard operacional deve apresentar listas acionáveis, com acesso direto às OS: abertas há mais de 10 dias; orçamento pronto aguardando aviso ao cliente; serviço pronto aguardando aviso; serviço sem reparo aguardando aviso; peça aguardando compra; peça comprada com entrega atrasada; orçamento enviado aguardando resposta; e OS sem movimentação técnica.
- Os prazos para acompanhar orçamento enviado sem resposta e OS sem movimentação são ajustáveis na própria tela do dashboard. A lista de OS acima de 10 dias usa 10 dias como referência inicial.
- Depois que a equipe registra que avisou o cliente, a OS deixa a pendência de aviso e passa a ser acompanhada como aguardando retirada.
- Para cada OS sob responsabilidade de um técnico, deve existir uma atualização no histórico a cada dois dias úteis. No login, técnico com OS pendente dessa atualização fica impedido de executar outras ações até registrar a informação no histórico das OS correspondentes. Administradores recebem apenas um alerta, sem bloqueio.

## Complemento da revisão integral do histórico

Os itens abaixo foram acrescentados na comparação detalhada das decisões aprovadas. Eles complementam os capítulos anteriores sem substituir o conteúdo já registrado.

### C.1 OS, cliente e equipamento

- Status de OS são configurações comportamentais independentes: podem habilitar abertura, marcar conclusão técnica/pronto, permitir encerramento e determinar se o encerramento gera contas a receber. “Pronto, cliente avisado” mantém a OS aberta; equipamento entregue é o encerramento. O resultado sem reparo precisa poder fechar sem cobrança.
- A data/hora da aprovação é preservada quando a OS muda entre situações que indiquem autorização. Se a alteração for escolhida, deve haver crítica explícita. O sistema mostra visualmente a aprovação e sua data, permitindo ordenar OS pela aprovação cronológica.
- A tela de cadastro de Pessoa durante abertura da OS é o cadastro completo; Tipo de Pessoa (PF/PJ) e Nome/Razão Social são os campos obrigatórios mínimos. Os demais campos são opcionais no cadastro geral, salvo regras específicas de fluxos futuros. Cada Pessoa pode ter zero ou uma Pessoa de Contato, que é outro cadastro completo de Pessoa, além de múltiplos telefones, e-mails e endereços. Telefones e e-mails podem ser marcados como principais; cada endereço tem Tipo de Endereço de cadastro próprio e pode ser marcado como principal.
- CPF/CNPJ é opcional; CPF é armazenado somente com números, possui 11 dígitos e é matematicamente validado. CNPJ aceita o formato numérico antigo ou o alfanumérico oficial, é armazenado sem pontuação e em maiúsculas, e é matematicamente validado conforme o algoritmo aplicável. O documento deve ser único e compatível com Tipo de Pessoa (PF usa CPF; PJ usa CNPJ). A máscara fica na interface; normalização, validação matemática, compatibilidade e duplicidade são regras do Backend/API. Documento repetido bloqueia novo cadastro; sem documento, comparação exata normalizada de nome (caixa alta e espaços extras removidos), telefone (somente números) ou e-mail (minúsculas após trim) avisa sem bloquear. Busca fuzzy está fora desta etapa.
- Nome Fantasia não se aplica a PF e é opcional para PJ; se PJ não informar, a Razão Social é a referência principal de exibição. Inscrição Estadual e Municipal são opcionais, aplicam-se principalmente a PJ e não têm validação fiscal específica estadual/municipal nesta etapa; o valor é armazenado sem interpretação fiscal complexa.
- Os dados cadastrais aprovados incluem Tipo de Pessoa, Nome/Razão Social, CPF/CNPJ, Nome Fantasia, Inscrição Estadual e Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso. Catálogos próprios iniciais: Tipos de Contato Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro; Tipos de Contribuinte Contribuinte ICMS, Contribuinte Isento e Não Contribuinte; Tipos de Endereço Principal, Cobrança, Entrega e Instalação. Tipo de Contribuinte é opcional no cadastro geral e obrigatório para emissão de nota fiscal; não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Regras fiscais e códigos continuam pendentes. A finalidade fiscal e de segmentação não significa que exista módulo de marketing aprovado.
- Uma Pessoa pode exercer simultaneamente vários Tipos de Contato. Transportadora é um Tipo de Contato, não cadastro separado. Marca e Fabricante são o mesmo conceito para equipamentos e usam um cadastro único, preferencialmente denominado Marca.
- Observações são passivas. Se houver Aviso, nos contextos aprovados o sistema pergunta “Há informação a ser visualizada. Deseja visualizar agora?”; Sim exibe o conteúdo; Não mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua. O conteúdo não é exibido automaticamente, a pergunta ocorre em cada contexto sem dispensa, e não há log/registro de leitura nem confirmação formal. Usuário autorizado pode preencher Aviso vazio; alterar/apagar conteúdo existente e ver seu histórico sensível exige Administrador ou permissão explícita equivalente. Eventos básicos/sensíveis e histórico de leituras permanecem pendentes.
- Cadastro permanente do equipamento contempla Tipo, Marca, Modelo, Número de Série opcional e status Ativo/Inativo. Acessórios, bateria, condição e observações são informações do atendimento/OS. Usuários com permissões correspondentes podem corrigir os dados da ficha com ou sem histórico, sem justificativa obrigatória; alterações são registradas automaticamente. Proprietário com histórico muda por transferência formal, também sujeita à permissão correspondente. A regra de normalização é definida na seção 3.2.
- Equipamento só pode ser excluído fisicamente por Administrador ou usuário com permissão explícita equivalente e sem qualquer registro persistido relacionado; se houver vínculo, só pode ser inativado/reativado com autorização correspondente. Inativo não aparece por padrão em novas OS, mas pode ser localizado com filtro e permanece visível no histórico. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Pessoa inativa não pode ser usada em novo vínculo como proprietário. Transferência muda proprietário atual, registra evento e não altera OS antigas. Correção sem vínculo histórico não é transferência formal; com vínculo operacional, mudança é transferência. Pode ocorrer fora ou durante OS, com associação opcional a uma OS. O schema atual pode ainda não representar status do equipamento, elegibilidade por Tipo de Contato ou vínculo com OS.
- A OS registra a Pessoa informada na abertura, sem separação obrigatória entre essa Pessoa, o proprietário real do equipamento, o responsável ou terceiro que o trouxe. Não há snapshot completo dos dados de Pessoa/Equipamento dentro da OS; as alterações e movimentações relevantes são registradas no histórico, que permite consultar a evolução sem duplicar cadastros. Eventos já registrados não são reescritos.
- O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; serial é opcional. Equipamento novo inicia Ativo; status possíveis nesta etapa são somente Ativo/Inativo. Tipo de Equipamento e Marca são cadastros próprios e seguem ciclo de vida auxiliar. Os campos/status obrigatórios e ciclo de vida ainda não estão integralmente representados no schema.
- Serial informado repetido para o mesmo proprietário bloqueia cadastro; repetido para proprietário diferente gera aviso não bloqueante, permite outro cadastro e não sugere transferência. Sem serial, salva normalmente sem busca automática pela combinação Proprietário + Tipo + Marca + Modelo. Serial é salvo em caixa alta sem limpeza de símbolos/espaços. A pesquisa aprovada é independente da duplicidade; apenas regras avançadas/filtros combinados permanecem pendentes.
- Prioridades disponíveis no exemplo operacional são baixa, normal, urgente e muito urgente. O campo de prazo combinado com o cliente é opcional, informativo e não gera alerta automático.
- Usuário com permissão pode encerrar OS se o status e as demais validações permitirem. Datas históricas são praticamente imutáveis; sua correção exige permissão explícita e log administrativo. Qualquer usuário autorizado pode alterar valores da OS depois da aprovação, com registro dos valores anterior/novo; não se exige motivo obrigatório (a sugestão foi negada).
- Itens da OS se dividem em Peças (cobradas e visíveis ao cliente), Componentes (consumo técnico, custo interno, não cobrados e ocultos nos documentos entregues ao cliente) e Serviços (cobrados e visíveis). Produto marcado como componente inserido pela seção Peças gera confirmação para cobrança; a mesma peça pode ser vendida normalmente. O atributo “Componente” não torna o produto indisponível para o módulo de vendas.
- Acessórios e observações não são copiados para uma nova OS; reclamação do cliente inicia vazia. Tipo/marca/modelo/serial do equipamento vêm protegidos e são alterados por ação explícita.

### C.2 Produtos, estoque e compras

- Estoque controla tanto peças/insumos quanto produtos para revenda. A distinção inicial é por categoria, sem regras independentes de peça interna e mercadoria de venda. Existe um único local de estoque nesta etapa; o saldo inicial será incorporado gradualmente.
- Entradas de produto podem ser lançadas manualmente como rotina normal ou por XML. Ajustes manuais não exigem motivo no primeiro desenho; exigem Administrador ou permissão específica de gestão de estoque e são auditados.
- Produtos podem ter número de série, mas o controle individual não é obrigatório. Produto avulso pode ser usado na OS; também se podem lançar serviços avulsos. Técnicos não alteram valores permanentes do cadastro de estoque, mas podem ajustar valores/descontos da linha daquela OS, com registro no log.
- Estoque físico, reservado, aplicado, disponível e a caminho aparecem como indicadores distintos. A caminho deriva de itens comprados, não integra físico nem disponível. Disponível é definido como físico menos reservado; produtos aplicados permanecem sob controle até encerramento da OS. Toda alteração de estoque gera movimento, e os saldos podem ser reconstruídos a partir do histórico. Os valores de saldo armazenados podem ser cache derivado, nunca autoridade primária.
- O cadastro 360° do produto inclui dados gerais, situação ativa/inativa, componente, estoque, compras, fornecedores, compradores, movimentações, estatísticas e histórico administrativo. Estatísticas previstas incluem quantidade vendida/usada em OS/usada como componente, última venda/utilização, tempo médio entre compras e em estoque, quantidades compradas por período e valores comprados/vendidos.
- Pesquisa de produto usa um campo único nos campos código interno, descrição, marca, modelo, fabricante, SKU, serial e categoria. O modo padrão aceita múltiplos termos: todos devem ser encontrados, independentemente de ordem e campo. Um controle alterna para pesquisa da sequência exata. Filtros previstos incluem categoria, marca, fabricante, ativo/inativo, componente, com/sem estoque, estoque negativo e a caminho.
- Solicitação de compra nasce na OS. Técnico descreve componente e quantidade, podendo incluir produto avulso não cadastrado e link de referência opcional. O pedido continua sendo único por OS; necessidades adicionais são adicionadas ao pedido original. O andamento é controlado por item, permitindo, por exemplo, um item comprado e outro aguardando compra.
- A etapa comercial completa fornecedor efetivo, quantidades aprovadas, preço, frete/outros custos, condição/forma de pagamento e previsão de entrega. O link sugerido pelo técnico permanece registrado mesmo que a compra seja feita em outro fornecedor; pode também ser informado link final da compra.
- Pedido pode registrar código de postagem/rastreamento e data prevista de entrega, ambos opcionais. Na primeira etapa o código é apenas armazenado; consulta automática à transportadora é futura.
- Entrada vinculada ao pedido pode ser manual ou originada da importação XML. Recebimento parcial é permitido por item: o recebido entra no estoque e o restante permanece a caminho. O estado “a caminho” não altera disponibilidade.

### C.3 Financeiro, contas e conciliação

- Encerramento de OS pode sinalizar faturamento posterior, criando pendência para o financeiro. O atendente do balcão não define vencimentos; o financeiro os define e emite os documentos. Pagamento futuro gera título(s) a receber relacionado(s) à origem.
- Parcelamento cria títulos independentes com vencimentos próprios. Contas a receber aceita pagamentos parciais e cada baixa aceita múltiplas condições/formas; a soma informada deve fechar com o total daquela baixa. O recebimento parcial de OS também é permitido.
- O cadastro oficial do processo é **Condições de Pagamento**, não apenas formas. A condição identifica código/nome, ativo/inativo, recebimento imediato, geração de contas a receber, prazo padrão, parcelamento e desconto. Condição “Faturado” gera contas a receber automaticamente.
- Juros e multa de recebíveis têm parâmetros padrão por condição/tipo, ajustáveis manualmente no faturamento. A multa é percentual único sobre parcela vencida; juros são mensais proporcionais aos dias de atraso. Para contas a pagar, juros e multa são informados manualmente; desconto manual no pagamento é permitido.
- Para cartão, o recebimento do cliente é imediato: não se controlam repasses futuros parcelados pela operadora. Registra-se a venda/recebimento bruto e, no dia seguinte, importa-se relatório do sistema Raio X para consolidar taxas e líquido. A conciliação desse relatório pode ser automática ou manual.
- Há contas/caixas separados (por exemplo caixa da loja e contas bancárias) e transferências entre eles. Transferência registra saída e entrada correspondentes sem afetar o resultado.
- Contas a pagar podem ser geradas por compra ou incluídas manualmente para despesas como aluguel, energia, contador e impostos. A compra gera o título no momento em que é realizada, mesmo antes da chegada da mercadoria. Parcelamento gera títulos independentes. Pagamentos podem ser parciais e originar-se de contas/caixas distintos.
- Projeção de caixa aprovada: visão consolidada geral por dias corridos, apenas com itens confirmados; alerta tanto para saldo negativo quanto para saldo abaixo de um piso mínimo configurável para o consolidado. Não há piso separado por conta.

### C.4 Dashboard e pendências de operação

O dashboard operacional deve privilegiar listas de ação, com atalho clicável para as OS envolvidas. Indicadores aprovados incluem OS abertas há mais de 10 dias; orçamento pronto aguardando aviso ao cliente; serviço pronto aguardando aviso ao cliente; serviço sem reparo aguardando aviso ao cliente; itens aguardando compra; compra atrasada em relação à previsão; orçamento enviado aguardando resposta; e OS sem movimentação técnica.

Após registrar que o cliente foi avisado, a OS deixa a pendência “avisar cliente” e passa à situação de aguardar retirada. Para orçamento enviado aguardando resposta e OS sem movimentação técnica, o prazo é ajustável diretamente na tela do dashboard.

Para OS sob responsabilidade de técnico, deve haver atualização no histórico a cada dois dias úteis. Técnico com OS vencida nessa obrigação fica impedido de executar outras ações após login até registrar a atualização no histórico das OS pendentes. Para administradores, a mesma situação produz apenas alerta, sem bloqueio. O evento de atualização é a anotação do histórico, conforme regra aprovada.

O dashboard também deve permitir comparar dois períodos. A prioridade declarada é operacional; indicadores monetários não substituem as pendências operacionais. O e-mail diário de OS prontas aguardando retirada contém datas relevantes; o(s) destinatário(s) é configurável.

### C.5 Segurança, permissões e trilha

- Administrador possui poderes máximos. Permissões são atribuídas por usuário/ação, sem perfis rígidos; Técnico e Usuário comum podem receber permissões específicas. Acesso ao financeiro é controlado por essas permissões; nenhum usuário sem autorização pode acessar contas a pagar/receber, fluxo de caixa, saldos ou informação financeira gerencial.
- Permissões são atribuídas diretamente a cada usuário, não por perfis predefinidos. O usuário pode ter sessões simultâneas; elas são permitidas e auditadas. Login normal usa usuário e senha; acesso externo à rede local exige 2FA e acesso interno exige login/senha. Método do 2FA ficou para definição posterior.
- Cinco tentativas consecutivas de senha incorreta não bloqueiam a conta; geram notificação ao(s) Administrador(es). Registrar tentativa no Log Administrativo com usuário informado, hora do servidor, IP/dispositivo quando disponível e origem interna/externa. A proposta de locais confiáveis e histórico de segurança separado foi rejeitada.
- Exclusão de itens da OS pode ser feita pelo usuário com permissão enquanto as regras de negócio permitirem; toda alteração/exclusão relevante fica no Log Administrativo com usuário, data/hora do servidor, operação e valores anterior/novo quando aplicável. Movimentações manuais de estoque exigem Administrador ou permissão específica de gestão de estoque.
- A filosofia aprovada é permitir alterações operacionais com rastreabilidade em vez de criar bloqueios generalizados; exceções explícitas permanecem, como acesso ao financeiro e bloqueio de técnico sem atualização obrigatória. A exigência universal de justificativa para alterações críticas foi rejeitada.

### C.6 Relatórios, portal, documentos e módulos

- Dashboard geral pode mostrar faturamento do período, OS abertas/encerradas, OS com/sem reparo, ticket médio, valores em aberto e equipamentos prontos não retirados; comparar dois períodos foi aprovado. A prioridade da primeira visualização continua sendo operacional.
- Relatórios são layouts fixos mantidos pelo sistema, organizados em OS, Financeiro, Estoque, Comercial e Gerencial. O relatório diário de OS prontas não retiradas é enviado por e-mail.
- Todos os contatos/comunicações ligados à OS são registrados em um único histórico de OS; não se cria módulo independente de comunicação. E-mail pode enviar status e orçamento; WhatsApp inicia comunicação usando dados da OS/cliente. Não ficou aprovada integração automatizada específica.
- Portal mobile contempla fluxos de técnicos, balcão e compras; atualização do histórico pelo portal é registrada com autoria e data. Portal para cliente foi colocado como fase futura. QR Code permite acessar/capturar a OS e há decisão por QR permanente; requisitos de acesso e proteção estão pendentes.
- Estrutura de configuração contempla dados da empresa, garantia padrão, parâmetros financeiros, backup, caminho dos anexos e organização dos parâmetros. Multiempresa é futura: V1 monoempresa para NoteDuke, arquitetura preparada para evolução sem exigir `empresa_id` indiscriminado em todas as tabelas.
- Importação de documentos fiscais aprova consulta de NF-e disponível para o CNPJ e importação de XML de arquivo. O assistente importa/associa produtos, produz entrada de estoque e contas a pagar. A associação inteligente deve guardar a memória de associação de itens/produtos para uso posterior.
