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

O atendimento começa com a identificação do cliente pelo nome informado e a associação do equipamento à OS; não é necessário registrar quem trouxe fisicamente o equipamento. Defeito/reclamação pode ser informado, mas não é obrigatório para confirmar a abertura. Na maior parte dos casos, a equipe avalia o equipamento diante do cliente e prepara o orçamento na recepção. Toda OS confirmada começa obrigatoriamente na situação operacional TRIAGEM; quando não for possível avaliar de imediato, o equipamento é encaminhado para avaliação a partir dessa etapa.

Triagem identifica o setor de avaliação/destino: Laboratório de Sistemas (informática convencional, por exemplo travamento, memória ou SSD) ou Laboratório Eletrônico (indícios de defeito eletrônico, por exemplo equipamento que não liga). O encaminhamento pode mudar após avaliação. Setor/destino físico e situação/status da OS são conceitos distintos.

Após autorização, o equipamento segue para o laboratório adequado. O técnico determina o trabalho, solicita peças quando necessário, executa e testa o reparo. A equipe informa o cliente; quando ele retorna, testa o equipamento no balcão, a OS de saída é emitida, o valor é cobrado conforme o caso e o equipamento é entregue. A conclusão técnica não equivale ao encerramento administrativo/financeiro.

### 2.2 Situação operacional, status macro e encerramento

A OS tem três conceitos distintos: **situação operacional** (etapa do trabalho), **status macro** (ABERTA, FECHADA ou CANCELADA) e **status/motivo de encerramento** (resultado final). A OS pode passar por várias situações operacionais mantendo-se ABERTA. Não unificar esses conceitos.

As situações operacionais iniciais aprovadas são:

1. **TRIAGEM:** estado inicial de todas as OS; na abertura, nenhuma outra situação fica disponível. Atribuível a um ou mais funcionários.
2. **AGUARDANDO AVALIAÇÃO/ORÇAMENTO:** atribuível a um ou mais funcionários.
3. **AGUARDANDO APROVAÇÃO DO ORÇAMENTO:** padrão atribuído ao Administrador, sem impedir outros funcionários.
4. **AUTORIZADO REPARO:** atribuível a um ou mais funcionários.
5. **AGUARDANDO COMPRA DE PEÇA:** padrão Administrador, podendo incluir outros funcionários.
6. **AGUARDANDO CHEGADA DE PEÇA:** padrão Administrador, podendo incluir outros funcionários.
7. **PRONTO AVISAR CLIENTE:** padrão Administrador, podendo incluir outros funcionários.
8. **PRONTO CLIENTE AVISADO:** padrão Administrador, podendo incluir outros funcionários.
9. **NÃO AUTORIZADO - REMONTAR EQUIPAMENTO:** atribuível a um ou mais funcionários. Ao salvar, se houver orçamento, perguntar se deseja removê-lo e colocá-lo no histórico ou mantê-lo.
10. **NÃO AUTORIZADO - PRONTO PRA ENTREGA:** atribuível a um ou mais funcionários. Ao salvar, se ainda houver orçamento, perguntar se deseja removê-lo e colocá-lo no histórico ou mantê-lo.

As situações com responsabilidade padrão da Administração pertencem a uma fila/grupo administrativo, visível e acionável por Administradores ou usuários com permissão equivalente. Não se escolhe automaticamente um Administrador nominal; atribuição a funcionário específico exige escolha explícita e pode coexistir com a fila. Situações criadas futuramente poderão ser atribuídas a qualquer funcionário. A abertura inicia obrigatoriamente em TRIAGEM e pode ficar sem atribuição nominal.

Os status macro são **ABERTA** (OS na loja, ainda não fechada/cancelada), **FECHADA** (OS entregue e faturada nos fluxos usuais; a OS externa encerrada como Equipamento comprado/Doado também fica FECHADA por exceção aprovada, sem pagamento ao cliente nesta etapa) e **CANCELADA** (OS entregue, serviço não executado e sem cobrança; encerrada operacionalmente, mas classificada como cancelada). O efeito fiscal/financeiro da exceção comprado/doado permanece pendente.

Os resultados/status-motivos finais aprovados são **Devolvido sem Reparo**, **Devolvido Reparado** e **Equipamento comprado/Doado**. O último fecha a OS externa e aciona a transferência e a criação automática de OS interna descritas na seção 2.4. A relação dos outros resultados com status macro permanece a detalhar; nenhum resultado substitui a situação operacional ou o status macro.

Mudanças de situação e atribuições geram histórico com usuário, data/hora, OS e situação anterior/nova; registrar funcionários antes/depois quando aplicável. A decisão de remover ou manter orçamento nas duas situações NÃO AUTORIZADO também é registrada. A lista e as propriedades iniciais estão aprovadas; grafo completo de transições, regras técnicas de encerramento e modelagem persistente seguem futuros.

### 2.3 Abertura e dados

Ao iniciar a abertura, o sistema gera o número visível `OS-000001` (prefixo `OS-` e seis dígitos), sequencial global, crescente, único e imutável. O número é apresentado antes da confirmação final para identificar a máquina e permitir etiqueta durante o atendimento. A abertura em andamento fica registrada no banco, mas ainda não é OS ativa de atendimento, não exige cliente/equipamento e não possui retrato histórico definitivo. Ela sobrevive a fechamento do sistema, queda do navegador ou reinício do computador e pode ser retomada ou cancelada ao retornar. Cada usuário pode ter no máximo uma abertura em andamento; antes de iniciar outra, deve retomar ou desistir da existente. Ao confirmar cliente e equipamento, nasce a OS oficialmente como ABERTA/TRIAGEM com número definido. Defeito/reclamação não é obrigatório e começa vazio. Identificadores técnicos internos podem existir, mas o usuário usa o número visível.

Toda abertura registra o usuário iniciador. Usuário comum só pode retomar ou cancelar a própria abertura; Administrador ou usuário com a permissão futura sugerida `service_orders.opening.manage` pode retomar/assumir ou cancelar abertura de outra pessoa. Ação de terceiro gera evento com iniciador, responsável pela ação, data/hora, número visível e ação realizada. Durante a abertura, o usuário autorizado pode alterar os dados temporários livremente, sem tratar isso como correção administrativa e sem histórico detalhado de cada edição. Registram-se os eventos principais de criação, retomada/assunção, confirmação e cancelamento. Não há expiração automática obrigatória no Recorte 1.

Na abertura, seleciona-se o cliente por pesquisa parcial ou total de nome, CPF/CNPJ, telefone ou outros termos definidos para a pesquisa. É possível cadastrar cliente durante o fluxo. O sistema mostra equipamentos associados ao cliente para selecionar um existente ou cadastrar outro. Equipamento criado durante esse fluxo fica automaticamente vinculado ao cliente selecionado.

Se um equipamento existente estiver associado a outra Pessoa, apresentar alerta com titular atual e cliente escolhido. O usuário pode cancelar a seleção, abrir a OS em nome do proprietário cadastrado, ou transferir a titularidade para o cliente informado se for Administrador ou possuir `equipment.transfer_ownership`. A transferência exige escolha/confirmação explícita, informa a consequência e registra o usuário responsável no histórico. A OS não trata normalmente cliente e proprietário como pessoas distintas. A pessoa cujo nome é informado no atendimento é o cliente e proprietário operacional do equipamento para aquela abertura; não há campo ou entidade obrigatória para portador, entregador ou terceiro que trouxe fisicamente a máquina.

Se a abertura for abandonada depois de gerar o número e não houver número maior usado, esse número pode ser reaproveitado na próxima abertura. Se já houver número maior usado, a tentativa fica registrada como ABERTURA CANCELADA e o número não pode ser reutilizado. Aberturas em andamento e canceladas não aparecem na listagem comum de OS; as canceladas ficam disponíveis apenas em consulta administrativa/auditoria ou filtro técnico. A impressão de etiqueta não consome definitivamente o número. O significado técnico exato de “número maior usado” e a concorrência entre reservas ainda exigem definição de implementação.

Dados da OS incluem cliente e equipamento; tipo, Marca (que representa também o fabricante), modelo e número de série/asset tag; bateria (campo textual livre, podendo registrar presente, ausente, serial ou observação); acessórios; estado geral/observações de entrada; defeito e reclamação informados pelo cliente; prioridade (normal, urgente, muito urgente ou baixa prioridade); técnico responsável opcional; e um ou dois campos personalizados previstos no levantamento inicial. A reclamação do cliente inicia vazia em cada nova OS. Condição, observações e acessórios são registrados por atendimento e não devem ser preenchidos automaticamente com dados históricos do equipamento.

Os dados permanentes identificadores do equipamento são exibidos inicialmente protegidos contra edição, com ação explícita “Alterar dados do equipamento”. Dados específicos daquele atendimento não sobrescrevem automaticamente o cadastro permanente.

### 2.4 Autorização, datas e encerramento

Qualquer pessoa pode autorizar o serviço em nome do cliente/empresa e qualquer usuário autorizado operacionalmente pode registrar a autorização e alterar a situação operacional. Alterar o status macro para FECHADA ou CANCELADA exige Administrador ou permissão específica. Na decisão atual, autorização e não autorização são registradas pela mudança de situação, com operador e data/hora automáticos. Não criar entidade/formulário de aprovação nem exigir nome do autorizante externo, canal, evidência, assinatura ou motivo. Observação manual no histórico é opcional e tem recurso próprio `/notes`, separado da mudança de situação e dos eventos automáticos.

A situação operacional e seu histórico identificam reparo autorizado e o instante da mudança. A primeira fatia não cria data editável nem formulário de aprovação; eventuais apresentações cronológicas derivam do histórico. Data/hora autoritativas vêm do servidor. A decisão simples atual substitui a previsão anterior de registro estruturado e edição de data de aprovação.

