# Modelo do Banco

## Objetivo

Documentar o modelo relacional implementado para o Sistema Gestor OS e registrar sua evolução por migrations do Prisma.

## Status

Primeiro recorte implementado no schema Prisma. A migration `20261006120000_initial_core` foi aplicada com sucesso no banco `gestor_os`, em MySQL Community Server 8.0.46, e a estrutura foi validada. Prisma Migrate controla o histórico pela tabela `_prisma_migrations`; não havia migration pendente no momento da validação.

## Última atualização

06/10/2026.

## Escopo atual

O primeiro recorte cobre cadastros compartilhados e equipamentos. A implementação está em `backend/prisma/schema.prisma`; a migration inicial está em `backend/prisma/migrations/20261006120000_initial_core/migration.sql`.

### Convenções

- Chaves primárias numéricas autoincrementais para relações internas.
- `publicId` UUID para identificação externa das entidades principais.
- Datas registradas em UTC com precisão de milissegundos (`DATETIME(3)`); o serviço de aplicação deverá usar UTC.
- Tabelas e colunas usam nomes em snake_case no banco, mapeados a nomes camelCase no Prisma.
- Exclusão física é restringida em relações históricas; inativação é usada onde aprovada.

### Entidades

| Entidade | Tabela | Responsabilidade e relações |
| --- | --- | --- |
| Pessoa | `people` | Cadastro compartilhado para clientes, fornecedores, transportadoras e prestadores. Nome obrigatório; documento opcional e único quando informado; pode indicar uma pessoa de contato. |
| Papel da pessoa | `person_roles` | Associação N:N entre pessoa e papéis `CUSTOMER`, `SUPPLIER`, `CARRIER` e `SERVICE_PROVIDER`. |
| Telefone | `person_phones` | Vários telefones por pessoa, com rótulo e indicação de principal. |
| E-mail | `person_emails` | Vários e-mails por pessoa, com rótulo e indicação de principal. |
| Endereço | `person_addresses` | Até um endereço por pessoa. Campos de endereço são opcionais. |
| Tipo de equipamento | `equipment_types` | Catálogo de tipos cadastráveis. |
| Marca de equipamento | `equipment_brands` | Cadastro único de marcas. A distinção de fabricante permanece fora deste recorte. |
| Equipamento | `equipment` | Equipamento permanente, relacionado ao proprietário e tipo, com marca, modelo e serial opcionais. O serial é indexado, mas não único, pois a especificação permite avisar sobre duplicidade e ainda cadastrar outro registro. |
| Histórico de titularidade | `equipment_ownership_events` | Registra equipamento, titular anterior (opcional), novo titular e data/hora da alteração. |

### Integridade e limites conhecidos

- CPF/CNPJ fica em uma coluna única opcional. A normalização do valor deve ser feita pela aplicação antes da gravação para que formatos equivalentes não contornem a unicidade.
- `isPrimary` identifica telefone/e-mail principal. A regra de garantir no máximo um principal de cada tipo por pessoa precisa ser aplicada pelo serviço em transação; não há restrição parcial correspondente neste esquema.
- `Equipment.ownerId` representa o titular atual. O serviço que trocar o titular deverá atualizar esse vínculo e inserir o evento de histórico na mesma transação.
- O histórico de titularidade não substitui o log administrativo nem identifica o usuário que realizou a alteração; autenticação e trilha administrativa ainda serão modeladas.
- Código interno sequencial exibido ao usuário, OS, estoque, compras, vendas, financeiro, segurança e auditoria completa ainda não fazem parte desta migration.

## Próximas áreas de modelagem

1. Usuários e permissões diretas por usuário, incluindo auditoria administrativa.
2. Ordem de Serviço e snapshots históricos de cliente/equipamento.
3. Estoque por movimentações e compras.
4. Financeiro e vendas, após detalhamento dos estados e vínculos pendentes.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Registro do primeiro recorte: pessoas, papéis, contatos, endereço, equipamentos e histórico de titularidade. |
