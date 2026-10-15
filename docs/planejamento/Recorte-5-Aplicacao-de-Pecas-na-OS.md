# Recorte 5 — Aplicação e reversão de peças do estoque na OS

**Status:** implementação local e validação concluídas. A migration foi aplicada e validada exclusivamente em `gestor_os_opening_test`; a migration permanece pendente no banco principal `gestor_os`. Não houve escrita operacional no banco principal nem push.

## Regras implementadas

- Uma OS pode ter no máximo um item ativo `STOCK_PART` por Produto. A API rejeita a repetição e o índice funcional único continua como proteção concorrente.
- Peças avulsas podem repetir descrições entre si e podem ter descrição igual à de Produtos cadastrados. A regra cruzada anterior foi removida e o índice único de descrição ativa das peças avulsas é removido pela migration deste recorte. A unicidade de mão de obra cadastrada/avulsa permanece.
- Inativar Produto não remove nem altera o item histórico da OS e não impede aplicar ou reverter esse item existente. Produtos inativos continuam fora da seleção para novos itens.
- Aplicar exige OS aberta, controle exclusivo válido, revisão atual, `service_orders.budget.update` e `products.stock.manage` (ou Administrador pela política central). A quantidade é inteira, positiva e não fica limitada à quantidade orçada nem ao saldo disponível.
- Cada aplicação cria movimento `SERVICE_ORDER_APPLIED` com origem `SERVICE_ORDER`, vínculo ao Produto, OS e item, ator, instante do servidor e snapshot do custo de aquisição atual, preservando `NULL` quando desconhecido. O total não muda; aplicadas aumentam e disponíveis diminuem. Disponibilidade negativa continua permitida.
- Reversões criam movimentos `SERVICE_ORDER_REVERSED` relacionados ao movimento original. A distribuição técnica é FIFO por data/ID da aplicação, para preservar a origem e o custo de cada lote aplicado; não representa cálculo de custo médio ou regra contábil. Reverter unidades normais reduz aplicadas e restaura disponíveis. Classificar parte da reversão como defeituosa reduz aplicadas e aumenta defeituosas, sem restaurar disponíveis. Uma unidade nunca permanece simultaneamente aplicada e defeituosa.
- A remoção individual de item com aplicações exige confirmação e informa quantas unidades serão classificadas como defeituosas. Reversão, classificação, remoção lógica, evento da OS e Log Administrativo ocorrem na mesma transação. Falha em qualquer etapa desfaz toda a operação.
- A retirada integral do orçamento no fluxo existente de situação NÃO AUTORIZADO também desfaz aplicações ainda ativas, retornando-as à disponibilidade e preservando os movimentos. O encerramento/cancelamento foi implementado posteriormente no Recorte 6, documentado em `docs/planejamento/Recorte-6-Encerramento-e-Estoque.md`.

## API e histórico

- `POST /api/v1/service-orders/:publicId/budget-items/:itemPublicId/applications` recebe `{ quantity }`.
- `POST /api/v1/service-orders/:publicId/budget-items/:itemPublicId/applications/reversals` recebe `{ quantity, defectiveQuantity? }`; a quantidade defeituosa padrão é zero e não pode exceder a quantidade revertida.
- Ambas as rotas exigem CSRF, controle exclusivo e revisão `X-Service-Order-Revision`, além das duas permissões operacionais.
- A composição informa quantidade aplicada e lotes com quantidade original, revertida e restante. Custo histórico só é incluído para quem tem `products.cost.read`.
- Eventos `PECA_ESTOQUE_APLICADA` e `PECA_ESTOQUE_APLICACAO_REVERTIDA`, eventos de remoção/retirada do orçamento e logs administrativos registram ator, OS, item, Produto, quantidades e saldos anteriores/posteriores. O valor do custo fica no movimento imutável e nos eventos históricos protegidos por `products.cost.read`; nunca é exposto no histórico de estoque comum nem no Log Administrativo.

## Encerramento e itens futuros

Aplicação não dá baixa definitiva; a baixa com reparo, reconciliação orçada/aplicada e devolução física sem reparo/cancelamento são responsabilidade do Recorte 6. O custo capturado não muda quando o custo cadastral do Produto mudar.

## Validação concluída

No banco `gestor_os_opening_test`, passaram aplicação integral/parcial/acima do orçamento/com saldo negativo; snapshots de custo nulo/alterado; reversões normais e defeituosas; remoção lógica com reversão atômica; Produto inativado após lançamento; bloqueio de Produto repetido e permissão de descrições iguais em peças avulsas; edição exclusiva, revisão obsoleta, permissões, auditoria, histórico sem vazamento de custo e retirada integral em NÃO AUTORIZADO. Também passaram testes unitários Backend, testes de componente Frontend, suite Frontend e build Frontend. `prisma migrate status` confirmou as 15 migrations atualizadas no banco isolado. Nunca usar `gestor_os` em testes operacionais.
