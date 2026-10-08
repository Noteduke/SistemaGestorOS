# API
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir o padrão oficial para todas as APIs do Sistema Gestor OS.

# 2. Arquitetura

- API REST.
- Backend em NestJS.
- Comunicação via HTTPS.
- JSON como formato padrão.

# 3. Versionamento

A API deverá suportar versionamento (ex.: /api/v1).

# 4. Autenticação

O primeiro recorte de autenticação e autorização foi implementado no Backend, já foi versionado em commit local, ainda não enviado a origin nem liberado para produção. Usa sessão opaca mantida no servidor; o cookie contém apenas o segredo opaco e o banco armazena seu hash. A sessão expira após 8 horas de inatividade: cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. Logout revoga somente a sessão atual. JWT e OIDC ficam fora do recorte atual. A migration `20261008120000_auth_foundation` foi aplicada no banco principal `gestor_os`; o bootstrap local foi concluído, com um Administrador ativo e 24 permissões, sem `admin.full`, `system.admin` ou perfil/usuário `Master`. A segunda execução do bootstrap aborta antes dos prompts de credenciais se já existe Administrador ativo; o controle transacional contra concorrência permanece no service. Os testes HTTP autenticados principais passaram localmente. O processo local escuta apenas em `127.0.0.1`. O sistema é considerado somente de uso interno e não está pronto para exposição externa operacional; não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo é proibido até 2FA e fronteira confiável estarem implementados. Proxy reverso, VPN, túnel ou publicação externa futura exige nova decisão documental. Uma credencial administrativa foi exposta acidentalmente durante teste manual e, por decisão de Marcos, não foi trocada nesta etapa; ela deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. O fluxo definitivo de troca/reset segue pendente.

Como a autenticação usa cookie, métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem proteção CSRF, inclusive `POST /api/v1/auth/login`; `GET` não exige token. Antes do login, o cliente obtém contexto temporário pela rota pública `GET /api/v1/auth/csrf`, que retorna o token e grava identificador opaco temporário em cookie `HttpOnly`, com validade de 15 minutos. O cliente envia o token em `X-CSRF-Token`. Após login bem-sucedido, o contexto pré-login é descartado e a sessão autenticada passa a usar seu próprio controle CSRF. O contexto é armazenado pela entidade Prisma `PreAuthCsrfContext`; sua tabela já existe no banco principal após a aplicação da migration de Auth.

As sete rotas atuais de Pessoas estão protegidas no código por autenticação e autorização por ação. Ausência de permissão nega acesso; uma rota protegida sem política explícita falha fechada. O Backend decide autorização. O Frontend não concede acesso nem substitui essa verificação. A migration e o seed já foram concluídos no banco principal; o bootstrap local e os principais testes autenticados foram concluídos, sem liberação para produção.

| Rota atual | Permissão exigida no código |
| --- | --- |
| `POST /api/v1/people` | `people.create` |
| `GET /api/v1/people` | `people.read` |
| `GET /api/v1/people/:publicId` | `people.read` |
| `POST /api/v1/people/:publicId/phones` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/phones` | `people.contacts.read` |
| `POST /api/v1/people/:publicId/emails` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/emails` | `people.contacts.read` |

O primeiro recorte implementa `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` e `GET /api/v1/auth/me`. Testes locais confirmaram `GET /auth/csrf` 200, login bem-sucedido, `/auth/me` autenticado 200, logout 204 e `/auth/me` após logout 401. Login e `/auth/me` retornam `data` com `publicId`, `username`, `isAdmin`, permissões efetivas, token CSRF da sessão e prazo de expiração; não expõem o `id` interno, hash de senha ou segredo de sessão. A rota de CSRF e o login são públicas, mas login exige token CSRF; falhas de login têm resposta genérica e não distinguem username existente de inexistente. Logout exige autenticação e CSRF e encerra somente a sessão atual; `/me` exige autenticação. Rotas públicas são identificadas explicitamente; não se presume pública nenhuma rota de negócio. O recorte não tem CRUD HTTP de usuários: o uso inicial é restrito ao Administrador bootstrapado. Criação e gestão de usuários por API ficam para recorte posterior.