Nos fluxos usuais, encerrar a OS é o ato administrativo de devolver o equipamento e fechar o atendimento, podendo registrar valores finais, descontos e forma(s) de pagamento. Uma OS devolvida sem reparo não gera cobrança, ainda que possa conservar valores informativos/orçados no documento. A impressão de saída acompanha a devolução; quando houver serviço cobrado, a garantia deve ser expressa no documento de saída. No fluxo Equipamento comprado/Doado, a OS externa também fica FECHADA, mas o equipamento passa à Pessoa da própria empresa e segue para uma OS interna; não há pagamento ao cliente nesta etapa (seção 2.4).

OS FECHADA ou CANCELADA não pode ser excluída e permanece rastreável. Mudanças entre situações operacionais são livres para usuário autorizado após a abertura, sem sequência rígida, e geram histórico. Somente Administrador ou usuário com permissão específica pode alterar o status macro para FECHADA/CANCELADA. Não se permite transição direta FECHADA→CANCELADA nem CANCELADA→FECHADA.

Há reabertura simples, para correção textual por usuário autorizado, sem alterar situação/status macro, faturamento ou pagamentos; e reabertura completa, para retornar a mesma OS (sem criar outra nem trocar seu número) a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO. Reabertura completa pode ser aplicada inclusive a OS CANCELADA, exceto à OS externa encerrada como Equipamento comprado/Doado após a criação da interna, que admite somente reabertura simples textual. A reabertura completa cancela o faturamento vinculado e retira pagamentos do financeiro ativo por cancelamento auditável, preservando seus registros históricos. Gera registro histórico e aviso no dashboard do Administrador. Após reabrir uma OS FECHADA ou CANCELADA elegível, só então pode ser aplicada a outra mudança de status macro, respeitando as permissões.

Na reabertura completa, peças de estoque vinculadas à OS retornam a ORÇADA até nova avaliação por técnico ou usuário autorizado, inclusive peças anteriormente UTILIZADAS/BAIXADAS; a transição registra estados anterior/novo e motivo. Isso não apaga movimentos ou históricos anteriores. A reconciliação de estoque de itens já BAIXADOS e o tratamento de documentos fiscais, títulos liquidados, estornos/devoluções, justificativas, preservação do resultado de encerramento e eventuais pendências de conferência ainda precisam de decisão/desenho específico.

#### Encerramento Equipamento comprado/Doado

Quando OS de cliente externo termina com esse resultado, a OS original fica FECHADA, o equipamento é transferido à Pessoa única configurada como representante da própria empresa e uma nova OS interna é criada automaticamente para essa Pessoa e o mesmo equipamento, em ABERTA/TRIAGEM. As OS mantêm referências recíprocas. A Pessoa da empresa é configurada, removida ou substituída somente por Administrador, com histórico administrativo; deve ser ativa e cumprir os critérios de titular de equipamento, incluindo Tipo de Contato Cliente. Se não existir configuração, bloquear o encerramento e informar que ela é obrigatória.

O encerramento, transferência, abertura da OS interna e vínculos registram usuário e data/hora. A nova OS mantém, em área histórica herdada separada de seus dados operacionais: número da OS original; cliente original; equipamento; defeito/reclamação; observações internas; laudo; orçamento anterior; peças/serviços orçados; resultado; data/hora e usuário do encerramento. Cobranças, pagamentos, serviços cobrados, peças UTILIZADAS/BAIXADAS e pendências abertas da original não são itens ativos na nova OS e só podem aparecer como histórico herdado. Não se registra valor pago ao cliente nesta etapa; valor, forma, saída financeira e compra formal do equipamento ficam para depois.

Depois de criada a OS interna, a original não recebe movimentações técnicas, conserva a negociação/encerramento e o vínculo interno, e só admite reabertura simples textual. A OS interna segue as regras gerais, mas não pode ser encerrada novamente como Equipamento comprado/Doado. Essa vedação evita uma cadeia infinita de OS internas. A consistência técnica entre fechamento, transferência e criação, assim como os detalhes fiscais/financeiros, permanece para modelagem futura.

### 2.5 Histórico, prioridade e acompanhamento

Há histórico operacional visível, no qual usuários registram comentários/anotações e o sistema registra autor e data/hora. Há também log administrativo restrito a pessoas autorizadas, destinado a registrar alterações e apoiar investigação. A conversa aprovou histórico único da OS e registro de autorização, movimentações e eventos relevantes nele, mantendo a distinção de acesso ao log administrativo.

O sistema deve permitir localizar OS e visualizar seu status atual, prioridade, aprovação e histórico. Reabertura completa gera aviso no dashboard do Administrador. O campo de prazo combinado com o cliente é opcional e informativo; não bloqueia o fluxo nem gera alerta automático na versão descrita. O destaque de OS em garantia é visual, informativo e aparece na tela e nas listas.

Decisões complementares: RN-148 aprova a data de prazo prometido como campo opcional, editável e informativo; não gera alerta automático nesta versão. RN-149 aprova o destaque visual da OS vinculada a atendimento em garantia, tanto na tela quanto nas listas. RN-150 aprova recebimento antecipado antes da conclusão da OS; o valor permanece vinculado à OS como crédito recebido e segue as regras financeiras mesmo se a OS for cancelada.

### 2.6 Numeração, duplicação e exclusão

Toda OS confirmada recebe número visível no formato `OS-` + seis dígitos, em sequência global, crescente, única e imutável. É gerado durante a abertura, antes da confirmação, e não muda em reabertura, cancelamento, fechamento ou edição. Abertura abandonada segue a regra específica de reaproveitar se não houver número maior usado, ou registrar ABERTURA CANCELADA sem reuso se já houver; etiqueta impressa não determina consumo. Outros documentos podem ter códigos internos gerados pelo sistema; seus formatos e contadores não são definidos por essa decisão. Identificadores técnicos internos da OS não substituem seu número visível.

É permitida clonagem/duplicação de documentos quando aprovada para o módulo: a operação cria novo documento/cadastro, não altera o original. Clonagem de pedido de venda, proposta comercial e faturamento foi aprovada; dados fiscais e financeiros não são copiados na clonagem de faturamento. Produtos podem ser clonados sem código, SKU ou identificadores únicos. A padronização “duplicar” cria um novo registro, preservando a origem.

### 2.7 Retrato histórico cadastral e correções de vínculo da OS

Ao confirmar a abertura, o sistema grava uma única vez um retrato histórico cadastral parcial dos dados principais do cliente e do equipamento. No primeiro recorte, ele será armazenado em objetos JSON estruturados próprios da OS, com campos sugeridos `customerSnapshotJson` e `equipmentSnapshotJson`, separados dos vínculos relacionais atuais com Pessoa e Equipamento. Os objetos guardam valores textuais principais para permanecer legíveis sem depender de IDs internos, e incluem `snapshotVersion: 1` e `capturedAt` correspondente ao momento da confirmação. O mínimo é nome do cliente e identificação principal do equipamento. Quando disponíveis, também são copiados documento do cliente, telefone e e-mail principais, endereço, tipo de equipamento, marca, modelo, número de série e observações/campos principais do equipamento. A abertura em andamento não recebe o retrato definitivo.

O retrato é imutável e não editável manualmente. Alterações posteriores nos cadastros atuais, reabertura da OS ou correção do cliente/equipamento vinculado não recalculam nem substituem o retrato original. `capturedAt` registra a confirmação da abertura, mesmo que `createdAt` da OS tenha sido definido antes. Usuários com permissão de visualizar a OS podem consultá-lo no histórico, claramente identificado como a situação cadastral na confirmação. A tela e a impressão padrão usam os dados atuais dos cadastros vinculados. Não há aviso automático obrigatório de divergência nem opção própria para imprimir o retrato histórico.

O retrato cadastral não inclui estado físico, acessórios, itens avulsos, senha informada, observações de recebimento, carregador, bolsa, avarias ou itens ausentes; esses dados pertencem a possível checklist/registro de recebimento futuro.

Depois da confirmação, corrigir cliente ou equipamento vinculado é alteração controlada, não nova abertura. Somente Administrador ou usuário com permissão específica futura sugerida (`os.correct_customer` ou `os.correct_equipment`, conforme o vínculo) pode realizar a correção. A OS mantém seu número e retrato originais, passa a usar o vínculo atual na tela e nas impressões e registra obrigatoriamente usuário, data/hora, campo alterado e valores anterior/novo. Motivo não é obrigatório; poderá existir futuramente como campo opcional. As regras para OS fechada/cancelada e titularidade estão na seção 2.8. A persistência, os contratos de API e os detalhes técnicos seguem sem decisão de modelagem.

### 2.8 Correção administrativa dos vínculos de cliente/equipamento

Administrador ou usuário com permissão específica poderá corrigir o cliente ou equipamento vinculado mesmo quando a OS estiver FECHADA ou CANCELADA. A operação não reabre a OS, não altera status macro, número ou retrato cadastral e não altera faturamento, cobrança, pagamento ou estoque. A correção pode ocorrer apesar de existirem registros financeiros vinculados, mas não os modifica automaticamente; ajustes eventualmente necessários pertencem a operação financeira própria, com regras e histórico próprios. Não há alerta automático obrigatório no painel do Administrador; relatórios ou filtros de auditoria podem ser considerados futuramente.

Ao corrigir o equipamento, se o proprietário atual divergir do cliente da OS, alertar e exigir escolha explícita entre cancelar a correção, corrigir também o cliente se houver permissão, ou transferir a titularidade por Administrador ou usuário com `equipment.transfer_ownership`. Ao corrigir o cliente, se o equipamento continuar vinculado ao cliente anterior, alertar e exigir decisão explícita sobre a transferência. Se o usuário não puder ou não quiser transferir, cancelar a correção. Nenhuma transferência pode ocorrer silenciosamente.

