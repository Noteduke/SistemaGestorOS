# FRONTEND
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir a arquitetura e os padrões oficiais do Frontend do Sistema Gestor OS.

# 2. Tecnologias

- React
- TypeScript

# 3. Responsabilidades

O Frontend será responsável exclusivamente por:

- Interface do usuário;
- Navegação;
- Validação visual;
- Consumo da API;
- Experiência do usuário.

Toda regra de negócio permanecerá no Backend.

# 4. Organização

A aplicação será organizada em componentes reutilizáveis.

As telas deverão seguir um padrão único de layout.

# 5. Navegação

O sistema utilizará menu lateral como navegação principal.

Novos módulos deverão seguir a estrutura oficial de navegação.

# 6. Componentes

Sempre que possível utilizar componentes reutilizáveis.

Evitar duplicação de código.

# 7. Formulários

Todos os formulários deverão possuir comportamento consistente:

- validação visual;
- mensagens padronizadas;
- atalhos de teclado quando aplicável.

# 8. Padrão Visual

Toda a identidade visual deverá permanecer consistente em todos os módulos.

# 9. Responsividade

O sistema deverá funcionar corretamente em diferentes resoluções.

# 10. Integração

Todo acesso aos dados ocorrerá exclusivamente através da API oficial.

## 10.1 Apresentação do Aviso da Pessoa

Nos contextos de visualização do cadastro da Pessoa, abertura de OS para ela e venda para ela, quando houver Aviso preenchido, a interface apresenta a pergunta “Há informação a ser visualizada. Deseja visualizar agora?”. A interface só apresenta o conteúdo se o operador escolher Sim. Ao escolher Não, apresenta “Não deixe de verificar as mensagens pendentes antes de continuar.” A operação continua normalmente nos dois casos. Não exibir o conteúdo automaticamente.

A pergunta volta a ocorrer em cada ocorrência de um contexto aprovado, sem dispensa por sessão, atendimento ou usuário. Nesta etapa, não há log de leitura, registro da resposta, confirmação formal de ciência ou histórico de leituras. A interface segue a regra fornecida pela API; validações e permissões permanecem responsabilidade do Backend.

## 10.2 Pessoas e equipamentos inativos

Pessoas e equipamentos inativos não devem aparecer como opções padrão em novos lançamentos ou novas OS, respectivamente. Pessoa inativa pode ser consultada pelo filtro “incluir inativos”, mas não pode ser usada em novos vínculos de OS, venda ou como proprietária de Equipamento. Os registros históricos continuam apresentando as entidades normalmente. Pessoa nunca tem exclusão física; Equipamento só pode ser excluído por Administrador ou usuário com permissão equivalente quando não houver qualquer registro persistido relacionado. O Frontend não deve inferir vínculos históricos; segue o resultado fornecido pela API.

## 10.3 Cadastro de Equipamento

O formulário exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; o serial é opcional. Equipamento novo inicia com status Ativo. Tipos de Equipamento e Marcas inativos não aparecem como opções padrão para novos equipamentos, mas as referências existentes continuam visíveis nos históricos.

Quando houver serial, a API bloqueia repetição para o mesmo proprietário e retorna aviso não bloqueante para repetição associada a proprietário diferente; nesse segundo caso a interface permite cadastrar outro Equipamento e não sugere transferência. Sem serial, não se executa busca automática de duplicidade pela combinação Proprietário + Tipo + Marca + Modelo. O Backend/API é autoridade para validar duplicidade; a interface apresenta o resultado sem criar regras próprias.

O Frontend pode pesquisar equipamentos por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; Status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem quando o usuário inclui inativos pelo filtro. Essa pesquisa apenas localiza registros e não deve ser confundida com a validação de duplicidade no cadastro.

Máscaras de telefone e CEP são aplicadas somente na interface; o Backend salva esses valores apenas com números. CEP é opcional. Dados textuais são persistidos em caixa alta, exceto e-mail, que é salvo em minúsculas após remoção de espaços externos. O número de série é convertido para caixa alta sem remover símbolos ou alterar espaços, inclusive no início/fim; a interface não deve limpar ou ocultar essa diferença. Telefone com 10 dígitos é aceito como fixo; com 11, como celular se o primeiro dígito após o DDD for 9. Fora desses critérios, entre 1 e 32 dígitos, a API avisa e a interface permite confirmar e continuar; sem dígitos ou acima de 32, bloqueia no recorte aprovado.

