# Abertura de OS — conclusão do fluxo operacional

## Escopo implementado localmente

Pesquisar cliente por nome, documento ou telefone; cadastrar Pessoa com papel CUSTOMER
em modal; selecionar o cliente criado; apresentar equipamentos ativos desse cliente;
selecionar equipamento existente ou manter equipamento novo como rascunho; registrar
atendimento; confirmar a OS pelo mecanismo transacional e de numeração existente.

CPF/CNPJ e contatos continuam opcionais. Documentos informados seguem os validadores
oficiais e a unicidade existente. Nome repetido sem documento gera aviso, sem inventar
unicidade de nomes. Cliente salvo permanece no cadastro mesmo se a abertura for cancelada.

## Equipamento e atendimento

- Tipo, marca e modelo seguem a regra aprovada. Catálogos existentes são reutilizados;
  `equipment.create` permite incluir tipo/marca no mesmo fluxo, com Log Administrativo.
  Pode-se cadastrar a marca controlada `NÃO INFORMADA` e usar o modelo `NÃO INFORMADO`.
- Série identificada ou `NOT_IDENTIFIED`/nula. Não foi criado campo paralelo de asset tag.
- Novo equipamento é vinculado ao cliente e materializado **somente na confirmação**.
  Antes disso, fica selecionado como rascunho na abertura. Não há Equipment órfão se cancelar.
- Mesma série e proprietário: a tela avisa e oferece o registro existente. A confirmação
  mantém o bloqueio transacional de duplicidade; não há autorização nova para duplicar.
- Equipamento existente começa protegido. A alteração permanente exige ação explícita,
  confirmação, `equipment.update`, versão `updatedAt`, locks e Log Administrativo.
  Não altera os snapshots de OS anteriores. O histórico usa a consulta de OS existente,
  com `equipmentPublicId` e `service_orders.read` (últimos 20 atendimentos).
- Defeito informado, reclamação, acessórios, estado físico, bateria e observações são da OS.
  Novas aberturas começam vazias; histórico do equipamento não preenche esses campos.
- Prioridade: NORMAL, URGENT, VERY_URGENT ou LOW. Padrão normal. Técnico opcional, via
  atribuição oficial e `service_orders.assignment.manage`.
- Status inicial vem do registro oficial já utilizado pelo Backend (`id=1`), com seu nome
  atual; deve estar ativo e classificado como NOT_COMPLETED. Não foi criado seletor paralelo
  nem inferência pelo nome. Administrador deve revisar esse registro se indisponível.

## Contrato e persistência

- `POST /api/v1/people/customers`: corpo Person existente + `phone`, `email` e
  `confirmNonstandardPhone` opcionais; cria Pessoa, CUSTOMER, contatos, autoria e auditoria
  em uma transação. Exige `people.create` **e** `service_orders.opening.create`.
- `GET /api/v1/equipment/opening-search`: adiciona filtro opcional `ownerPublicId` UUID.
- `POST /api/v1/equipment-types` e `/equipment-brands`: `{name}`, com `equipment.create`.
- `PATCH /api/v1/equipment/:publicId`: `{equipmentDraft,expectedUpdatedAt,confirmEquipmentChange:true}`.
- `GET /api/v1/service-orders/openings/options`: status inicial permitido.
- PATCH da abertura aceita `complaint` e `intakeData` versionado: `{version:1,reportedDefect,
  accessories,physicalCondition,battery,observations,priority}`. Textos de intake limitados a
  2.000 caracteres, normalizados pelo Backend. Não são campos do Equipment.
- Migration nova `20261024120000_opening_intake`: acrescenta `intake_data_json` nullable
  às aberturas e às OS. Não reescreve dados existentes. JSON ausente em registros antigos
  é compatível com campos não informados; nova abertura recebe valores vazios na resposta.
- Confirmação copia os dados para a OS na mesma transação de equipamento, número,
  snapshots, atribuições e eventos. `intakeObservations` continua compatível com o contrato
  anterior. Detalhe e impressão de entrada passam a exibir os novos dados.
- Não há alteração de regras de orçamento, estoque, encerramento ou custos.

## Evidências e liberação

