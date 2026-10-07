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
| Equipamento | `equipment` | Modelo físico atual: proprietário e tipo obrigatórios; Marca/Modelo opcionais; sem status; serial opcional com índice não unique. A regra funcional aprovada exige Proprietário, Tipo, Marca, Modelo e Status, e valida serial pela combinação com proprietário atual na aplicação. |
| Histórico de titularidade | `equipment_ownership_events` | Registra equipamento, titular anterior (opcional), novo titular e data/hora da alteração. |

### Integridade e limites conhecidos

- No modelo físico atual, CPF/CNPJ ocupa a coluna opcional `document`, com índice unique. A regra funcional aprovada exige armazenamento somente numérico, validade matemática, unicidade e compatibilidade com PF/PJ quando informado; a aplicação deverá normalizar e validar antes de persistir. O schema não impõe essas validações nem possui o Tipo de Pessoa.
- `isPrimary` identifica telefone/e-mail principal. A regra de garantir no máximo um principal de cada tipo por pessoa precisa ser aplicada pelo serviço em transação; não há restrição parcial correspondente neste esquema.
- `Equipment.ownerId` representa o titular atual. O serviço que trocar o titular deverá atualizar esse vínculo e inserir o evento de histórico na mesma transação.
- A regra funcional exige Tipo de Contato Cliente para o proprietário, mas `Equipment.ownerId` apenas referencia `Person` no schema atual e não impõe essa elegibilidade.
- O histórico de titularidade não substitui o log administrativo nem identifica o usuário que realizou a alteração; autenticação e trilha administrativa ainda serão modeladas.
- Código interno sequencial exibido ao usuário, OS, estoque, compras, vendas, financeiro, segurança e auditoria completa ainda não fazem parte desta migration.

### Regras aprovadas ainda não refletidas no modelo aplicado

Decisões funcionais aprovadas em 07/10/2026 descrevem uma evolução futura. O schema Prisma e a migration inicial permanecem como a representação do modelo físico atualmente aplicado; esta seção não afirma que as mudanças já foram migradas.

- Pessoa deverá contemplar Tipo de Pessoa (PF/PJ), Nome/Razão Social, CPF/CNPJ, Nome Fantasia, Inscrição Estadual, Inscrição Municipal, Tipo de Contribuinte, Tipos de Contato, Observações e Aviso. Tipo de Pessoa e Nome/Razão Social são os campos obrigatórios mínimos; os demais são opcionais no cadastro geral, exceto por exigência específica de fluxo futuro. O modelo físico atual não contempla Tipo de Pessoa nem todos os demais campos e catálogos.
- CPF/CNPJ é opcional. Quando informado, deve ser armazenado somente com números, ser matematicamente válido, único e compatível com PF (CPF, 11 dígitos) ou PJ (CNPJ, 14 dígitos). A máscara é apenas visual; normalização e validação cabem ao Backend/API. A coluna atual `document` tem unicidade, mas não impõe essas regras.
- Nome Fantasia não se aplica a PF e é opcional para PJ; quando não informado, a Razão Social é a referência principal de exibição. Inscrições Estadual e Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, são armazenadas sem validação específica por estado ou município nem interpretação fiscal complexa.
- Tipo de Contribuinte será um cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). Não é exigido para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos, regras fiscais e validações de NF-e/NFS-e ainda não estão definidos.
- Tipo de Contato será cadastro próprio para os papéis da Pessoa, que podem coexistir. O catálogo inicial contém Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro, com significados definidos em `docs/02-Regras-de-Negocio.md`. `person_roles` continua sendo a estrutura física existente baseada em enum e não deve ser tratada como solução funcional definitiva.
- Observações são passivas. Aviso é campo único informativo, com pergunta e mensagens definidas em `docs/02-Regras-de-Negocio.md`; não exibe conteúdo automaticamente nem bloqueia operações. A tabela atual não o contém. Não há log de leitura ou confirmação nesta etapa; o perfil/permissão de administrador e eventual auditoria de alteração/apagamento permanecem pendentes.
- Cada Pessoa poderá ter múltiplos endereços, cada um com Tipo de Endereço de cadastro próprio (Principal, Cobrança, Entrega ou Instalação) e opção de principal. Ainda não foi definida uma regra sobre permitir ou impedir mais de um endereço do mesmo tipo. `person_addresses.person_id UNIQUE` atualmente restringe a cardinalidade a zero ou um e deverá ser removido em migration futura; a tabela e seus campos ainda precisam ser modelados para a nova regra.
- Catálogos auxiliares: opções não utilizadas podem ser editadas, inativadas ou excluídas; opções usadas podem ser editadas ou inativadas, mas não excluídas fisicamente. Inativas não são opções padrão em novos vínculos e permanecem válidas em registros históricos. É pendente definir se alterar o nome de opção usada afeta a exibição histórica ou se será armazenado snapshot do nome anterior; regra específica futura pode substituir a regra geral.
- Duplicidade de Pessoa: CPF/CNPJ informado é critério forte de identidade e, se repetido, bloqueia o cadastro; sem documento, possível duplicidade por nome, telefone ou e-mail gera aviso e permite salvar. Critérios de similaridade, normalização e algoritmo são pendentes e ficam a cargo de lógica futura, não do schema físico atual.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outro cadastro completo de Pessoa. A autorrelação atual é conceitualmente compatível com essa cardinalidade; `primary_contact_id` é o nome físico existente e a terminologia funcional passa a ser Pessoa de Contato.
- Para equipamentos, Marca e Fabricante são o mesmo conceito. `equipment_brands` permanece a referência conceitual única; não deverá ser criado cadastro separado de fabricante.

