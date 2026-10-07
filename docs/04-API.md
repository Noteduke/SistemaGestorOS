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

As rotas `/contacts/phones` e `/contacts/emails` não serão usadas neste recorte, para não confundir telefone/e-mail com Tipo de Contato ou Pessoa de Contato. `PATCH`, `PUT`, `DELETE`, edição geral de Pessoa e uso funcional de `label` ficam fora. As respostas públicas não exporão o `id` interno; está aprovada a adição de `public_id` a telefone/e-mail se tecnicamente viável. Campos exatos, paginação e códigos de erro serão detalhados antes da implementação.

O `POST` de telefone exige valor com dígitos e aceita no máximo 32 dígitos normalizados. Dez dígitos, ou onze com 9 após o DDD, passam sem aviso de formato. Outros comprimentos até 32 e onze sem esse 9 recebem aviso não bloqueante, mas a primeira tentativa não grava; o operador deverá reenviar com confirmação explícita. Mais de 32 dígitos são bloqueados. O campo booleano de confirmação e o formato do aviso serão definidos no contrato técnico, com validação no Backend. O `POST` de e-mail exige `trim`, minúsculas, formato básico válido e até 254 caracteres; e-mail inválido é bloqueado. Mesmo e-mail normalizado na mesma Pessoa é bloqueado; entre Pessoas diferentes é permitido com aviso não bloqueante. Não haverá consulta de DNS ou existência real da caixa postal.

Ambos os `POST` poderão marcar o novo contato como principal; nesse caso, o anterior da mesma Pessoa e coleção será desmarcado na transação, sem alterar a outra coleção. Sem marcação, o principal existente permanece, e uma coleção pode ficar sem principal. `GET` é permitido para Pessoa inativa; `POST` é bloqueado até sua reativação. A inclusão de contato em Pessoa existente é alteração cadastral: cada `POST` depende do histórico mínimo obrigatório dos eventos `PHONE_CREATED`, `EMAIL_CREATED`, `PHONE_PRIMARY_CHANGED` e `EMAIL_PRIMARY_CHANGED` quando aplicáveis. A confirmação geral de mudança cadastral continua válida, além da confirmação específica do aviso de telefone. Nenhuma dessas rotas existe no Backend ainda. Autenticação, guards e autorização por usuário/ação permanecem pendentes; as rotas atuais e futuras não estão prontas para produção.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.