Em termos gerais, requisição sem sessão autenticada recebe `401`; ausência de permissão ou falha de CSRF recebe `403`; falha de login usa resposta genérica sem indicar se o username existe. O contrato específico e os códigos por endpoint permanecem descritos nas seções correspondentes abaixo.

# 5. Padrão de Endpoints

Recursos utilizarão substantivos.

Exemplos:
GET /clientes
POST /clientes
PUT /clientes/{id}
DELETE /clientes/{id}

# 6. Respostas

Todas as respostas deverão seguir um padrão único.

Sucesso:
- dados
- paginação (quando aplicável)

Erro:
- código
- mensagem
- detalhes

# 7. Paginação

Listagens deverão suportar paginação.

# 8. Filtros

Filtros deverão ser padronizados para todos os módulos.

# 9. Upload de Arquivos

Uploads serão tratados por endpoints específicos.

# 10. Documentação

A API deverá possuir documentação centralizada e atualizada.

## 10.1 Regras de domínio para Cadastros

O Backend/API aplica as regras de duplicidade e normalização aprovadas em `docs/02-Regras-de-Negocio.md`. No primeiro recorte de Pessoas, CPF/CNPJ informado é validado e duplicidade bloqueia; sem documento, nome normalizado exatamente igual retorna aviso não bloqueante. Comparação por telefone/e-mail e regras de serial de Equipamento permanecem para os respectivos recortes futuros.

Para documentos de Pessoa, a API básica valida CPF numérico para PF e CNPJ numérico ou alfanumérico oficial para PJ. CPF aceita 11 dígitos ou máscara completa `000.000.000-00` na entrada, após remover espaços externos; letras e símbolos indevidos são rejeitados, e o valor é persistido somente com números. CNPJ é persistido sem pontuação e em maiúsculas, preservando letras do padrão oficial. Validade matemática, compatibilidade com Tipo de Pessoa e unicidade são verificadas no Backend.

A regra aprovada não permite Pessoa inativa em novos vínculos operacionais. Essa validação geral e as permissões por usuário/ação ainda deverão ser aplicadas nos fluxos futuros correspondentes. Nas rotas de contatos, a troca de principalidade já é implementada em transação.

### 10.2 Primeiro recorte implementado de Pessoas

- `POST /api/v1/people`: cria Pessoa básica ativa. Exige `personType` PF/PJ e `name`; aceita `document`, `tradeName` apenas para PJ, `stateRegistration`, `municipalRegistration` e `observations` como opcionais. A resposta contém `data` e `warnings`; documento repetido retorna conflito. Sem documento, nome normalizado idêntico pode gerar aviso não bloqueante.
- `GET /api/v1/people/:publicId`: consulta uma Pessoa pelo identificador público, inclusive se estiver inativa; retorna `data` ou erro de não encontrada.
- `GET /api/v1/people`: exige `page` e `pageSize` inteiros positivos; não há valores padrão automáticos; ausência ou valor inválido retorna `400 INVALID_PAGINATION`. `pageSize` é no máximo 100. Rejeita números fora do intervalo seguro e deslocamento de paginação inseguro. `search` pesquisa nome ou documento; inativos ficam ocultos por padrão e `includeInactive=true` os inclui. Retorna `data` e `pagination`, com ordenação estável por `name` e `id` interno. Teste local confirmou que a chamada sem paginação é rejeitada e `?page=1&pageSize=20` retorna 200 para Administrador.

As respostas de Pessoa expõem `publicId`, não o `id` interno. `name` e `tradeName` são limitados a 191 caracteres, `stateRegistration` e `municipalRegistration` a 50, e `observations` a 2000. O recorte não possui PUT, PATCH ou DELETE, nem edição, inativação/reativação ou exclusão. Telefones, e-mails, endereços, Pessoa de Contato, Aviso, histórico, Equipamentos e demais módulos continuam fora destas rotas. Contratos dos demais recortes de Cadastros ainda precisam ser detalhados.

### 10.3 Recorte implementado: telefones e e-mails de Pessoa