Pode-se corrigir cliente e equipamento na mesma operação administrativa. Todas as permissões e condições de titularidade devem ser validadas; a operação é atômica, aplicando todos os vínculos e eventos ou nenhum deles. O histórico identifica cada campo alterado e registra usuário, data/hora e valores anterior/novo. Motivo não é obrigatório, podendo ser um campo opcional futuro. O desenho da transação, os contratos de API e a estrutura física permanecem pendentes.

## 3. Clientes, contatos e equipamentos

### 3.1 Pessoas e clientes

Adota-se cadastro único de Pessoas, com Tipo de Pessoa PF ou PJ. Os campos obrigatórios mínimos para salvar são Tipo de Pessoa e Nome/Razão Social. Todos os demais campos são opcionais no cadastro geral, salvo regras específicas de fluxos futuros, como emissão fiscal. A Pessoa também contempla CPF/CNPJ, Nome Fantasia, Inscrição Estadual, Inscrição Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso.

CPF/CNPJ é opcional no cadastro geral. CPF aplica-se a PF, é armazenado somente com números em 11 dígitos e validado matematicamente quando informado. CNPJ aplica-se a PJ e aceita o formato numérico antigo ou o alfanumérico oficial; é armazenado sem pontuação, em maiúsculas, e validado matematicamente conforme o algoritmo aplicável. CPF/CNPJ informado deve ser único e compatível com o Tipo de Pessoa. A máscara é aplicada somente na interface. Normalização, validação matemática, compatibilidade e verificação de duplicidade são responsabilidades do Backend/API; validação visual do Frontend não é autoridade final.

Nome Fantasia não se aplica a PF e é opcional para PJ. Quando não informado para PJ, a Razão Social é a referência principal de exibição. Inscrição Estadual e Inscrição Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, não passam por validação fiscal específica por estado ou município; o valor informado é armazenado sem interpretação fiscal complexa.

Uma Pessoa pode ter vários Tipos de Contato simultaneamente. O catálogo inicial de cadastro próprio contém Cliente (contrata serviços ou adquire produtos), Fornecedor (fornece produtos ou serviços), Transportadora (realiza transporte), Prestador de Serviço (presta serviços) e Parceiro (mantém relação de parceria comercial ou operacional); não é uma enumeração fixa. Tipo de Contribuinte também será classificação de cadastro próprio, destinada inclusive ao uso fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). É opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal; não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.

Uma Pessoa poderá possuir zero ou uma Pessoa de Contato vinculada. A Pessoa de Contato é outro cadastro completo de Pessoa, não um conjunto simplificado de dados duplicados. A pessoa que autoriza uma OS pode ser qualquer membro de uma família/empresa, não necessariamente a Pessoa de Contato.

Uma Pessoa poderá possuir múltiplos endereços, inclusive vários do mesmo Tipo de Endereço; o Tipo classifica, mas não limita a quantidade. Cada endereço poderá ser principal. Telefones e e-mails também podem ser múltiplos. Em cada coleção há no máximo um principal, sem obrigação de haver um; marcar outro desmarca o anterior, e remover/inativar o principal pode deixar a coleção sem principal. A pesquisa de clientes e dados para segmentação/mala direta também foi aprovada.

O recorte de contatos foi implementado como sub-recursos de Pessoa, limitados a adicionar e listar pelas rotas diretas `/api/v1/people/:publicId/phones` e `/api/v1/people/:publicId/emails` (`POST` e `GET`). `label` físico não é aceito nem retornado, permanecendo nulo/sem uso; contatos possuem `public_id` próprio e único, sem expor `id` interno. Edição, remoção e inativação de contato e edição geral da Pessoa permanecem fora. Listagem é permitida para Pessoa inativa; inclusão é bloqueada (`409 PERSON_INACTIVE`).

Telefone é persistido somente em dígitos, com máximo de 32: dez dígitos ou onze com 9 após o DDD passam sem aviso de formato; menos de dez, mais de onze até 32 ou onze sem esse 9 produzem aviso não bloqueante. Sem `confirmNonstandardPhone: true`, a API responde `409 PHONE_CONFIRMATION_REQUIRED` com `PHONE_NONSTANDARD_FORMAT` e número normalizado, sem gravar; mais de 32 dígitos são bloqueados. E-mail é convertido para minúsculas após `trim`, deve ser ASCII e tem até 254 caracteres. Exige exatamente um `@`; a parte local tem até 64 caracteres e aceita letras minúsculas, dígitos e `_ % + -`, com pontos somente entre segmentos não vazios. O domínio tem até 253 caracteres, pelo menos dois rótulos separados por ponto; cada rótulo tem 1 a 63 caracteres, aceita letras minúsculas, dígitos ou hífen e começa/termina por letra ou dígito. Não há consulta DNS ou verificação da caixa postal. Formato inválido retorna `400 INVALID_EMAIL`; repetição do mesmo e-mail normalizado na mesma Pessoa bloqueia (`409 DUPLICATE_PERSON_EMAIL`); entre Pessoas diferentes, grava no primeiro envio válido com aviso genérico `EMAIL_SHARED_ACROSS_PEOPLE`, sem confirmação extra nem exposição de dados da outra Pessoa. Telefone e e-mail têm principalidade independente e opcional; marcar novo principal desmarca o anterior da mesma coleção em transação, impedindo dois principais simultâneos, com garantia adicional por índice funcional único no MySQL.

A inclusão em Pessoa existente exige `confirmPersonChange: true` em todo `POST`; sem isso, responde `409 PERSON_CHANGE_CONFIRMATION_REQUIRED` sem gravar ou criar evento. Essa declaração não comprova, sozinha, que a interface mostrou a mensagem nem substitui autenticação. Cada inclusão bem-sucedida gera `PHONE_CREATED` ou `EMAIL_CREATED`; se o principal efetivo mudar, inclusive de nulo para o primeiro, gera também `PHONE_PRIMARY_CHANGED` ou `EMAIL_PRIMARY_CHANGED`. A tabela `person_contact_events` relaciona Pessoa e contato, tipo, data/hora e valores quando aplicáveis. Não há usuário fictício nem rota pública. O schema Prisma e a migration Auth criada incluem `user_id` opcional; eventos já existentes permanecem com `NULL` e o ator é persistido na mesma transação da alteração de contato. Inclusão, principalidade e eventos são atômicos, com reversão total se o histórico falhar. Esse histórico não substitui o histórico geral definitivo. A migration `20261007183000_person_contacts` foi aplicada e validada. A tabela de eventos não tem CHECK que obrigue XOR entre as FKs de telefone/e-mail ou valide tipo contra FK; o service garante a coerência. Auth está implementado no código; a migration e o seed de 24 permissões estão aplicados no banco principal, o bootstrap foi concluído e os principais testes HTTP autenticados locais passaram. Testes específicos de criação de contato e registro de `user_id` permanecem pendentes. Frontend permanece futuro e o recorte não está pronto para produção.

Para catálogos auxiliares, uma opção não utilizada pode ser editada, inativada ou excluída; uma opção já utilizada pode ser editada ou inativada, mas não excluída fisicamente. Opções inativas não são oferecidas por padrão em novos cadastros e permanecem válidas nos históricos. Renomeações são permitidas; o cadastro mostra o nome atual e o histórico registra valor anterior/novo, data/hora e usuário responsável quando disponível. Uma regra específica futura pode substituir a regra geral.

Quando CPF/CNPJ for informado e já estiver associado a outra Pessoa, o cadastro é bloqueado. Como regra aprovada, sem CPF/CNPJ a possível duplicidade será comparada exatamente por Nome/Razão Social em caixa alta sem espaços extras, telefone somente numérico e e-mail em minúsculas após trim. Correspondência gera aviso não bloqueante e permite continuar. A criação atual implementa o aviso por nome; comparação por telefone/e-mail ainda é futura. Busca aproximada/fuzzy está fora desta etapa.

Observações são informação passiva. Aviso é um único campo informativo da Pessoa. Nos contextos aprovados — visualização do cadastro, abertura de OS e venda —, se houver conteúdo, o sistema pergunta “Há informação a ser visualizada. Deseja visualizar agora?”. Sim exibe o conteúdo; Não oculta-o naquele momento e mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua. A pergunta reaparece a cada ocorrência, sem dispensa por sessão, atendimento ou usuário; o conteúdo nunca é exibido automaticamente. Nesta etapa não há log de leitura, registro da resposta, confirmação formal de ciência ou histórico de leituras.

Usuário com permissão pode preencher Aviso quando o campo está vazio. Alterar ou apagar Aviso existente e consultar seu histórico sensível exige Administrador ou permissão explícita equivalente. Administrador tem poderes máximos; as permissões são atribuídas por usuário/ação, sem perfis rígidos de Técnico ou Usuário comum. Master não existe no sistema. Histórico de leitura, múltiplos Avisos e trilha técnica detalhada permanecem pendentes.

Pessoa nunca é excluída fisicamente, mesmo sem vínculo histórico ou se cadastrada por engano; a única saída é inativar. Inativar/reativar exige Administrador ou permissão explícita equivalente. Pessoa inativa pode ser localizada e consultada pelo filtro “incluir inativos”, mas não pode ser usada em novos vínculos operacionais, inclusive OS, venda ou como proprietário de Equipamento; continua visível no histórico. Na abertura da OS, a Pessoa informada pelo nome é cliente e proprietário operacional. Se o titular cadastrado for diferente, aplicam-se o alerta e as escolhas explícitas da seção 2.3. Não há campo obrigatório para portador/entregador. Não haverá snapshot completo da Pessoa/Equipamento em cada OS; na confirmação será gravado o retrato histórico cadastral parcial definido na seção 2.7, além do histórico de alterações/movimentações.

### 3.2 Equipamentos

