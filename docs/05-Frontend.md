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

O histórico geral por entidade de Pessoa, Equipamento e OS aparece no contexto do respectivo cadastro/OS. A interface diferencia alteração de campo (valor anterior e novo) de evento/movimentação. Aviso e histórico técnico/auditoria exigem Administrador ou permissão equivalente. Não se deve presumir snapshot completo dos cadastros dentro da OS; a consulta de dados atuais é complementada pelo histórico de mudanças. A estrutura física continua pendente.

Antes de salvar qualquer alteração de Pessoa ou Equipamento, exibir a confirmação: “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra a alteração; cancelar não salva. O registro é automático e alteração comum não exige justificativa. Os detalhes finais de exibição, filtros, paginação e eventos permanecem pendentes.

Cada coleção de telefones, e-mails e endereços pode ter no máximo um principal e não precisa ter nenhum. Ao selecionar um registro como principal, desmarcar o anterior da mesma coleção; remover/inativar o principal pode deixar a coleção sem principal. São permitidos vários endereços do mesmo Tipo.

## 10.4 CPF e CNPJ

O campo de CPF aceita somente algarismos, com máscara visual opcional. O campo de CNPJ deve aceitar letras e números para permitir o formato alfanumérico oficial, além do formato numérico antigo. A máscara deve preservar as letras; antes do envio, o valor será encaminhado para normalização e validação pela API. A validação visual não substitui a validação do Backend. A API persiste CPF numérico e CNPJ sem pontuação, com letras em maiúsculas.

## 10.5 Telefones e e-mails — Backend implementado, interface futura

O Backend já implementa inclusão e listagem de telefones/e-mails como sub-recursos de Pessoa; a interface correspondente permanece futura. Todo `POST` exige `confirmPersonChange: true`. Quando a interface existir, deverá exibir a confirmação geral antes de salvar; esse campo, sozinho, não comprova que a mensagem foi apresentada. Para telefone fora do padrão, a API retorna `409 PHONE_CONFIRMATION_REQUIRED` sem gravar; a interface apresenta o aviso e só reenvia com `confirmNonstandardPhone: true` após confirmação. Mais de 32 dígitos são bloqueados. O Backend registra histórico mínimo de criação e mudança efetiva de principal. E-mail repetido na mesma Pessoa é bloqueado; entre Pessoas diferentes é permitido com aviso genérico. Pessoa inativa pode ter contatos consultados, mas não receber novos contatos. As rotas estão protegidas por Auth no código. O bootstrap do primeiro Administrador e os principais testes HTTP autenticados foram concluídos no ambiente local; isso não libera produção. A migration Auth e o seed de permissões já foram aplicados no banco principal.

### 10.6 Autenticação e autorização

