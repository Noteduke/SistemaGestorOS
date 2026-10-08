# BANCO DE DADOS
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir os padrões oficiais de modelagem e utilização do banco de dados do Sistema Gestor OS.

# 2. Tecnologias

- MySQL 8
- Prisma ORM 7.10.0
- Para MySQL 8 self-hosted, o Prisma Client utiliza o adapter oficial `@prisma/adapter-mariadb`. O banco permanece MySQL 8; o adapter usa o driver Node `mariadb` para conectar-se a MySQL e MariaDB.
- No Prisma 7, `datasource db` mantém `provider = "mysql"` no `schema.prisma`; a URL `DATABASE_URL` é configurada em `backend/prisma.config.ts`.

# 3. Princípios

- Toda alteração estrutural deverá ser versionada.
- Utilizar migrations do Prisma.
- Evitar SQL espalhado pela aplicação.
- Integridade dos dados acima da conveniência.

# 4. Convenções

- Chaves primárias preferencialmente numéricas.
- Chaves estrangeiras obrigatórias quando existir relacionamento.
- Datas em UTC quando aplicável.
- Valores monetários utilizando DECIMAL.

# 5. Organização

A modelagem detalhada ficará em:

docs/modelagem/Modelo-Banco.md

Diagramas ficarão em:

docs/modelagem/Diagrama-Entidades.md

# 6. Estrutura prevista

Principais grupos de tabelas:

- Cadastros
- Ordem de Serviço
- Financeiro
- Estoque
- Compras
- Vendas
- Fiscal
- Segurança
- Auditoria
- Configurações

# 7. Migrações

Todas as alterações deverão ocorrer através do Prisma Migrate.

É proibido alterar diretamente a estrutura do banco em produção sem migration correspondente.

# 8. Índices

Os índices deverão ser criados conforme necessidade de desempenho e documentados.

# 9. Auditoria

Sempre que necessário, registrar informações de criação, alteração e exclusão lógica.

# 10. Estado da implementação

O modelo aplicado está em `backend/prisma/schema.prisma` e nas migrations `backend/prisma/migrations/20261006120000_initial_core/migration.sql`, `backend/prisma/migrations/20261007120000_person_basic/migration.sql` e `backend/prisma/migrations/20261007183000_person_contacts/migration.sql`.

O recorte físico atual inclui pessoas, papéis, telefones, e-mails, eventos de contato, até um endereço por pessoa, tipos e marcas de equipamento, equipamentos e eventos de titularidade. O diagrama e as relações atuais estão descritos em `docs/modelagem/Modelo-Banco.md` e `docs/modelagem/Diagrama-Entidades.md`.