### Regras aprovadas de Aviso, exclusão/inativação, OS e titularidade ainda não refletidas

As decisões abaixo são funcionais e não descrevem o schema Prisma/migration já aplicados:

- Aviso é campo único informativo de Pessoa; a tabela atual `people` não o contém. A pergunta e mensagens aprovadas, a continuidade sem bloqueio e a frequência em cada contexto são regras futuras de aplicação. Não há log de leitura ou confirmação formal; histórico de alteração do Aviso será sensível e restrito a administrador.
- Pessoa nunca pode ser excluída fisicamente, mesmo sem histórico. A tabela `people` já possui `is_active`; somente inativação é permitida, e inativar/reativar é ação de administrador. Inativos não são opções padrão, podem ser encontrados por filtro e permanecem exibidos em históricos.
- Equipamento sem vínculo histórico pode ser excluído fisicamente somente por administrador; com qualquer vínculo operacional, financeiro, comercial ou técnico, não pode ser apagado e só pode ser inativado por administrador. A regra funcional de status Ativo/Inativo está aprovada, mas o schema atual de `equipment` não tem campo de status/ativo.
- O proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente, tanto na criação inicial quanto em transferência; Pessoa inativa não é opção padrão. `Equipment.ownerId` atualmente referencia `Person`, mas não impõe elegibilidade por Tipo de Contato ou atividade.
- A OS registra a Pessoa informada no atendimento na abertura, sem exigir separação entre ela e proprietário real do equipamento. Não haverá snapshot completo de Pessoa/Equipamento em cada OS; alterações e movimentações relevantes serão consultáveis no histórico. Não há entidade OS nem histórico geral no schema atual.
- Transferência é permitida, altera o titular atual e cria evento em `equipment_ownership_events`, sem reescrever OS antigas. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, a mudança é transferência. Usuário comum pode fazer transferências e alterar dados de Pessoa/Equipamento com ou sem histórico, sem justificativa obrigatória; alterações ficam registradas automaticamente. Vínculo da transferência com OS é opcional. A tabela atual não registra usuário executor nem vínculo com OS.
- O perfil/permissão técnico de administrador, lista final de eventos de histórico operacional/sensível, critérios técnicos de vínculo histórico, filtros/layout do histórico e auditoria técnica continuam pendentes.

Nenhuma dessas regras foi aplicada ao schema ou banco nesta atualização documental.

### Regras aprovadas para validação e ciclo de vida de Equipamento ainda não refletidas

- O cadastro exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; Número de Série é opcional. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Tipo de Equipamento e Marca são cadastros próprios; Marca também representa Fabricante.
- Equipamento tem somente status Ativo/Inativo nesta etapa e novo equipamento inicia Ativo. Ativo aparece normalmente em abertura de OS; Inativo não é opção padrão, pode ser localizado por filtro e permanece visível em históricos. Outros status operacionais não estão incluídos.
- Serial informado repetido para o mesmo proprietário atual bloqueia o cadastro. Para proprietário diferente, gera aviso, permite cadastrar outro e não sugere transferência. Serial não informado permite salvar sem busca automática por proprietário + Tipo + Marca + Modelo. Unicidade global e normalização de símbolos/espaços não são aprovadas; os critérios detalhados de pesquisa e filtros combinados permanecem pendentes.
- Tipo de Equipamento e Marca sem uso podem ser editados, inativados ou excluídos fisicamente; já usados podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não são opção padrão em novos equipamentos, e equipamentos antigos continuam exibindo os valores usados. Snapshot do nome anterior após edição de valor usado permanece pendente.
- No schema aplicado, `brand_id` e `model` são opcionais; `serial_number` é opcional e indexado sem unicidade; `equipment` não possui status; `equipment_types` e `equipment_brands` não possuem campo de atividade. O bloqueio por serial repetido para mesmo proprietário, aviso por proprietário diferente, campos obrigatórios e ciclo de vida dos catálogos dependem de modelagem e lógica futuras; nada disso foi migrado.

### Catálogos, normalização, pesquisa e alterações permanentes — regras aprovadas ainda não refletidas

