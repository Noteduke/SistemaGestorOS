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

O primeiro recorte de persistência está em `backend/prisma/schema.prisma` e na migration `backend/prisma/migrations/20261006120000_initial_core/migration.sql`.

O recorte físico atual inclui pessoas, papéis, telefones, e-mails, até um endereço por pessoa, tipos e marcas de equipamento, equipamentos e eventos de titularidade. O diagrama e as relações atuais estão descritos em `docs/modelagem/Modelo-Banco.md` e `docs/modelagem/Diagrama-Entidades.md`.

O schema Prisma foi validado pelo Prisma. A migration inicial `20261006120000_initial_core` foi aplicada no MySQL Community Server 8.0.46 por `prisma migrate deploy`. A estrutura resultante foi conferida com a migration versionada e com o schema Prisma: nove tabelas do domínio, 58 colunas, chaves primárias e estrangeiras, índices, restrições de unicidade, nulabilidade, defaults, charset e collation. O Prisma Migrate controla o histórico pela tabela administrativa `_prisma_migrations`. O banco deixou de estar vazio em estrutura; nenhum dado de teste foi inserido. Conforme as regras aprovadas, a futura aplicação deverá armazenar CPF/CNPJ somente com números e, quando informado, verificar validade matemática, unicidade e compatibilidade com PF/PJ. Também deverá garantir no máximo um telefone e um e-mail principal por pessoa e atualizar o titular atual junto com o evento de titularidade na mesma transação. Essas regras ainda não estão implementadas nesta atualização documental.

Permanecem para etapas seguintes: usuário e permissões, auditoria administrativa, OS e seu snapshot histórico, estoque, compras, vendas e financeiro. Regras que constam em `docs/Especificacoes-Nao-Documentadas.md` não devem ser presumidas durante a modelagem.

## 10.1 Regras funcionais aprovadas para Cadastros ainda não refletidas no schema aplicado

As decisões abaixo foram aprovadas documentalmente em 07/10/2026. As decisões deste complemento detalham e, quando indicadas, substituem a regra anterior registrada na mesma data. Elas descrevem o estado funcional desejado e **não** alteram nem descrevem como já migrada a estrutura existente. A evolução do schema deverá ser feita em etapa própria, com migration Prisma revisada e aprovada antes de qualquer aplicação.

- Os campos obrigatórios mínimos da Pessoa são Tipo de Pessoa (PF ou PJ) e Nome/Razão Social. Os demais campos são opcionais no cadastro geral, salvo exigência específica em fluxo futuro, como emissão fiscal. A tabela `people` ainda não possui Tipo de Pessoa, Nome Fantasia, Inscrição Estadual, Inscrição Municipal, Tipo de Contribuinte, Observações ou Aviso.
- CPF/CNPJ é opcional no cadastro geral. Quando informado, deve ser armazenado somente com números, ser matematicamente válido, único no cadastro e compatível com o Tipo de Pessoa (PF: CPF com 11 dígitos; PJ: CNPJ com 14 dígitos). Máscara existe somente na interface; normalização, validação matemática, compatibilidade e duplicidade são regras Backend/API. O schema atual mantém `document` opcional e único, mas não representa Tipo de Pessoa nem impõe essas validações.
- Nome Fantasia não se aplica a PF e é opcional para PJ. Sem valor informado para PJ, a Razão Social é a referência principal de exibição. Inscrição Estadual e Inscrição Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, são armazenadas sem validação fiscal específica por estado/município nem interpretação fiscal complexa.
- Tipo de Contribuinte será cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS, Contribuinte Isento e Não Contribuinte, conforme as definições em `docs/02-Regras-de-Negocio.md`. Não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. O schema atual ainda não possui esse relacionamento. Códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.
- Tipo de Contato representa papéis da Pessoa, admite vários simultaneamente e será cadastro próprio, com catálogo inicial Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro. `person_roles` atualmente usa enum e representa parcialmente os papéis; não é a solução definitiva aprovada. O catálogo e o ciclo de vida dos valores são decisões funcionais aprovadas, mas ainda não estão representados no schema.
- Observações será informação passiva. Aviso é campo único informativo, com pergunta e mensagens definidas em `docs/02-Regras-de-Negocio.md`; não exibe conteúdo automaticamente nem bloqueia operações. O schema atual não possui esses campos. A permissão técnica de administrador e eventual auditoria de alteração/apagamento permanecem pendentes. O Backend/API mantém dados e regra; o Frontend apresenta a informação. Não há log de leitura ou confirmação nesta etapa.
- Uma Pessoa poderá possuir múltiplos endereços. Cada endereço terá um Tipo de Endereço de cadastro próprio (Principal, Cobrança, Entrega ou Instalação) e poderá ser marcado como principal. Ainda não foi definida uma regra sobre permitir ou impedir mais de um endereço do mesmo tipo. O schema aplicado tem `person_addresses.person_id UNIQUE`, que permite zero ou um endereço; essa unicidade não atende à regra nova. Tipo, principalidade e multiplicidade exigirão evolução por migration.
- Os catálogos auxiliares seguem regra de ciclo de vida aprovada: valores ainda não usados podem ser editados, inativados ou excluídos; valores usados podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não aparecem por padrão para novos vínculos e permanecem válidos nos registros históricos. Ainda está pendente definir se editar a descrição muda também o nome exibido em históricos ou se será mantido snapshot do nome anterior. Uma decisão específica futura pode substituir a regra geral.
- Para Pessoas, CPF/CNPJ informado é critério forte de identidade e, se já estiver cadastrado para outra Pessoa, bloqueia novo cadastro. Sem documento, possível duplicidade por nome, telefone ou e-mail deve gerar aviso sem bloquear o salvamento. Critérios de similaridade, normalização e algoritmo permanecem pendentes e não são impostos pelo schema atual.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outra Pessoa com cadastro completo. O vínculo autorreferenciado atual é conceitualmente compatível com a cardinalidade, mas a coluna `primary_contact_id` usa terminologia “principal” que não corresponde à regra funcional. Esta documentação não altera o nome físico.
- Para equipamentos, Marca e Fabricante são o mesmo conceito e haverá um único cadastro, preferencialmente denominado Marca. `equipment_brands` é compatível como referência conceitual; não deve ser criado cadastro separado de fabricantes de equipamentos.