Testes de interface cobrem modal/cancelamento, criação, preservação após erro, série ausente,
duplicidade, dados vazios, salvamento e clique repetido. Testes Backend cobrem DTOs,
permissões, cadastro e edição concorrente. Integração HTTP usa NestJS/Prisma/MariaDB e
MySQL 8.0.46 em instância descartável própria, porta loopback exclusiva, diretório novo e
banco `gestor_os_opening_test`. Executa `SELECT DATABASE()` antes das escritas operacionais.
Não lê `.env` nem usa a instância ou dados dos bancos existentes.

A preparação não equivale a implantação. Homologação precisa de autorização para backup,
aplicação dessa migration e publicação coordenada dos artefatos Backend/Frontend. Preservar
configuração RSA, credencial corrigida, arquivos, logos, certificados e backups. Não usar um
commit antigo como origem de fontes modificadas: os artefatos locais registram snapshot.
Rollback da aplicação deve preservar as colunas JSON adicionadas, evitando perda dos dados
de entrada já gravados; eventual restauração de banco exige procedimento administrativo.
Não houve migration em homologação, reinício de serviços, commit ou push nesta entrega.

## Revisão aprovada de cadastro e usabilidade — 23/10/2026

O formulário de Pessoa deve ser completo e compartilhável com o cadastro geral: PF/PJ
(PF inicialmente selecionado), nome/razão social, documento opcional, nome fantasia para PJ,
inscrições estadual/municipal, contato da PJ como texto opcional (sem criar outra Pessoa),
situação, observações, aviso, endereço único completo e coleções opcionais de telefones e
e-mails, com no máximo um principal em cada coleção. Só o nome exige preenchimento manual.
Esta decisão substitui, neste recorte, o contato vinculado a outra Pessoa e os múltiplos
endereços anteriormente previstos. Não introduz cadastros fiscais ou exigências de emissão.

Criação completa e contatos/endereço são atômicos. Na abertura, o Backend bloqueia a abertura
com lock, cria e vincula o cliente e persiste o indicador de criação, impedindo um segundo
cadastro mesmo após F5, navegação ou chamadas concorrentes. Cadastro geral não possui esse
limite. Cancelar o modal não cria nada; descartar o atendimento permite novo cadastro na nova
abertura. Cliente inativo pode ser cadastrado, mas não vinculado como cliente ativo da OS.

Tipo e Marca/Fabricante apenas são selecionados na abertura. Os catálogos iniciais são os
listados em Regras de Negócio, sem entidade Fabricante paralela. A carga é idempotente, não
renomeia nem apaga registros e registra autoria administrativa. Obrigatórios usam asterisco,
legenda, erro junto ao campo e foco no primeiro inválido. Prioridades: LOW, NORMAL, URGENT,
VERY_URGENT, mantendo NORMAL inicial e os valores internos existentes.

A nova migration aditiva e a carga de catálogos serão testadas apenas em instância isolada.
Aplicação de ambas em homologação depende de autorização separada; não estão autorizadas
por esta missão. Não publicar código que dependa dessas colunas antes da aplicação aprovada.

## Ajustes de atendimento aprovados — 23/10/2026 (segunda revisão)

Esta revisão substitui as apresentações anteriores correspondentes. PF não apresenta IE/IM;
PJ mantém ambos os campos. País não é solicitado: novos endereços usam BR internamente.
Edição não limpa inscrições históricas de PF nem substitui o país de endereço existente.
Nome/Razão Social permanece o único preenchimento obrigatório do cliente. Telefones são
opcionais, nacionais, com DDD válido: fixo (XX) XXXX-XXXX ou celular (XX) XXXXX-XXXX.
Múltiplos telefones/e-mails e o principal de cada coleção são preservados. Novas entradas
fora desse padrão são recusadas no formulário e no cadastro da abertura no Backend;
contatos legados inalterados continuam disponíveis para leitura/edição dos demais campos.

Depois do vínculo, o formulário de criação desaparece e dá lugar ao resumo de nome,
CPF/CNPJ quando informado, telefones/e-mails com principal destacado e endereço. As ações
são Alterar cliente e Substituir cliente. Alterar edita o cadastro atual, com confirmação,
revisão atual e Log Administrativo anterior/novo; Substituir seleciona outro cliente já
existente. O limite persistido de um cliente novo por abertura continua válido, inclusive
após substituição e F5. Equipamento de outro proprietário exige o tratamento explícito
já implementado. Demais dados do atendimento não são descartados pela troca de cliente.

