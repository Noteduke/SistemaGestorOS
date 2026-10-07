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
- Serial de equipamento não possui unicidade por decisão funcional: a aplicação poderá alertar sobre coincidências e permitir um novo cadastro.
- **Modelo físico atual:** `person_addresses.person_id` é único, então o banco aplicado aceita no máximo um endereço por Pessoa. A regra funcional aprovada em 07/10/2026 permite vários endereços; a unicidade deverá ser removida e Tipo de Endereço/principalidade modelados em migration futura. O diagrama continua mostrando o schema atual, não a estrutura futura.
- **Modelo físico atual:** `person_roles.role` é enum. A regra funcional aprovada define papéis como Tipos de Contato simultâneos provenientes de cadastro próprio; a estrutura atual é parcial e deverá ser revista.
- A relação física de Pessoa de Contato é opcional, autorreferenciada em `people` e permite no máximo uma pessoa vinculada a cada cadastro. A coluna existente se chama `primary_contact_id`; a nomenclatura funcional aprovada é Pessoa de Contato.
- Para equipamentos, Marca e Fabricante são o mesmo conceito e haverá um único cadastro, representado fisicamente por `equipment_brands`.
- O schema atual ainda não representa integralmente os campos aprovados de Pessoa (Tipo de Pessoa, Nome Fantasia, inscrições, Tipo de Contribuinte, Observações e Aviso), nem os cadastros próprios de Tipo de Contato, Tipo de Contribuinte e Tipo de Endereço. Nenhuma dessas alterações foi aplicada nesta etapa.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Primeiro diagrama do recorte de pessoas e equipamentos. |
| 07/10/2026 | Registro das regras funcionais aprovadas que divergem do modelo físico, sem representar migrations ainda não aplicadas. |
