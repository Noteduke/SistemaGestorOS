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
Os detalhes serão definidos no documento de Segurança.

O primeiro recorte técnico de Pessoas ainda não possui autenticação nem guards. Suas rotas não estão prontas para exposição operacional ou produção. Autenticação e autorização por usuário/ação deverão ser implementadas antes dessa exposição.

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

A regra aprovada não permite Pessoa inativa em novos vínculos operacionais. Essa validação, as permissões por usuário/ação e as mudanças de principalidade ainda não integram o recorte técnico de Pessoas e deverão ser aplicadas nos fluxos futuros correspondentes.

### 10.2 Primeiro recorte implementado de Pessoas

- `POST /api/v1/people`: cria Pessoa básica ativa. Exige `personType` PF/PJ e `name`; aceita `document`, `tradeName` apenas para PJ, `stateRegistration`, `municipalRegistration` e `observations` como opcionais. A resposta contém `data` e `warnings`; documento repetido retorna conflito. Sem documento, nome normalizado idêntico pode gerar aviso não bloqueante.
- `GET /api/v1/people/:publicId`: consulta uma Pessoa pelo identificador público, inclusive se estiver inativa; retorna `data` ou erro de não encontrada.
- `GET /api/v1/people`: exige `page` e `pageSize` inteiros positivos; `pageSize` é no máximo 100. Rejeita números fora do intervalo seguro e deslocamento de paginação inseguro. `search` pesquisa nome ou documento; inativos ficam ocultos por padrão e `includeInactive=true` os inclui. Retorna `data` e `pagination`, com ordenação estável por `name` e `id` interno.

As respostas de Pessoa expõem `publicId`, não o `id` interno. `name` e `tradeName` são limitados a 191 caracteres, `stateRegistration` e `municipalRegistration` a 50, e `observations` a 2000. O recorte não possui PUT, PATCH ou DELETE, nem edição, inativação/reativação ou exclusão. Telefones, e-mails, endereços, Pessoa de Contato, Aviso, histórico, Equipamentos e demais módulos continuam fora destas rotas. Contratos dos demais recortes de Cadastros ainda precisam ser detalhados.

### 10.3 Próximo recorte aprovado, ainda não implementado: telefones e e-mails

Telefones e e-mails serão sub-recursos diretos de Pessoa. Estão aprovadas para implementação futura as rotas:

| Método | Rota | Finalidade |
| --- | --- | --- |
| `POST` | `/api/v1/people/:publicId/phones` | Adicionar telefone. |
| `GET` | `/api/v1/people/:publicId/phones` | Listar telefones. |
| `POST` | `/api/v1/people/:publicId/emails` | Adicionar e-mail. |
| `GET` | `/api/v1/people/:publicId/emails` | Listar e-mails. |

As rotas `/contacts/phones` e `/contacts/emails` não serão usadas neste recorte, para não confundir telefone/e-mail com Tipo de Contato ou Pessoa de Contato. `PATCH`, `PUT`, `DELETE`, edição geral de Pessoa e uso funcional de `label` ficam fora. `label` não será aceito na entrada nem retornado na saída; permanecerá nulo/sem uso. As respostas públicas exporão `publicId` próprio do contato, se sua inclusão tecnicamente viável for confirmada, e nunca o `id` interno. A paginação seguirá `page` e `pageSize`, com `data` e `pagination`, em linha com a API básica de Pessoas.

#### Confirmações e avisos dos POST

Adicionar telefone ou e-mail a Pessoa existente é alteração cadastral. **Todo `POST` exige `confirmPersonChange: true`**. Sem esse valor verdadeiro, não grava contato nem histórico e retorna `409 PERSON_CHANGE_CONFIRMATION_REQUIRED`. O campo torna a confirmação explícita no contrato, mas não substitui autenticação nem comprova sozinho que a mensagem foi apresentada ao operador.