Permissões são atribuídas por usuário/ação. Técnico e Usuário comum não são perfis rígidos; Administrador tem poderes máximos, e outro usuário pode executar ação administrativa específica se receber permissão equivalente. Usuários com permissão podem alterar Pessoa e Equipamento mesmo com histórico, sem justificativa obrigatória. Proprietário sem histórico pode ser corrigido diretamente; com histórico, a mudança usa transferência formal.

O Frontend apenas reflete as permissões e respostas fornecidas pela API. Pode ocultar ou desabilitar ações indisponíveis para orientar a interface, mas essa apresentação não concede nem nega autorização real; o Backend verifica cada operação e é a autoridade final. Não duplicar no Frontend as regras de autorização.

O histórico geral por entidade de Pessoa, Equipamento e OS aparece no contexto do respectivo cadastro/OS. A interface diferencia alteração de campo (valor anterior e novo) de evento/movimentação. Aviso e histórico técnico/auditoria exigem Administrador ou permissão equivalente. A OS terá retrato cadastral parcial da confirmação, sem snapshot completo; a entidade OS e os campos JSON do retrato já existem no banco principal, e o Backend captura os snapshots na confirmação. A primeira fatia do Frontend já lista OS confirmadas, exibe o detalhe e oferece histórico/eventos somente leitura. Os snapshots são exibidos como retratos históricos imutáveis, sem recálculo ou comparação automática com o cadastro atual.

Antes de salvar qualquer alteração de Pessoa ou Equipamento, exibir a confirmação: “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra a alteração; cancelar não salva. O registro é automático e alteração comum não exige justificativa. Os detalhes finais de exibição, filtros, paginação e eventos permanecem pendentes.

Cada coleção de telefones, e-mails e endereços pode ter no máximo um principal e não precisa ter nenhum. Ao selecionar um registro como principal, desmarcar o anterior da mesma coleção; remover/inativar o principal pode deixar a coleção sem principal. São permitidos vários endereços do mesmo Tipo.

## 10.4 CPF e CNPJ

O campo de CPF aceita somente algarismos, com máscara visual opcional. O campo de CNPJ deve aceitar letras e números para permitir o formato alfanumérico oficial, além do formato numérico antigo. A máscara deve preservar as letras; antes do envio, o valor será encaminhado para normalização e validação pela API. A validação visual não substitui a validação do Backend. A API persiste CPF numérico e CNPJ sem pontuação, com letras em maiúsculas.

## 10.5 Telefones e e-mails — Backend implementado, interface futura

O Backend já implementa inclusão e listagem de telefones/e-mails como sub-recursos de Pessoa; a interface correspondente permanece futura. Todo `POST` exige `confirmPersonChange: true`. Quando a interface existir, deverá exibir a confirmação geral antes de salvar; esse campo, sozinho, não comprova que a mensagem foi apresentada. Para telefone fora do padrão, a API retorna `409 PHONE_CONFIRMATION_REQUIRED` sem gravar; a interface apresenta o aviso e só reenvia com `confirmNonstandardPhone: true` após confirmação. Mais de 32 dígitos são bloqueados. O Backend registra histórico mínimo de criação e mudança efetiva de principal. E-mail repetido na mesma Pessoa é bloqueado; entre Pessoas diferentes é permitido com aviso genérico. Pessoa inativa pode ter contatos consultados, mas não receber novos contatos. As rotas estão protegidas por Auth no código. O bootstrap do primeiro Administrador e os principais testes HTTP autenticados foram concluídos no ambiente local; isso não libera produção. A migration Auth e o seed de permissões já foram aplicados no banco principal.

### 10.6 Autenticação e autorização

