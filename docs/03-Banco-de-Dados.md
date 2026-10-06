# BANCO DE DADOS
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir os padrões oficiais de modelagem e utilização do banco de dados do Sistema Gestor OS.

# 2. Tecnologias

- MySQL 8
- Prisma ORM

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

A migration ainda não foi validada pelo Prisma nem aplicada em um banco MySQL. A aplicação deverá normalizar CPF/CNPJ antes de persistir, garantir no máximo um telefone e um e-mail principal por pessoa e atualizar o titular atual junto com o evento de titularidade na mesma transação.

Permanecem para etapas seguintes: usuário e permissões, auditoria administrativa, OS e seu snapshot histórico, estoque, compras, vendas e financeiro. Regras que constam em `docs/Especificacoes-Nao-Documentadas.md` não devem ser presumidas durante a modelagem.

# 11. Evolução

Este documento será expandido juntamente com a modelagem do sistema.
