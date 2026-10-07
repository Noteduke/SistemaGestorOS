# Modelo do Banco

## Objetivo

Documentar o modelo relacional implementado para o Sistema Gestor OS e registrar sua evolução por migrations do Prisma.

## Status

Primeiro recorte implementado no schema Prisma. A migration `20261006120000_initial_core` foi aplicada com sucesso no banco `gestor_os`, em MySQL Community Server 8.0.46, e a estrutura foi validada. Prisma Migrate controla o histórico pela tabela `_prisma_migrations`; não havia migration pendente no momento da validação.

## Última atualização

07/10/2026. As regras aprovadas nesta data estão registradas separadamente das estruturas físicas ainda não migradas.

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
| Pessoa | `people` | Modelo físico atual de cadastro compartilhado. Nome obrigatório; documento opcional e único quando informado; pode apontar para outra Pessoa como contato. As novas regras funcionais aprovadas ainda não estão integralmente refletidas nesta tabela. |
| Papel da pessoa | `person_roles` | Modelo físico atual: associação N:N com enum `CUSTOMER`, `SUPPLIER`, `CARRIER` e `SERVICE_PROVIDER`. Funcionalmente, os papéis passam a ser Tipos de Contato de cadastro próprio; a enumeração atual é parcial e deverá ser revista. |
| Telefone | `person_phones` | Vários telefones por pessoa, com rótulo e indicação de principal. |
| E-mail | `person_emails` | Vários e-mails por pessoa, com rótulo e indicação de principal. |
| Endereço | `person_addresses` | Modelo físico atual: até um endereço por pessoa, com campos opcionais. A regra funcional aprovada agora permite múltiplos endereços, cada qual com Tipo de Endereço próprio e possibilidade de principal; o schema ainda não atende. |
| Tipo de equipamento | `equipment_types` | Catálogo de tipos cadastráveis. |
| Marca de equipamento | `equipment_brands` | Modelo físico atual do cadastro único de marcas. Regra aprovada: Marca e Fabricante são o mesmo conceito para equipamentos, usando um só cadastro, preferencialmente chamado Marca. |
| Equipamento | `equipment` | Equipamento permanente, relacionado ao proprietário e tipo, com marca, modelo e serial opcionais. O serial é indexado, mas não único, pois a especificação permite avisar sobre duplicidade e ainda cadastrar outro registro. |
| Histórico de titularidade | `equipment_ownership_events` | Registra equipamento, titular anterior (opcional), novo titular e data/hora da alteração. |

### Integridade e limites conhecidos

- No modelo físico atual, CPF/CNPJ ocupa a coluna opcional `document`, com índice unique. A regra funcional aprovada exige armazenamento somente numérico, validade matemática, unicidade e compatibilidade com PF/PJ quando informado; a aplicação deverá normalizar e validar antes de persistir. O schema não impõe essas validações nem possui o Tipo de Pessoa.
- `isPrimary` identifica telefone/e-mail principal. A regra de garantir no máximo um principal de cada tipo por pessoa precisa ser aplicada pelo serviço em transação; não há restrição parcial correspondente neste esquema.
- `Equipment.ownerId` representa o titular atual. O serviço que trocar o titular deverá atualizar esse vínculo e inserir o evento de histórico na mesma transação.
- O histórico de titularidade não substitui o log administrativo nem identifica o usuário que realizou a alteração; autenticação e trilha administrativa ainda serão modeladas.
- Código interno sequencial exibido ao usuário, OS, estoque, compras, vendas, financeiro, segurança e auditoria completa ainda não fazem parte desta migration.

### Regras aprovadas ainda não refletidas no modelo aplicado

Decisões funcionais aprovadas em 07/10/2026 descrevem uma evolução futura. O schema Prisma e a migration inicial permanecem como a representação do modelo físico atualmente aplicado; esta seção não afirma que as mudanças já foram migradas.

- Pessoa deverá contemplar Tipo de Pessoa (PF/PJ), Nome/Razão Social, CPF/CNPJ, Nome Fantasia, Inscrição Estadual, Inscrição Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso. Tipo de Pessoa e Nome/Razão Social são os campos obrigatórios mínimos; os demais são opcionais no cadastro geral, exceto por exigência específica de fluxo futuro. O modelo físico atual não contempla Tipo de Pessoa nem todos os demais campos e catálogos.
- CPF/CNPJ é opcional. Quando informado, deve ser armazenado somente com números, ser matematicamente válido, único e compatível com PF (CPF, 11 dígitos) ou PJ (CNPJ, 14 dígitos). A máscara é apenas visual; normalização e validação cabem ao Backend/API. A coluna atual `document` tem unicidade, mas não impõe essas regras.
- Nome Fantasia não se aplica a PF e é opcional para PJ; quando não informado, a Razão Social é a referência principal de exibição. Inscrições Estadual e Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, são armazenadas sem validação específica por estado ou município nem interpretação fiscal complexa.
- Tipo de Contribuinte será um cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. Não é exigido para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Valores, códigos, regras fiscais e validações de NF-e/NFS-e ainda não estão definidos.
- Tipo de Contato será cadastro próprio para os papéis da Pessoa, que podem coexistir. `person_roles` continua sendo a estrutura física existente baseada em enum e não deve ser tratada como solução funcional definitiva.
- Observações são passivas. Aviso deve ser apresentado ao operador ao visualizar a Pessoa, realizar venda para ela e abrir OS para ela. O backend/API responde pelos dados e pela regra; o frontend faz a apresentação. Modalidade visual, confirmação de leitura, bloqueio, severidade, validade e histórico não foram decididos.
- Cada Pessoa poderá ter múltiplos endereços, cada um com Tipo de Endereço de cadastro próprio e opção de principal. `person_addresses.person_id UNIQUE` atualmente restringe a cardinalidade a zero ou um e deverá ser removido em migration futura; a tabela e seus campos ainda precisam ser modelados para a nova regra. Não estão aprovadas outras restrições.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outro cadastro completo de Pessoa. A autorrelação atual é conceitualmente compatível com essa cardinalidade; `primary_contact_id` é o nome físico existente e a terminologia funcional passa a ser Pessoa de Contato.
- Para equipamentos, Marca e Fabricante são o mesmo conceito. `equipment_brands` permanece a referência conceitual única; não deverá ser criado cadastro separado de fabricante.

## Próximas áreas de modelagem

1. Usuários e permissões diretas por usuário, incluindo auditoria administrativa.
2. Ordem de Serviço e snapshots históricos de cliente/equipamento.
3. Estoque por movimentações e compras.
4. Financeiro e vendas, após detalhamento dos estados e vínculos pendentes.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Registro do primeiro recorte: pessoas, papéis, contatos, endereço, equipamentos e histórico de titularidade. |
| 07/10/2026 | Registro das regras aprovadas para campos e obrigatoriedade de Pessoa, validação de CPF/CNPJ, Tipo de Contribuinte, Tipos de Contato/Endereço, Aviso, endereços múltiplos, Pessoa de Contato e equivalência Marca/Fabricante, com divergências do schema atual explicitadas. |
