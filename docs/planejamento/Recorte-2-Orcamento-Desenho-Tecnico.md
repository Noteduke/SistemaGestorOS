# Recorte 2 — orçamento simplificado da Ordem de Serviço

**Status:** decisões funcionais de vínculo, ausência de status próprio, tipos de item e ausência de efeitos automáticos em estoque/financeiro aprovadas por Marcos. Este documento é proposta técnica de planejamento; não há implementação, modelo Prisma, API, interface ou migration de orçamento.

## 1. Objetivo

Descrever uma primeira estrutura para compor itens de orçamento diretamente na OS confirmada, acompanhar o trabalho pela situação operacional da própria OS e preservar alterações relevantes. O documento não aprova schema, rotas, permissões nem comportamento além das decisões funcionais registradas.

## 2. Escopo funcional aprovado

- O orçamento é a composição de itens vinculados à Ordem de Serviço; não é entidade autônoma com fluxo independente e não possui status próprio.
- O andamento acompanha as situações operacionais da OS. São exemplos `AGUARDANDO AVALIAÇÃO/ORÇAMENTO`, `AGUARDANDO APROVAÇÃO DO ORÇAMENTO`, `AUTORIZADO REPARO` e as duas situações `NÃO AUTORIZADO`.
- Há exatamente três tipos de item de orçamento: `SERVIÇO_MÃO_DE_OBRA`, `PEÇA_AVULSA` e `PEÇA_ESTOQUE`. Serviço e mão de obra formam uma única categoria. Não há tipo “Outro”.
- A peça avulsa não pertence ao estoque e não reserva, baixa ou altera disponibilidade.
- Peça de estoque pode ser incluída como orçada sem movimentar, reservar ou indisponibilizar estoque. Só fica indisponível quando for marcada `UTILIZADA` no equipamento; a baixa definitiva ocorre em etapa posterior conforme as regras de encerramento/conclusão.
- Alterações relevantes nos itens e valores devem ser preservadas no histórico.
- O orçamento não cria lançamentos financeiros nesta fase.
- Ao escolher remover o orçamento da apresentação principal da OS em situação de não autorização, os itens não são apagados: ficam preservados no histórico com valores, usuário, data/hora e contexto da decisão e eventual motivo informado.

## 3. Primeira fase proposta

Recomendação técnica, sujeita à aprovação: iniciar com inclusão, consulta e edição de serviço/mão de obra e peça avulsa em OS confirmada, persistindo as alterações no histórico. A OS continua sendo a unidade de fluxo e autorização. Não definir total, precisão ou arredondamento até aprovação da política monetária.

Manter peça do estoque para uma fatia posterior, após fechar o vínculo com o futuro cadastro de produtos e os contratos de integração com estoque. Essa recomendação trata apenas da ordem de implementação; o orçamento continua aprovado com os três tipos e não terá efeitos de reserva ou baixa ao incluir a peça.

## 4. Fora do escopo inicial

- Criar status ou fluxo independente de orçamento.
- Reserva, baixa, indisponibilidade ou movimentação de estoque ao incluir item orçado.
- Criar contas a pagar/receber, faturamento, cobrança ou qualquer outro lançamento financeiro automaticamente.
- Integração com compra, XML, fiscal, pagamento ou emissão fiscal.
- Definir política de desconto/acréscimo, tributos, validade, aprovação parcial ou revisão com novo aceite sem decisão de Marcos.
- Assumir que uma situação da OS muda automaticamente quando item é criado ou quando o cliente aprova/recusa.

## 5. Relação com OS e situação operacional

Conceitualmente, a OS possui itens de orçamento. Não propor modelo `Budget` separado nem `BudgetStatus`. Os estados como aguardando elaboração, aguardando resposta, autorizado e não autorizado são representados pela situação operacional da OS já aprovada.

As regras existentes dizem que situações operacionais podem mudar livremente após `TRIAGEM`. A documentação associa `AGUARDANDO APROVAÇÃO DO ORÇAMENTO` à resposta do cliente e exige perguntar sobre manter ou retirar o orçamento nas duas situações `NÃO AUTORIZADO`. O momento, a interação e a atomicidade dessa pergunta junto à mudança de situação precisam de contrato posterior.

**Pendente:** confirmar se a primeira fase aceita mutações somente enquanto o macrostatus da OS for `ABERTA`, e como consulta/edição se comporta em OS `FECHADA` ou `CANCELADA`.

## 6. Tipos de item e campos conceituais

Os campos abaixo são sugestões para discussão, não schema definitivo.

| Tipo aprovado | Descrição e referências conceituais |
| --- | --- |
| Serviço / mão de obra | Descrição do trabalho técnico cobrado, como diagnóstico, reparo, instalação ou configuração. Serviço e mão de obra são uma categoria. |
| Peça avulsa | Descrição informada manualmente; sem vínculo com produto/estoque, saldo, reserva, baixa ou conversão posterior para peça de estoque. Pode possuir custo interno separado do valor cobrado, mas política de acesso e edição do custo está pendente. |
| Peça do estoque | Referência futura ao produto/peça e descrição apresentada no item. Enquanto orçada não muda o estoque; o ciclo `ORÇADA`/`UTILIZADA`/`BAIXADA` segue as regras de estoque já aprovadas. |

