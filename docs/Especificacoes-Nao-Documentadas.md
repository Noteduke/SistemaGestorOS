# Especificações Não Documentadas — Sistema Gestor OS

**Fontes:** `conversa.md` e decisões posteriores aprovadas por Marcos. Este documento registra lacunas e inconsistências sem resolvê-las. “Não documentado” significa que as fontes aprovadas não fecham a regra de forma suficientemente inequívoca para implementação sem confirmação.

## 1. Conflitos e inconsistências de registro

1. **Numeração RN reutilizada.** Há identificadores repetidos para decisões distintas (por exemplo RN-027, RN-046, RN-071, RN-079, RN-083, RN-137, RN-163 a RN-168). Alguns números aparecem como sugestão e depois como decisão, e alguns títulos mudam. É necessário estabelecer um índice canônico que associe número, título, última revisão e trecho de origem antes de referenciar essas regras em outros documentos.
2. **RN-014 foi revisada.** A formulação inicial sugeria baixa no uso; versão posterior distingue peça orçada, aplicada/reservada e baixa final no encerramento/entrega. A versão revisada é a válida. Há também uma formulação posterior que chama “reserva” de aplicada/utilizada; os estados e momento exato devem usar a versão final descrita no capítulo 5 da especificação.
3. **RN-137 (Origem do Cliente) foi reprovada posteriormente.** Não implementar esse cadastro com base na aprovação intermediária.
4. **Propostas arquivadas versus decisão aprovada.** A conversa contém longas recomendações e tarefas de pesquisa técnica para Dell, Correios, SEFAZ, Stone, Banco Inter e boletos. A existência desses textos não confirma contratação, endpoint, credenciais ou aprovação de arquitetura específica.
5. **V1 e futuro se misturam.** Portal para clientes, integrações, multiempresa, automação, relatórios e componentes aparecem em diferentes horizontes sem uma matriz final consolidada de versão/prioridade.
6. **Disponível versus aplicado.** A RN-056 escreve `Disponível = Físico − Reservado`, mas as decisões também dizem que a peça aplicada fica indisponível até a entrega e distinguem “Reservado” de “Aplicado”. Não está esclarecido se “Reservado” inclui também o saldo aplicado para essa fórmula, ou se a equação deve descontar ambos. A especificação preserva os conceitos sem escolher a fórmula conflitante.

### Conflitos resolvidos por decisão aprovada em 07/10/2026

- **Cardinalidade de endereços — resolvida:** uma Pessoa pode possuir vários endereços. Cada endereço tem Tipo de Endereço de cadastro próprio e pode ser marcado como principal. A cardinalidade atual do schema ainda é divergente e deverá ser evoluída por migration.
- **Pessoa de Contato — resolvida:** cada Pessoa pode ter zero ou uma Pessoa de Contato, que é outro cadastro completo de Pessoa. A coluna física atual `primary_contact_id` continua representando esse vínculo no modelo existente; a nomenclatura funcional é Pessoa de Contato.
- **Marca x Fabricante em equipamentos — resolvida:** são o mesmo conceito para equipamentos, com um único cadastro, chamado preferencialmente Marca. Não criar cadastro paralelo de fabricantes de equipamentos.
- **Papéis da Pessoa — complementada:** os papéis são Tipos de Contato; uma Pessoa pode ter vários simultaneamente e o Tipo de Contato será cadastro próprio. `person_roles` com enum é apenas a estrutura atual e deverá ser revista na modelagem futura.
- **Catálogos iniciais de Pessoa — aprovados em 07/10/2026:** Tipos de Contato (Cliente, Fornecedor, Transportadora, Prestador de Serviço, Parceiro), Tipos de Endereço (Principal, Cobrança, Entrega, Instalação) e Tipos de Contribuinte (Contribuinte ICMS, Contribuinte Isento, Não Contribuinte), com definições em `docs/02-Regras-de-Negocio.md`.
- **Ciclo de vida de catálogos auxiliares — aprovado em 07/10/2026:** item não utilizado pode ser editado, inativado ou excluído; item utilizado pode ser editado ou inativado, mas não excluído fisicamente; item inativo não é opção padrão para novo vínculo e permanece válido no histórico. Ainda falta decidir se a edição do nome de um item usado atualiza o texto de históricos ou se será preservado snapshot do nome anterior. Regras específicas aprovadas podem substituir essa regra geral.
- **Duplicidade de Pessoa — complementada em 07/10/2026:** CPF/CNPJ informado repetido bloqueia o cadastro; sem documento, suspeita por nome, telefone ou e-mail avisa e permite salvar. Permanecem pendentes critérios exatos de similaridade, normalização e algoritmo.
- **Aviso, ciclo de vida de Pessoa/Equipamento e titularidade — aprovados em 07/10/2026:** regras operacionais registradas em `docs/02-Regras-de-Negocio.md` e `docs/Especificacao-GestorOS.md`; o schema atual não deve ser interpretado como implementação dessas regras.

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

### Pessoas, contatos e equipamentos