A edição nesta tela exige as permissões existentes people.update e people.contacts.add,
além de service_orders.opening.create; Administrador mantém o acesso oficial. O endpoint
de leitura fica limitado ao cliente da abertura em andamento pertencente ao usuário. Tipo
de Pessoa, situação e aviso são preservados neste editor; não substitui seus fluxos próprios.
Não há exclusão de contatos históricos neste formulário: é possível corrigir e acrescentar,
preservando IDs, vínculos e auditoria. Não é um novo cadastro geral de Pessoas.

O rótulo exibido é Sintoma identificado, mantendo reportedDefect como identificador técnico.
Cada nova OS começa com sintoma vazio. Sintoma é opcional. Ao confirmar sem preenchê-lo:
“Nenhum defeito foi informado. Deseja prosseguir com a gravação da Ordem de Serviço mesmo
assim?”. Ações: Voltar e preencher (preserva dados e focaliza sintoma) ou Prosseguir sem
informar. O botão Confirmar OS exige cliente/equipamento válidos, status inicial disponível
e ausência de operações/edições pendentes. Backend continua validando o estado, permissões
e confirmação transacional; o Frontend impede envio duplicado enquanto aguarda a resposta.

Histórico apresenta data, responsável, descrição e dados operacionais relevantes por uma
projeção de apresentação. IDs, tokens, revisões e códigos técnicos continuam armazenados,
mas não são exibidos no painel. Proteção de custos permanece no Backend. Ações de concluir,
cancelar e encerrar ficam ao final do respectivo formulário; encerrar exige OS aberta,
permissão e controle de edição válidos, conforme os fluxos existentes.

### Impressão — revisão implementada em 23/10/2026, publicação pendente

- Após a confirmação bem-sucedida, o detalhe pergunta “Deseja imprimir a Ordem de Serviço de entrada?”, com Imprimir/Não imprimir. Recusar não desfaz nem regrava a OS.
- Entrada e saída possuem duas vias A4 retrato: Via NoteDuke/Via do cliente, linha de separação e assinaturas. A prévia abre antes do diálogo de impressão/PDF.
- Não imprimir saída de OS aberta. Disponível durante o encerramento, após sua conclusão,
  ou posteriormente. Cancelada, como estado final existente, mantém o documento correspondente.
- Após conclusão bem-sucedida do encerramento, oferece-se impressão de saída para quem tem as permissões de leitura necessárias; reimpressão continua no detalhe.
- As impressões consultam os dados salvos/atuais vinculados, sem substituir o retrato histórico. A saída recebe o último evento de encerramento diretamente do Backend, sem depender da primeira página do histórico.
- Documento extenso exibe aviso e passa a vias separadas, com páginas adicionais quando necessário, sem cortar informações ou diminuir fontes. Garantia, pagamento e entrega física não são inferidos de dados inexistentes.
- Prévias sintéticas conferidas no navegador interno em 24/10/2026: PF/PJ, dados ausentes, saída com/sem reparo e fallback extenso. A validação nativa de PDF permanece pendente: o Chrome não pôde ser controlado com URL confirmada e a tentativa de impressão no navegador interno não produziu diálogo verificável. As prévias não comprovam sozinhas a paginação final em impressora.

Esta revisão não requer migration, não altera o banco e não autoriza publicação ou reinício.

### Validação de impressão concluída — 24/10/2026

A pendência de PDF descrita acima foi encerrada por impressão real no Chrome headless/CDP, sem automação de janela: dois PDFs curtos de uma página e dois extensos de quatro páginas A4. Fontes ampliadas, duas vias curtas completas e assinaturas preservadas; conteúdo extenso íntegro nas páginas adicionais. Todas as páginas renderizadas e inspecionadas. A conclusão é limitada aos exemplos sintéticos testados; não autoriza publicação nem define entrega física, cobrança ou garantia. Relatório e PDFs na pasta versionada os-print-pdf-validation-20261024-v1/final.
