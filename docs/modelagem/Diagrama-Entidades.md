# Diagrama de Entidades

## Objetivo

Apresentar os relacionamentos do modelo atualmente implementado no Prisma. Este diagrama cobre apenas o primeiro recorte de cadastros e equipamentos.

## Status

Diagrama inicial documentado; corresponde ao schema Prisma em 06/10/2026. A migration ainda não foi aplicada em um MySQL.

## Última atualização

06/10/2026.

## Diagrama

```mermaid
erDiagram
  PERSON ||--o{ PERSON_ROLE_ASSIGNMENT : has
  PERSON ||--o{ PERSON_PHONE : has
  PERSON ||--o{ PERSON_EMAIL : has
  PERSON ||--o| PERSON_ADDRESS : has
  PERSON o|--o{ PERSON : "is primary contact for"
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
- A relação de pessoa de contato é opcional e autorreferenciada em `people`.

## Histórico de alterações

| Data | Alteração |
| --- | --- |
| 06/10/2026 | Primeiro diagrama do recorte de pessoas e equipamentos. |
