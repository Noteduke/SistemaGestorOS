# Especificações Não Documentadas — Sistema Gestor OS

**Fonte exclusiva:** `conversa.md`. Este documento registra lacunas e inconsistências sem resolvê-las. “Não documentado” significa que a conversa não fecha a regra de forma suficientemente inequívoca para implementação sem confirmação.

## 1. Conflitos e inconsistências de registro

1. **Numeração RN reutilizada.** Há identificadores repetidos para decisões distintas (por exemplo RN-027, RN-046, RN-071, RN-079, RN-083, RN-137, RN-163 a RN-168). Alguns números aparecem como sugestão e depois como decisão, e alguns títulos mudam. É necessário estabelecer um índice canônico que associe número, título, última revisão e trecho de origem antes de referenciar essas regras em outros documentos.
2. **RN-014 foi revisada.** A formulação inicial sugeria baixa no uso; versão posterior distingue peça orçada, aplicada/reservada e baixa final no encerramento/entrega. A versão revisada é a válida. Há também uma formulação posterior que chama “reserva” de aplicada/utilizada; os estados e momento exato devem usar a versão final descrita no capítulo 5 da especificação.
3. **RN-137 (Origem do Cliente) foi reprovada posteriormente.** Não implementar esse cadastro com base na aprovação intermediária.
4. **Propostas arquivadas versus decisão aprovada.** A conversa contém longas recomendações e tarefas de pesquisa técnica para Dell, Correios, SEFAZ, Stone, Banco Inter e boletos. A existência desses textos não confirma contratação, endpoint, credenciais ou aprovação de arquitetura específica.
5. **V1 e futuro se misturam.** Portal para clientes, integrações, multiempresa, automação, relatórios e componentes aparecem em diferentes horizontes sem uma matriz final consolidada de versão/prioridade.
6. **Disponível versus aplicado.** A RN-056 escreve `Disponível = Físico − Reservado`, mas as decisões também dizem que a peça aplicada fica indisponível até a entrega e distinguem “Reservado” de “Aplicado”. Não está esclarecido se “Reservado” inclui também o saldo aplicado para essa fórmula, ou se a equação deve descontar ambos. A especificação preserva os conceitos sem escolher a fórmula conflitante.

## 2. Regras operacionais a completar

### Ordem de Serviço

- Lista inicial de status, seus nomes oficiais, transições permitidas, estados finais e propriedades editáveis não está fechada. Ficou decidido que o catálogo é configurável e cada situação contém atributos operacionais, mas não foi fornecido um modelo final de transições/grafo.
- Critérios de cancelamento, reabertura e encerramento excepcional de OS encerrada; quais papéis podem realizá-los; quando exigir justificativa; e efeitos financeiros/estoque associados não estão integralmente definidos.
- O texto de RN-030 (encerramento) e RN-035 (alteração após encerramento) deve ser cotejado para estabelecer precisamente edição, reabertura e correção. Está aprovado preservar trilha de auditoria, mas a sequência operacional não está completa.
- Comportamento quando mudar o status para um que permite fechamento sem cobrança, mas existirem valores orçados, recebimentos antecipados ou peças aplicadas/reservadas precisa ser detalhado.
- Regra de data de aprovação: há confirmação/crítica ao alterá-la, mas não foi definido quem pode alterar, se a data original fica imutável em todos os casos e como corrigir erro de registro.
- O fluxo para autorização por telefone, e-mail, WhatsApp ou presencial está descrito; não foram definidos os campos obrigatórios por meio, evidências ou autenticação do autorizador.
- Critérios para atendimento sem orçamento, avaliação posterior, recusa de orçamento, orçamento parcial e mudança de laboratório/setor não estão todos formalizados como transições.
- O texto menciona um ou dois campos personalizados, mas não fixa nomes, tipos, obrigatoriedade, pesquisa, auditoria ou configuração por tipo de equipamento.
- Número sequencial: escopo do contador (global/por empresa/ano), formato, lacunas permitidas, concorrência e regras após cancelamento não estão definidos.

### Clientes e equipamentos

