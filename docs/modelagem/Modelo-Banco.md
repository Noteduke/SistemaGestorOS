# Modelo do Banco

## Objetivo

Documentar o modelo relacional implementado para o Sistema Gestor OS e registrar sua evolução por migrations do Prisma.

## Status

O schema Prisma contém o recorte inicial e a evolução de Pessoa básica. As migrations `20261006120000_initial_core` e `20261007120000_person_basic` foram aplicadas no banco `gestor_os`, em MySQL Community Server 8.0.46. Prisma Migrate controla o histórico pela tabela `_prisma_migrations`; `prisma migrate status` confirmou que não há migration pendente.

## Última atualização

07/10/2026. O recorte de Pessoa básica aplicado está separado das demais regras funcionais ainda pendentes.

## Escopo atual

O modelo físico inclui as tabelas iniciais de cadastros compartilhados e equipamentos e os novos campos de Pessoa básica. A implementação está em `backend/prisma/schema.prisma`; as migrations são `backend/prisma/migrations/20261006120000_initial_core/migration.sql` e `backend/prisma/migrations/20261007120000_person_basic/migration.sql`. A existência das demais tabelas não significa que seus módulos funcionais estejam implementados.

### Convenções

- Chaves primárias numéricas autoincrementais para relações internas.
- `publicId` UUID para identificação externa das entidades principais.
- Datas registradas em UTC com precisão de milissegundos (`DATETIME(3)`); o serviço de aplicação deverá usar UTC.
- Tabelas e colunas usam nomes em snake_case no banco, mapeados a nomes camelCase no Prisma.
- Exclusão física é restringida em relações históricas; inativação é usada onde aprovada.

### Entidades

| Entidade | Tabela | Responsabilidade e relações |
| --- | --- | --- |
| Pessoa | `people` | `person_type` PF/PJ e `name` obrigatórios; `document` opcional e único; `trade_name`, `state_registration`, `municipal_registration` e `observations` opcionais. `is_active` mantém default verdadeiro. Pode apontar para outra Pessoa como contato, embora esse fluxo não integre a API básica. Aviso e Tipo de Contribuinte continuam ausentes. |
| Papel da pessoa | `person_roles` | Modelo físico atual: associação N:N com enum `CUSTOMER`, `SUPPLIER`, `CARRIER` e `SERVICE_PROVIDER`. Funcionalmente, os papéis passam a ser Tipos de Contato de cadastro próprio; a enumeração atual é parcial e deverá ser revista. |
| Telefone | `person_phones` | Vários telefones por pessoa, com rótulo e indicação de principal. |
| E-mail | `person_emails` | Vários e-mails por pessoa, com rótulo e indicação de principal. |
| Endereço | `person_addresses` | Modelo físico atual: até um endereço por pessoa, com campos opcionais. A regra funcional aprovada agora permite múltiplos endereços, cada qual com Tipo de Endereço próprio e possibilidade de principal; o schema ainda não atende. |
| Tipo de equipamento | `equipment_types` | Catálogo de tipos cadastráveis. |
| Marca de equipamento | `equipment_brands` | Modelo físico atual do cadastro único de marcas. Regra aprovada: Marca e Fabricante são o mesmo conceito para equipamentos, usando um só cadastro, preferencialmente chamado Marca. |
| Equipamento | `equipment` | Modelo físico atual: proprietário e tipo obrigatórios; Marca/Modelo opcionais; sem status; serial opcional com índice não unique. A regra funcional aprovada exige Proprietário, Tipo, Marca, Modelo e Status, e valida serial pela combinação com proprietário atual na aplicação. |
| Histórico de titularidade | `equipment_ownership_events` | Registra equipamento, titular anterior (opcional), novo titular e data/hora da alteração. |

### Integridade e limites conhecidos

- CPF/CNPJ ocupa a coluna opcional `document VARCHAR(14)`, com índice unique. `person_type` PF/PJ já é obrigatório, sem default. A API básica normaliza e valida CPF numérico e CNPJ numérico ou alfanumérico oficial, verifica compatibilidade com PF/PJ e rejeita documento repetido. A validade matemática e a normalização são garantidas pelo Backend, não pelo tipo da coluna.
- `isPrimary` identifica telefone/e-mail principal. A regra de garantir no máximo um principal de cada tipo por pessoa precisa ser aplicada pelo serviço em transação; não há restrição parcial correspondente neste esquema.
- `Equipment.ownerId` representa o titular atual. O serviço que trocar o titular deverá atualizar esse vínculo e inserir o evento de histórico na mesma transação.
- A regra funcional exige Tipo de Contato Cliente para o proprietário, mas `Equipment.ownerId` apenas referencia `Person` no schema atual e não impõe essa elegibilidade.
- O histórico de titularidade não substitui o log administrativo nem identifica o usuário que realizou a alteração; autenticação e trilha administrativa ainda serão modeladas.
- Código interno sequencial exibido ao usuário, OS, estoque, compras, vendas, financeiro, segurança e auditoria completa ainda não fazem parte das migrations aplicadas.