Campos a avaliar: identificador público do item, OS, tipo, posição, descrição, quantidade, unidade, valor cobrado unitário, total calculado da linha e timestamps. Referência de produto aplica-se somente a peça de estoque quando existir catálogo. Campos de custo interno, desconto, tributo, texto interno/cliente e visibilidade exigem decisão própria. Não incluir tipo “Outro”.

Componentes de consumo técnico mencionados em documentação geral não constituem um quarto tipo de orçamento aprovado. Sua representação fora da composição cobrada deve ser detalhada no desenho de estoque/itens técnicos.

## 7. Histórico e retirada da apresentação principal

O histórico deve permitir reconstruir criação, edição e remoção relevante de itens/valores, com OS, item, tipo, campo, valor anterior/novo, usuário e instante; o contexto da decisão e eventual motivo informado devem ser preservados; a obrigatoriedade de motivo permanece pendente. A lista de eventos, payload e eventuais requisitos de motivo ainda precisam de aprovação.

Na escolha de remover o orçamento da tela principal ao salvar situação `NÃO AUTORIZADO`, retirar itens apenas da composição apresentada como atual. Preservar os registros e valores no histórico; não executar exclusão física. A operação não gera financeiro, movimento, reserva ou baixa de estoque. Como a OS não terá status de orçamento, eventual indicador de apresentação atual deve ser atributo dos itens ou registro histórico, não um `BudgetStatus`.

## 8. Estoque e financeiro futuros

O item `PEÇA_ESTOQUE` pode referenciar o futuro catálogo de produtos. A inclusão em orçamento não reserva nem reduz disponibilidade. A ação posterior de marcar `UTILIZADA` torna a peça indisponível sem baixa definitiva; conferência e baixa seguem as regras aprovadas do ciclo de estoque. Requer integração transacional própria e testes isolados quando estoque for implementado.

Esta fase não cria financeiro. A relação futura entre OS, valores cobrados, faturamento, títulos e recebimentos será desenhada no módulo financeiro; não inferir lançamento a partir da aprovação ou do total do orçamento.

## 9. Permissões, eventos, API e interface a avaliar

Não há permissões de orçamento aprovadas. Avaliar leitura e edição de itens por OS e como essa autorização se relaciona à mudança de situação. Definir separadamente quem pode ver/alterar custo interno por tipo; `finance.os_costs.manage` não está aprovado para esse uso.

Eventos sugeridos para discussão: item criado/alterado/removido da composição atual, valor cobrado alterado, custo interno alterado (se aprovado) e escolha de preservar/retirar itens da apresentação principal. Aprovação/recusa usa a mudança de situação da OS; evento específico, canal, evidência e aprovador dependem das decisões pendentes.

Endpoints futuros poderiam consultar itens por OS e criar/editar/retirar item, protegidos por sessão, CSRF nas mutações e permissões aprovadas. Não definir rotas ou payloads como contrato nesta proposta.

Interface futura: seção de orçamento no detalhe da OS, formulário/lista dos três tipos, totalização após aprovação de regra monetária, consulta do histórico e confirmação ao alterar para uma situação `NÃO AUTORIZADO`. Visibilidade do custo interno deve obedecer à regra de acesso que Marcos aprovar.

## 10. Persistência e migration

O schema Prisma atual não possui itens de OS/orçamento, histórico específico de itens nem produto/estoque. A implementação precisará de schema e migration depois da aprovação do modelo e dos contratos. Conceitualmente, avaliar itens vinculados diretamente à OS e histórico de alterações, com um indicador de item na composição atual versus preservado no histórico. Não criar tabela de entidade `Budget` com status próprio nesta decisão.

Índices a avaliar: FK/consulta por OS e ordenação dos itens; histórico por OS/item/instante; unicidade da posição apenas se o contrato necessitar. Constraints de quantidade, valor, tipo e regra de item atual dependem de campos/precisão aprovados. Nada disso é uma definição física nesta fase.

## 11. Testes e validações futuras

- Backend: autorização, OS elegível, três tipos exatos, integridade de vínculo, cálculos após decisão monetária, alterações e histórico atômicos, preservação ao retirar da apresentação principal, concorrência e ausência de alterações em estoque/financeiro.
- Frontend: inclusão/edição dos três tipos, permissões, totalização, consulta do histórico, confirmação de retirada sem exclusão e associação correta às situações da OS.
- Operacional: testar em MySQL isolado; incluir item de estoque não pode alterar saldo/disponibilidade; retirar o orçamento não apaga itens; nenhum lançamento financeiro é criado. A transição posterior a `UTILIZADA` deve ser validada somente quando estoque estiver implementado.

## 12. Decisões pendentes de Marcos

1. Campos definitivos, quantidade, unidade e precisão monetária.
2. Desconto/acréscimo, arredondamento e tributos.
3. Custo interno por tipo; quem pode visualizá-lo e alterá-lo.
4. Registro de aprovação: autor interno, canal, evidência e observação; e registro de recusa/motivo/canal.
5. Se haverá impressão/PDF, envio por e-mail/WhatsApp, validade ou aprovação parcial.
6. Como alterações após aprovação aparecem no histórico, sem alterar a decisão aprovada de que a mudança de valor não exige nova aprovação do cliente.
7. Se a primeira fase inclui peça de estoque ou apenas os dois tipos manuais.
8. Se itens podem ser editados em OS fechada/cancelada.
9. Momento e fluxo exatos da pergunta para retirar/manter itens em situação `NÃO AUTORIZADO`, e exigência de motivo.
10. Evolução futura com produto/estoque e, separadamente, integração com financeiro.