Equipamentos possuem cadastro permanente vinculado a um proprietário/cliente e histórico de titularidade. O proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Pessoa inativa não pode ser usada em novo vínculo. Na abertura, a Pessoa cujo nome é informado no atendimento define o cliente e o proprietário operacional do equipamento para aquela OS. Se o equipamento estiver vinculado a outra Pessoa, o usuário deve escolher explicitamente entre cancelar a seleção, abrir para o proprietário atual ou transferir a titularidade para o cliente atual. A transferência só pode ser feita por Administrador ou usuário com `equipment.transfer_ownership`, não ocorre silenciosamente e registra ator/histórico. Não existe campo/entidade obrigatória para quem trouxe fisicamente o equipamento. Não há snapshot completo dos cadastros dentro da OS; a OS mantém o retrato histórico cadastral parcial da confirmação, e os dados atuais são complementados pelo histórico, sem reescrever eventos registrados. É possível reutilizar equipamento ao abrir OS e consultar seu histórico.

Equipamento pode ser excluído fisicamente somente por Administrador ou permissão equivalente e sem qualquer registro persistido relacionado. Vínculos de OS, venda, orçamento, garantia, entrega/devolução, transferência, movimentação técnica, financeiro ou histórico/auditoria impedem exclusão e permitem somente inativação autorizada. Inativo não aparece como opção padrão em novas OS e continua nos históricos. O schema e o banco principal possuem `equipment.is_active`; a inativação funcional ainda depende do Backend.

Tipo de Equipamento e Marca são cadastros próprios; Marca representa também Fabricante. O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Modelo é obrigatório; número de série/asset tag é opcional. Nesta etapa, status de Equipamento limita-se a Ativo/Inativo, e Equipamento novo inicia Ativo. Ativo aparece normalmente para abertura de OS; Inativo não é opção padrão, pode ser localizado por filtro de inativos e continua aparecendo nos históricos antigos. Outros estados operacionais não estão incluídos.

Ao criar equipamento novo durante uma abertura de OS, Tipo é obrigatório; Marca e Modelo também devem ser preenchidos, com opções controladas exibidas como “Não informada” e “Não informado” quando desconhecidos. A série pode ser informada ou marcada “Não identificado”. Estado físico, observações, acessórios e bateria continuam sendo dados próprios da entrada da OS, não do cadastro permanente do Equipamento.

Número de série, quando informado, é o principal critério de duplicidade e a comparação considera o proprietário atual. Repetição para o mesmo proprietário bloqueia o cadastro. Repetição para proprietário diferente gera aviso não bloqueante, permite cadastrar outro Equipamento e não sugere transferência. Sem serial, o Equipamento pode ser salvo normalmente e não há busca automática por combinação de proprietário, tipo, Marca e Modelo; essa busca combinada foi reprovada. Não se definem normalização avançada, tratamento por Marca/Fabricante, fusão automática ou bloqueio global de serial nesta etapa.

Tipo de Equipamento e Marca seguem o ciclo de vida dos cadastros auxiliares: sem uso podem ser editados, inativados ou excluídos; usados podem ser editados ou inativados, mas não excluídos fisicamente. Renomeações após uso são permitidas; o cadastro exibe o nome atual e o histórico registra nome anterior/novo, data/hora e usuário quando disponível, sem snapshots completos nas referências. Os catálogos iniciais de Tipo de Equipamento e Marca são cadastros próprios expansíveis. O seed será idempotente, executado por comando controlado e não automaticamente no startup; cria valores ausentes, não duplica e não desfaz renomeações permitidas.

Transferência de titularidade é permitida: o novo proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente e ativa. A transferência altera o proprietário atual e registra evento no histórico, sem alterar OS antigas. Se o equipamento ainda não tiver vínculo histórico, o proprietário pode ser corrigido sem tratar a ação como transferência formal. Com histórico, a mudança deve ser transferência, realizada por usuário com a permissão correspondente, sem justificativa obrigatória. Pode ocorrer manualmente fora de OS ou durante atendimento/OS e poderá ser vinculada a uma OS, mas o vínculo é opcional.

No fluxo Equipamento comprado/Doado, o novo titular é a Pessoa única configurada como representante da própria empresa, também ativa e com Tipo de Contato Cliente. A transferência vincula-se à OS original, cria uma OS interna para o mesmo equipamento e mantém referências entre as duas; ver seção 2.4.

Os catálogos iniciais de Tipo de Equipamento e Marca são listas de cadastros próprios expansíveis, não enums fixos no código. Tipos e marcas inativos não aparecem como opções padrão em novos equipamentos; valores usados não podem ser excluídos fisicamente.

Dados textuais persistidos são convertidos para MAIÚSCULAS no Backend antes de salvar, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números; máscaras são apenas visuais e CEP é opcional. Telefone com 10 dígitos é aceito como fixo; 11, como celular se o primeiro após o DDD for 9. Menos de 10, mais de 11 até 32 ou celular sem nono dígito gera aviso não bloqueante, permitindo continuar após confirmação. Telefone sem dígitos ou acima de 32 é bloqueado no recorte aprovado. Endereço segue a caixa alta geral.

Número de série é salvo em caixa alta sem remover ou alterar espaços, inclusive no início/fim, pontos, traços, barras ou outros símbolos. Assim, `ABC-123` e `ABC123` são valores diferentes. A regra de duplicidade por proprietário continua separada dessa normalização.

A pesquisa de equipamentos localiza por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo permite busca textual; serial permite busca exata ou parcial; status filtra Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem mediante filtro. Pesquisa não bloqueia cadastro nem substitui a regra de duplicidade por serial; sem serial não existe alerta/bloqueio automático por proprietário + Tipo + Marca + Modelo. Detalhes de pesquisa avançada e filtros combinados permanecem pendentes.

Na ficha do Equipamento, usuário com permissão pode alterar Tipo, Marca, Modelo e Número de Série com ou sem histórico, sem justificativa obrigatória; as alterações são registradas automaticamente. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, exige transferência. Isso não altera o ciclo de vida dos cadastros auxiliares de Tipo e Marca.

Dados textuais persistidos são convertidos para MAIÚSCULAS no Backend, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números e usam máscara apenas visual; CEP é opcional. Os critérios aprovados de telefone para o próximo recorte estão na seção 3.1; formato inesperado até 32 dígitos gera aviso não bloqueante com confirmação explícita, e mais de 32 dígitos são bloqueados. Serial é salvo em caixa alta sem remover ou alterar espaços, inclusive no início/fim, nem símbolos; valores como `ABC-123` e `ABC123` são diferentes.

A pesquisa de equipamento permite localizar por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; Status oferece Ativo, Inativo ou Todos, mantendo inativos ocultos por padrão. Pesquisa não bloqueia cadastro nem altera a regra de duplicidade de serial.

Na abertura rápida de OS, o usuário escolhe equipamento existente ou cria um. A consulta de histórico deve estar disponível no fluxo. Para Dell, foi aprovada/pesquisada integração futura de consulta do modelo pelo asset tag/serial; o asset tag Dell corresponde ao número de série.

### 3.3 Histórico e permissões de Cadastros

Não será adotado snapshot completo dos dados de Pessoa ou Equipamento dentro de cada OS. O sistema manterá histórico de alterações de campo e eventos/movimentações relevantes em Pessoa, Equipamento, OS e entidades relacionadas, além do retrato histórico cadastral parcial capturado na confirmação. Alteração de campo registra, quando aplicável, entidade, campo, valor anterior, novo valor, data/hora e usuário responsável quando o módulo de usuários estiver definido. Evento/movimentação registra ações relevantes que não sejam apenas troca de valor, como adicionar/remover telefone/endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade ou cancelar OS. A lista final de eventos básicos e sensíveis permanece pendente.

O histórico geral por entidade é exibido no contexto da Pessoa, Equipamento ou OS. Usuário com permissão pode consultar histórico operacional básico; histórico completo, Aviso e histórico técnico/auditoria exigem Administrador ou permissão explícita equivalente. Administrador tem poderes máximos. A estrutura física e a lista final de eventos básicos/sensíveis permanecem pendentes; uma visão administrativa geral poderá existir futuramente.

Permissões são atribuídas por usuário/ação; Técnico e Usuário comum não são perfis rígidos. Administrador tem poderes máximos, e permissões equivalentes para ações específicas podem ser atribuídas a outros usuários. A matriz de Cadastros define as ações autorizadas por regra funcional, sem criar o módulo técnico de usuários. Pessoa nunca é excluída fisicamente; Equipamento só pode ser excluído sem qualquer registro persistido relacionado e com permissão correspondente.

Antes de salvar qualquer alteração de Pessoa ou Equipamento, o sistema exibe: “Estas alterações serão registradas no histórico. Deseja continuar?”. Ao confirmar, salva e registra automaticamente; ao cancelar, não salva. Alterações não exigem justificativa obrigatória. Transferências feitas por usuário autorizado também geram evento automaticamente.

## 4. Orçamentos, serviços, itens e garantia

### 4.1 Orçamento e itens

O orçamento é uma composição vinculada diretamente à OS, não uma entidade ou fluxo autônomo, e não tem status próprio: acompanha a situação operacional da OS. Seus únicos tipos são serviço/mão de obra, peça avulsa e peça do estoque; não existe tipo Outro. Alterações de valores cobrados dos três tipos podem ocorrer após aprovação sem exigir nova aprovação do cliente e devem ser historizadas. Não há financeiro nesta fase nem movimentação de estoque ao apenas orçar peça. Na primeira fatia só peça avulsa tem custo unitário opcional não negativo, com NULL distinto de zero; ver/alterar são capacidades separadas e alteração pressupõe visualização, inclusive na API/histórico. Códigos técnicos permanecem propostos. Este fluxo não está implementado.

