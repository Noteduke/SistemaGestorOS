# Diagrama de Entidades

## Objetivo

Apresentar os relacionamentos do modelo atualmente implementado no Prisma. Este diagrama cobre apenas o primeiro recorte de cadastros e equipamentos.

## Status

Diagrama físico correspondente ao schema Prisma em 06/10/2026. A migration `20261006120000_initial_core` foi aplicada com sucesso no banco `gestor_os`, em MySQL Community Server 8.0.46, e a estrutura foi validada. Prisma Migrate controla o histórico pela tabela `_prisma_migrations`; não havia migration pendente no momento da validação. As decisões funcionais aprovadas em 07/10/2026 são descritas nas observações abaixo e ainda não foram aplicadas ao schema/banco.

## Última atualização

07/10/2026.

## Diagrama

```mermaid
erDiagram
  PERSON ||--o{ PERSON_ROLE_ASSIGNMENT : has
  PERSON ||--o{ PERSON_PHONE : has
  PERSON ||--o{ PERSON_EMAIL : has
  PERSON ||--o| PERSON_ADDRESS : "current schema: has"
  PERSON o|--o{ PERSON : "contact person link"
  PERSON ||--o{ EQUIPMENT : owns
  EQUIPMENT_TYPE ||--o{ EQUIPMENT : classifies
  EQUIPMENT_BRAND o|--o{ EQUIPMENT : brands
  EQUIPMENT ||--o{ EQUIPMENT_OWNERSHIP : tracks
  PERSON o|--o{ EQUIPMENT_OWNERSHIP : "previous owner"
  PERSON ||--o{ EQUIPMENT_OWNERSHIP : "new owner"

  PERSON {
    int id PK
    string public_id UK
    string name
    string document UK
    boolean is_active
    int primary_contact_id FK
  }
  PERSON_ROLE_ASSIGNMENT {
    int person_id PK,FK
    enum role PK
  }
  PERSON_PHONE {
    int id PK
    int person_id FK
    string number
    boolean is_primary
  }
  PERSON_EMAIL {
    int id PK
    int person_id FK
    string address
    boolean is_primary
  }
  PERSON_ADDRESS {
    int id PK
    int person_id FK,UK
    string postal_code
    string city
    string state
  }
  EQUIPMENT_TYPE {
    int id PK
    string public_id UK
    string name UK
  }
  EQUIPMENT_BRAND {
    int id PK
    string public_id UK
    string name UK
  }
  EQUIPMENT {
    int id PK
    string public_id UK
    int owner_id FK
    int type_id FK
    int brand_id FK
    string model
    string serial_number
  }
  EQUIPMENT_OWNERSHIP {
    int id PK
    int equipment_id FK
    int previous_owner_id FK
    int new_owner_id FK
    datetime changed_at
  }
```

## Observações

