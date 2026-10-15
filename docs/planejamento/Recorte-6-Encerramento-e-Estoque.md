# Recorte 6 — Encerramento e cancelamento com estoque

**Status:** implementação local; migration, seed de permissões e validação operacional executados somente em `gestor_os_opening_test`. Não aplicado ao banco principal e sem push.

## Contratos

- `POST /api/v1/service-orders/:publicId/close` exige `os.close` ou Administrador. Resultado reparado: `{ "outcome": "REPAIRED" }`. Sem reparo: `{ "outcome": "WITHOUT_REPAIR", "confirmPhysicalRemoval": true, "defectiveItems": [{ "itemPublicId": "...", "quantity": 1 }] }`.
- `POST /api/v1/service-orders/:publicId/cancel` exige `os.cancel` ou Administrador. Recebe `{ "confirmPhysicalRemoval": true, "defectiveItems": [...] }`.
- Ambas exigem sessão, CSRF, controle exclusivo da OS e revisão agregada atual em `X-Service-Order-Revision`. Os códigos foram adicionados ao catálogo de permissões, sem concessão automática a usuários existentes.
- `defectiveItems` é opcional, admite somente item público e quantidade inteira positiva, rejeita identificadores duplicados e só aceita linhas com aplicações ativas. Itens omitidos têm zero unidades defeituosas. A confirmação física só é exigida se houver aplicações ativas.

## Efeitos de estoque e atomicidade

No encerramento reparado, a quantidade orçada de cada item de estoque ativo deve coincidir com a quantidade aplicada que permanece ativa. Divergências retornam `409 SERVICE_ORDER_STOCK_RECONCILIATION_REQUIRED`, com item, descrição, quantidade esperada e aplicada. Não há ajuste automático. Item retirado logicamente espera quantidade orçada zero. Depois da reconciliação, o ledger recebe `SERVICE_ORDER_CONSUMED` por aplicação de origem, com deltas total/aplicado iguais e negativos, delta defeituoso zero e snapshot do custo copiado da aplicação, sem recálculo.

No encerramento sem reparo e no cancelamento, as aplicações ativas são revertidas. Unidades normais voltam à disponibilidade; unidades classificadas como defeituosas deixam de estar aplicadas e continuam fora da disponibilidade. O total do produto não muda. O estoque negativo segue permitido. Sem aplicações ativas, a ação final não requer `products.stock.manage`; quando existem aplicações, o usuário precisa dessa permissão além da permissão de fechar/cancelar.

O bloqueio começa pela linha da OS e, em operações com vários produtos, trava produtos em ordem ascendente. Status, movimentos, eventos operacionais, Log Administrativo, revisão e liberação do controle de edição são gravados em uma transação. Conflito concorrente é recusado e não duplica movimentos. Eventos finais são allowlist e não incluem snapshots de custo. Registros financeiros, pagamentos e recebíveis não são criados nem alterados.

## Persistência

A migration `20261017120000_service_order_closure_stock` amplia os enums físicos para macrostatus `FECHADA`/`CANCELADA` e movimento `SERVICE_ORDER_CONSUMED`; não cria tabela ou coluna. O CHECK restringe a forma dos deltas de consumo. O MySQL 8.0.46 não permite referenciar `source_movement_id` no CHECK porque a coluna participa de FK; serviço e FK mantêm a referência à aplicação original.

## Limites do recorte

Reabertura simples/completa, compra/doação, criação de OS interna, faturamento, pagamentos, reembolsos, documentos fiscais e demais efeitos financeiros permanecem fora. Até existir reabertura, uma OS fechada/cancelada fica somente para consulta e não pode transitar diretamente entre os dois estados finais.
