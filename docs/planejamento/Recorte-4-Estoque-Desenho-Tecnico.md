# Recorte 4 — Controle inicial de Estoque

**Status:** modelo, migration, permissão, Backend e tela inicial do controle inicial de estoque implementados. As migrations deste recorte foram validadas exclusivamente em `gestor_os_opening_test`; banco principal não acessado nesta etapa. Este documento registra o estado e escopo do Recorte 4 antes da integração com OS. Aplicação e reversão de peças foram implementadas posteriormente no [Recorte 5](Recorte-5-Aplicacao-de-Pecas-na-OS.md); baixa definitiva no encerramento e integração completa com cancelamento continuam futuras.

## Escopo

Implementar saldo por produto para um único local implícito, com movimentos manuais, classificação de defeituosas, retorno à disponibilidade e descarte definitivo. A inclusão de produto não cria saldo nem movimento. Não há aplicação de peças em OS, compra, venda, inventário, lote, série, transferência ou múltiplos locais nesta fatia.

## Modelo físico

`ProductStockMovement` será o livro imutável do estoque; não haverá colunas de saldo em `Product`, tabela de saldo materializado ou entidade de local enquanto houver somente um local. Cada linha terá `publicId`, produto, tipo, origem `MANUAL`, deltas assinados de total/aplicado/defeituoso, ator e instante do servidor. FKs para Produto e Usuário serão restritivas. A consulta histórica será ordenada por `occurredAt` e `id`; não haverá edição ou exclusão de movimento.

As quantidades desta primeira etapa são unidades inteiras, pois o cadastro não possui unidade de medida aprovada. Cada operação informa quantidade inteira positiva; ajuste manual informa delta inteiro não nulo com sinal. Unidades fracionárias requerem decisão posterior de unidade/precisão.

Tipos e efeitos registrados:

| Tipo | `totalDelta` | `appliedDelta` | `defectiveDelta` |
| --- | ---: | ---: | ---: |
| `MANUAL_ENTRY` | `+q` | `0` | `0` |
| `MANUAL_ADJUSTMENT` | delta informado | `0` | `0` |
| `DEFECTIVE_CLASSIFIED` | `0` | `0` | `+q` |
| `DEFECTIVE_RETURNED` | `0` | `0` | `-q` |
| `DEFECTIVE_DISCARDED` | `-q` | `0` | `-q` |

**Estado histórico no Recorte 4:** `appliedDelta` foi reservado para integração futura e todos os tipos daquele recorte mantinham o valor em zero. O Recorte 5 acrescentou os movimentos `SERVICE_ORDER_APPLIED` e `SERVICE_ORDER_REVERSED`, que atualizam esse delta no livro imutável.

Os saldos são sempre calculados por agregação do livro: `Total = SUM(totalDelta)`, `Aplicadas = SUM(appliedDelta)`, `Defeituosas = SUM(defectiveDelta)` e `Disponíveis = Total − Aplicadas − Defeituosas`. Sem movimentos, os quatro valores são zero. Estoque disponível negativo é válido.

Entradas e ajustes podem deixar o saldo disponível negativo. Classificar defeituosas exige quantidade disponível suficiente; não se classifica unidade já aplicada/defeituosa ou saldo ainda negativo. Retorno e descarte não podem exceder a quantidade defeituosa existente. Ajuste negativo não pode reduzir o total abaixo do volume já aplicado mais defeituoso. Descarte reduz igualmente total e defeituoso; descarte parcial exige confirmação explícita e não exige justificativa.

## Autorização

Nova permissão `products.stock.manage` controla todas as operações que criam movimentos. Administrador (`isAdmin`) tem autoridade máxima pela política existente. Consultas de produtos/saldos e histórico ficam disponíveis a `products.manage` ou `products.stock.manage`; esta escolha permite que quem administra estoque consulte os produtos necessários sem conceder gestão cadastral. `products.manage` isoladamente não permite movimentar estoque. Nenhuma permissão é concedida automaticamente a usuários comuns. Não existe nesta etapa interface administrativa para conceder/revogar permissões.

Permissões de custo permanecem independentes. Produtos e movimentos não retornam custo de aquisição ou lucro derivado sem `products.cost.read`.

## API e transações

- Listagem/detalhe de Produto incluem resumo de estoque derivado.
- `GET /api/v1/products/:publicId/stock/movements?page=1&pageSize=20` consulta movimentos.
- `POST /api/v1/products/:publicId/stock/entries` cria entrada positiva.
- `POST /api/v1/products/:publicId/stock/adjustments` recebe `quantityDelta` inteiro positivo ou negativo.
- `POST /api/v1/products/:publicId/stock/defective/classifications` classifica unidades disponíveis.
- `POST /api/v1/products/:publicId/stock/defective/returns` devolve unidades defeituosas à disponibilidade.
- `POST /api/v1/products/:publicId/stock/defective/disposals` recebe `quantity` e `confirmed: true`.

Toda escrita valida a permissão no Backend, inicia transação, bloqueia a linha do Produto com `SELECT ... FOR UPDATE`, agrega o livro atual, valida as invariantes, acrescenta um movimento e grava Log Administrativo com ator, movimento e saldos anterior/posterior. Se qualquer etapa falhar, nem movimento nem log são persistidos. Escritas concorrentes do mesmo produto são serializadas pelo bloqueio da linha. Não há justificativa obrigatória. Custo não participa de payloads de estoque ou logs de estoque.

## Interface e validação

A tela de Produtos mostra Total, Aplicadas, Defeituosas e Disponíveis; saldo disponível negativo recebe destaque visual sem alertas repetitivos. Ações de movimento aparecem somente para quem tem `products.stock.manage`. Descarte exige confirmação da interface e confirmação explícita aceita pelo Backend. Histórico mostra tipo, quantidade, data/hora e usuário.

Testes devem cobrir autorização, entradas, ajustes, saldo negativo, proteção das quantidades classificadas, retorno, descarte parcial/total, histórico, auditoria, agregação derivada e concorrência. Migração e testes operacionais serão aplicados somente em `gestor_os_opening_test`, depois de verificar `SELECT DATABASE()` nesse banco.

## Fora de escopo e pendências

No escopo original do Recorte 4, aplicação/estorno de peças em OS, baixa por encerramento, compra, venda, fornecedor, inventário, devolução ao fornecedor, lotes, seriais, custo por movimento e múltiplos locais permaneciam fora. O saldo `Aplicadas` ficava zero naquela etapa. A aplicação e reversão foram implementadas posteriormente no Recorte 5; baixa por encerramento e as demais integrações continuam futuras.
