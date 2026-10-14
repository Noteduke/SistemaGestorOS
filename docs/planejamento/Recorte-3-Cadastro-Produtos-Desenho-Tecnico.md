# Recorte 3 — Cadastro básico de Produtos

**Status:** cadastro básico e extensão de preços/custos implementados; migrations aplicadas somente no banco isolado `gestor_os_opening_test`. O banco principal permanece fora deste recorte. Estoque e integração dos Produtos com orçamento permanecem fora desta etapa.

## Extensão aprovada — preço de venda e custo de aquisição

O cadastro mantém `sale_price DECIMAL(15,2) NULL` e `acquisition_cost DECIMAL(15,2) NULL`. Ambos são opcionais, aceitam `0.00` e rejeitam negativos. Strings decimais são usadas na API. `NULL` de custo significa desconhecido; não calcular média ou substituir por zero. Não integrar preço ao orçamento nesta etapa.

Até decisão de permissão específica para custo de Produto, apenas Administrador recebe custo e lucro bruto estimado e pode alterar custo. Usuários com `products.manage` continuam podendo gerir os demais campos e preço de venda. Permissões de custos do orçamento não se aplicam. A estimativa de lucro é preço de venda menos custo e só existe quando ambos são conhecidos; margem não é exibida. Toda alteração é registrada em `admin_audit_log` com valores anterior/novo e ator na mesma transação. Uma futura projeção de auditoria deverá remover os campos de custo para não autorizados.

O custo histórico de uma peça será capturado quando ela for marcada como aplicada à OS; alterações posteriores do custo do cadastro não mudam o snapshot da aplicação. Essa associação não integra este recorte.

Peça defeituosa deve receber destino próprio e não retornar automaticamente à disponibilidade. Estados, opções, transições, responsáveis, efeitos contábeis e fluxo de garantia permanecem pendentes do desenho de estoque.

## Decisões de negócio registradas

- Peças e mercadorias para revenda compartilham o estoque inicial, que possui um único local. A categoria diferencia esses usos.
- Estoque negativo é permitido.
- As movimentações serão a fonte oficial do saldo. A fórmula definitiva, os tipos de movimento e regras de inventário não são definidos neste recorte.
- Incluir peça em orçamento não reserva nem altera estoque. Aplicar torna somente a quantidade aplicada indisponível; baixa definitiva ocorre no encerramento com reparo.
- Remover peça aplicada, após confirmação normal, desfaz a aplicação e restaura disponibilidade na mesma transação. Cancelamento com peças aplicadas exige confirmação de retirada física antes de desfazer e restaurar. Essas decisões substituem a regra anterior de abrir pendência administrativa para cada devolução.
- Encerramento sem reparo desfaz aplicações e restaura disponibilidade, sem cobrança. Encerramento com reparo compara quantidades orçadas/aplicadas e exige regularização explícita, sem correção automática e sem nova autorização do cliente somente pela inclusão de peças adicionais.
- Operações relevantes preservam histórico e Log Administrativo; Histórico Operacional de OS e Log Administrativo mantêm propósitos distintos.

## Escopo físico proposto para o cadastro

Criar apenas `Product`, sem tabelas de saldo, local, movimento, lote, série, custo por lote/unidade ou compra. Os dois campos de referência de preço/custo ficam no próprio Produto.

| Campo | Representação | Regra nesta etapa |
| --- | --- | --- |
| `id` | INT interno | Relações internas; nunca exposto na API |
| `publicId` | UUID `CHAR(36)` único | Identificação pública própria, gerada pelo servidor |
| `internalCode` | `VARCHAR(64)` nullable, único | Opcional; `NULL` permitido em vários produtos; normalizado em caixa alta, sem espaços externos e com espaços internos colapsados |
| `description` | `VARCHAR(255)` obrigatório | Texto limpo e salvo em caixa alta |
| `category` | Enum `PART` / `RESALE_GOOD` obrigatório | Categorias aprovadas para distinguir peça e mercadoria para revenda; não há CRUD de categorias nesta etapa |
| `isActive` | Boolean, default `true` | Inativar impede seleção futura; consulta histórica continua possível |
| `version` | INT positivo | Concorrência otimista em alterações |
| `salePrice` | `DECIMAL(15,2)` nullable | Opcional, não negativo, zero válido; preço padrão para possível sugestão futura |
| `acquisitionCost` | `DECIMAL(15,2)` nullable | Opcional, não negativo; NULL desconhecido; acesso restrito temporariamente a Administrador |
| autoria | `createdByUserId`, `updatedByUserId` obrigatórios | Usuário autenticado responsável |
| timestamps | `createdAt`, `updatedAt` DATETIME(3) | Gerados pelo servidor |

Não haverá exclusão física. `internalCode` vazio é tratado como ausente. A chave pública e a descrição identificam o cadastro quando não houver código interno. Os limites de 64/255 caracteres são limites técnicos desta primeira API, não uma regra fiscal ou de estoque.

As alterações de criação, edição e situação registram snapshots anterior/novo em `AdminAuditLog`, na mesma transação do Produto. Não será criada uma segunda trilha administrativa. Essa auditoria não substitui os eventos operacionais futuros de movimentação de estoque.

## API e autorização

- `GET /api/v1/products?page=1&pageSize=20&status=active&search=...&category=PART`: consulta paginada, pesquisa por código ou descrição e filtro de situação/categoria; ativos por padrão.
- `GET /api/v1/products/:publicId`: consulta por identificador público, inclusive inativo.
- `POST /api/v1/products`: cria código interno opcional, descrição, categoria e preço; somente Administrador pode enviar custo.
- `PATCH /api/v1/products/:publicId`: altera um ou mais campos permitidos e exige `expectedVersion`; situação pode ser inativada/reativada. Somente Administrador altera custo. Não existe DELETE.
- `products.manage` protege as rotas administrativas. Administrador segue a política central existente.

## Exclusões explícitas desta etapa

Não implementar quantidade/saldo, movimentações, reserva, compra, inventário, locais adicionais, custo médio, números de série, aplicação, baixa, API de integração com orçamento, comparação de peças avulsas ou dados no item de OS. O cadastro ficará pronto para referências futuras, sem alegar que controla estoque.

## Risco/decisão ainda não modelada

A composição e a reconciliação física dos saldos, os tipos de movimentação, correção/estorno de movimento, inventário e política de custo por estoque permanecem para desenho próprio. Nenhum desses pontos deve ser deduzido desta tabela de catálogo.