- Tipo de Equipamento e Marca têm catálogos iniciais aprovados e são cadastros próprios expansíveis, não enums fixos. Tipo: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Marca: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. A carga inicial ainda está pendente. Inativos não são opções padrão; catálogos já usados não podem ser excluídos fisicamente.
- Todos os dados textuais são convertidos para MAIÚSCULAS antes da persistência, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números; máscaras ficam na interface; CEP é opcional. Telefone fora do formato esperado avisa sem bloquear, mas seus critérios técnicos finais permanecem pendentes. Endereço segue a regra de caixa alta. CPF/CNPJ mantém sua regra específica de somente números.
- Serial é salvo em caixa alta sem remover símbolos nem alterar espaços, inclusive no início/fim. `ABC-123` e `ABC123` são distintos; não foi aprovada normalização específica de símbolos.
- Pesquisa localiza por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, serial e Status. Modelo aceita busca textual, serial aceita correspondência exata ou parcial e Status permite Ativo/Inativo/Todos; inativos ficam ocultos por padrão. Pesquisa não bloqueia cadastro e não altera a regra de duplicidade. Detalhes de pesquisa avançada e filtros combinados seguem pendentes.
- Na ficha do Equipamento, usuário comum pode alterar dados com ou sem histórico, sem justificativa obrigatória; alterações são registradas automaticamente. Proprietário com histórico muda por transferência formal. Isso não altera o ciclo de vida dos próprios cadastros de Tipo e Marca.
- Embora a associação de transferência a OS esteja aprovada como opcional, `equipment_ownership_events` ainda não possui chave para OS e não existe entidade de OS no schema aplicado. Nenhuma dessas regras funcionais foi migrada.

### Histórico, exclusões e permissões — regras aprovadas ainda não refletidas

- Não haverá snapshot completo de Pessoa/Equipamento dentro de cada OS. O histórico de Pessoa, Equipamento, OS e entidades relacionadas registrará mudanças e movimentações relevantes sem duplicar todos os dados cadastrais em cada OS.
- O histórico diferencia alteração de campo (entidade, campo, valor anterior/novo, data/hora, usuário responsável quando definido) e evento/movimentação (ação relevante sem simples troca de valor). Exemplos incluem adicionar/remover telefone ou endereço, abrir OS, aprovar orçamento, entregar equipamento, transferir titularidade e cancelar OS. A lista final de eventos básicos/sensíveis e a estrutura técnica permanecem pendentes.
- Histórico é exibido no contexto da Pessoa, Equipamento ou OS. Usuário comum consulta o histórico operacional básico; administrador consulta histórico completo, incluindo itens sensíveis/auditoria. Histórico de Aviso e histórico técnico/auditoria são restritos ao administrador.
- Pessoa nunca é apagada fisicamente; `people.is_active` representa a possibilidade de inativação, restrita a administrador. Equipamento pode ser excluído apenas por administrador sem qualquer vínculo histórico; com vínculo, somente inativação/reativação por administrador.
- Usuário comum pode criar Pessoa/Equipamento e alterar os demais dados cadastrais com ou sem histórico, transferir titularidade e preencher Aviso vazio, sem justificativa obrigatória. Não pode inativar/reativar entidades nem alterar/apagar Aviso existente. Administrador também pode criar/alterar cadastros e transferir titularidade, além das ações administrativas listadas acima. Alterações geram histórico automaticamente. A interface confirma antes de salvar com “Estas alterações serão registradas no histórico. Deseja continuar?”; cancelar não persiste.
- O schema Prisma e a migration não possuem histórico geral, tipos de registro de histórico, referência ao usuário, as permissões ou a confirmação de salvamento. Esta documentação não modifica o modelo físico.

## Próximas áreas de modelagem

1. Usuários e permissões diretas por usuário, incluindo auditoria administrativa.
2. Ordem de Serviço e estrutura de histórico de alterações/eventos para OS, Pessoa, Equipamento e entidades relacionadas; não adotar snapshot cadastral completo por OS.
3. Estoque por movimentações e compras.
4. Financeiro e vendas, após detalhamento dos estados e vínculos pendentes.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Registro do primeiro recorte: pessoas, papéis, contatos, endereço, equipamentos e histórico de titularidade. |
| 07/10/2026 | Registro das regras aprovadas para campos e obrigatoriedade de Pessoa, validação de CPF/CNPJ, Tipo de Contribuinte, Tipos de Contato/Endereço, Aviso, endereços múltiplos, Pessoa de Contato e equivalência Marca/Fabricante, com divergências do schema atual explicitadas. |
| 07/10/2026 | Complemento com catálogos iniciais e significados, ciclo de vida geral de valores auxiliares e regra de duplicidade de Pessoa com/sem documento; critérios exatos de busca e snapshot de nomes permanecem pendentes. |
| 07/10/2026 | Registro das regras aprovadas para Aviso, exclusão/inativação de Pessoa e Equipamento, proprietário elegível, Pessoa informada na abertura da OS, transferência/correção de titularidade e divergências ainda existentes no schema. |
| 07/10/2026 | Registro das regras aprovadas de serial, campos obrigatórios, status Ativo/Inativo e ciclo de vida de Tipo de Equipamento/Marca, sem alterar o schema ou migration atuais. |
| 07/10/2026 | Registro dos catálogos iniciais de Tipo de Equipamento e Marca, normalização de dados, pesquisa, alterações permanentes e vínculo opcional de transferência com OS; schema e migration permanecem inalterados. |