O Frontend possui tela de login integrada ao primeiro recorte de Auth. Na inicialização, consulta `GET /api/v1/auth/me`; enquanto a sessão é verificada, não exibe as telas protegidas. Sem sessão válida, apresenta login. Para entrar, obtém contexto pré-login por `GET /api/v1/auth/csrf` e envia as credenciais em `POST /api/v1/auth/login` com o token em `X-CSRF-Token`; depois confirma a sessão por `/auth/me`. O contexto pré-login tem validade de 15 minutos. A sessão opaca é mantida pelo cookie `HttpOnly`; senha não é persistida e é limpa do formulário após a tentativa. O token CSRF da sessão fica somente em memória para eventual chamada mutável e logout; não armazenar senha ou token CSRF em `localStorage`/`sessionStorage`. Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o token da sessão; `GET` não exige token. A sessão expira após 8 horas de inatividade e o logout encerra somente a sessão atual. A tela reflete a identidade/permissões fornecidas pelo Backend, sem decidir autorização; respostas 401/403 devem ser tratadas sem revelar detalhes sensíveis. CRUD HTTP e gestão de usuários por tela ficam para recorte posterior. A paginação da lista de Pessoas é obrigatória: `page` e `pageSize` não têm padrão automático. O sistema é somente de uso interno; acesso externo segue proibido até 2FA e fronteira confiável implementados.

Em 11/10/2026, o login visual foi validado em navegador local com Vite, proxy `/api` e Backend real conectado temporariamente ao banco isolado `gestor_os_opening_test`. O formulário executou o fluxo CSRF/login/identidade e entrou na área autenticada; o cookie de sessão controlado pelo Backend foi usado pelo navegador para consultar a identidade e as OS. A lista, o detalhe, os retratos históricos e os eventos foram exibidos. Senha incorreta apresentou erro e limpou o campo; logout e recarga sem sessão retornaram à tela de login. A inspeção do código de produção não encontrou uso de `localStorage` ou `sessionStorage` para senha/token sensível. O usuário não administrador de validação foi desativado e suas sessões foram revogadas ao final. Naquela validação, nenhum endpoint mutável de OS foi chamado.

A interface de detalhe permite alterar a situação operacional da OS confirmada por `PATCH /api/v1/service-orders/:publicId/operational-situation`. Envia o token CSRF da sessão mantido em memória e o cookie de sessão existente; o Backend continua responsável por autorização e regras de transição. A resposta atualiza o detalhe, preservando macrostatus, cliente, equipamento e snapshots; ao abrir ou recarregar o histórico, a interface consulta novamente os eventos, incluindo `SITUACAO_OPERACIONAL_ALTERADA`. Abertura, confirmação e edição da OS pela interface permanecem pendentes.

O detalhe da OS permite consultar e substituir os responsáveis nominais. A interface usa `GET /api/v1/users/assignable` com paginação e busca por username, e envia a lista completa em `PUT /api/v1/service-orders/:publicId/assignments` no campo `userPublicIds`, com cookie de sessão e CSRF em memória. A lista vazia remove todos; conjunto equivalente não envia PUT. O Backend continua aplicando elegibilidade, autorização e registro do evento. Depois de salvar, o detalhe é atualizado pela resposta; ao abrir o histórico, os eventos são consultados novamente para exibir `ATRIBUICOES_ALTERADAS`. Abertura, confirmação e edição da OS pela interface permanecem pendentes.

Testes automatizados de componente validam consulta e paginação de usuários, seleção e remoção total, PUT com CSRF, conjunto equivalente sem chamada, tratamento de 401/403/404/400/409/422 e preservação de situação, macrostatus, cliente, equipamento e snapshots. A validação operacional desta interface em navegador com Backend real foi concluída, conforme registro abaixo.

Validação operacional em 11/10/2026: no navegador local, com Vite, proxy `/api`, Backend real e sessão real, a mudança de `TRIAGEM` para `AGUARDANDO AVALIAÇÃO/ORÇAMENTO` foi concluída na OS `OS-000131` (`63cdf79c-951f-427d-89ea-4309589725df`). A conexão foi confirmada em `gestor_os_opening_test` no MySQL 8.0.46 antes das operações; o banco principal `gestor_os` não foi acessado. O PATCH oficial incluiu `X-CSRF-Token`, foi aceito e a situação persistiu após recarregar o detalhe. O histórico exibiu `SITUACAO_OPERACIONAL_ALTERADA` de `TRIAGE` para `AWAITING_EVALUATION_BUDGET`. Macrostatus `ABERTA`, snapshots (versão 1), cliente e equipamento foram preservados. Selecionar a situação atual manteve Salvar desativado. Sem `service_orders.situation.update`, a interface mostrou a mensagem de permissão negada e a OS não mudou. O endpoint antigo `/situation` e endpoints de abertura, atribuição, orçamento, peças, estoque e financeiro não foram chamados. A conta não administradora `validacao.frontend` foi desativada, sua permissão de alteração removida e não restaram sessões ativas; nenhuma senha foi registrada.