### Regras aprovadas parcialmente refletidas no modelo aplicado

O recorte de Pessoa básica já foi migrado. As demais decisões funcionais aprovadas em 07/10/2026 descrevem evolução futura e não devem ser interpretadas como módulos já implementados.

- Pessoa já contempla Tipo de Pessoa (PF/PJ), Nome/Razão Social, CPF/CNPJ, Nome Fantasia, Inscrição Estadual, Inscrição Municipal e Observações. Tipo de Pessoa e Nome/Razão Social são obrigatórios; os demais campos do recorte são opcionais. Tipo de Contribuinte, Tipos de Contato como catálogo próprio e Aviso permanecem pendentes no modelo funcional definitivo.
- CPF/CNPJ é opcional. CPF possui 11 dígitos canônicos; CNPJ numérico ou alfanumérico oficial possui 14 caracteres canônicos. A API básica valida matematicamente, normaliza e confere compatibilidade com PF/PJ; o banco assegura unicidade de `document` informado, mas não executa essas validações de formato ou cálculo.
- Nome Fantasia não se aplica a PF e é opcional para PJ; quando não informado, a Razão Social é a referência principal de exibição. Inscrições Estadual e Municipal são opcionais, aplicam-se principalmente a PJ e, nesta etapa, são armazenadas sem validação específica por estado ou município nem interpretação fiscal complexa.
- Tipo de Contribuinte será um cadastro próprio, opcional no cadastro geral e obrigatório quando houver emissão de nota fiscal. O catálogo inicial contém Contribuinte ICMS (possui inscrição estadual e recolhe ICMS), Contribuinte Isento (não possui inscrição estadual e não recolhe ICMS) e Não Contribuinte (Pessoa que não é contribuinte de ICMS, podendo ou não possuir inscrição estadual no cadastro de contribuintes). Não é exigido para OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Códigos, regras fiscais e validações de NF-e/NFS-e ainda não estão definidos.
- Tipo de Contato será cadastro próprio para os papéis da Pessoa, que podem coexistir. O catálogo inicial contém Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro, com significados definidos em `docs/02-Regras-de-Negocio.md`. `person_roles` continua sendo a estrutura física existente baseada em enum e não deve ser tratada como solução funcional definitiva.
- Observações são passivas e já estão em `people.observations`. Aviso é campo único informativo futuro, com pergunta e mensagens definidas em `docs/02-Regras-de-Negocio.md`; a tabela atual não o contém. Não há log de leitura ou confirmação; permissões e eventual auditoria de alteração/apagamento permanecem futuras.
- Cada Pessoa poderá ter múltiplos endereços, inclusive vários do mesmo Tipo de Endereço. Telefones, e-mails e endereços admitem no máximo um principal por coleção, mas principal é opcional; ao marcar outro, o anterior é desmarcado, e remover/inativar o principal pode deixar a coleção sem principal. `person_addresses.person_id UNIQUE` restringe hoje a cardinalidade e deverá ser removido em migration futura; o schema também não garante principalidade única.
- Catálogos auxiliares podem ser renomeados mesmo após uso; o cadastro exibe o nome atual e o histórico registra valor anterior/novo, data/hora e usuário quando disponível. Opções usadas continuam não podendo ser excluídas fisicamente; inativas não são opções padrão para novos vínculos.
- Duplicidade de Pessoa: CPF/CNPJ informado repetido bloqueia. Sem documento, a API básica já avisa sem bloquear por nome/Razão Social exatamente igual após normalização. Comparação por telefone numérico ou e-mail em minúsculas após trim permanece para os recortes que implementarem esses contatos. Busca fuzzy está fora do escopo.
- Cada Pessoa poderá ter zero ou uma Pessoa de Contato, que será outro cadastro completo de Pessoa. A autorrelação atual é conceitualmente compatível com essa cardinalidade; `primary_contact_id` é o nome físico existente e a terminologia funcional passa a ser Pessoa de Contato.
- Para equipamentos, Marca e Fabricante são o mesmo conceito. `equipment_brands` permanece a referência conceitual única; não deverá ser criado cadastro separado de fabricante.