- O diagrama mostra relações e restrições principais; os campos completos estão em `docs/modelagem/Modelo-Banco.md` e `backend/prisma/schema.prisma`.
- `equipment.serial_number` é opcional e possui índice não unique no schema atual. A regra funcional mais recente bloqueia serial repetido para o mesmo proprietário atual e avisa sem bloquear quando o proprietário é diferente; a aplicação deverá aplicar essa validação. Não há unicidade global de serial.
- **Modelo físico atual:** `person_addresses.person_id` é único, então o banco aplicado aceita no máximo um endereço por Pessoa. A regra funcional aprovada em 07/10/2026 permite vários endereços; a unicidade deverá ser removida e Tipo de Endereço/principalidade modelados em migration futura. O diagrama continua mostrando o schema atual, não a estrutura futura.
- Os catálogos funcionais iniciais aprovados em 07/10/2026 são Tipos de Contato (Cliente, Fornecedor, Transportadora, Prestador de Serviço, Parceiro), Tipos de Endereço (Principal, Cobrança, Entrega, Instalação) e Tipos de Contribuinte (Contribuinte ICMS, Contribuinte Isento, Não Contribuinte). Essas categorias ainda não correspondem a tabelas no schema/banco aplicado; o diagrama não as representa como entidades físicas existentes.
- O ciclo de vida de catálogos auxiliares e a regra de duplicidade de Pessoa também são decisões funcionais ainda sem representação no schema: documento informado duplicado bloqueia; possível duplicidade sem documento avisa sem bloquear. Critérios exatos de busca e preservação de snapshot do nome antigo de opção editada seguem pendentes.
- **Modelo físico atual:** `person_roles.role` é enum. A regra funcional aprovada define papéis como Tipos de Contato simultâneos provenientes de cadastro próprio; a estrutura atual é parcial e deverá ser revista.
- A relação física de Pessoa de Contato é opcional, autorreferenciada em `people` e permite no máximo uma pessoa vinculada a cada cadastro. A coluna existente se chama `primary_contact_id`; a nomenclatura funcional aprovada é Pessoa de Contato.
- Para equipamentos, Marca e Fabricante são o mesmo conceito e haverá um único cadastro, representado fisicamente por `equipment_brands`.
- Aviso permanece campo único futuro e não existe em `people`; pergunta, apresentação condicional, permissões e ausência de log de leitura são regras funcionais ainda não implementadas. Perfil/permissão de administrador ainda não está definido.
- `people.is_active` existe no schema, mas exclusão física condicionada a ausência de histórico, inativação com vínculos, filtros de pesquisa e seleção padrão ainda dependem da aplicação e dos critérios futuros de relacionamento. A mesma regra funcional de exclusão/inativação aplica-se a Equipamento, mas `equipment` não tem campo de status/ativo.
- `equipment.owner_id` referencia uma Pessoa sem exigir no schema que ela tenha Tipo de Contato Cliente ou esteja ativa. A validação funcional será necessária no cadastro e em transferência.
- OS deverá preservar a Pessoa informada na abertura e o retrato daquele atendimento, sem exigir separação da propriedade real do equipamento. O schema atual não contém OS nem snapshot, e correções posteriores no cadastro permanente não devem reescrever esse futuro histórico.
- `equipment_ownership_events` existe para eventos de titularidade. A regra aprovada distingue correção de proprietário sem histórico de transferência formal; mudanças com histórico operacional devem gerar transferência, atualizar titular atual e preservar OS antigas. O modelo atual não diferencia esses fluxos nem contém usuário, justificativa ou vínculo com OS. Transferência pode ocorrer fora ou durante OS e a associação com uma OS é opcional, mas não há entidade OS nem chave de vínculo no schema. Correção retroativa com histórico será restrita a administrador, com justificativa/auditoria a modelar.
- Permanecem pendentes os critérios técnicos de vínculo histórico, a implementação dos snapshots, perfil/permissões de administrador, justificativa e auditoria detalhadas, e ciclos de vida de Aviso/Equipamento além do aprovado. O vínculo opcional de transferência a OS está aprovado funcionalmente, mas ainda não representado no schema.
- Regra de serial aprovada: repetição para o mesmo proprietário atual bloqueia; para proprietário diferente avisa e permite cadastro, sem sugerir transferência. Sem serial, salva sem busca automática por proprietário + Tipo + Marca + Modelo. Serial é armazenado em caixa alta sem remover símbolos ou alterar espaços, inclusive no início/fim; `ABC-123` e `ABC123` são diferentes. Pesquisa de equipamentos é independente de duplicidade: localiza por proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, serial e Status; Modelo aceita texto, serial aceita busca exata ou parcial, Status permite Ativo/Inativo/Todos e inativos ficam ocultos por padrão. Detalhes de pesquisa avançada/filtros combinados permanecem pendentes.
- Equipamento exige funcionalmente Proprietário, Tipo de Equipamento, Marca, Modelo e Status; serial é opcional. O schema atual deixa `brand_id` e `model` opcionais e não tem status de Equipamento. Status funcionais são apenas Ativo/Inativo, com novo Equipamento Ativo; estados adicionais estão fora desta etapa.
- `equipment_types` e `equipment_brands` não possuem status no schema atual. A regra funcional permite exclusão física apenas antes do uso; usados podem ser editados/inativados, mas não apagados, e inativos não são opções padrão em novos Equipamentos. Snapshots de nomes usados após edição permanecem pendentes.
- Tipo de Equipamento e Marca possuem catálogos iniciais aprovados como cadastros próprios expansíveis, não enums fixos; sua carga inicial ainda está pendente. Regra geral de caixa alta, e-mail minúsculo com trim, telefone/CEP numéricos e pesquisa de equipamentos são comportamentos de aplicação. O telefone fora do padrão avisa sem bloquear; critérios técnicos finais permanecem pendentes. Na ficha do equipamento, os dados permanentes sem histórico podem ser corrigidos por usuário comum; com histórico, alterações em Tipo/Marca/Modelo/serial são restritas a administrador e exigem justificativa/auditoria futura. Proprietário com histórico exige transferência formal. Isso não altera o ciclo de vida dos cadastros auxiliares de Tipo e Marca.
- O schema atual ainda não representa integralmente os campos aprovados de Pessoa (Tipo de Pessoa, Nome Fantasia, inscrições, Tipo de Contribuinte, Observações e Aviso), nem os cadastros próprios de Tipo de Contato, Tipo de Contribuinte e Tipo de Endereço. Tipo de Pessoa e Nome/Razão Social são obrigatórios na regra funcional; essa obrigatoriedade de Tipo de Pessoa ainda não está representada no schema.
- `document` é opcional e unique no modelo físico. A regra funcional exige que CPF/CNPJ informado seja armazenado somente com números, matematicamente válido, único e compatível com PF/PJ. O schema atual não impõe normalização, validade ou compatibilidade; essas validações deverão ser feitas pela aplicação e ainda não foram implementadas.
- Nome Fantasia não se aplica a PF, é opcional para PJ e a Razão Social serve como referência de exibição quando ausente. IE/IM são opcionais, principalmente para PJ, e não terão validação estadual/municipal nesta etapa. Tipo de Contribuinte é opcional no cadastro geral e necessário na emissão de nota fiscal; regras fiscais completas continuam pendentes.
- Nenhuma dessas alterações de campos ou validações foi aplicada ao schema ou banco nesta etapa documental.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Primeiro diagrama do recorte de pessoas e equipamentos. |
| 07/10/2026 | Registro das regras funcionais aprovadas que divergem do modelo físico, incluindo campos obrigatórios de Pessoa e validação de CPF/CNPJ, sem representar migrations ainda não aplicadas. |
| 07/10/2026 | Complemento das observações com Aviso, exclusão/inativação, Pessoa informada na abertura da OS e titularidade, mantendo o diagrama limitado ao schema físico atual. |
| 07/10/2026 | Registro das regras aprovadas de serial, campos obrigatórios, status Ativo/Inativo e ciclo de vida de Tipo de Equipamento/Marca, sem alterar o diagrama físico atual. |
| 07/10/2026 | Registro dos catálogos iniciais de Tipo de Equipamento e Marca, normalização, pesquisa, alterações permanentes e vínculo opcional de transferência com OS, sem alterar o diagrama físico. |