O Frontend continua não implementado. Quando criado, deverá obter o token pré-login por `GET /api/v1/auth/csrf` antes de enviar credenciais. O contexto pré-login tem validade de 15 minutos; o token será enviado em `X-CSRF-Token` no `POST /api/v1/auth/login`. Após autenticar, o Frontend usará o controle CSRF próprio da sessão nas chamadas mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`); `GET` não exige token. A sessão expira após 8 horas de inatividade e o logout encerra a sessão atual. Os testes locais confirmaram login, `/auth/me`, acesso Admin à listagem paginada de Pessoas, rejeição CSRF em mutação, logout e rejeição da sessão revogada. A interface deverá lidar com respostas 401/403 e refletir as permissões fornecidas pelo Backend, sem decidir autorização. O primeiro uso será somente pelo Administrador bootstrapado; CRUD HTTP e gestão de usuários por tela ficam para recorte posterior. A paginação da lista de Pessoas é obrigatória: `page` e `pageSize` não têm padrão automático. O sistema é somente de uso interno; acesso externo segue proibido até 2FA e fronteira confiável implementados.

### 10.7 Peças em Ordem de Serviço — interface futura

Na futura interface de OS, DISPONÍVEL, ORÇADA, UTILIZADA e BAIXADA devem ser apresentados com seus efeitos distintos: ORÇADA não afeta estoque; UTILIZADA fica indisponível para outra OS/venda, mas não é baixa definitiva; BAIXADA é definitiva no encerramento. Usuários autorizados na OS podem mudar ORÇADA para UTILIZADA. A transição registra usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável. Recusa/cancelamento de lançamento ainda ORÇADO não movimenta estoque e preserva o histórico do lançamento.

A interface deverá apresentar peça avulsa separadamente de peça controlada pelo estoque. A avulsa é item manual financeiro/descritivo, não exibe saldo nem ações de disponibilidade, movimentação, baixa ou conferência, e não pode ser convertida em peça de estoque. O custo interno deve aparecer separado do valor cobrado; usuários autorizados na OS podem visualizar e alterar ambos, inclusive após aprovação do orçamento. A aprovação não trava os campos. Cada mudança gera histórico com usuário, data/hora, OS, item, campo alterado e valores anterior/novo. `finance.os_costs.manage` pode ser avaliada futuramente para relatórios gerenciais, fechamento financeiro ou controle mais restrito, sem ser requisito para editar o item avulso. O cálculo de margem/lucro e o fluxo visual ainda não estão implementados.

Para valor cobrado de peça de estoque, peça avulsa, serviço/mão de obra ou outro item da OS, a interface não deve travar a edição depois da aprovação do orçamento nem exigir nova aprovação do cliente. Usuários autorizados na OS podem corrigir o valor sem motivo obrigatório. A interface deve informar que a alteração será registrada no histórico, que contém usuário, data/hora, OS, item, tipo do item, campo e valores anterior/novo.

A interface deve sinalizar pendências para peças UTILIZADAS que não foram usadas, foram removidas ou cuja OS/serviço foi cancelado, desfeito ou recusado. Usuário operacional pode reportar a não utilização; somente Administrador ou usuário autorizado pela permissão futura `stock.pending_review.resolve` pode resolver, escolhendo DISPONÍVEL, manter UTILIZADA ou BAIXADA por motivo administrativo. Não deve haver liberação automática. O encerramento da OS deve baixar as peças UTILIZADAS e ficar bloqueado enquanto houver pendência aberta. Uma tela/painel de conferência e o fluxo visual ainda não estão implementados.

### 10.8 Situação operacional da OS — interface futura

A interface deve apresentar separadamente situação operacional, status macro e resultado/status-motivo de encerramento. A abertura inicia em TRIAGEM e somente essa situação fica disponível nesse momento. As dez situações iniciais e seus padrões de atribuição constam em `docs/02-Regras-de-Negocio.md`; a atribuição padrão ao Administrador permite também incluir outros funcionários. Situações futuras podem ser atribuídas a qualquer funcionário.

Ao selecionar uma das situações NÃO AUTORIZADO, se houver orçamento, perguntar se deseja removê-lo e colocá-lo no histórico ou mantê-lo. Registrar a escolha e todas as mudanças de situação/atribuição no histórico, incluindo usuário, data/hora, OS, situação anterior/nova e funcionários atribuídos antes/depois quando aplicável. A UI ainda não está implementada.

### 10.9 Reabertura e encerramento da OS — interface futura

Exibir separadamente reabertura simples (correção textual, sem mudança de status/situação, faturamento ou pagamentos) e reabertura completa. A reabertura completa deve apresentar os efeitos aprovados: mesma OS/número, retorno a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO, cancelamento do faturamento e dos pagamentos no financeiro ativo com preservação do histórico, retorno das peças vinculadas para ORÇADA e aviso no dashboard do Administrador. Também deve estar disponível para OS CANCELADA, exceto para a OS externa encerrada como Equipamento comprado/Doado depois de criada a interna; nessa origem, oferecer somente reabertura simples textual.

Não oferecer a mudança direta FECHADA→CANCELADA ou CANCELADA→FECHADA; para OS elegíveis, a interface deve conduzir à reabertura completa para ABERTA antes da outra ação. A OS externa encerrada como Equipamento comprado/Doado, depois de criada a interna, não oferece essa reabertura completa nem mudança técnica posterior; permite somente correção textual pela reabertura simples. Alterar status macro para FECHADA/CANCELADA depende de Administrador ou permissão específica; a atribuição de situação operacional segue a autorização da OS. Regras de texto, confirmação e apresentação de exceções financeiras ainda precisam de especificação de UX.

### 10.10 Pessoa da própria empresa e OS interna — interface futura

Disponibilizar ao Administrador a configuração de uma única Pessoa ativa como representante da própria empresa. Exibir o valor atual e registrar alterações no histórico administrativo. No encerramento Equipamento comprado/Doado, informar e bloquear a operação se essa Pessoa não estiver configurada; após configurada, permitir concluir o fluxo que fecha a OS externa e abre a interna ABERTA/TRIAGEM.

Na OS interna, mostrar claramente uma área histórica de informações herdadas da OS original e separá-la dos novos dados, atribuições e itens operacionais. Exibir o vínculo de origem/destino entre as OS. A origem fechada não oferece novos movimentos técnicos nem reabertura completa; somente reabertura simples para correção textual pode ser apresentada. OS interna não oferece Equipamento comprado/Doado como resultado de encerramento. Não exibir cobrança, pagamentos, serviços cobrados, peças UTILIZADAS/BAIXADAS nem pendências da original como itens ativos da interna. Não solicitar nem registrar valor pago ao cliente nesse fluxo nesta etapa. Os textos e detalhes de interação ainda precisam de especificação de UX.

# 11. Evolução

Este documento será expandido com padrões de componentes, gerenciamento de estado, rotas, temas e biblioteca visual adotada.