Validação operacional das atribuições nominais (12/10/2026): no navegador local, com Vite, proxy `/api`, Backend real, sessão e CSRF reais, a interface foi validada exclusivamente contra `gestor_os_opening_test`; antes das escritas, `DATABASE()` confirmou esse banco, e o banco principal `gestor_os` não recebeu escrita. Na OS `OS-000033`, inicialmente sem responsáveis, `GET /api/v1/users/assignable` forneceu opções e `PUT /api/v1/service-orders/:publicId/assignments` salvou a lista completa pelo campo `userPublicIds`. O cookie de sessão e `X-CSRF-Token` foram enviados. Após recarregar, o responsável selecionado (`assign_first_assignee_55bd623349`) apareceu no detalhe e o histórico exibiu `ATRIBUICOES_ALTERADAS`. Enviar `userPublicIds: []` removeu os responsáveis e gerou novo evento; seleção equivalente não enviou PUT. Sem `service_orders.assignment.manage`, salvar exibiu 403 e a OS permaneceu inalterada. A OS terminou sem responsáveis, como começou; situação `TRIAGEM`, macrostatus `ABERTA`, versão e hashes dos snapshots, cliente e equipamento permaneceram iguais. Não foram chamados `PATCH /assignments`, o PATCH de situação, rotas de abertura ou endpoints de orçamento, peças, estoque, financeiro e CRUD administrativo de usuários. A conta descartável `validacao.frontend` terminou inativa, sem sessões; a permissão temporária de atribuição foi removida e as permissões de leitura preexistentes foram preservadas. Nenhuma senha foi registrada. Abertura, edição e confirmação da OS pela interface continuam pendentes.

### 10.7 Peças em Ordem de Serviço — interface futura

Na futura interface de OS, DISPONÍVEL, ORÇADA, UTILIZADA e BAIXADA devem ser apresentados com seus efeitos distintos: ORÇADA não afeta estoque; UTILIZADA fica indisponível para outra OS/venda, mas não é baixa definitiva; BAIXADA é definitiva no encerramento. Usuários autorizados na OS podem mudar ORÇADA para UTILIZADA. A transição registra usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável. Recusa/cancelamento de lançamento ainda ORÇADO não movimenta estoque e preserva o histórico do lançamento.

A interface deverá apresentar peça avulsa separadamente de peça controlada pelo estoque. A avulsa é item manual financeiro/descritivo, não exibe saldo nem ações de disponibilidade, movimentação, baixa ou conferência, e não pode ser convertida em peça de estoque. O custo interno deve aparecer separado do valor cobrado; usuários autorizados na OS podem visualizar e alterar ambos, inclusive após aprovação do orçamento. A aprovação não trava os campos. Cada mudança gera histórico com usuário, data/hora, OS, item, campo alterado e valores anterior/novo. `finance.os_costs.manage` pode ser avaliada futuramente para relatórios gerenciais, fechamento financeiro ou controle mais restrito, sem ser requisito para editar o item avulso. O cálculo de margem/lucro e o fluxo visual ainda não estão implementados.

Para valor cobrado de peça de estoque, peça avulsa, serviço/mão de obra ou outro item da OS, a interface não deve travar a edição depois da aprovação do orçamento nem exigir nova aprovação do cliente. Usuários autorizados na OS podem corrigir o valor sem motivo obrigatório. A interface deve informar que a alteração será registrada no histórico, que contém usuário, data/hora, OS, item, tipo do item, campo e valores anterior/novo.

A interface deve sinalizar pendências para peças UTILIZADAS que não foram usadas, foram removidas ou cuja OS/serviço foi cancelado, desfeito ou recusado. Usuário operacional pode reportar a não utilização; somente Administrador ou usuário autorizado pela permissão futura `stock.pending_review.resolve` pode resolver, escolhendo DISPONÍVEL, manter UTILIZADA ou BAIXADA por motivo administrativo. Não deve haver liberação automática. O encerramento da OS deve baixar as peças UTILIZADAS e ficar bloqueado enquanto houver pendência aberta. Uma tela/painel de conferência e o fluxo visual ainda não estão implementados.

### 10.8 Situação operacional da OS — atualização básica implementada; demais ações futuras