- Tipo de Pessoa (PF/PJ) e Nome/Razão Social são os campos obrigatórios mínimos; os demais são opcionais no cadastro geral, salvo fluxo futuro específico. CPF/CNPJ continua opcional, mas as regras de armazenar só números, validar matematicamente, garantir unicidade e compatibilidade PF/CNPJ estão aprovadas e pertencem ao Backend/API. A máscara é apenas de interface. Não se deve manter a redação anterior de que Nome/Razão Social era o único obrigatório.
- Nome Fantasia não se aplica a PF, é opcional para PJ e, quando ausente, a Razão Social é a referência principal de exibição. Inscrições Estadual e Municipal são opcionais, principalmente para PJ, armazenadas sem validação estadual/municipal nesta etapa.
- Tipo de Contribuinte é opcional no cadastro geral e obrigatório na emissão de nota fiscal; não é exigido em OS sem emissão fiscal nem inicialmente para fornecedor, transportadora ou prestador sem fluxo fiscal específico. Os valores iniciais estão aprovados; permanecem pendentes códigos e regras fiscais NF-e/NFS-e. A validação de IE/IM para regras fiscais futuras também não foi definida.
- Critérios exatos de similaridade, normalização e algoritmo de pesquisa para detectar possíveis Pessoas duplicadas sem CPF/CNPJ permanecem pendentes. A regra funcional aprovada determina aviso sem bloqueio do salvamento.
- Ainda não está definido se alterações na descrição de um valor auxiliar usado devem refletir nos históricos ou se o texto anterior será preservado como snapshot.
- Aviso é informativo, não bloqueia operações e seu conteúdo não aparece automaticamente: a pergunta aprovada ocorre em cada contexto definido; Sim apresenta o conteúdo e Não mostra a mensagem pendente, permitindo continuar em ambos os casos. Não há log de leitura, confirmação formal ou histórico de leituras nesta etapa. Usuário comum pode preencher o campo vazio; alteração e apagamento de conteúdo existente são restritos a administrador. Permanecem pendentes a permissão técnica/perfil de administrador, auditoria de alteração/apagamento e eventual evolução para múltiplos Avisos ou histórico de leitura.
- Pessoa inativa não aparece como opção padrão e pode ser localizada em pesquisa com filtro de inativos. Ainda não está definido se uma Pessoa inativa selecionada explicitamente poderá ser usada para abrir nova OS ou se esse uso será bloqueado.
- Permanecem pendentes obrigatoriedade, ordenação, validação, exclusão/inativação e histórico de telefones, e-mails e endereços. Também não estão definidos limites de canais, principal único de telefone/e-mail/endereço ou unicidade de endereço por tipo. Para endereços, a cardinalidade aprovada é múltipla, com Tipo de Endereço e possibilidade de marcar principal; CEP obrigatório não foi aprovado.
- Proprietário de equipamento deve ser Pessoa cadastrada com Tipo de Contato Cliente; Pessoa inativa não é opção padrão. Exclusão/inativação de equipamento segue presença de vínculo operacional. Transferência altera proprietário atual, registra evento e não altera OS antigas; sem histórico, o titular pode ser corrigido sem transferência formal; com histórico, a mudança é transferência. Ainda estão pendentes os critérios exatos de vínculo, possibilidade de associar transferência a OS e a justificativa/auditoria/permissões da correção retroativa. A regra aprovada para serial é: mesmo serial para o mesmo proprietário bloqueia; para proprietário diferente avisa e permite cadastro sem sugerir transferência. Sem serial não se faz busca combinada por proprietário/tipo/Marca/Modelo. A cardinalidade de Pessoa de Contato (zero ou uma) e o fato de ser outro cadastro completo estão resolvidos.
- Status de Equipamento limita-se a Ativo/Inativo nesta etapa; novo equipamento inicia Ativo. Status operacionais adicionais estão fora do escopo atual. Campos obrigatórios são Proprietário, Tipo de Equipamento, Marca, Modelo e Status; serial é opcional. Tipo de Equipamento e Marca sem uso podem ser editados, inativados ou excluídos fisicamente; usados podem ser editados/inativados, mas não excluídos fisicamente. Snapshot de nome anterior após edição permanece pendente.
- O catálogo inicial de tipos de equipamento e Marcas ainda não está fechado. Marca e Fabricante são o mesmo conceito cadastral para equipamentos; não há pendência de separação entre eles.
- A normalização exata do número de série, as regras de pesquisa e a auditoria detalhada de alteração de dados permanentes do equipamento permanecem pendentes.
- Está aprovado que alterações posteriores no cadastro de Pessoa ou Equipamento não reescrevem o retrato da OS capturado na abertura. A composição e implementação técnica dos snapshots históricos ainda não estão modeladas.

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
- O schema aplicado ainda diverge de regras funcionais aprovadas para Cadastros: `person_addresses.person_id UNIQUE` permite somente um endereço; `person_roles` usa enum em vez de cadastro próprio de Tipos de Contato; não existem entidades próprias para Tipo de Endereço ou Tipo de Contribuinte; `people` não contém Tipo de Pessoa, Nome Fantasia, inscrições, Observações ou Aviso, nem relação com Tipo de Contribuinte; `equipment` não tem status e mantém `brand_id` e `model` opcionais, embora a regra funcional exija status e Marca/Modelo. `equipment_types` e `equipment_brands` não têm campos de inativação. `serial_number` é opcional e possui índice não unique: mesmo serial para o mesmo proprietário bloquear e, para proprietário diferente, avisar são regras de API, não garantidas pelo banco. `equipment.owner_id` aponta para `people`, sem impor Tipo de Contato Cliente ou atividade. `equipment_ownership_events` registra titulares e data, mas não distingue correção simples, transferência formal, usuário executor ou justificativa. Não há entidade de OS nem snapshot nesta migration. Permissões de Aviso e correção retroativa dependem do módulo de segurança. Essas regras ainda exigem modelagem e implementação futuras; não devem ser descritas como já aplicadas.
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