- “Identificação mínima” do cliente é aprovada, mas quais campos satisfazem o mínimo não ficou explícito.
- Comportamento exato para cliente inativo ao abrir nova OS (bloqueio, aviso ou permissão excepcional) carece de regra operacional inequívoca.
- Limite, ordenação, principalidade e validação de endereços, telefones, e-mails e contatos empresariais não estão definidos. Há tensão entre decisão de endereço único por pessoa e decisões posteriores de múltiplos canais de contato; preservar essa distinção até confirmação.
- Regra completa para troca de proprietário, equipamento herdado, transferência entre clientes e equipamentos sem serial precisa especificar confirmação, histórico e prevenção de duplicidade.
- Não estão fechados catálogo inicial de tipos/fabricantes/marcas, nem diferença entre fabricante e marca.
- Sincronização entre alteração do cadastro permanente de equipamento e snapshots históricos da OS não está detalhada além da preservação histórica.

### Orçamentos, serviços e garantia

- Fluxo de revisões de orçamento após autorização do cliente (nova versão, aceite parcial, validade, registro do autorizador e itens alterados) não está completamente modelado.
- Política de desconto, limites por papel, aprovação gerencial, arredondamento, impostos e formação de preço não foi especificada em sua totalidade.
- Definição funcional de “componente” versus “peça”, itens avulsos e apresentação ao cliente precisa ser normalizada para evitar diferenças entre orçamento, estoque e documento fiscal.
- Regras de garantia: duração padrão, início da contagem, cobertura de peça/mão de obra, exclusões, garantia de retorno e vínculo entre atendimentos não estão todas fechadas.
- Garantia padrão configurável foi aprovada, mas quem pode alterá-la e se alterações afetam OS já emitidas não está definido.

### Estoque e compras

- **Custo permanente do produto:** durante a descoberta foi sugerido, “num primeiro momento”, manter permanentemente como referência o primeiro preço de compra lançado, mas a própria resposta foi registrada como provisória e sujeita a reflexão/revisão. Não tratar isso como política definitiva de custo por lote/unidade sem confirmação.
- Quantidades, fórmulas e consistência entre físico, reservado, disponível, aplicado e a caminho não estão formalmente definidas; a decisão determina que sejam conceitos separados, sem modelo matemático final.
- “Baixa definitiva na entrega” aparece reiteradamente como regra final, mas o caso de cliente que paga/retira parcialmente, não retira equipamento ou a OS é faturada antes da entrega requer comportamento explícito.
- Destinos e estados para peça defeituosa foram exemplificados, mas transições, responsáveis, impacto contábil e retorno de garantia ao fornecedor não foram definidos.
- Estoque negativo foi aprovado; não foi definido se pode ocorrer por produto/local, quem pode autorizar nem como tratar saldo negativo quando chega compra ou se faz inventário.
- Multiestoque/depósitos/locais não está confirmado. Localização física do equipamento no laboratório foi sugerida e rejeitada; isso não responde à necessidade de depósitos para produtos.
- Regras de inventário, transferência, devolução, estorno, custo médio e atualização de custos não estão detalhadas, embora alguns movimentos estejam previstos.
- A relação de um pedido de compra por OS foi aprovada; falta definir cancelamento parcial, recebimento parcial, divergência, substituição de item e frete rateado.
- O estágio “solicitação” versus “pedido aprovado/realizado”, autorizações e papéis de comprador não foi fechado integralmente.

### Financeiro e vendas

- O fluxo de caixa projetado é desejado, mas não ficou definido quais títulos/estados compõem a projeção, datas, saldo inicial, recorrência, inadimplência ou filtros.
- Regras para estorno, devolução ao cliente, crédito, cancelamento de recebimento antecipado, chargeback e conciliação não estão completas.
- Contas a pagar, baixa, pagamento parcial, juros/multa, descontos e conciliação bancária não receberam especificação completa.
- Condições e formas de pagamento foram aprovadas, mas divisão de parcelas, datas de vencimento, taxas de cartão e tratamento de PIX/boleto não estão inteiramente fechados.
- “Recebimento faturado” e faturamento como documento comercial/fiscal precisam de definição de estados e vínculo com contas a receber.
- Vendas compartilham financeiro e estoque com OS; faltam fluxos detalhados de pedido, reserva, separação, entrega, devolução e faturamento.
- O envio/geração de documento fiscal de saída não deve ser deduzido da especificação de importação de NF-e; emissão fiscal ainda não está descrita de forma suficiente.

## 3. Integrações, segurança e infraestrutura