A interface deve apresentar separadamente situação operacional, status macro e resultado/status-motivo de encerramento. A abertura inicia em TRIAGEM e somente essa situação fica disponível nesse momento. Nas situações com responsabilidade padrão da Administração, a interface apresenta fila/grupo administrativo, acessível a Administradores e a usuários com permissão equivalente; não mostra um Administrador específico como responsável sem atribuição nominal explícita. A OS em TRIAGEM pode não ter funcionário nominal atribuído. Atribuições explícitas de outros funcionários são permitidas; situações futuras poderão ser atribuídas a qualquer funcionário.

Ao selecionar uma das situações NÃO AUTORIZADO, se houver orçamento, perguntar se deseja removê-lo e colocá-lo no histórico ou mantê-lo. Registrar a escolha e todas as mudanças de situação/atribuição no histórico, incluindo usuário, data/hora, OS, situação anterior/nova e funcionários atribuídos antes/depois quando aplicável. A API de consulta paginada de eventos da OS está implementada em `GET /api/v1/service-orders/:publicId/events`, protegida por `service_orders.events.read`; a seção de histórico somente leitura também está implementada. A alteração básica da situação da OS confirmada está disponível no detalhe, pelas dez opções aprovadas e pela rota oficial com CSRF. A interação sobre orçamento nas situações NÃO AUTORIZADO e a interface de atribuições nominais permanecem futuras.

### 10.9 Reabertura e encerramento da OS — interface futura

Exibir separadamente reabertura simples (correção textual, sem mudança de status/situação, faturamento ou pagamentos) e reabertura completa. A reabertura completa deve apresentar os efeitos aprovados: mesma OS/número, retorno a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO, cancelamento do faturamento e dos pagamentos no financeiro ativo com preservação do histórico, retorno das peças vinculadas para ORÇADA e aviso no dashboard do Administrador. Também deve estar disponível para OS CANCELADA, exceto para a OS externa encerrada como Equipamento comprado/Doado depois de criada a interna; nessa origem, oferecer somente reabertura simples textual.

Não oferecer a mudança direta FECHADA→CANCELADA ou CANCELADA→FECHADA; para OS elegíveis, a interface deve conduzir à reabertura completa para ABERTA antes da outra ação. A OS externa encerrada como Equipamento comprado/Doado, depois de criada a interna, não oferece essa reabertura completa nem mudança técnica posterior; permite somente correção textual pela reabertura simples. Alterar status macro para FECHADA/CANCELADA depende de Administrador ou permissão específica; a atribuição de situação operacional segue a autorização da OS. Regras de texto, confirmação e apresentação de exceções financeiras ainda precisam de especificação de UX.

### 10.10 Pessoa da própria empresa e OS interna — interface futura

Disponibilizar ao Administrador a configuração de uma única Pessoa ativa como representante da própria empresa. Exibir o valor atual e registrar alterações no histórico administrativo. No encerramento Equipamento comprado/Doado, informar e bloquear a operação se essa Pessoa não estiver configurada; após configurada, permitir concluir o fluxo que fecha a OS externa e abre a interna ABERTA/TRIAGEM.

Na OS interna, mostrar claramente uma área histórica de informações herdadas da OS original e separá-la dos novos dados, atribuições e itens operacionais. Exibir o vínculo de origem/destino entre as OS. A origem fechada não oferece novos movimentos técnicos nem reabertura completa; somente reabertura simples para correção textual pode ser apresentada. OS interna não oferece Equipamento comprado/Doado como resultado de encerramento. Não exibir cobrança, pagamentos, serviços cobrados, peças UTILIZADAS/BAIXADAS nem pendências da original como itens ativos da interna. Não solicitar nem registrar valor pago ao cliente nesse fluxo nesta etapa. Os textos e detalhes de interação ainda precisam de especificação de UX.

### 10.11 Abertura e numeração da OS — interface futura