O schema Prisma foi validado pelo Prisma. As migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` foram aplicadas no MySQL Community Server 8.0.46; `prisma migrate status` confirmou o banco atualizado, sem migrations pendentes. A terceira migration acrescentou identificadores públicos de contato, unicidade de e-mail por Pessoa, unicidade funcional de principalidade por coleção e a tabela de eventos de contato. O Prisma Migrate controla o histórico pela tabela administrativa `_prisma_migrations`. O Backend valida CPF numérico e CNPJ numérico ou alfanumérico, normaliza e verifica unicidade do documento informado. A transferência de titularidade e o histórico geral permanecem para etapas futuras.

Permanecem para etapas seguintes a implementação física de usuários e permissões (cujo desenho conceitual foi aprovado), o Log Administrativo, OS e seu histórico de alterações/movimentações, estoque, compras, vendas e financeiro. Não se adotará snapshot completo de Pessoa/Equipamento em cada OS. Regras que constam em `docs/Especificacoes-Nao-Documentadas.md` não devem ser presumidas durante a modelagem.

## 10.1 Cadastros: recorte de Pessoa básica aplicado e evolução pendente

As decisões funcionais abaixo foram aprovadas em 07/10/2026. As migrations de Pessoa básica e de contatos implementaram os campos e fluxos descritos nas seções correspondentes. As demais evoluções exigem etapas próprias; a presença de tabelas de endereços e equipamentos não significa que seus fluxos funcionais estejam implementados.

- Os campos obrigatórios mínimos da Pessoa são Tipo de Pessoa (PF ou PJ) e Nome/Razão Social. `people.person_type` é obrigatório, sem default, e `name` permanece obrigatório. `trade_name`, `state_registration`, `municipal_registration` e `observations` são opcionais e já existem. Tipo de Contribuinte e Aviso ainda não têm campo ou relação no schema; os demais fluxos de Pessoa continuam pendentes.
- CPF/CNPJ permanece opcional em `document VARCHAR(14)` com unicidade. O Backend já exige compatibilidade com PF/PJ e validade matemática: CPF aceita 11 dígitos ou máscara completa na entrada e é salvo somente com números; letras e símbolos indevidos são rejeitados. CNPJ numérico ou alfanumérico oficial é aceito, salvo sem pontuação e em maiúsculas. O schema garante a unicidade quando informado, mas não impõe sozinho a normalização, a validade matemática ou a compatibilidade; estas ficam no Backend.
- Nome Fantasia não se aplica a PF e é opcional para PJ. Sem valor informado para PJ, a Razão Social é a referência principal de exibição. Inscrição Estadual e Inscrição Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, são armazenadas sem validação fiscal específica por estado/município nem interpretação fiscal complexa.
- Tipo de Contribuinte será cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS, Contribuinte Isento e Não Contribuinte, conforme as definições em `docs/02-Regras-de-Negocio.md`. Não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. O schema atual ainda não possui esse relacionamento. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.
- Tipo de Contato representa papéis da Pessoa, admite vários simultaneamente e será cadastro próprio, com catálogo inicial Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro. `person_roles` atualmente usa enum e representa parcialmente os papéis; não é a solução definitiva aprovada. O catálogo e o ciclo de vida dos valores são decisões funcionais aprovadas, mas ainda não estão representados no schema.
- Observações são informação passiva e já possuem a coluna opcional `people.observations`. Aviso é campo único informativo futuro, com pergunta e mensagens definidas em `docs/02-Regras-de-Negocio.md`; ainda não existe em `people`. Permissões e auditoria de alteração/apagamento permanecem pendentes. Não há log de leitura ou confirmação nesta etapa.
- Uma Pessoa poderá possuir múltiplos endereços, inclusive vários do mesmo Tipo (Principal, Cobrança, Entrega ou Instalação). Telefone, e-mail e endereço admitem no máximo um principal por Pessoa e coleção, mas principal é opcional. Para telefone/e-mail, a migration aplicada cria índices funcionais únicos e o service troca o principal em transação. Para endereço, o schema ainda tem `person_addresses.person_id UNIQUE`, permitindo no máximo um endereço por Pessoa; a evolução de endereços permanece pendente.
- Os catálogos auxiliares seguem regra de ciclo de vida aprovada: valores ainda não usados podem ser editados, inativados ou excluídos; valores usados podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não aparecem por padrão para novos vínculos e permanecem válidos nos registros históricos. Renomeações após uso são permitidas e registradas no histórico com valor anterior/novo, data/hora e usuário quando disponível; o cadastro mostra o nome atual.
- Para Pessoas, CPF/CNPJ informado e repetido bloqueia o cadastro. Sem documento, a API básica avisa sem bloquear quando encontra Nome/Razão Social normalizado idêntico. Comparações de duplicidade por telefone/e-mail em minúsculas continuam fora do fluxo de criação de Pessoa; contatos, contudo, têm suas regras próprias: e-mail repetido na mesma Pessoa bloqueia e compartilhamento entre Pessoas gera aviso. Busca aproximada/fuzzy fica fora desta etapa.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outra Pessoa com cadastro completo. O vínculo autorreferenciado atual é conceitualmente compatível com a cardinalidade, mas a coluna `primary_contact_id` usa terminologia “principal” que não corresponde à regra funcional. Esta documentação não altera o nome físico.
- Para equipamentos, Marca e Fabricante são o mesmo conceito e haverá um único cadastro, preferencialmente denominado Marca. `equipment_brands` é compatível como referência conceitual; não deve ser criado cadastro separado de fabricantes de equipamentos.

As divergências remanescentes são trabalho de modelagem e implementação futura. Esta atualização documental não altera schema, migrations ou banco.

## 10.2 Aviso, ciclo de vida e titularidade — regras aprovadas ainda não refletidas

As regras funcionais abaixo foram aprovadas para orientar modelagem e aplicação futuras. Não descrevem a estrutura já aplicada:

- Aviso é um campo único informativo da Pessoa. A tabela `people` atualmente não possui esse campo. O comportamento de pergunta, apresentação condicional e continuidade da operação é regra de aplicação; não existe log de leitura ou confirmação nesta etapa. Histórico de alterações do Aviso é sensível e exige Administrador ou permissão explícita equivalente; permissões técnicas dependem do módulo de usuários.
- `people.is_active` existe no schema. Pessoa nunca pode ser excluída fisicamente, mesmo sem vínculo; somente pode ser inativada. Inativação/reativação exigem Administrador ou permissão explícita equivalente. Inativos não são opções padrão em lançamentos, podem ser encontrados com filtro e continuam visíveis no histórico.
- `equipment` atualmente não possui campo de status. A regra aprovada limita o status funcional a Ativo/Inativo; novo Equipamento inicia Ativo. Ativo aparece para nova OS; Inativo fica fora das opções padrão, pode ser localizado por filtro e continua visível no histórico. Exclusão física é permitida somente sem qualquer registro persistido relacionado e somente por Administrador ou usuário com permissão explícita equivalente; depois de vínculo, somente inativação autorizada. O campo ainda precisa ser modelado.
- `Equipment.ownerId` referencia `people`, mas o schema não impõe que a Pessoa tenha o Tipo de Contato Cliente nem que esteja ativa. A elegibilidade deve ser validada pela aplicação tanto no cadastro inicial quanto na transferência. O modelo físico atual de `person_roles` é um enum e não corresponde ao catálogo funcional definitivo.
- A OS registra a Pessoa informada na abertura, sem separação obrigatória entre essa Pessoa e o proprietário real. Não haverá snapshot completo dos dados da Pessoa/Equipamento dentro de cada OS; alterações e movimentações relevantes devem ser consultáveis no histórico. O schema atual não contém entidade OS nem estrutura de histórico geral.
- `equipment_ownership_events` existe e registra equipamento, titular anterior, novo titular e data/hora. A transferência altera o proprietário atual e registra evento sem reescrever OS antigas; pode ocorrer fora ou durante OS e sua associação com OS é opcional. Usuários com permissões correspondentes podem transferir e alterar Pessoa/Equipamento com ou sem histórico, sem justificativa obrigatória, com registro automático no histórico. O schema atual não registra usuário executor nem vínculo com OS.
- A exclusão física ou inativação de Pessoa/Equipamento deve preservar registros históricos. A matriz técnica de relacionamentos, restrições e critérios de vínculo depende da modelagem futura.

Permanecem pendentes: ciclo operacional de equipamento além de Ativo/Inativo, estrutura técnica e lista final de eventos básicos/sensíveis do histórico, filtros/pesquisa do histórico, implementação técnica de permissões, contratos de API e estratégia técnica do seed. Não há snapshots completos da OS aprovados. O vínculo opcional de transferência com OS está aprovado funcionalmente, mas ainda não existe estrutura de OS ou vínculo no schema.

## 10.3 Campos e validação de Equipamento — regras aprovadas ainda não refletidas

- O cadastro exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; Número de Série é opcional. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Tipo de Equipamento e Marca são cadastros próprios, e Marca representa também Fabricante.
- No schema atual, `owner_id` e `type_id` são obrigatórios, mas `brand_id` é opcional e `model` é opcional. `serial_number` é opcional e tem índice não unique; não existe status em `equipment`. O schema/migration não representa ainda a obrigatoriedade de Marca/Modelo nem os status Ativo/Inativo.
- `equipment_types` e `equipment_brands` são cadastros próprios, mas não possuem campo de atividade no schema atual. Inativação, exclusão física condicionada a ausência de uso e seleção padrão precisam de implementação/modelagem futura; Tipo/Marca usados não podem ser apagados fisicamente e seus registros históricos continuam exibindo a referência. Renomeação após uso é permitida e deve ser registrada no histórico com valores anterior/novo, data/hora e usuário quando disponível.
- Se o número de série for informado, a API deverá comparar o serial com equipamentos existentes considerando o proprietário atual: coincidência para o mesmo proprietário bloqueia; para proprietário diferente, avisa e permite cadastrar outro, sem sugerir transferência. Não haverá unicidade global de serial. Esse comportamento é regra de aplicação e não é garantido apenas pelo índice atual.
- Sem número de série, o equipamento salva normalmente e não há busca automática de duplicidade pela combinação proprietário + Tipo + Marca + Modelo. A regra de armazenamento aprovada converte o serial para caixa alta sem remover símbolos ou espaços; não há limpeza específica. A pesquisa de equipamentos é independente da duplicidade e segue os filtros funcionais descritos abaixo.

## 10.4 Catálogos, normalização, pesquisa e alterações de Equipamento — regras aprovadas ainda não refletidas

- O catálogo inicial de Tipo de Equipamento contém Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. O catálogo inicial de Marca contém Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. São cadastros próprios expansíveis, não enums fixos. Catálogos iniciais serão inseridos por seed idempotente executado por comando controlado, não automaticamente ao iniciar o Backend; o seed cria ausentes, não duplica e não sobrescreve renomeações manuais permitidas.
- A regra de aplicação aprovada converte todos os dados textuais persistidos para MAIÚSCULAS, com exceção de e-mail. E-mail é salvo em minúsculas, após trim de espaços externos, e duplicidade é comparada em minúsculas. Telefone é persistido somente com números; sua máscara é visual. São aceitos 10 dígitos como fixo e 11 como celular quando o primeiro dígito após o DDD é 9. Menos de 10, mais de 11 até 32 ou celular sem esse nono dígito gera aviso não bloqueante; após confirmação o operador pode continuar. Telefone sem dígitos ou acima de 32 é bloqueado no recorte aprovado. CEP é opcional, salvo somente com números e sua máscara é visual. Campos textuais de endereço seguem caixa alta. CPF é somente numérico; CNPJ é canônico sem pontuação e em maiúsculas, podendo ser numérico ou alfanumérico oficial.
- Número de Série é persistido em caixa alta sem remover ou alterar espaços (inclusive no início/fim), pontos, traços, barras ou outros símbolos. Assim, `abc-123` é salvo como `ABC-123`; `AB C 123` permanece `AB C 123`; `ab.c/123` vira `AB.C/123`; `ABC-123` e `ABC123` são diferentes. Não se aprovou normalização de símbolos.
- Pesquisa de equipamento localiza por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; o status filtra Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem mediante filtro. Pesquisa não é regra de bloqueio; a duplicidade continua sendo determinada exclusivamente pela regra de serial por proprietário. Sem serial, não há busca/alerta/bloqueio automático por proprietário + tipo + Marca + Modelo. Pesquisa avançada e combinações finais de filtros permanecem pendentes.
- Na ficha do Equipamento, usuários com permissões correspondentes podem alterar Tipo, Marca, Modelo, Número de Série e demais dados mesmo com histórico; proprietário com histórico muda por transferência formal. Alterações não exigem justificativa obrigatória e devem ser registradas automaticamente. Isso não altera o ciclo de vida cadastral próprio de Tipo e Marca.
- Transferência manual fora de OS e transferência durante OS são permitidas. O evento poderá ter vínculo com uma OS, mas o vínculo é opcional e OS antigas nunca são alteradas. A tabela atual `equipment_ownership_events` registra equipamento, titulares anterior/novo e data, mas não contém `work_order_id`; não há entidade de OS no schema aplicado.
- A regra de normalização geral, a exceção de e-mail, telefone/CEP e os comportamentos de pesquisa, alteração permanente e vínculo opcional com OS são regras da aplicação/API. O schema e a migration atuais não foram alterados nem representam todos esses comportamentos.

## 10.5 Histórico, exclusões e permissões — regras aprovadas ainda não refletidas

- Não será adotado snapshot completo dos dados de Pessoa e Equipamento em cada OS. O sistema usará histórico de alterações e eventos/movimentações relevantes de Pessoa, Equipamento, OS e entidades relacionadas, sem duplicar todos os dados cadastrais. O schema atual não contém mecanismo geral de histórico/auditoria para essas entidades.
- O histórico distingue alteração de campo (entidade, campo, valor anterior/novo, data/hora e usuário quando definido) de evento/movimentação (ação relevante sem simples troca de valor, como adicionar/remover telefone/endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade ou cancelar OS). A lista final de eventos ainda não está fechada.
- Histórico aparece no contexto da entidade Pessoa, Equipamento ou OS. Usuários com permissão correspondente podem ver histórico operacional básico; Administrador pode ver histórico completo e sensível. Histórico de Aviso e histórico técnico/auditoria exigem Administrador ou permissão explícita equivalente. Eventos básicos/sensíveis, filtros e permissões finais permanecem pendentes.
- Pessoa nunca é excluída fisicamente; `people.is_active` existe, mas a regra funcional só permite inativar. Pessoa inativa é omitida por padrão e permanece acessível por filtro e nos históricos. Usuário comum não inativa/reativa Pessoa; administrador pode fazê-lo.
- Equipamento pode ser excluído fisicamente apenas por Administrador ou usuário com permissão explícita equivalente e apenas sem qualquer registro persistido relacionado. Qualquer vínculo operacional, comercial, financeiro, técnico ou de auditoria impede exclusão física; após vínculo, somente inativação/reativação autorizada. O schema atual ainda usa `onDelete: Restrict` nas relações, mas não implementa autorização nem status de Equipamento.
- As permissões são atribuídas por usuário/ação: podem autorizar criação e alteração de Pessoa/Equipamento, transferência e preenchimento de Aviso vazio. Inativar/reativar Pessoa ou Equipamento, excluir Equipamento sem vínculo, modificar/apagar Aviso existente e visualizar histórico sensível exigem Administrador ou permissão explícita equivalente. Administrador possui poderes máximos; a implementação técnica aguarda o módulo de segurança.
- Toda alteração cadastral relevante gera histórico automaticamente. Antes de salvar mudança de Pessoa ou Equipamento, a interface pede confirmação com o texto “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra; cancelar não salva. Alterações comuns não exigem justificativa obrigatória.
- O modelo Prisma/migration atual não contém histórico geral, classificação dos dois tipos de registro, usuário responsável, permissões nem status de Equipamento. Exclusão física bloqueada para Pessoa e confirmação antes de salvar são regras da aplicação/interface, não estado presente no banco. Nada disso foi migrado nesta atualização documental.

# 10.6 Decisões funcionais complementares — ainda não refletidas no schema

As decisões abaixo complementam e substituem as pendências anteriores deste documento quando tratam do mesmo assunto. São regras funcionais aprovadas; não descrevem o schema aplicado:

- **Usuários e permissões:** Administrador é o conceito máximo e possui poderes máximos. Técnico e Usuário comum são designações operacionais, não perfis rígidos. Permissões são atribuídas por usuário/ação; ações restritas ao Administrador podem ser concedidas explicitamente a outro usuário. Master não existe no sistema. A implementação técnica e o módulo de usuários permanecem futuros.
- **Principalidade:** telefones, e-mails e endereços admitem no máximo um principal por Pessoa e coleção, mas não exigem principal. Marcar outro registro como principal desmarca o anterior; remover/inativar o principal pode deixar a coleção sem principal. Índices funcionais aplicados garantem principalidade única de telefones/e-mails. São permitidos vários endereços do mesmo Tipo funcionalmente, mas o schema ainda restringe endereço a zero ou um por Pessoa.
- **Pessoa inativa:** pode ser consultada por filtro, mas não usada em novos vínculos operacionais, inclusive OS, venda ou como proprietária de Equipamento. Reativação exige Administrador ou permissão equivalente.
- **Duplicidade sem documento:** compara exatamente nome/Razão Social em caixa alta e sem espaços extras, telefone somente numérico e e-mail em minúsculas após trim. Correspondência avisa sem bloquear. Busca fuzzy fica fora do escopo.
- **Telefone:** aceita 10 dígitos como fixo e 11 como celular se o primeiro dígito após DDD for 9. Menos de 10, mais de 11 até 32 ou celular sem nono dígito gera aviso não bloqueante; o operador pode confirmar e continuar. Sem dígitos ou acima de 32, bloqueia no recorte aprovado.
- **Vínculo de Equipamento:** qualquer registro persistido relacionado ao Equipamento (OS, venda, orçamento, garantia, entrega/devolução, transferência, movimentação técnica, financeiro ou histórico/auditoria) impede exclusão física. A regra funcional está definida; as consultas e validações ainda precisam ser implementadas.
- **Catálogos:** renomear Tipo de Equipamento, Marca ou outro catálogo usado é permitido. O cadastro exibe o nome atual; o histórico geral registra valor anterior/novo, data/hora e usuário quando disponível. Não se cria snapshot completo em cada referência.
- **Seed:** os catálogos iniciais serão carregados por seed idempotente, sob comando controlado, e não automaticamente na inicialização do Backend. A execução repetida cria valores ausentes sem duplicar e não desfaz renomeações manuais permitidas. Estratégia técnica continua pendente.
- **Histórico geral:** está aprovado conceitualmente um histórico por entidade para alterações de campo e eventos/movimentações, com entidade, data/hora, valores anterior/novo quando aplicável e usuário quando disponível. A estrutura física, os eventos finais e a classificação sensível permanecem pendentes.

## 10.7 Telefones e e-mails de Pessoa — migration aplicada

O recorte foi implementado e aplicado pela migration `20261007183000_person_contacts`. Ela acrescenta `public_id CHAR(36) NOT NULL` único a `person_phones` e `person_emails`, preenchendo identificadores antes de impor obrigatoriedade; cria `person_contact_events`; adiciona unicidade composta de e-mail por `(person_id, address)` e índices funcionais únicos para principalidade por Pessoa e coleção. Os índices funcionais consideram `person_id` somente quando `is_primary = 1`, permitindo vários contatos não principais. As tabelas mantêm `id` interno, `label` legado nullable sem uso pela API, `number VARCHAR(32)` ou `address VARCHAR(254)`, `is_primary`, `created_at` e índice de consulta `(person_id, is_primary)`. Não foi adicionado `is_active`.

`person_contact_events` armazena `person_id`, `event_type`, referências opcionais a telefone/e-mail, `previous_contact_public_id`, `previous_value`, `new_value` e `occurred_at`; possui índice `(person_id, occurred_at)` e FKs com `ON DELETE RESTRICT` e `ON UPDATE CASCADE`. Os tipos atuais são `PHONE_CREATED`, `EMAIL_CREATED`, `PHONE_PRIMARY_CHANGED` e `EMAIL_PRIMARY_CHANGED`. A migration foi preparada com as FKs dentro do `CREATE TABLE`, evitando ALTER posterior na nova tabela. O service garante que cada evento corresponda ao tipo de contato correto; não há CHECK físico exigindo exclusividade entre `phone_id`/`email_id` ou coerência entre tipo e FK, ponto que poderá ser avaliado futuramente.

O mesmo e-mail normalizado é bloqueado na mesma Pessoa pela unicidade composta de `person_id` e `address`; entre Pessoas, é permitido e a API apresenta aviso não bloqueante. Principalidade é opcional e independente entre telefones e e-mails; definir novo principal desmarca o anterior da mesma coleção na transação. Os índices funcionais foram validados em MySQL 8.0.46 e Prisma 7.10.0. A migration foi aplicada após a recuperação de uma tentativa anterior que deixou DDL parcial: o estado foi reconciliado e validado antes de registrar a migration como aplicada. O estado final não tem migration pendente; a estrutura aplicada foi comparada com o schema Prisma. Essa recuperação não alterou as migrations anteriores.

Cada inclusão bem-sucedida gera evento de criação; mudança efetiva de principal gera evento adicional, inclusive de nenhum para o primeiro principal. Contato, eventual desmarcação anterior e eventos são persistidos atomicamente; falha no histórico cancela a operação. Não há usuário fictício nem rota pública de histórico. Este histórico mínimo não substitui o histórico geral definitivo, cuja estrutura permanece pendente.


# 10.8 Autenticação e autorização — modelo conceitual aprovado, não implementado

O desenho conceitual prevê `users`, `permissions`, `user_permissions`, `user_sessions` e um único `admin_audit_log` para eventos administrativos e de segurança. Esses nomes representam entidades previstas, não tabelas existentes nem um schema definitivo. Não há migration, modelo Prisma ou alteração no banco para Auth nesta etapa.

Usuários terão nome de usuário único para login e senha de no mínimo 10 caracteres armazenada com Argon2id; não haverá troca periódica obrigatória. Serão criados somente por Administrador e não terão auto-registro público. O primeiro Administrador será provisionado manualmente por comando interno/script controlado no ambiente local ou na implantação inicial. Inativar o último Administrador ativo, remover sua permissão administrativa ou fazer qualquer alteração que deixe o sistema sem Administrador ativo deve ser bloqueado. Usuários devem ser inativados, não excluídos fisicamente.

A sessão será opaca e mantida no servidor; somente o hash do segredo poderá ser persistido. `user_sessions` deverá permitir controlar `last_used_at`, revogação e timeout de 8 horas por inatividade. Cada requisição autenticada válida atualizará `last_used_at` e renovará o prazo a partir do último uso; não haverá limite absoluto no primeiro recorte. Logout revoga somente a sessão atual; encerramento de todas as sessões pode ser considerado futuramente. Sessões simultâneas são permitidas e auditadas. JWT e OIDC ficam fora do recorte atual.

O Log Administrativo único deverá registrar, no mínimo, login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado e permissão concedida/revogada. Falhas registram IP, origem e user-agent quando disponíveis. Sua retenção é inicialmente indefinida e não haverá exclusão automática neste primeiro desenho. Campos além do mínimo aprovado, acesso e demais políticas de integridade ainda precisam de especificação. No primeiro recorte, a notificação por cinco falhas poderá ser somente o registro no Log Administrativo, sem envio de e-mail.

`person_contact_events` deverá aceitar referência opcional ao usuário executor, preservando eventos sistêmicos, legados ou anteriores à autenticação. Usuários devem ser inativados em vez de fisicamente excluídos. Caso a exclusão física venha a existir, o comportamento preferencial é FK opcional equivalente a `ON DELETE SET NULL`, preservando o evento histórico. Essa relação e sua política serão modeladas em migration futura; a FK ainda não existe.

Neste momento o sistema será considerado somente de uso interno e o Backend não está pronto para exposição externa operacional. Não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos para classificar a rede. Acesso externo continua proibido até 2FA e fronteira confiável estarem implementados; proxy reverso, VPN, túnel ou publicação externa exigirão nova decisão documental. O desenho de autenticação não está implementado: o banco aplicado continua sem tabelas de usuários, permissões, sessões ou Log Administrativo. Método/recuperação do 2FA e implementação física permanecem pendentes.

# 11. Evolução

Este documento será expandido juntamente com a modelagem do sistema.

# 12. Configuração atual do Prisma Client

- O generator do projeto é `prisma-client`, com saída em `backend/src/generated/prisma`.
- O código gerado não é versionado; ele deve ser reproduzido com `npm run prisma:generate` no Backend.
- `schema.prisma` e `prisma/migrations/` permanecem versionados.
- O datasource continua usando MySQL 8. A configuração da URL e dos caminhos do Prisma fica em `backend/prisma.config.ts`.
- O `PrismaService` configura o Prisma Client com `@prisma/adapter-mariadb` na aplicação NestJS.
- `@prisma/adapter-mariadb@7.10.0` fixa `mariadb@3.4.5`, versão com advisories de segurança relevantes ao runtime. Enquanto o adapter oficial estável não utilizar um driver corrigido, `backend/package.json` aplica override restrito para `mariadb@3.4.7`. A combinação foi validada com Prisma 7.10.0 e MySQL 8.0.46. Remover o override quando uma versão oficial estável do adapter passar a utilizar um driver corrigido.

# 13. Ambiente local de desenvolvimento

- O banco oficial permanece MySQL 8, conforme a DA-005. O ambiente local atual utiliza MySQL Community Server 8.0.46, que será mantido nesta fase do desenvolvimento. Essa versão é uma configuração operacional e não altera a decisão arquitetural.
- O serviço Windows identificado é `MySQL80`, na porta `3306`.
- A configuração aprovada para o banco do projeto é `gestor_os`, charset `utf8mb4`, collation `utf8mb4_unicode_ci` e usuário `gestor_os` limitado a `localhost`. A aplicação não utilizará `root`.
- O banco `gestor_os` e o usuário `gestor_os` foram criados no servidor local. A conexão real com MySQL foi validada com esse usuário, inclusive por consulta de leitura pelo Prisma Client integrado à aplicação NestJS.
- As migrations `20261006120000_initial_core`, `20261007120000_person_basic` e `20261007183000_person_contacts` foram aplicadas. `prisma migrate status` confirmou que não há migration pendente, e o histórico concluído é controlado por `_prisma_migrations`.
- `docker/compose.yaml` ainda referencia `mysql:8.4`, enquanto o ambiente local usa MySQL 8.0.46. Essa divergência conhecida será tratada quando Docker passar a fazer parte efetiva do ambiente de execução; ela não altera a stack oficial neste momento.

# 14. Fronteira de persistência

Prisma ORM é a camada oficial de acesso do Backend ao MySQL, conforme DA-017. Módulos de negócio não deverão criar conexões MySQL próprias nem utilizar clientes ou drivers paralelos para contornar o Prisma. O uso interno do driver `mariadb` por `@prisma/adapter-mariadb` não autoriza seu uso direto pelos módulos.

`PrismaService` e `PrismaModule` pertencem à infraestrutura em `backend/src/infrastructure/prisma/`. O `PrismaModule` não é global e deverá ser importado explicitamente por cada módulo consumidor. O `PrismaService` gerencia a conexão e a desconexão no ciclo de vida da aplicação.

# 15. Configuração da CLI e da aplicação

`backend/prisma.config.ts` configura a CLI do Prisma, incluindo a URL do datasource e os caminhos de schema e migrations. Essa configuração não carrega automaticamente a `DATABASE_URL` no runtime NestJS. A aplicação utiliza `@nestjs/config` para obter a variável em runtime; a inicialização da persistência falha claramente quando ela está ausente, sem exibir credenciais.

Credenciais não devem constar no código nem no Git. `backend/.env` permanece local e não versionado; outros ambientes deverão fornecer a configuração apropriada sem expor credenciais.

# 16. SQL raw excepcional

Prisma Client é o mecanismo padrão de acesso aos dados. Quando sua API normal não atender adequadamente uma necessidade técnica concreta, poderá ser avaliado SQL raw por recursos do próprio Prisma, como `$queryRaw` e `$executeRaw`. A consulta deverá ser parametrizada de forma segura, identificável e revisável, dentro da fronteira de persistência. SQL raw não deverá se tornar alternativa habitual ao ORM nem ficar espalhado pelos módulos.

# 17. Transações

Operações que exijam atomicidade deverão utilizar os mecanismos transacionais do Prisma, especialmente `$transaction`. `PrismaService` disponibiliza essa infraestrutura; o service responsável pelo fluxo de negócio decidirá quando iniciar a transação e quais operações ela abrangerá. Mudança de titular e seu evento histórico, movimentos de estoque, baixas financeiras e alterações de OS com histórico são exemplos futuros, sem implementação nesta etapa.