- **Dell/TechDirect:** pesquisa técnica foi pedida, mas credenciais, disponibilidade dos dados, termos, limites, autenticação, cache e política de falha final não estão formalmente aprovados.
- **Correios/logística:** APIs e alternativas foram pesquisadas; provedor final, frequência, custos, autenticação e fluxo de postagem/rastreamento não estão fechados.
- **SEFAZ/NF-e:** certificado digital, armazenamento/uso, manifestação do destinatário, eventos, distribuição, duplicidade, cancelamentos e recuperação de falhas carecem de especificação de produção e aprovação técnica completa.
- **Boletos/Banco Inter/Stone:** falta selecionar operações/provedores por banco, fluxo de homologação, webhooks, conciliação e tratamento de indisponibilidade.
- 2FA foi aprovado com distinção de rede interna/externa; método, política de recuperação, dispositivos e exceções não foram detalhados. A sugestão de “local confiável” foi negada.
- Política de senha, expiração, bloqueio, recuperação de conta e retenção de sessão requer detalhamento; tentativa de autenticação e sessão simultânea foram tratadas, mas não todos os parâmetros.
- Regras de acesso a QR Code/portal mobile e proteção de dados expostos não estão fechadas.
- Backup foi aprovado como configuração, mas agenda, destino, retenção, criptografia, restauração testada, RPO/RTO, alta disponibilidade e responsabilidade operacional não foram estabelecidos. Propostas de replicação/backup e nuvem não devem ser tratadas como decisões finais.
- Metas de desempenho, disponibilidade, escala, recuperação de desastre, observabilidade, retenção de logs e política de privacidade não foram quantificadas.

## 4. UX, relatórios e comunicação

- Catálogo de relatórios por área foi aprovado, mas campos, filtros, permissões, exportações e fórmulas de cada relatório não estão especificados.
- Relatório diário de OS prontas aguardando retirada foi aprovado; horário de corte, destinatários e canal de entrega não estão definidos.
- Dashboard operacional foi aprovado em nível de conteúdo (pendências, indicadores e atalhos); indicadores e cálculos não estão enumerados.
- Lembretes de OS: recorrência, fusos, responsáveis, adiamento, notificações e conclusão precisam de regras de detalhe.
- E-mail/WhatsApp: modelos, destinatários, consentimento, registro de entrega/falha e conteúdo seguro não estão totalmente definidos.
- Compartilhamento WhatsApp foi revisado e aprovado, mas não se deve assumir automação, integração oficial ou divulgação irrestrita de dados sem confirmação do fluxo final.
- Anexos: formatos, limites, antivírus, política de acesso, retenção e armazenamento não estão definidos.
- Portal mobile para cliente é futuro; perfis de técnico/balcão/compras têm escopo geral aprovado, mas catálogo exato de ações e modo offline não foram fixados.

## 5. Dados, modelo e API

- O histórico contém documentos-modelo de entidades e banco, mas a presente fonte não fecha um esquema relacional/ERD final completo com cardinalidades e restrições.
- Campos de auditoria padrão, histórico, log administrativo e identificador externo UUID foram aprovados em nível de padrão, mas retenção e valores obrigatórios por entidade carecem de especificação.
- A API é REST/HTTPS/versionada e padronizada; endpoints, contratos, status HTTP, paginação, filtros, idempotência, limites e compatibilidade ainda precisam de documentação implementável.
- Preparação para multiempresa foi aprovada; isolamento de dados, usuários compartilhados, numeração e configurações por empresa não estão resolvidos.
- Nomes oficiais de módulos, campos e estados ainda variam em partes da conversa (por exemplo “avaliação da loja”/“avaliação do sistema”); glossário final deve fixar nomenclatura.
- A arquitetura de camadas, serviços por domínio e centralização das regras no backend está aprovada; granularidade dos domínios e fronteiras de módulos não foi fechada.

## 6. Estado documental e confirmação necessária

1. Consolidar a tabela canônica de decisões RN e DA, mantendo versões antigas apenas como histórico e apontando a revisão vigente.
2. Confirmar priorização e corte da primeira versão para separar requisitos de produção inicial, evolução aprovada e pesquisa.
3. Completar as regras pendentes listadas acima antes de implementar os fluxos que dependem delas.
4. Não preencher lacunas por convenção técnica ou por documentação de produtos externos; a fonte autorizada aqui é exclusivamente a conversa.