**Consolidação atual:** regras em docs/02-Regras-de-Negocio.md e proposta de itens em docs/planejamento/Recorte-2-Orcamento-Desenho-Tecnico.md. O Cadastro de Serviços já possui schema, migration, API e tela, com `services.manage`; migration aplicada apenas em `gestor_os_opening_test`, ainda pendente no principal. Nome de até 120 caracteres é único após normalização entre ativos e desabilitados; preço padrão `DECIMAL(15,2)` obrigatório admite zero e não afeta lançamentos anteriores. Reabilitar cadastro existente permite reutilizar nome; exclusão física preserva auditoria e libera nome, mas a proteção por vínculo histórico com OS depende da futura associação. Serviço/Mão de obra, Peça avulsa, peça do estoque e permissões de orçamento/custo permanecem futuros. Quantidade inteira ≥1, total calculado de itens atuais, histórico de retiradas e AGUARDANDO APROVAÇÃO sem itens são regras aprovadas, ainda sem implementação de itens.

O orçamento possui somente os três tipos aprovados. Componentes de consumo técnico pertencem ao desenho futuro de itens técnicos/estoque, não a uma quarta categoria cobrada. Lançamento avulso obedece à regra contra contorno de cadastro correspondente, inclusive inativo.

Custos internos nunca aparecem em documentos destinados ao cliente. No orçamento inicial, somente peça avulsa tem custo; a API/histórico omitem seus valores de quem não pode visualizar, e editar pressupõe visualizar. Valor cobrado é visível a quem trabalha com orçamento e editável com a permissão de editar orçamento, sem permissão separada de preço. Desconto/acréscimo não integra orçamento: desconto único no fechamento pertence ao futuro faturamento, futuramente em valor ou percentual. Peças avulsas não podem contornar peça cadastrada/inativa; integração com catálogo ainda requer definição.

### 4.2 Serviços

O Cadastro de Serviços está implementado no Backend e Frontend, com nome obrigatório e imutável de até 120 caracteres após limpeza, único após normalização inclusive entre desabilitados; a chave ignora caixa, acentos e diferenças de espaços, preservando a distinção da pontuação. Preço padrão obrigatório admite zero, nunca negativo, e pode mudar inclusive quando desabilitado. Novo serviço nasce ativo. Auditoria de criação, preço, atividade e exclusão registra ator e instante. Serviço associado alguma vez a OS não poderá ser excluído; o bloqueio por vínculo será implementado quando existirem itens de orçamento, pois ainda não há FK/associação. Nunca associado pode ser excluído ativo ou desabilitado, com snapshot administrativo de nome, preço, ator e instante, liberando o nome. Administração usa `services.manage`, separada da futura edição do orçamento. Não há catálogo pré-carregado. A migration do catálogo foi aplicada somente em banco isolado; ainda não no principal.

### 4.3 Garantia

O retorno de equipamento para atendimento em garantia deve ser identificado como tal e relacionado à OS/atendimento original. A garantia pertence ao atendimento/serviço executado, e a nova OS de retorno mantém sua própria identidade e histórico. O sistema deve destacar visualmente OS em garantia.

Existe garantia padrão configurável pela empresa e indicação expressa da garantia no documento de saída. O sistema deve apoiar a identificação/fluxo de retorno, sem presumir aprovação automática ou encerramento automático da garantia. Prazo, cobertura por tipo de serviço/peça, exceções, início da contagem e procedimento de garantia permanecem pendentes quando não explicitados.

## 5. Estoque, produtos e compras

**Estado da primeira fatia implementada:** o cadastro básico de Produtos e o controle manual inicial de estoque foram implementados. A migration `20261015150000_product_stock` e o seed da permissão `products.stock.manage` foram executados somente em `gestor_os_opening_test`; o banco principal `gestor_os` permaneceu intocado. O controle atual usa um local implícito, ledger de movimentos imutável e saldos agregados (`total`, `applied`, `defective`, `available`), com quantidades inteiras e saldo negativo permitido. Entrada, ajuste, classificação de defeituosa, retorno e descarte confirmado gravam movimento e Log Administrativo atomicamente. Consulta aceita `products.manage` ou `products.stock.manage`; movimentar exige `products.stock.manage` ou Administrador. Integração com OS, compras, inventário, unidade de medida e locais adicionais continuam fora desta fatia.

### 5.1 Princípios do estoque

Estoque é controlado por movimentações, que são a fonte da verdade. Não se recalcula saldo por consulta indireta a OS. Movimentações não podem ser apagadas; correções são novos lançamentos. O Recorte 4 implementa apenas origem `MANUAL`, com auditoria atômica. Compra, venda, OS, inventário, devolução e transferência são origens planejadas para etapas futuras e podem exigir documento de origem próprio.

Os status principais da peça controlada pelo estoque no ciclo OS/Estoque são DISPONÍVEL (parada no estoque, sem previsão de uso), ORÇADA, UTILIZADA e BAIXADA. ORÇADA significa lançamento de peça de estoque em orçamento de OS, não altera estoque nem reduz disponibilidade e pode corresponder a peça física ou previsão de compra vinculada ao estoque. Peça avulsa não integra esse ciclo. Se orçamento, item ou OS for recusado/cancelado enquanto a peça de estoque permanecer ORÇADA, não há movimento nem impacto no estoque; atualiza-se o status do lançamento e preserva-se o histórico. Todos os usuários autorizados na OS podem mudar ORÇADA para UTILIZADA. Essa transição registra usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável. UTILIZADA é peça retirada do estoque, instalada ou em processo de instalação; fica indisponível para outra OS ou venda, mas ainda não representa baixa definitiva.

Decisão posterior substituiu a pendência administrativa por unidade: remoção confirmada de peça aplicada desfaz a aplicação e restaura disponibilidade na mesma transação; cancelamento com peças aplicadas exige confirmação de retirada física antes da reversão. No encerramento com reparo, as diferenças entre quantidades orçadas e aplicadas são regularizadas explicitamente e, então, a quantidade aplicada é baixada. Operações relevantes preservam Histórico Operacional e Log Administrativo conforme a natureza de cada ato.

BAIXADA representa a baixa definitiva: ao encerrar com reparo, as quantidades aplicadas e regularizadas passam a BAIXADA; peças somente ORÇADAS não são baixadas. Peças avulsas não geram baixa. A regra anterior que bloqueava encerramento por pendência administrativa de devolução foi substituída. O ledger e as operações manuais iniciais já foram implementados, conforme o estado registrado na seção 5.1; os movimentos vinculados aos itens da OS e os fluxos de aplicação/baixa ainda são futuros. Peça classificada como defeituosa pode retornar à disponibilidade ou ser descartada; garantia, análise, sucata e devolução ao fornecedor ainda não têm fluxo.

Em reabertura completa, todas as peças vinculadas à OS passam a ORÇADA, inclusive as antes UTILIZADAS ou BAIXADAS, e ficam nesse estado até atualização por usuário autorizado após reavaliação. Registrar a transição e preservar movimentos anteriores. Como ORÇADA não altera disponibilidade, a reabertura de peça antes BAIXADA exige que o futuro desenho detalhe como reconciliar o estoque físico/financeiro; não presumir entrada ou estorno automático.

Peça avulsa é item manual da OS para descrição, orçamento e cobrança; não pertence ao cadastro de estoque, não tem saldo, não afeta disponibilidade, não gera movimento, baixa ou pendência de conferência e não percorre o ciclo de estoque. Não pode ser convertida em peça de estoque: se comprada para controle, deve ser cadastrada separadamente e lançada como peça de estoque. Custo interno unitário opcional está aprovado para peça avulsa: NULL desconhecido, zero conhecido, negativo proibido, total calculado quando informado e acesso controlado na API/histórico. Serviço/Mão de obra não tem custo interno nesta fatia. O valor cobrado segue a regra de alteração pós-aprovação e o histórico aprovados para os três tipos de item.

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

O futuro faturamento aplica desconto único somente no fechamento da OS, em valor ou percentual, sem campo de desconto/acréscimo no orçamento; o fechamento pode registrar uma ou mais formas de pagamento, por exemplo dinheiro, PIX, cartão ou boleto. Não se gera cobrança por OS encerrada sem reparo. Formas de pagamento são cadastros configuráveis/auxiliares. Contas a receber e contas a pagar têm movimentações como fonte de verdade financeira; não se deve inferir saldo apenas do estado de documentos comerciais.

No encerramento Equipamento comprado/Doado, não registrar nesta etapa valor pago ao cliente, forma de pagamento ou saída financeira. O tratamento fiscal e a compra formal do equipamento de cliente permanecem futuros.

Condições de pagamento, baixa parcial, recebimento faturado e pagamentos múltiplos foram aprovados. Parâmetros financeiros de juros e multa padrão são configuráveis. O fluxo de caixa deve suportar visão de títulos a pagar/receber e projeção, mas os critérios de inclusão e exibição da projeção não ficaram completamente fixados.

### 6.3 Contas a pagar, bancos e centros de custo

Contas a pagar são relacionadas a compras/documentos quando aplicável e contemplam vencimento, pagamento e auditoria. Bancos e centros de custo são cadastros aprovados. O sistema deve permitir navegação entre títulos e documentos de origem. Regras completas de conciliação, estorno, juros, multa, baixa e liquidação não estão integralmente definidas nesta conversa.

### 6.4 Vendas e documentos comerciais

O escopo inclui módulo de vendas, pedidos de venda, propostas comerciais e faturamento, compartilhando produtos/estoque/financeiro com OS. A clonagem de pedido de venda, proposta comercial e faturamento foi aprovada; o novo registro não reutiliza os dados fiscais/financeiros do faturamento original. A clonagem de produto omite identificadores únicos. Faturamento fiscal e emissão de documentos fiscais não devem ser presumidos como totalmente especificados apenas por haver importação de NF-e.

