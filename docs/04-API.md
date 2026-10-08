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

Será centralizada no backend.
O modelo aprovado para o aplicativo web é sessão opaca mantida no servidor; o cookie contém apenas o segredo opaco, e o banco deverá armazenar somente seu hash. A sessão expira após 8 horas de inatividade: cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. Logout revoga somente a sessão atual. JWT e OIDC ficam fora do recorte atual. O sistema é considerado somente de uso interno e o Backend não está pronto para exposição externa operacional; não se deve confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo é proibido até 2FA e fronteira confiável estarem implementados. Proxy reverso, VPN, túnel ou publicação externa futura exige nova decisão documental.

Como a autenticação usa cookie, métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigirão proteção CSRF, inclusive `POST /api/v1/auth/login`; `GET` não exige token. Antes do login, o cliente obterá contexto temporário pela rota pública futura `GET /api/v1/auth/csrf`, que retorna o token e grava identificador opaco temporário em cookie `HttpOnly`, com validade de 15 minutos. O cliente enviará o token em `X-CSRF-Token`. Após login bem-sucedido, o contexto pré-login será descartado e a sessão autenticada passará a usar seu próprio controle CSRF. A estrutura física do contexto será definida na modelagem futura.

As rotas atuais de Pessoas não possuem autenticação nem guards e não estão prontas para exposição operacional ou produção. No primeiro recorte de Auth, todas exigirão autenticação e autorização por ação. Ausência de permissão nega acesso; uma rota protegida sem política explícita deve falhar fechada. O Backend decide autorização. O Frontend não concede acesso nem substitui essa verificação.

| Rota atual | Política inicial prevista |
| --- | --- |
| `POST /api/v1/people` | `people.create` |
| `GET /api/v1/people` | `people.read` |
| `GET /api/v1/people/:publicId` | `people.read` |
| `POST /api/v1/people/:publicId/phones` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/phones` | `people.contacts.read` |
| `POST /api/v1/people/:publicId/emails` | `people.contacts.add` |
| `GET /api/v1/people/:publicId/emails` | `people.contacts.read` |

No primeiro recorte de Auth, estão previstas `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` e `GET /api/v1/auth/me`. A rota de CSRF e o login são públicas, mas login exige token CSRF; respostas de falha não distinguem username existente de inexistente. Logout exige autenticação e CSRF e encerra somente a sessão atual; `/me` exige autenticação. Rotas públicas deverão ser explicitamente identificadas; não se presume pública nenhuma rota de negócio. O primeiro recorte não terá CRUD HTTP de usuários: o uso inicial será restrito ao Administrador bootstrapado. Criação e gestão de usuários por API ficam para recorte posterior.

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
- `GET /api/v1/people`: exige `page` e `pageSize` inteiros positivos; `pageSize` é no máximo 100. Rejeita números fora do intervalo seguro e deslocamento de paginação inseguro. `search` pesquisa nome ou documento; inativos ficam ocultos por padrão e `includeInactive=true` os inclui. Retorna `data` e `pagination`, com ordenação estável por `name` e `id` interno.

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

Marcar o novo contato como principal desmarca o anterior **da mesma Pessoa e coleção**, na mesma transação; telefone e e-mail são independentes. Sem `isPrimary: true`, o principal anterior permanece e nenhuma coleção é obrigada a ter principal. A migration `20261007183000_person_contacts` foi aplicada; o histórico mínimo é persistido atomicamente com a inclusão e a troca, e falha ao registrar evento cancela toda a operação. `person_contact_events` não possui rota pública. A migration cria FKs para Pessoa e para cada tabela de contato, mas não possui constraint CHECK que obrigue exatamente um entre `phone_id` e `email_id` ou valide a coerência de `event_type` com a FK; a coerência é aplicada pelo service e uma constraint física pode ser avaliada futuramente. Autenticação, guards e autorização por usuário/ação permanecem pendentes; as rotas não estão prontas para produção.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.