Telefone normalizado sem dígitos ou com mais de 32 dígitos é inválido. Dez dígitos, ou onze com 9 após o DDD, passam sem aviso de formato. Outros comprimentos entre 1 e 32, ou onze sem esse 9, exigem também `confirmNonstandardPhone: true`. Sem a confirmação específica, a API retorna `409 PHONE_CONFIRMATION_REQUIRED`, incluindo mensagem, número normalizado e aviso `PHONE_NONSTANDARD_FORMAT`, **sem gravar contato ou evento**. No reenvio, ambos `confirmPersonChange: true` e `confirmNonstandardPhone: true` são necessários; após nova validação, a API grava e registra o histórico. A confirmação não permite ultrapassar 32 dígitos.

E-mail é normalizado com `trim` e minúsculas, limitado a 254 caracteres e validado em formato básico: exatamente um `@`, partes local e domínio não vazias, separador válido no domínio e ausência de espaços/caracteres de controle. Não há consulta de DNS ou verificação da caixa postal. E-mail inválido bloqueia. Repetição do mesmo e-mail normalizado na própria Pessoa retorna `409 DUPLICATE_PERSON_EMAIL`, sem gravação. Repetição em outra Pessoa **grava no primeiro envio válido** e retorna `201` com aviso não bloqueante `EMAIL_SHARED_ACROSS_PEOPLE`, sem confirmação extra. Mensagem sugerida: “Este e-mail também pode constar em outro cadastro.” O aviso não revela nome, `publicId`, quantidade, estado nem outros dados da outra Pessoa; ainda assim, pode indicar que há outro cadastro e requer autenticação/guards antes de exposição em produção.

#### Respostas e efeitos por rota

| Rota | Entrada planejada | Sucesso | Erros e efeitos |
| --- | --- | --- | --- |
| `POST /api/v1/people/:publicId/phones` | `number`; `isPrimary` opcional; `confirmPersonChange: true`; `confirmNonstandardPhone: true` apenas quando fora do padrão. | `201` com `data: { publicId, number, isPrimary, createdAt }` e `warnings` quando houver. | `400` para entrada inválida/sem dígitos/acima de 32; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `PHONE_CONFIRMATION_REQUIRED`. Gera `PHONE_CREATED` e, se o principal efetivo mudar, `PHONE_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/phones` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, number, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |
| `POST /api/v1/people/:publicId/emails` | `address`; `isPrimary` opcional; `confirmPersonChange: true`. | `201` com `data: { publicId, address, isPrimary, createdAt }` e `warnings` quando houver. | `400` para e-mail inválido/acima de 254; `404 PERSON_NOT_FOUND`; `409 PERSON_INACTIVE`, `PERSON_CHANGE_CONFIRMATION_REQUIRED` ou `DUPLICATE_PERSON_EMAIL`. Gera `EMAIL_CREATED` e, se o principal efetivo mudar, `EMAIL_PRIMARY_CHANGED`, inclusive de nulo para o primeiro principal. |
| `GET /api/v1/people/:publicId/emails` | `page`, `pageSize`. | `200` com `data` paginada de `{ publicId, address, isPrimary, createdAt }` e `pagination`. | `404 PERSON_NOT_FOUND`; Pessoa ativa ou inativa pode consultar. Não gera histórico. |

Marcar o novo contato como principal desmarca o anterior **da mesma Pessoa e coleção**, na mesma transação; telefone e e-mail são independentes. Sem `isPrimary: true`, o principal anterior permanece e nenhuma coleção é obrigada a ter principal. O histórico mínimo será persistido atomicamente com a inclusão e a troca; falha ao registrar evento cancela toda a operação. A futura tabela `person_contact_events` ainda não existe e não terá rota pública neste recorte. Nenhuma das quatro rotas foi implementada. Autenticação, guards e autorização por usuário/ação permanecem pendentes; as rotas atuais e futuras não estão prontas para produção.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.