Regras de clonagem: RN-157 cria novo pedido de venda copiando dados comerciais reaproveitáveis (cliente, itens, quantidades, preços, descontos, observações e condição quando aplicável), sem número, datas, recebimentos, faturamento, situação, logs ou movimentações financeiras. RN-158 cria nova proposta, com nova numeração, data e situação inicial, mantendo itens e demais dados comerciais. RN-159 permite clonar faturamento apenas com dados comerciais reaproveitáveis, nunca dados fiscais ou financeiros. RN-160 permite clonar produto sem código, SKU ou identificadores únicos. RN-161 padroniza “Duplicar” como criação de novo documento/cadastro sem alterar o original.

## 7. Usuários, segurança, permissões e auditoria

### 7.1 Autenticação e sessão

Autenticação usa nome de usuário único; e-mail de Pessoa não é login obrigatório. Usuários são criados somente por Administrador, sem auto-registro público. O primeiro recorte está implementado no Backend, mas já foi versionado localmente, ainda não enviado a origin. O bootstrap local do primeiro Administrador foi concluído; a verificação confirmou um Administrador ativo e 32 permissões após o seed de OS, sem `admin.full`, `system.admin` ou perfil/usuário `Master`. A segunda execução do bootstrap foi validada para abortar antes de solicitar credenciais quando já há Administrador ativo; a proteção transacional contra concorrência permanece no service, embora a corrida real ainda não tenha sido testada. Os principais testes HTTP autenticados locais foram concluídos: login e `/auth/me` retornaram `publicId` sem `id` interno, a listagem paginada de Pessoas respondeu 200 para Admin, mutação sem CSRF foi rejeitada com 403, logout respondeu 204 e a sessão revogada recebeu 401. Sem paginação, a listagem retorna `400 INVALID_PAGINATION`; `page` e `pageSize` são obrigatórios e não têm padrão automático. O sistema deve bloquear inativação do último Administrador ativo, remoção de sua permissão administrativa e qualquer alteração que deixe o sistema sem Administrador ativo. A migration de Auth está aplicada no banco principal e o seed inicial de 24 permissões de Auth e o seed posterior das oito de OS foram validados como idempotentes; o banco contém 32 permissões; os testes locais não liberam operação em produção.

