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
- Tipo de Contribuinte será cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. Não é obrigatório para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. O schema atual ainda não possui esse relacionamento. Valores, códigos fiscais, regras de NF-e/NFS-e e validações fiscais permanecem pendentes.
- Tipo de Contato representa papéis da Pessoa, admite vários simultaneamente e terá cadastro próprio. `person_roles` atualmente usa enum e representa parcialmente os papéis; não é a solução definitiva aprovada. Catálogo inicial e regras de ciclo de vida continuam pendentes.
- Observações será informação passiva. Aviso terá regra operacional de apresentação quando a Pessoa for visualizada, quando uma venda for realizada para ela e quando uma OS for aberta para ela. O schema atual não possui esses campos; formato, confirmação, severidade, bloqueio, validade e histórico do Aviso permanecem pendentes. O Backend/API mantém dados e regra; o Frontend apresenta o conteúdo.
- Uma Pessoa poderá possuir múltiplos endereços. Cada endereço terá Tipo de Endereço de cadastro próprio e poderá ser marcado como principal. O schema aplicado tem `person_addresses.person_id UNIQUE`, que permite zero ou um endereço; essa unicidade não atende à regra nova. Tipo, principalidade e multiplicidade exigirão evolução por migration. Catálogo inicial e outras validações não estão aprovados.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outra Pessoa com cadastro completo. O vínculo autorreferenciado atual é conceitualmente compatível com a cardinalidade, mas a coluna `primary_contact_id` usa terminologia “principal” que não corresponde à regra funcional. Esta documentação não altera o nome físico.
- Para equipamentos, Marca e Fabricante são o mesmo conceito e haverá um único cadastro, preferencialmente denominado Marca. `equipment_brands` é compatível como referência conceitual; não deve ser criado cadastro separado de fabricantes de equipamentos.

Estas divergências são trabalho de modelagem futuro. Nenhum schema, migration ou banco foi alterado nesta atualização documental.

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