Ao iniciar a abertura, apresentar o número visível gerado no formato `OS-000001` antes de confirmar os dados, para uso em etiqueta e atendimento. Identificar claramente que a abertura persistida ainda está em andamento até confirmar cliente e equipamento; ela sobrevive a reinício, não é atendimento ativo e não tem snapshot definitivo. `GET /api/v1/service-orders/openings/current` é a retomada oficial da abertura própria após interrupção. A tela consulta as APIs auxiliares de clientes, equipamentos, tipos e marcas documentadas em `docs/04-API.md`; elas são somente leitura e exigem `service_orders.opening.create` (ou Administrador). A busca de equipamento inclui proprietários distintos e a resposta pública do proprietário permite comparar com o cliente selecionado. Tipos e marcas retornam todos os registros cadastrados enquanto o schema não possuir estado ativo/inativo. Defeito/reclamação começa vazio e não bloqueia confirmação. Equipamento novo recebe automaticamente o cliente como proprietário e só vira cadastro definitivo ao confirmar a abertura.

Se o equipamento existente pertencer a outra Pessoa, mostrar o proprietário atual, o cliente selecionado e o efeito de cada escolha. Oferecer cancelar a seleção, abrir para o proprietário atual ou transferir para o cliente selecionado quando o usuário for Administrador ou tiver `equipment.transfer_ownership`; nunca transferir sem confirmação explícita. Não solicitar dados de portador/entregador. Em desistência, apresentar o resultado do cancelamento da abertura conforme a regra de reuso do número; imprimir etiqueta não consome o número por si só. Aberturas canceladas não aparecem na listagem normal de OS. Alterações temporárias da abertura podem ser feitas pelo usuário autorizado e não são apresentadas como correções administrativas nem exigem histórico detalhado. Não há expiração automática obrigatória neste recorte. `POST /api/v1/service-orders/openings/:publicId/resume` e a listagem administrativa de aberturas permanecem fora do contrato implementado; a interface comum retoma pelo `GET /current`.

### 10.12 Retrato cadastral e correção de vínculos da OS — interface futura

Na confirmação da abertura, o Backend grava uma única vez os snapshots cadastrais estruturados em JSON da Pessoa e do Equipamento, independentes dos vínculos atuais e contendo valores textuais principais, `snapshotVersion: 1` e `capturedAt`. A interface não solicita nem permite edição manual desse retrato. Na tela e na impressão padrão da OS, exibir dados atuais dos cadastros vinculados; não exibir aviso automático obrigatório se divergirem do retrato. Não oferecer impressão própria do retrato.

Usuários com permissão de visualizar a OS podem consultar o retrato no histórico, com indicação clara de que representa a situação cadastral na confirmação da abertura. Não o apresentar como dado principal. Reabertura ou correção posterior do cliente/equipamento não altera esse registro. A correção de vínculo exige Administrador ou permissão específica futura sugerida (`os.correct_customer` ou `os.correct_equipment`, conforme o vínculo), confirmação apropriada e histórico com usuário, data/hora, campo e valores anterior/novo. Motivo não é obrigatório; poderá ser um campo opcional futuro. Correção pode ser feita em OS FECHADA/CANCELADA e não a reabre, não altera status, número, retrato, faturamento, cobrança, pagamento ou estoque. Não altera automaticamente registros financeiros e não exige aviso no painel do Administrador.

Ao corrigir equipamento, se o titular atual for diferente do cliente da OS, mostrar o alerta e exigir decisão explícita entre cancelar, corrigir também o cliente (se autorizado) ou transferir a titularidade (Administrador ou `equipment.transfer_ownership`). Ao corrigir cliente e o equipamento continuar no nome do cliente anterior, alertar e exigir decisão explícita sobre a transferência; se ela não for autorizada ou aceita, cancelar a correção. Nunca transferir silenciosamente. A interface pode oferecer correção conjunta; o Backend garante que a operação seja atômica e que cada campo alterado tenha histórico.

O número da OS não muda; os dados principais da tela e da impressão passam a refletir o vínculo atual. Relatórios ou filtros de auditoria para localizar essas correções são possibilidade futura, sem alerta automático obrigatório no painel.

O retrato não substitui checklist de recebimento. Estado físico, acessórios, senha informada, avarias, itens ausentes e demais dados de recebimento não aparecem nele; um checklist/registro de recebimento é fluxo futuro independente.

# 11. Evolução

A base atual usa React + TypeScript + Vite, proxy local `/api` para `http://127.0.0.1:3000`, listener Vite restrito a `127.0.0.1`, navegação por hash e cliente HTTP com sessão/cookies. A aplicação inicial contém listagem, detalhe e histórico somente leitura de OS confirmadas. Padrões mais amplos de componentes, gerenciamento de estado, temas e biblioteca visual poderão ser definidos conforme novos módulos forem implementados.