Telefones e e-mails são sub-recursos diretos de Pessoa. As rotas implementadas são:

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/api/v1/people/:publicId/phones` | Adicionar telefone. |
| `GET` | `/api/v1/people/:publicId/phones` | Listar telefones. |
| `POST` | `/api/v1/people/:publicId/emails` | Adicionar e-mail. |
| `GET` | `/api/v1/people/:publicId/emails` | Listar e-mails. |

As rotas `/contacts/phones` e `/contacts/emails` não são usadas, para não confundir telefone/e-mail com Tipo de Contato ou Pessoa de Contato. `PATCH`, `PUT`, `DELETE`, edição geral de Pessoa e uso funcional de `label` ficam fora. `label` não é aceito na entrada nem retornado na saída; permanece nulo/sem uso. As respostas públicas expõem `publicId` próprio do contato e nunca o `id` interno. A listagem exige `page` e `pageSize`, com `data` e `pagination`.

#### Confirmações e avisos dos POST

Adicionar telefone ou e-mail a Pessoa existente é alteração cadastral. **Todo `POST` exige `confirmPersonChange: true`**. Sem esse valor verdadeiro, não grava contato nem histórico e retorna `409 PERSON_CHANGE_CONFIRMATION_REQUIRED`. O campo torna a confirmação explícita no contrato, mas não substitui autenticação nem comprova sozinho que a mensagem foi apresentada ao operador.

Telefone normalizado sem dígitos ou com mais de 32 dígitos é inválido. Dez dígitos, ou onze com 9 após o DDD, passam sem aviso de formato. Outros comprimentos entre 1 e 32, ou onze sem esse 9, exigem também `confirmNonstandardPhone: true`. Sem a confirmação específica, a API retorna `409 PHONE_CONFIRMATION_REQUIRED`, incluindo mensagem, número normalizado e aviso `PHONE_NONSTANDARD_FORMAT`, **sem gravar contato ou evento**. No reenvio, ambos `confirmPersonChange: true` e `confirmNonstandardPhone: true` são necessários; após nova validação, a API grava e registra o histórico. A confirmação não permite ultrapassar 32 dígitos.

E-mail é convertido para minúsculas após `trim`, deve ser ASCII e tem limite de 254 caracteres. A parte local tem até 64 caracteres, aceita letras minúsculas, dígitos e `_ % + -`, com pontos somente entre segmentos não vazios. O domínio tem até 253 caracteres e pelo menos dois rótulos separados por ponto; cada rótulo tem 1 a 63 caracteres, aceita letras minúsculas, dígitos ou hífen, e começa e termina com letra ou dígito. Exige exatamente um `@`. Não há consulta DNS nem verificação da caixa postal. E-mail inválido retorna `400 INVALID_EMAIL`. Repetição do mesmo e-mail normalizado na própria Pessoa retorna `409 DUPLICATE_PERSON_EMAIL`, sem gravação. Repetição em outra Pessoa **grava no primeiro envio válido** e retorna `201` com aviso não bloqueante `EMAIL_SHARED_ACROSS_PEOPLE`, sem confirmação extra. Mensagem: “Este e-mail também está cadastrado para outra Pessoa.” O aviso não revela nome, `publicId`, quantidade, estado nem outros dados da outra Pessoa; ainda assim, pode indicar que há outro cadastro e requer autenticação/guards antes de exposição em produção.

#### Respostas e efeitos por rota

| Rota | Entrada | Sucesso | Erros e efeitos |
| --- | --- | --- | --- |
| `POST /api/v1/people/:publicId/phones` | `number`; `isPrimary` opcional; `confirmPersonChange: true`; `confirmNonstandardPhone: true` apenas quando fora do padrão. | `201` com `data: { publicId, number, isPrimary, createdAt }` e `warnings` quando houver. | `400` para entrada inválida/sem dígitos/acima de 32; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `PHONE_CONFIRMATION_REQUIRED`. Gera `PHONE_CREATED` e, se o principal efetivo mudar, `PHONE_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/phones` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, number, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |
| `POST /api/v1/people/:publicId/emails` | `address`; `isPrimary` opcional; `confirmPersonChange: true`. | `201` com `data: { publicId, address, isPrimary, createdAt }` e `warnings` quando houver. | `400` para e-mail inválido/acima de 254; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `DUPLICATE_PERSON_EMAIL`. Gera `EMAIL_CREATED` e, se o principal efetivo mudar, `EMAIL_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/emails` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, address, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |

Marcar o novo contato como principal desmarca o anterior **da mesma Pessoa e coleção**, na mesma transação; telefone e e-mail são independentes. Sem `isPrimary: true`, o principal anterior permanece e nenhuma coleção é obrigada a ter principal. A migration `20261007183000_person_contacts` foi aplicada; o histórico mínimo é persistido atomicamente com a inclusão e a troca, e falha ao registrar evento cancela toda a operação. `person_contact_events` não possui rota pública. A migration cria FKs para Pessoa e para cada tabela de contato, mas não possui constraint CHECK que obrigue exatamente um entre `phone_id` e `email_id` ou valide a coerência de `event_type` com a FK; a coerência é aplicada pelo service e uma constraint física pode ser avaliada futuramente. Auth e guards estão implementados no código; a migration e o seed de permissões foram aplicados no banco principal, o bootstrap local foi concluído e os testes autenticados principais passaram. Testes específicos de criação de contato e autoria em `person_contact_events.user_id` permanecem pendentes.

### 10.4 Peças em Ordem de Serviço — contrato futuro

O contrato ainda não está implementado. Deve refletir os estados DISPONÍVEL, ORÇADA, UTILIZADA e BAIXADA. ORÇADA não altera estoque; recusa/cancelamento enquanto a peça permanece ORÇADA só altera o status do lançamento e preserva histórico. Usuários autorizados na OS podem mudar ORÇADA para UTILIZADA, registrando usuário, data/hora, OS, peça, status anterior/novo e motivo quando aplicável; a peça fica indisponível para outra OS ou venda.

O contrato deve distinguir peças vinculadas ao estoque de peças avulsas. Peça avulsa é item manual financeiro/descritivo da OS, não integra o estoque nem o ciclo de status acima, não cria pendência de conferência e não pode ser convertida em peça de estoque. Usuários autorizados na OS podem visualizar e alterar o custo interno e o valor cobrado, inclusive após aprovação do orçamento; não há bloqueio automático. Toda alteração deve gerar histórico com usuário, data/hora, OS, item, campo alterado e valor anterior/novo. `finance.os_costs.manage` poderá ser avaliada futuramente para relatórios gerenciais, fechamento financeiro ou controle mais restrito, mas não é requisito para essas operações na OS. O contrato e a implementação da API permanecem futuros.

Para qualquer item cobrado da OS — peça de estoque, peça avulsa, serviço/mão de obra ou outro — a API futura deve permitir que usuário autorizado na OS altere o valor mesmo depois da aprovação do orçamento. Não deve exigir nova aprovação do cliente, bloquear pela aprovação anterior nem exigir motivo obrigatório. Cada alteração deve registrar usuário, data/hora, OS, item, tipo do item, campo alterado e valores anterior/novo. Essa decisão trata dos valores cobrados; o custo interno da peça avulsa também permanece editável conforme a regra acima e deve gerar histórico.

Para peça UTILIZADA não usada, removida da OS ou ligada a serviço/OS cancelado, desfeito ou recusado, a API futura deve criar pendência de conferência. Técnico/usuário operacional pode informar não utilização, mas apenas Administrador ou usuário com a permissão futura sugerida `stock.pending_review.resolve` poderá resolver a pendência, confirmando DISPONÍVEL, mantendo UTILIZADA ou marcando BAIXADA por motivo administrativo. O encerramento da OS deve alterar automaticamente para BAIXADA suas peças UTILIZADAS e ser recusado enquanto houver pendência aberta. Peças ORÇADAS não são baixadas. Endpoints, contratos de erro, políticas técnicas, tabelas e implementação seguem futuros.

### 10.5 Situação e encerramento da OS — contrato futuro

A API futura deve tratar separadamente situação operacional, status macro ABERTA/FECHADA/CANCELADA e resultado/status-motivo de encerramento. A abertura inicia em TRIAGEM e não disponibiliza outra situação operacional. Deve suportar a lista inicial, as atribuições a um ou mais funcionários e os padrões ao Administrador definidos em `docs/02-Regras-de-Negocio.md`; padrões não impedem outras atribuições e situações futuras podem ser atribuídas a qualquer funcionário.

Ao salvar NÃO AUTORIZADO - REMONTAR EQUIPAMENTO ou NÃO AUTORIZADO - PRONTO PRA ENTREGA, se houver orçamento, o contrato deve permitir perguntar se ele será removido e colocado no histórico ou mantido. A escolha gera histórico. Mudanças de situação/atribuição também registram usuário, data/hora, OS, situação anterior/nova e funcionários atribuídos antes/depois quando aplicável. Não há endpoints nem modelo de persistência aprovados nesta etapa.

### 10.6 Reabertura e mudanças de status macro — contrato futuro

Após a abertura, usuários autorizados na OS podem alterar livremente a situação operacional para qualquer situação ativa; não existe sequência rígida. Encerramento continua bloqueado por pendência aberta de conferência de estoque. Alterar o status macro para FECHADA ou CANCELADA exige Administrador ou permissão específica futura (`os.close` ou `os.cancel`); não permitir transição direta FECHADA→CANCELADA nem CANCELADA→FECHADA.

A reabertura simples (`os.reopen_text`) permite correções textuais sem alterar situação, status macro, faturamento ou pagamentos, e gera histórico. A reabertura completa (`os.reopen_full`) mantém a mesma OS/número, retorna a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO, cancela faturamento e retira pagamentos do financeiro ativo por cancelamento auditável. Aplica-se também a OS CANCELADA, exceto à OS externa encerrada como Equipamento comprado/Doado depois de criada sua OS interna; essa origem admite somente reabertura simples textual. Deve preservar histórico, registrar o motivo “reabertura completa da OS”, cancelar lançamentos financeiros vinculados sem exclusão física de seus rastros, reclassificar peças vinculadas como ORÇADA e notificar o dashboard do Administrador.

Para pagamento previamente registrado, o evento deve referenciar usuário, data/hora, OS, valor, forma quando houver e lançamento anterior. Para peças antes UTILIZADAS/BAIXADAS, preservar estado anterior e registrar retorno a ORÇADA. Operações sobre faturamento, financeiro, itens de estoque, OS e histórico precisarão de consistência transacional; o contrato técnico, tratamento de títulos liquidados/documento fiscal e movimentos físicos de peças baixadas ainda não estão definidos. Nenhum endpoint, tabela ou migration está aprovado por esta documentação.

### 10.7 Encerramento Equipamento comprado/Doado — contrato futuro

O encerramento de OS externa com esse resultado deve validar que existe uma única Pessoa ativa configurada como representante da própria empresa e elegível como titular de equipamento. Sem ela, rejeitar o encerramento e informar que a configuração administrativa é obrigatória. Somente Administrador pode definir, remover ou trocar a Pessoa configurada; a alteração gera histórico administrativo.

O fluxo aprovado fecha a OS externa, transfere a titularidade, cria OS interna ligada ao mesmo equipamento em ABERTA/TRIAGEM e persiste referências recíprocas entre as OS. As ações devem manter histórico com usuário/data/hora; a consistência contra conclusão parcial entre fechamento, transferência e criação será definida no desenho técnico. A nova OS identifica informações herdadas separadas de seus campos e itens operacionais; cobrança, pagamento, serviços cobrados, peças UTILIZADAS/BAIXADAS e pendências abertas da origem não são criados como registros ativos na interna.

A OS externa original não aceita movimentos técnicos após a geração da interna e só pode receber reabertura simples textual. A OS interna segue os fluxos gerais, exceto que não pode usar novamente o resultado Equipamento comprado/Doado. Não se registra valor pago ao cliente, forma de pagamento, saída financeira ou compra formal nesta etapa. Fiscal, pagamento futuro, modelo dos dados herdados, nomes/rotas e semântica de falha parcial seguem pendentes; nenhum endpoint, modelo físico ou migration está aprovado.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.