Estas divergências são trabalho de modelagem futuro. Nenhum schema, migration ou banco foi alterado nesta atualização documental.

## 10.2 Aviso, ciclo de vida e titularidade — regras aprovadas ainda não refletidas

As regras funcionais abaixo foram aprovadas para orientar modelagem e aplicação futuras. Não descrevem a estrutura já aplicada:

- Aviso é um campo único informativo da Pessoa. A tabela `people` atualmente não possui esse campo. O comportamento de pergunta, apresentação condicional e continuidade da operação é regra de aplicação; não existe log de leitura ou confirmação nesta etapa. Permissões de inserir/alterar/apagar Aviso dependem do módulo de usuários e permissões ainda não implementado.
- `people.is_active` existe no schema. Pessoa sem vínculo histórico pode ser excluída fisicamente; com vínculo histórico, não pode ser excluída fisicamente e pode ser inativada. As opções padrão de novos lançamentos devem excluir inativos, com pesquisa direta mediante filtro e preservação de exibição histórica. O critério exato de vínculo histórico por entidade/tabela ainda precisa ser modelado.
- `equipment` atualmente não possui campo de status. A regra aprovada limita o status funcional a Ativo/Inativo; novo Equipamento inicia Ativo. Ativo aparece para nova OS; Inativo fica fora das opções padrão, pode ser localizado por filtro e continua visível no histórico. Exclusão física só é permitida sem OS ou histórico operacional; com vínculo, permite-se inativação. O campo ainda precisa ser modelado.
- `Equipment.ownerId` referencia `people`, mas o schema não impõe que a Pessoa tenha o Tipo de Contato Cliente nem que esteja ativa. A elegibilidade deve ser validada pela aplicação tanto no cadastro inicial quanto na transferência. O modelo físico atual de `person_roles` é um enum e não corresponde ao catálogo funcional definitivo.
- A OS deverá guardar a Pessoa informada no momento da abertura e o retrato histórico desse atendimento. Nesta etapa não haverá separação obrigatória entre pessoa informada na OS e proprietário real do equipamento. O schema atual não contém entidade de OS nem implementa snapshots; alterações posteriores no cadastro permanente não devem reescrever o retrato futuro da OS.
- `equipment_ownership_events` existe e registra equipamento, titular anterior, novo titular e data/hora. A transferência aprovada altera o proprietário atual e registra o evento sem reescrever OS antigas. Correção do proprietário sem histórico não precisa ser tratada como transferência formal. Mudança com histórico operacional deve ser transferência; correção retroativa com histórico fica restrita a administrador e deverá exigir justificativa/auditoria. O schema atual não identifica a natureza do evento, usuário executor ou justificativa, e as permissões ainda não estão implementadas.
- A exclusão física ou inativação de Pessoa/Equipamento deve preservar registros históricos. A matriz técnica de relacionamentos, restrições e critérios de vínculo depende da modelagem futura.

Permanecem pendentes: identificação técnica de vínculos históricos por entidade, normalização do número de série, regras de pesquisa, catálogo inicial de Tipo de Equipamento e Marca, snapshot do nome anterior de Tipo/Marca usados, ciclo operacional de equipamento além de Ativo/Inativo, eventual vínculo de transferência a OS, justificativa/auditoria de correção retroativa, permissões finais de administrador, snapshots da OS e eventual evolução para múltiplos Avisos ou log de leitura.

## 10.3 Campos e validação de Equipamento — regras aprovadas ainda não refletidas

- O cadastro exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; Número de Série é opcional. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Tipo de Equipamento e Marca são cadastros próprios, e Marca representa também Fabricante.
- No schema atual, `owner_id` e `type_id` são obrigatórios, mas `brand_id` é opcional e `model` é opcional. `serial_number` é opcional e tem índice não unique; não existe status em `equipment`. O schema/migration não representa ainda a obrigatoriedade de Marca/Modelo nem os status Ativo/Inativo.
- `equipment_types` e `equipment_brands` são cadastros próprios, mas não possuem campo de atividade no schema atual. Inativação, exclusão física condicionada a ausência de uso e seleção padrão precisam de implementação/modelagem futura; Tipo/Marca usados não podem ser apagados fisicamente e seus registros históricos continuam exibindo a referência. Snapshot de nome anterior após edição segue pendente.
- Se o número de série for informado, a API deverá comparar o serial com equipamentos existentes considerando o proprietário atual: coincidência para o mesmo proprietário bloqueia; para proprietário diferente, avisa e permite cadastrar outro, sem sugerir transferência. Não haverá unicidade global de serial. Esse comportamento é regra de aplicação e não é garantido apenas pelo índice atual.
- Sem número de série, o equipamento salva normalmente e não há busca automática de duplicidade pela combinação proprietário + Tipo + Marca + Modelo. Normalização avançada e regras gerais de pesquisa continuam pendentes.

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
- A migration inicial `20261006120000_initial_core` foi aplicada com sucesso por `prisma migrate deploy`. `prisma migrate status` confirmou que não há migration pendente, e o registro concluído consta em `_prisma_migrations`.
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