### Regras aprovadas de Aviso, exclusão/inativação, OS e titularidade ainda não refletidas

As decisões abaixo são funcionais e não descrevem o schema Prisma/migration já aplicados:

- Aviso é campo único informativo de Pessoa; a tabela atual `people` não o contém. A pergunta e mensagens aprovadas, a continuidade sem bloqueio e a frequência em cada contexto são regras futuras de aplicação. Não há log de leitura ou confirmação formal; histórico de alteração do Aviso é sensível e exige Administrador ou permissão explícita equivalente.
- Pessoa nunca pode ser excluída fisicamente, mesmo sem histórico. A tabela `people` já possui `is_active`; somente inativação é permitida, e inativar/reativar exige Administrador ou permissão equivalente. Inativos são consultáveis por filtro, mas não podem ser usados em novos vínculos operacionais; permanecem exibidos em históricos.
- Equipamento sem registro persistido relacionado pode ser excluído fisicamente somente por Administrador ou permissão equivalente; qualquer relação operacional, financeira, comercial, técnica ou de auditoria impede exclusão e permite apenas inativação autorizada. A regra funcional de status Ativo/Inativo está aprovada, mas o schema atual de `equipment` não tem campo de status/ativo.
- O proprietário deve ser Pessoa ativa cadastrada com Tipo de Contato Cliente, tanto na criação inicial quanto em transferência. Pessoa inativa não pode ser usada em novo vínculo. `Equipment.ownerId` atualmente referencia `Person`, mas não impõe elegibilidade por Tipo de Contato ou atividade.
- A OS registra a Pessoa informada no atendimento na abertura, sem exigir separação entre ela e proprietário real do equipamento. Não haverá snapshot completo de Pessoa/Equipamento em cada OS; alterações e movimentações relevantes serão consultáveis no histórico. Não há entidade OS nem histórico geral no schema atual.
- Transferência é permitida, altera o titular atual e cria evento em `equipment_ownership_events`, sem reescrever OS antigas. Proprietário sem histórico pode ser corrigido sem transferência formal; com histórico, a mudança é transferência. Usuários com permissões correspondentes podem fazer transferências e alterar dados de Pessoa/Equipamento com ou sem histórico, sem justificativa obrigatória; alterações ficam registradas automaticamente. Vínculo da transferência com OS é opcional. A tabela atual não registra usuário executor nem vínculo com OS.
- Administrador tem poderes máximos; Técnico e Usuário comum não são perfis rígidos. Permissões são atribuídas por usuário/ação e uma permissão equivalente pode autorizar ações administrativas específicas. Master não existe. Implementação técnica, eventos finais e classificação do histórico continuam pendentes.

Os fluxos de Aviso, inativação/reativação, Equipamento, OS, transferência, histórico e permissões permanecem pendentes. `people.is_active` já existe, e a API básica já permite consultar Pessoas inativas diretamente ou incluí-las na listagem por filtro; esta atualização documental não modifica schema ou banco.

### Regras aprovadas para validação e ciclo de vida de Equipamento ainda não refletidas

- O cadastro exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; Número de Série é opcional. Proprietário deve ser Pessoa cadastrada com Tipo de Contato Cliente. Tipo de Equipamento e Marca são cadastros próprios; Marca também representa Fabricante.
- Equipamento tem somente status Ativo/Inativo nesta etapa e novo equipamento inicia Ativo. Ativo aparece normalmente em abertura de OS; Inativo não é opção padrão, pode ser localizado por filtro e permanece visível em históricos. Outros status operacionais não estão incluídos.
- Serial informado repetido para o mesmo proprietário atual bloqueia o cadastro. Para proprietário diferente, gera aviso, permite cadastrar outro e não sugere transferência. Serial não informado permite salvar sem busca automática por proprietário + Tipo + Marca + Modelo. Unicidade global e normalização de símbolos/espaços não são aprovadas; os critérios detalhados de pesquisa e filtros combinados permanecem pendentes.
- Tipo de Equipamento e Marca sem uso podem ser editados, inativados ou excluídos fisicamente; já usados podem ser editados ou inativados, mas não excluídos fisicamente. Inativos não são opção padrão em novos equipamentos. Renomear valor usado é permitido e deve gerar evento de histórico com nome anterior/novo; referências mostram o nome atual.
- No schema aplicado, `brand_id` e `model` são opcionais; `serial_number` é opcional e indexado sem unicidade; `equipment` não possui status; `equipment_types` e `equipment_brands` não possuem campo de atividade. O bloqueio por serial repetido para mesmo proprietário, aviso por proprietário diferente, campos obrigatórios e ciclo de vida dos catálogos dependem de modelagem e lógica futuras; nada disso foi migrado.