O primeiro recorte implementa sessão opaca mantida no servidor: o cookie contém apenas o segredo opaco e o banco persiste somente o hash. A sessão expira após 8 horas de inatividade; cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. Sessões podem ser revogadas e coexistir; logout revoga somente a sessão atual. O cookie usa `HttpOnly`, `Secure` em ambiente HTTPS e `SameSite` adequado. Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`), inclusive login, exigem CSRF; `GET` não exige token. `GET /api/v1/auth/csrf` cria contexto temporário, retorna token e grava identificador opaco em cookie `HttpOnly` por 15 minutos; o contexto físico é `PreAuthCsrfContext`. O login exige `X-CSRF-Token`; após sucesso, descarta o contexto e a sessão autenticada passa a usar controle CSRF próprio. JWT e OIDC ficam fora do recorte atual. A migration de Auth foi aplicada ao banco principal; o Frontend permanece futuro.

Neste momento, o sistema será considerado somente de uso interno e o Backend não está pronto para exposição externa operacional. Não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo é proibido até 2FA e fronteira confiável estarem implementados. Proxy reverso, VPN, túnel ou publicação externa futura exigirá nova decisão documental. O método de 2FA e sua recuperação continuam pendentes.

Username é obrigatório e único, normalizado por `trim`, armazenado em minúsculas, com 3 a 50 caracteres e regex `^[a-z0-9._-]{3,50}$`; e-mail de Pessoa não é login. Senha terá mínimo de 10 caracteres, será armazenada com Argon2id pelo pacote `argon2` usando defaults seguros iniciais da biblioteca, sujeitos a validação/ajuste no ambiente, e não exigirá troca periódica. Nunca registrar senha, hash ou parâmetros sensíveis. Recuperação fica fora do primeiro recorte. Uma credencial administrativa foi exposta acidentalmente durante teste manual; por decisão de Marcos, ela não foi trocada nesta etapa e deverá ser substituída antes de uso real, em rede compartilhada, produção ou demonstração externa. Não existe fluxo definitivo de troca/reset implementado ou documentado; não se deve presumir que a credencial foi alterada.

Falhas são contadas por username normalizado, inclusive inexistente. A quinta falha gera evento no Log Administrativo, sem bloquear a conta nem impedir novas tentativas. Login bem-sucedido zera o contador de usuário existente. Username inexistente gera eventos de tentativa e, na quinta falha, de limiar atingido, sem usuário ou contador persistente, e não é revelado ao solicitante. Notificação inicial somente pelo Log Administrativo, sem e-mail. Registrar IP remoto, origem e user-agent quando disponíveis.

### 7.2 Permissões e perfis

Administrador é a autoridade máxima; não existe “Master”. Técnico e Usuário comum são designações operacionais, não perfis rígidos. Permissões granulares são atribuídas diretamente por usuário/ação; o catálogo inicial aprovado está em `docs/02-Regras-de-Negocio.md`. Ações específicas podem ser concedidas a usuário sem torná-lo Administrador. O Backend é a autoridade final, ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. O Frontend apenas reflete a API. As sete rotas atuais de Pessoas estão protegidas no código do primeiro recorte, já versionado localmente, ainda não enviado a origin; bootstrap e testes HTTP autenticados principais foram concluídos localmente. A listagem exige `page` e `pageSize`; sem eles retorna `INVALID_PAGINATION`. Migration Auth e seed já foram aplicados no banco principal.

Para incluir, alterar ou apagar Aviso e executar ações administrativas, a regra funcional exige Administrador ou permissão explícita equivalente para a ação. Contas são criadas somente por Administrador; o sistema deverá impedir a remoção/inativação do último Administrador ativo. Não há CRUD HTTP de usuários neste recorte. O módulo de Auth está implementado no Backend, e migration e seed foram aplicados no banco principal; o bootstrap local foi concluído e os principais testes HTTP autenticados passaram.

### 7.3 Auditoria e exclusão lógica

Auditoria de alterações é aprovada, incluindo inclusões, alterações, inativações e reativações, com usuário e data/hora autoritativa quando disponíveis. Haverá um único Log Administrativo para eventos administrativos e de segurança; não criar histórico paralelo de segurança. Deve registrar, no mínimo, login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado e permissão concedida/revogada. A retenção é inicialmente indefinida e não haverá exclusão automática neste primeiro desenho. O log não substitui o histórico operacional visível; campos além do mínimo aprovado e acesso permanecem pendentes. OS não é apagada; clientes e demais entidades preservam histórico via inativação/exclusão lógica conforme suas regras.

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

Cadastros previstos: Pessoas e seus Tipos de Contato, Tipos de Contribuinte, Pessoas de Contato, telefones, e-mails, Tipos de Endereço e endereços, equipamentos, tipos de equipamento, Marcas (incluindo fabricantes de equipamentos), produtos, categorias, unidades de medida, bancos, centros de custo, serviços, formas/condições de pagamento, status da OS e demais cadastros auxiliares aprovados. Tipo de Contato, Tipo de Contribuinte e Tipo de Endereço são classificações de cadastros próprios com catálogos iniciais definidos nesta especificação. O ciclo de vida geral dos valores auxiliares está aprovado; renomeações após uso são permitidas e registradas no histórico, enquanto o cadastro mostra o nome atual. Cadastro de Serviços é exceção específica: nome imutável desde a criação, inclusive na OS; preço padrão pode mudar sem afetar lançamentos anteriores. Situações/status da OS são configuráveis e possuem propriedades operacionais.

## 10. Relatórios, consultas, lembretes e notificações

Relatórios têm layout fixo definido pelo sistema, sem ferramenta livre de montagem pelo usuário. Catálogo aprovado contempla grupos de OS, financeiro, estoque, comercial e gerencial. Foi explicitamente aprovado relatório diário de OS prontas aguardando retirada.

Pesquisa de clientes, produtos e OS foi aprovada. Pesquisa de produtos inteligente suporta termos e expressão exata. Navegação por documentos relacionados deve facilitar rastreabilidade de produto, OS, financeiro e estoque.

Agenda/lembretes vinculados à OS foram aprovados, com estrutura do lembrete, avisos e aba dedicada. Fluxo inclui criação, consulta e atualização/encerramento conforme o estado definido. Compromissos como módulo próprio e checklist/pendências genéricas de OS foram rejeitados como sugestões; a regra anterior de pendência administrativa individual para devolução de peça também foi substituída pelas decisões atuais do capítulo 5. Lembrete automático de vencimento de contas a receber/notificação por e-mail foi aprovado, com configurações e situações de supressão indicadas na RN-168. Janela de antecedência e critérios finais devem ser conferidos na regra detalhada, pois o histórico reutiliza o identificador RN-168.

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

- Situação operacional, status macro e resultado/status-motivo de encerramento são conceitos distintos, conforme a seção 2.2. A lista inicial aprovada não define por si só permissões de abertura/encerramento nem efeitos de cobrança; a abertura obrigatória em TRIAGEM e as definições de ABERTA, FECHADA e CANCELADA devem ser observadas. Equipamento comprado/Doado fecha a OS externa como FECHADA e cria OS interna conforme seção 2.4. A relação dos demais resultados com o status macro, inclusive “Devolvido sem Reparo”, permanece pendente e não deve ser inferida.
- A data/hora da aprovação é preservada quando a OS muda entre situações que indiquem autorização. Se a alteração for escolhida, deve haver crítica explícita. O sistema mostra visualmente a aprovação e sua data, permitindo ordenar OS pela aprovação cronológica.
- A tela de cadastro de Pessoa durante abertura da OS é o cadastro completo; Tipo de Pessoa (PF/PJ) e Nome/Razão Social são os campos obrigatórios mínimos. Os demais campos são opcionais no cadastro geral, salvo regras específicas de fluxos futuros. Cada Pessoa pode ter zero ou uma Pessoa de Contato, que é outro cadastro completo de Pessoa, além de múltiplos telefones, e-mails e endereços. Telefones e e-mails podem ser marcados como principais; cada endereço tem Tipo de Endereço de cadastro próprio e pode ser marcado como principal.
- CPF/CNPJ é opcional; CPF é armazenado somente com números, possui 11 dígitos e é matematicamente validado. CNPJ aceita o formato numérico antigo ou o alfanumérico oficial, é armazenado sem pontuação e em maiúsculas, e é matematicamente validado conforme o algoritmo aplicável. O documento deve ser único e compatível com Tipo de Pessoa (PF usa CPF; PJ usa CNPJ). A máscara fica na interface; normalização, validação matemática, compatibilidade e duplicidade são regras do Backend/API. Documento repetido bloqueia novo cadastro; pela regra aprovada, sem documento a comparação exata normalizada de nome, telefone (somente números) ou e-mail (minúsculas após trim) avisa sem bloquear. A criação atual implementa o aviso por nome; as verificações por telefone/e-mail ainda são futuras. Busca fuzzy está fora desta etapa.
- Nome Fantasia não se aplica a PF e é opcional para PJ; se PJ não informar, a Razão Social é a referência principal de exibição. Inscrição Estadual e Municipal são opcionais, aplicam-se principalmente a PJ e não têm validação fiscal específica estadual/municipal nesta etapa; o valor é armazenado sem interpretação fiscal complexa.
- Os dados cadastrais aprovados incluem Tipo de Pessoa, Nome/Razão Social, CPF/CNPJ, Nome Fantasia, Inscrição Estadual e Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso. Catálogos próprios iniciais: Tipos de Contato Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro; Tipos de Contribuinte Contribuinte ICMS, Contribuinte Isento e Não Contribuinte; Tipos de Endereço Principal, Cobrança, Entrega e Instalação. Tipo de Contribuinte é opcional no cadastro geral e obrigatório para emissão de nota fiscal; não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Regras fiscais e códigos continuam pendentes. A finalidade fiscal e de segmentação não significa que exista módulo de marketing aprovado.
- Uma Pessoa pode exercer simultaneamente vários Tipos de Contato. Transportadora é um Tipo de Contato, não cadastro separado. Marca e Fabricante são o mesmo conceito para equipamentos e usam um cadastro único, preferencialmente denominado Marca.
- Observações são passivas. Se houver Aviso, nos contextos aprovados o sistema pergunta “Há informação a ser visualizada. Deseja visualizar agora?”; Sim exibe o conteúdo; Não mostra “Não deixe de verificar as mensagens pendentes antes de continuar.” Em ambos os casos a operação continua. O conteúdo não é exibido automaticamente, a pergunta ocorre em cada contexto sem dispensa, e não há log/registro de leitura nem confirmação formal. Usuário autorizado pode preencher Aviso vazio; alterar/apagar conteúdo existente e ver seu histórico sensível exige Administrador ou permissão explícita equivalente. Eventos básicos/sensíveis e histórico de leituras permanecem pendentes.
- Cadastro permanente do equipamento contempla Tipo, Marca, Modelo, Número de Série opcional e status Ativo/Inativo. Acessórios, bateria, condição e observações são informações do atendimento/OS. Usuários com permissões correspondentes podem corrigir os dados da ficha com ou sem histórico, sem justificativa obrigatória; alterações são registradas automaticamente. Proprietário com histórico muda por transferência formal, também sujeita à permissão correspondente. A regra de normalização é definida na seção 3.2.
- Equipamento só pode ser excluído fisicamente por Administrador ou usuário com permissão explícita equivalente e sem qualquer registro persistido relacionado; se houver vínculo, só pode ser inativado/reativado com autorização correspondente. Inativo não aparece por padrão em novas OS, mas pode ser localizado com filtro e permanece visível no histórico. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente; Pessoa inativa não pode ser usada em novo vínculo como proprietário. Transferência muda proprietário atual, registra evento e não altera OS antigas. Correção sem vínculo histórico não é transferência formal; com vínculo operacional, mudança é transferência. Pode ocorrer fora ou durante OS, com associação opcional a uma OS. O schema e o banco principal já possuem `equipment.is_active` e vínculo opcional da transferência com OS; a elegibilidade por Tipo de Contato e os fluxos de transferência dependem do Backend.
- A Pessoa cujo nome é informado no atendimento é o cliente da OS e o proprietário operacional do equipamento para aquela abertura. Não se controla portador, entregador ou terceiro que trouxe fisicamente o equipamento. Se o equipamento estiver vinculado a outra Pessoa, a interface deve alertar e oferecer cancelamento da seleção, abertura para o titular atual ou transferência autorizada e explícita para o cliente informado. Não há snapshot completo dos dados de Pessoa/Equipamento dentro da OS; a confirmação captura o retrato cadastral parcial imutável, enquanto alterações e movimentações relevantes também são registradas no histórico. Eventos já registrados não são reescritos.
- O cadastro de Equipamento exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; serial é opcional. Ao criar equipamento novo durante abertura de OS, Tipo é obrigatório; Marca/Modelo aceitam as opções controladas “Não informada”/“Não informado”, e a série pode ser marcada “Não identificado”. Equipamento novo inicia Ativo; status possíveis nesta etapa são somente Ativo/Inativo. Tipo de Equipamento e Marca são cadastros próprios e seguem ciclo de vida auxiliar. Proprietário, Tipo, Marca, Modelo e status Ativo/Inativo já estão representados no schema e no banco principal; o ciclo de vida dos catálogos auxiliares e os fluxos funcionais permanecem pendentes.
- Serial informado repetido para o mesmo proprietário bloqueia cadastro; repetido para proprietário diferente gera aviso não bloqueante, permite outro cadastro e não sugere transferência. Sem serial, salva normalmente sem busca automática pela combinação Proprietário + Tipo + Marca + Modelo. Serial é salvo em caixa alta sem limpeza de símbolos/espaços. A pesquisa aprovada é independente da duplicidade; apenas regras avançadas/filtros combinados permanecem pendentes.
- Prioridades disponíveis no exemplo operacional são baixa, normal, urgente e muito urgente. O campo de prazo combinado com o cliente é opcional, informativo e não gera alerta automático.
- Usuário com permissão pode encerrar OS se o status e as demais validações permitirem. Datas históricas são praticamente imutáveis; sua correção exige permissão explícita e log administrativo. O valor cobrado dos três tipos aprovados de item de orçamento (peça de estoque, peça avulsa e serviço/mão de obra) pode ser alterado por usuário autorizado mesmo após aprovação, sem exigir nova aprovação do cliente e sem motivo obrigatório; cada alteração registra usuário, data/hora, OS, item, tipo, campo e valores anterior/novo. Outro não é tipo de orçamento; custo opcional de peça avulsa exige capacidades de visualizar/alterar, com códigos técnicos ainda pendentes. Edição de itens/valores somente em OS ABERTA; FECHADA/CANCELADA permanece somente consulta.
- Permissões futuras sugeridas para a OS: `os.close` e `os.cancel` (FECHADA/CANCELADA), `os.reopen_text` (reabertura simples) e `os.reopen_full` (reabertura completa). A matriz final e os endpoints ainda serão detalhados.
- Componentes representam consumo técnico não cobrado e oculto nos documentos ao cliente; não constituem tipo de item de orçamento. O orçamento, quando implementado, será uma composição vinculada à OS, sem status próprio, e terá somente três tipos: serviço/mão de obra, peça avulsa e peça do estoque. A peça avulsa é manual, fora do estoque e não conversível; a peça de estoque segue seu ciclo próprio, mas sua inclusão apenas como orçada não movimenta, reserva ou reduz disponibilidade. O orçamento não gera financeiro nesta fase. Custo de peça avulsa e capacidades de visualizar/alterar já foram aprovados; serviço não tem custo nesta fatia. Códigos de permissão ainda dependem de Marcos. Produto marcado como componente inserido pela seção Peças pode demandar confirmação de cobrança, sem criar uma quarta categoria de orçamento; a mesma peça pode ser vendida normalmente. O atributo Componente não torna o produto indisponível para vendas.
- Acessórios e observações não são copiados para uma nova OS; reclamação do cliente inicia vazia. Tipo/marca/modelo/serial do equipamento vêm protegidos e são alterados por ação explícita.

### C.2 Produtos, estoque e compras

O cadastro básico de Produtos está implementado com código interno opcional, descrição, categoria e situação, acrescidos de preço de venda padrão e custo de aquisição opcionais em `DECIMAL(15,2)`. Zero é válido e distinto de `NULL`; custo `NULL` significa desconhecido. A estimativa de lucro bruto é calculável somente quando preço e custo são conhecidos; não há cálculo de margem nem custo médio. As permissões independentes `products.cost.read` e `products.cost.update` autorizam visualizar ou alterar o custo; alteração exige também `products.manage`. Usuário com alteração sem leitura pode substituir ou limpar o custo sem receber o valor atual, e mudanças de outros campos preservam o custo. Administrador (`isAdmin`) tem acesso efetivo às duas, sem novo papel Master. As permissões de custo do orçamento de OS não se aplicam. A alteração registra ator, produto, data/hora do servidor e valores anterior/novo no Log Administrativo, na mesma transação; projeções de histórico devem filtrar esses valores por `products.cost.read`. O custo histórico será capturado quando uma peça for marcada como aplicada à OS, sem ser reescrito por mudanças cadastrais posteriores; essa integração ainda não está implementada. As migrations do cadastro e dos preços/custos foram aplicadas somente em `gestor_os_opening_test`, permanecendo pendentes no banco principal.

Peça defeituosa deve receber destino próprio (análise, sucata, garantia ou devolução ao fornecedor) e não retornar automaticamente à disponibilidade. A definição de estados, transições, responsáveis e impactos contábeis pertence ao desenho futuro de estoque.

- Estoque controla tanto peças/insumos quanto produtos para revenda. A distinção inicial é por categoria, sem regras independentes de peça interna e mercadoria de venda. Existe um único local de estoque nesta etapa; o saldo inicial será incorporado gradualmente.
- Entradas de produto podem ser lançadas manualmente como rotina normal ou por XML. Ajustes manuais não exigem motivo no primeiro desenho; exigem Administrador ou permissão específica de gestão de estoque e são auditados.
- Produtos podem ter número de série, mas o controle individual não é obrigatório. Peça/produto avulso lançado manualmente na OS permanece fora do estoque, sem saldo, movimento, baixa ou conferência, e não pode ser convertido em peça de estoque; serviços e mão de obra são uma única categoria de orçamento. A primeira fatia de orçamento tem quantidade inteira obrigatória ≥1, inicialmente 1, total calculado e valor cobrado não negativo, inclusive zero. Só peça avulsa admite custo opcional; desconto/acréscimo fica fora do orçamento. A escala monetária de duas casas está aprovada; precisão física do DECIMAL, demais limites e contratos técnicos ainda requerem aprovação. Técnicos não alteram valores permanentes do cadastro de estoque.
- Estoque físico, reservado, aplicado, disponível e a caminho aparecem como indicadores distintos. A caminho deriva de itens comprados, não integra físico nem disponível. No ciclo da peça, ORÇADA não altera disponibilidade, UTILIZADA fica indisponível sem baixa definitiva e BAIXADA representa a baixa definitiva automática no encerramento da OS. A fórmula agregada dos indicadores físico/reservado/aplicado/disponível continua pendente de reconciliação. Toda alteração efetiva de estoque gera movimento, e os saldos podem ser reconstruídos a partir do histórico. Os valores de saldo armazenados podem ser cache derivado, nunca autoridade primária.
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

- Administrador possui poderes máximos. Permissões são atribuídas diretamente por usuário/ação, sem perfis rígidos; Técnico e Usuário comum podem receber permissões específicas. Acesso ao financeiro é controlado por essas permissões; nenhum usuário sem autorização pode acessar contas a pagar/receber, fluxo de caixa, saldos ou informação financeira gerencial.
- Login usa username obrigatório e único, normalizado por `trim`, armazenado em minúsculas, com 3 a 50 caracteres e regex `^[a-z0-9._-]{3,50}$`; e-mail de Pessoa não é login. O primeiro recorte não tem CRUD HTTP de usuários: o uso inicial é restrito ao Administrador bootstrapado. `isAdmin` representa a autoridade máxima, sem `admin.full`, `system.admin` ou Master; rotas continuam sujeitas a políticas explícitas. O bootstrap aborta se já existir Administrador ativo, não promove conta existente, usa transação com controle efetivo de concorrência para impedir simultaneidade e registra evento. Usuários são inativados, não excluídos fisicamente, e nenhuma operação pode deixar o sistema sem Administrador ativo. A sessão do aplicativo web é opaca, expira após 8 horas de inatividade renovadas a cada requisição autenticada válida por `last_used_at`, não tem limite absoluto no primeiro recorte e mantém somente o hash do segredo no banco. Permite revogação e sessões simultâneas; logout encerra apenas a sessão atual. O sistema é somente de uso interno; acesso externo exige 2FA e fronteira confiável implementados. Não confiar em headers de proxy, IP público ou origem para classificar a rede. JWT/OIDC ficam fora do recorte.
- Senha tem mínimo de 10 caracteres, usa Argon2id pelo pacote `argon2` com parâmetros iniciais seguros padrão da biblioteca, sujeitos a validação/ajuste no ambiente, e não exige troca periódica. Nunca registrar senha, hash ou parâmetros sensíveis. Recuperação fica fora do primeiro recorte. Falhas são contadas por username normalizado, inclusive inexistente; a quinta registra evento no Log Administrativo, sem bloquear a conta nem impedir novas tentativas. Login bem-sucedido zera o contador existente; username inexistente não cria usuário nem contador persistente e não é revelado ao solicitante. Notificação inicial somente pelo Log Administrativo, sem e-mail; registrar IP remoto, origem e user-agent quando disponíveis.
- Métodos mutáveis exigem proteção CSRF, inclusive login; `GET` não exige token. Antes do login, `GET /api/v1/auth/csrf` retorna token e grava identificador opaco temporário em cookie `HttpOnly`, com validade de 15 minutos. Login envia o token em `X-CSRF-Token`; sucesso descarta o contexto pré-login e passa ao CSRF próprio da sessão. O Log Administrativo único tem retenção inicialmente indefinida, sem exclusão automática, e registra os eventos mínimos aprovados. As sete rotas atuais de Pessoas estão protegidas no código pelo primeiro recorte de Auth; os principais testes locais confirmaram acesso autenticado, autorização Admin e proteção CSRF. O bootstrap foi concluído no banco principal. `PersonContactEvent.userId` é opcional no schema e migration aplicada, mantendo eventos existentes com `NULL` e sendo gravado na mesma transação do contato. O Frontend apenas refletirá permissões; buscará CSRF antes do login e enviará o token nas chamadas mutáveis. Gestão de usuários por tela fica para recorte posterior.
- Exclusão de itens da OS pode ser feita pelo usuário com permissão enquanto as regras de negócio permitirem; toda alteração/exclusão relevante fica no Log Administrativo com usuário, data/hora do servidor, operação e valores anterior/novo quando aplicável. Movimentações manuais de estoque exigem Administrador ou permissão específica de gestão de estoque.
- A filosofia aprovada é permitir alterações operacionais com rastreabilidade em vez de criar bloqueios generalizados; exceções explícitas permanecem, como acesso ao financeiro e bloqueio de técnico sem atualização obrigatória. A exigência universal de justificativa para alterações críticas foi rejeitada.

### C.7 Observações manuais da OS

`ServiceOrderNote` guarda texto simples obrigatório de uma linha e até 255 caracteres, sem edição, HTML, Markdown ou anexo, somente em OS confirmada. Não existe nota na abertura provisória. `service_orders.update` ou Administrador permite criar; o autor autenticado pode excluir sua própria nota, e `service_orders.notes.delete_any` ou Administrador permite excluir a de terceiros. A exclusão faz hard delete após snapshot integral no Log Administrativo, atomicamente e sem justificativa. Eventos automáticos não podem ser alterados ou excluídos. `/history` mostra eventos e notas ativas em uma linha do tempo; `/events` preserva apenas eventos. Criar ou excluir nota também será permitido em OS FECHADA/CANCELADA quando esses estados forem implementados, sem alterar o estado nem os demais módulos.

### C.6 Relatórios, portal, documentos e módulos

- Dashboard geral pode mostrar faturamento do período, OS abertas/encerradas, OS com/sem reparo, ticket médio, valores em aberto e equipamentos prontos não retirados; comparar dois períodos foi aprovado. A prioridade da primeira visualização continua sendo operacional.
- Relatórios são layouts fixos mantidos pelo sistema, organizados em OS, Financeiro, Estoque, Comercial e Gerencial. O relatório diário de OS prontas não retiradas é enviado por e-mail.
- Todos os contatos/comunicações ligados à OS são registrados em um único histórico de OS; não se cria módulo independente de comunicação. E-mail pode enviar status e orçamento; WhatsApp inicia comunicação usando dados da OS/cliente. Não ficou aprovada integração automatizada específica.
- Portal mobile contempla fluxos de técnicos, balcão e compras; atualização do histórico pelo portal é registrada com autoria e data. Portal para cliente foi colocado como fase futura. QR Code permite acessar/capturar a OS e há decisão por QR permanente; requisitos de acesso e proteção estão pendentes.
- Estrutura de configuração contempla dados da empresa, garantia padrão, parâmetros financeiros, backup, caminho dos anexos e organização dos parâmetros. Multiempresa é futura: V1 monoempresa para NoteDuke, arquitetura preparada para evolução sem exigir `empresa_id` indiscriminado em todas as tabelas.
- Importação de documentos fiscais aprova consulta de NF-e disponível para o CNPJ e importação de XML de arquivo. O assistente importa/associa produtos, produz entrada de estoque e contas a pagar. A associação inteligente deve guardar a memória de associação de itens/produtos para uso posterior.

## Controle de edição de OS confirmada

Uma OS confirmada pode ser visualizada simultaneamente, mas somente um contexto de usuário/aba pode executar mutações normais por vez. Ao abrir uma OS livre, quem tiver permissão normal de edição assume automaticamente; sem essa permissão, permanece em somente leitura. O Backend concede o controle por até 10 minutos desde o último heartbeat válido, renovado a cada 60 segundos, e tenta liberá-lo quando a tela fecha ou sai da OS normalmente. O mesmo usuário pode transferir o controle entre abas com confirmação própria e sem permissão especial. Para assumir edição de outra pessoa, exige-se permissão normal e **Assumir edição de OS** (`service_orders.edit.takeover`), com confirmação explícita antes da transferência; o Administrador conserva a autoridade máxima da política central. A operação entre pessoas é registrada no Log Administrativo, fora do histórico operacional. Heartbeat, aquisição e liberação normais e expiração não geram histórico operacional nem log administrativo. Ao perder a posse, a tela torna-se somente leitura e continua visível. Observações manuais seguem autorizadas independentemente do controle. Schema, migration e integração HTTP foram validados apenas em `gestor_os_opening_test`; esta atualização não alterou schema ou migration, e não foi aplicada ao banco principal.
