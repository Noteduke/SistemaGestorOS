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

O recorte inclui pessoas e seus papéis, telefones, e-mails e endereço, além de tipos/marcas de equipamento, equipamentos e eventos de titularidade. O diagrama e as relações estão descritos em `docs/modelagem/Modelo-Banco.md` e `docs/modelagem/Diagrama-Entidades.md`.

O schema Prisma foi validado pelo Prisma. A migration inicial `20261006120000_initial_core` foi aplicada no MySQL Community Server 8.0.46 por `prisma migrate deploy`. A estrutura resultante foi conferida com a migration versionada e com o schema Prisma: nove tabelas do domínio, 58 colunas, chaves primárias e estrangeiras, índices, restrições de unicidade, nulabilidade, defaults, charset e collation. O Prisma Migrate controla o histórico pela tabela administrativa `_prisma_migrations`. O banco deixou de estar vazio em estrutura; nenhum dado de teste foi inserido. A aplicação deverá normalizar CPF/CNPJ antes de persistir, garantir no máximo um telefone e um e-mail principal por pessoa e atualizar o titular atual junto com o evento de titularidade na mesma transação.

Permanecem para etapas seguintes: usuário e permissões, auditoria administrativa, OS e seu snapshot histórico, estoque, compras, vendas e financeiro. Regras que constam em `docs/Especificacoes-Nao-Documentadas.md` não devem ser presumidas durante a modelagem.

# 11. Evolução

Este documento será expandido juntamente com a modelagem do sistema.

# 12. Configuração atual do Prisma Client

- O generator do projeto é `prisma-client`, com saída em `backend/src/generated/prisma`.
- O código gerado não é versionado; ele deve ser reproduzido com `npm run prisma:generate` no Backend.
- `schema.prisma` e `prisma/migrations/` permanecem versionados.
- O datasource continua usando MySQL 8. A configuração da URL e dos caminhos do Prisma fica em `backend/prisma.config.ts`.
- A configuração do adapter do Prisma Client na aplicação será implementada quando a camada de persistência for iniciada.

# 13. Ambiente local de desenvolvimento

- O banco oficial permanece MySQL 8, conforme a DA-005. O ambiente local atual utiliza MySQL Community Server 8.0.46, que será mantido nesta fase do desenvolvimento. Essa versão é uma configuração operacional e não altera a decisão arquitetural.
- O serviço Windows identificado é `MySQL80`, na porta `3306`.
- A configuração aprovada para o banco do projeto é `gestor_os`, charset `utf8mb4`, collation `utf8mb4_unicode_ci` e usuário `gestor_os` limitado a `localhost`. A aplicação não utilizará `root`.
- O banco `gestor_os` e o usuário `gestor_os` foram criados no servidor local. A conexão real com MySQL foi validada com esse usuário, inclusive por consulta de leitura pelo Prisma Client. A integração do Client à aplicação NestJS ainda depende da camada de acesso ao banco.
- A migration inicial `20261006120000_initial_core` foi aplicada com sucesso por `prisma migrate deploy`. `prisma migrate status` confirmou que não há migration pendente, e o registro concluído consta em `_prisma_migrations`.
- `docker/compose.yaml` ainda referencia `mysql:8.4`, enquanto o ambiente local usa MySQL 8.0.46. Essa divergência conhecida será tratada quando Docker passar a fazer parte efetiva do ambiente de execução; ela não altera a stack oficial neste momento.

# 14. Fronteira de persistência

Prisma ORM é a camada oficial de acesso do Backend ao MySQL, conforme DA-017. Módulos de negócio não deverão criar conexões MySQL próprias nem utilizar clientes ou drivers paralelos para contornar o Prisma. O uso interno do driver `mariadb` por `@prisma/adapter-mariadb` não autoriza seu uso direto pelos módulos.

`PrismaService` e `PrismaModule` pertencerão à infraestrutura em `backend/src/infrastructure/prisma/`. A integração permanente com NestJS ainda não foi implementada. O `PrismaModule` não será global e deverá ser importado explicitamente por cada módulo consumidor.

# 15. Configuração da CLI e da aplicação

`backend/prisma.config.ts` configura a CLI do Prisma, incluindo a URL do datasource e os caminhos de schema e migrations. Essa configuração não carrega automaticamente a `DATABASE_URL` no runtime NestJS. A aplicação utilizará `@nestjs/config` para obter a variável em runtime quando a integração for implementada; a dependência ainda não foi instalada.

Credenciais não devem constar no código nem no Git. `backend/.env` permanece local e não versionado; outros ambientes deverão fornecer a configuração apropriada sem expor credenciais.

# 16. SQL raw excepcional

Prisma Client é o mecanismo padrão de acesso aos dados. Quando sua API normal não atender adequadamente uma necessidade técnica concreta, poderá ser avaliado SQL raw por recursos do próprio Prisma, como `$queryRaw` e `$executeRaw`. A consulta deverá ser parametrizada de forma segura, identificável e revisável, dentro da fronteira de persistência. SQL raw não deverá se tornar alternativa habitual ao ORM nem ficar espalhado pelos módulos.

# 17. Transações

Operações que exijam atomicidade deverão utilizar os mecanismos transacionais do Prisma, especialmente `$transaction`. `PrismaService` disponibilizará essa infraestrutura; o service responsável pelo fluxo de negócio decidirá quando iniciar a transação e quais operações ela abrangerá. Mudança de titular e seu evento histórico, movimentos de estoque, baixas financeiras e alterações de OS com histórico são exemplos futuros, sem implementação nesta etapa.