### Catálogos, normalização, pesquisa e alterações permanentes — regras aprovadas ainda não refletidas

- Tipo de Equipamento e Marca têm catálogos iniciais aprovados e são cadastros próprios expansíveis, não enums fixos. Tipo: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Marca: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. A carga será feita por seed idempotente sob comando controlado, sem execução automática no startup; cria valores ausentes, não duplica e não desfaz renomeações permitidas. Inativos não são opções padrão; catálogos já usados não podem ser excluídos fisicamente.
- Todos os dados textuais são convertidos para MAIÚSCULAS antes da persistência, exceto e-mail, salvo em minúsculas após trim de espaços externos e comparado em minúsculas para duplicidade. Telefone e CEP são salvos somente com números; máscaras ficam na interface; CEP é opcional. Telefone com 10 dígitos é aceito como fixo e com 11 como celular se o primeiro após DDD for 9; fora disso, avisa e permite continuar após confirmação. Endereço segue caixa alta. CPF permanece numérico; CNPJ é salvo sem pontuação e em maiúsculas, aceitando o formato numérico antigo ou o alfanumérico oficial.
- Serial é salvo em caixa alta sem remover símbolos nem alterar espaços, inclusive no início/fim. `ABC-123` e `ABC123` são distintos; não foi aprovada normalização específica de símbolos.
- Pesquisa localiza por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, serial e Status. Modelo aceita busca textual, serial aceita correspondência exata ou parcial e Status permite Ativo/Inativo/Todos; inativos ficam ocultos por padrão. Pesquisa não bloqueia cadastro e não altera a regra de duplicidade. Detalhes de pesquisa avançada e filtros combinados seguem pendentes.
- Na ficha do Equipamento, usuários com permissões correspondentes podem alterar dados com ou sem histórico, sem justificativa obrigatória; alterações são registradas automaticamente. Proprietário com histórico muda por transferência formal. Isso não altera o ciclo de vida dos próprios cadastros de Tipo e Marca.
- Embora a associação de transferência a OS esteja aprovada como opcional, `equipment_ownership_events` ainda não possui chave para OS e não existe entidade de OS no schema aplicado. Nenhuma dessas regras funcionais foi migrada.

### Histórico, exclusões e permissões — regras aprovadas ainda não refletidas

- Não haverá snapshot completo de Pessoa/Equipamento dentro de cada OS. O histórico de Pessoa, Equipamento, OS e entidades relacionadas registrará mudanças e movimentações relevantes sem duplicar todos os dados cadastrais em cada OS.
- O histórico geral por entidade diferencia alteração de campo (entidade, campo, valor anterior/novo, data/hora, usuário responsável quando definido) e evento/movimentação. O conceito está aprovado; estrutura física, lista final de eventos básicos/sensíveis e filtros permanecem pendentes.
- Histórico é exibido no contexto da Pessoa, Equipamento ou OS. Permissão para histórico operacional/sensível é individual por ação; Administrador tem poderes máximos. Histórico de Aviso e histórico técnico/auditoria exigem Administrador ou permissão equivalente.
- Pessoa nunca é apagada fisicamente; `people.is_active` representa a possibilidade de inativação, restrita a Administrador ou usuário com permissão explícita equivalente. Equipamento pode ser excluído apenas por Administrador ou usuário com permissão equivalente sem qualquer registro persistido relacionado; com vínculo, somente inativação/reativação autorizada.
- Usuários com permissões correspondentes podem criar/alterar Pessoa/Equipamento com ou sem histórico, transferir titularidade e preencher Aviso vazio, sem justificativa obrigatória. Inativar/reativar, excluir Equipamento sem vínculo, alterar/apagar Aviso e acessar histórico sensível exigem permissão explícita; Administrador tem poderes máximos. Técnico e Usuário comum não são perfis rígidos. Alterações geram histórico automaticamente. A interface confirma antes de salvar com “Estas alterações serão registradas no histórico. Deseja continuar?”; cancelar não persiste.
- O schema Prisma e as migrations aplicadas não possuem histórico geral, tipos de registro de histórico, referência ao usuário, permissões ou confirmação de salvamento. Esta documentação não modifica o modelo físico.

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
| 07/10/2026 | Aplicação da migration `20261007120000_person_basic` e atualização do modelo físico de Pessoa básica, mantendo as demais decisões funcionais como evolução futura. |
