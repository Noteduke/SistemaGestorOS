# DECISÕES ARQUITETURAIS
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Ativo

# 1. Objetivo

Registrar oficialmente todas as decisões arquiteturais permanentes do Sistema Gestor OS.

Cada decisão deverá possuir um identificador único (DA-XXX), motivação, alternativas avaliadas, impactos e data de aprovação.

---

# DA-001

## Título
Sistema 100% Web.

## Situação
Aprovada.

## Motivação
Permitir acesso de qualquer computador da empresa sem instalação local, facilitar manutenção e futuras evoluções.

## Alternativas avaliadas
- Desktop
- Híbrido

## Consequências
Todo acesso ocorrerá por navegador.

---

# DA-002

## Título
Frontend em React + TypeScript.

## Situação
Aprovada.

## Motivação
Separação clara entre interface e regras de negócio.

---

# DA-003

## Título
Backend em NestJS.

## Situação
Aprovada.

## Motivação
Arquitetura modular, escalabilidade e integração com TypeScript.

---

# DA-004

## Título
Prisma como ORM.

## Situação
Aprovada.

## Motivação
Versionamento de migrations, tipagem e integração com MySQL.

---

# DA-005

## Título
Banco de Dados MySQL 8.

## Situação
Aprovada.

## Motivação
Tecnologia já dominada pela equipe e aderente aos requisitos do projeto.

---

# DA-006

## Título
Documentação antes da implementação.

## Situação
Aprovada.

## Motivação
Reduzir retrabalho e garantir consistência entre regras de negócio e código.

---

# DA-017

## Título
Camada de Persistência.

## Situação
Aprovada na conversa original do projeto; decisão histórica transcrita para a documentação oficial.

## Contexto
A decisão histórica define a fronteira de acesso do Backend ao banco de dados.

## Problema
Evitar acessos paralelos ao banco e SQL espalhado pela aplicação.

## Alternativas avaliadas
Não recuperadas da fonte histórica.

## Decisão adotada
Toda comunicação entre o Backend e o banco de dados deverá ocorrer através do Prisma ORM. Não será permitido acesso direto ao banco por SQL espalhado pela aplicação. O fluxo é Backend → Prisma → MySQL. Módulos de negócio não deverão criar conexões MySQL próprias nem utilizar diretamente o driver empregado internamente por `@prisma/adapter-mariadb`.

## Justificativa
Não recuperada da fonte histórica.

## Impactos
Prisma constitui a fronteira oficial de persistência do Backend. A organização de `PrismaModule`, `PrismaService`, repositories opcionais, SQL raw excepcional e transações está detalhada nos documentos de arquitetura, banco de dados e padrões de código.

## Data de aprovação
Não recuperada da fonte histórica.

## Responsável
Não informado na fonte histórica disponível.

## Procedência
Conversa original do projeto; o conteúdo conceitual da decisão foi confirmado para esta transcrição.

---

# DA-018

## Título
Autenticação e autorização do aplicativo web.

## Situação
Aprovada em 08/10/2026. Primeiro recorte implementado no Backend, ainda não versionado. Migration criada e pendente no banco principal; Auth não está liberado para produção.

## Contexto
O Backend NestJS possui o primeiro recorte de autenticação, guards e autorização por usuário/ação, incluindo proteção das sete rotas de Pessoas. A implementação foi validada em banco isolado, mas ainda não foi versionada. A migration de Auth está pendente no banco principal, então a proteção ainda depende de migration, seed, bootstrap e validação nesse banco antes de operação real.

## Problema
Definir uma base de autenticação e autorização compatível com as regras de usuários, sessões, auditoria e evolução dos módulos, sem transformar designações operacionais em perfis rígidos nem confiar a segurança ao Frontend.

## Alternativas avaliadas
- Sessão opaca mantida no servidor: escolhida para o aplicativo web e revogação centralizada.
- JWT com tokens de acesso/renovação: não adotado neste recorte; não há necessidade aprovada que justifique acrescentar ciclo de refresh e revogação de tokens.
- Provedor externo de identidade OIDC: fora do escopo atual; nenhum provedor foi aprovado.
- Papéis fixos ou permissões granulares diretas: papéis rígidos não atendem à regra aprovada; concessões diretas por usuário/ação foram escolhidas, com Administrador como autoridade máxima.

## Decisão adotada
- O aplicativo web usa sessão opaca mantida no servidor. O cookie contém somente o segredo opaco e o banco persiste somente seu hash. A sessão expira após 8 horas de inatividade; cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. A sessão pode ser revogada. Sessões simultâneas são permitidas e auditadas; logout revoga somente a sessão atual. Cookies usam `HttpOnly`, `Secure` em ambiente HTTPS e `SameSite` adequado. JWT e OIDC ficam fora do recorte atual.
- O sistema é considerado somente de uso interno neste momento e o Backend não está pronto para exposição externa operacional. Acesso externo fica proibido até 2FA e fronteira confiável implementados. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Proxy reverso, VPN, túnel ou publicação externa exigirá nova decisão documental.
- Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem CSRF, inclusive login; `GET` não exige token. Antes do login, a rota pública `GET /api/v1/auth/csrf` gera contexto temporário, devolve o token e grava identificador opaco em cookie `HttpOnly`, válido por 15 minutos. O login exige o token em `X-CSRF-Token`; após sucesso, descarta o contexto pré-login e usa controle CSRF próprio da sessão autenticada. `PreAuthCsrfContext` é o modelo Prisma que armazena esse contexto.
- Username é obrigatório e único, com `trim`, armazenamento em minúsculas, 3 a 50 caracteres e regex `^[a-z0-9._-]{3,50}$`; e-mail de Pessoa não é login. Senhas têm mínimo de 10 caracteres e usam Argon2id pelo pacote `argon2`, inicialmente com parâmetros seguros padrão da biblioteca, sujeitos a validação/ajuste no ambiente; nunca registrar senha, hash ou parâmetros sensíveis. Não há troca periódica obrigatória. Recuperação fica fora do primeiro recorte.
- Falhas são contadas por username normalizado, inclusive para nomes inexistentes. Ao atingir cinco, registrar evento no Log Administrativo, sem bloquear a conta nem impedir novas tentativas. Login bem-sucedido zera o contador de usuário existente; username inexistente não cria usuário nem contador persistente e gera somente eventos de tentativa. A notificação inicial é exclusivamente pelo Log Administrativo, sem e-mail. Registrar IP remoto, origem e user-agent quando disponíveis sem revelar se a conta existe.
- Haverá um único Log Administrativo para eventos administrativos e de segurança, com retenção inicialmente indefinida e sem exclusão automática neste primeiro desenho. Eventos mínimos: login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado e permissão concedida/revogada.
- O primeiro Administrador será criado manualmente por comando/script interno controlado. O bootstrap aborta se já existir Administrador ativo, não promove conta existente, usa transação com controle efetivo de concorrência para impedir bootstraps simultâneos e registra o evento no Log Administrativo. O primeiro recorte não terá CRUD HTTP de usuários; o uso inicial será restrito ao Administrador bootstrapado. Usuários são inativados, não excluídos fisicamente, e qualquer alteração que deixe o sistema sem Administrador ativo deve ser bloqueada.
- `isAdmin` representa o nível máximo. Permissões granulares são atribuídas diretamente por usuário/ação, sem “Master”, `admin.full`, `system.admin` ou perfis rígidos obrigatórios de Técnico/Usuário comum. Administrador tem autoridade máxima no serviço de política, mas cada rota exige política explícita. Ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. O Backend é a autoridade; o Frontend somente reflete permissões e respostas da API.
- `person_contact_events.user_id` é opcional e a escrita do ator é atômica com a alteração do contato; eventos existentes permanecem com `NULL`. A migration criada define FK `ON DELETE SET NULL` e está pendente no banco principal.
- As sete rotas atuais de Pessoas estão protegidas no código por autenticação e autorização. Essa proteção só estará operacional no banco principal depois de aplicar a migration, executar seed e bootstrap, e validar o banco.

## Justificativa
O modelo conserva revogação no servidor e atende ao aplicativo web próprio. Permissões por usuário/ação preservam a flexibilidade aprovada e o Log Administrativo único evita duplicar trilhas. O primeiro recorte está implementado no código e no schema Prisma; o banco principal ainda não recebeu a migration.

## Impactos
O schema Prisma e a migration criada `20261008120000_auth_foundation` definem `User`, `Permission`, `UserPermission`, `UserSession`, `PreAuthCsrfContext`, `AdminAuditLog` e a referência opcional `PersonContactEvent.userId`. A migration foi executada em SQL diretamente no banco isolado `gestor_os_shadow` para validação, sem registro em `_prisma_migrations`; no banco principal ela continua pendente. O processo local escuta apenas em `127.0.0.1`. O bootstrap foi revisado no código, mas ainda não testado em terminal interativo real, nem houve teste real de concorrência entre bootstraps. O primeiro recorte não tem CRUD HTTP de usuários; o Administrador bootstrapado é a conta inicial. Frontend, aplicação e validações no banco principal, seed de permissões, bootstrap real, CRUD HTTP de usuários, recuperação de senha, 2FA e fronteira externa continuam pendentes. Acesso externo é proibido. O `npm install` reportou quatro vulnerabilidades high pendentes de avaliação.

Não há endpoints de inativação ou rebaixamento de Administrador neste recorte. A aplicação da regra que impede deixar o sistema sem Administrador ativo deverá ser validada quando essas operações forem implementadas.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Pacotes inicial e complementar de decisões de Autenticação e Autorização aprovados por Marcos em 08/10/2026.

## Complemento aprovado em 08/10/2026

Este complemento atualiza a decisão adotada acima com as regras operacionais de username, falhas de autenticação, CSRF pré-login, pacote Argon2id, nível `isAdmin`, bootstrap concorrente, limite de uso inicial ao Administrador bootstrapado e autoria opcional de contatos. O primeiro recorte está implementado no Backend e no schema Prisma; a migration está pendente no banco principal. Os endpoints Auth existem no código, mas não há CRUD HTTP de usuários. O bootstrap foi revisado, ainda não exercitado em terminal interativo real, e a concorrência real não foi testada.

---

# Lacunas da numeração histórica

DA-007 a DA-016 ainda não estão registradas neste documento. Decisões históricas correspondentes, se existirem, precisam ser recuperadas e consolidadas. DA-001 a DA-006 e DA-017 preservam seus identificadores; as lacunas não foram preenchidas nem as decisões existentes renumeradas.

---

# Estrutura de novas decisões

Toda nova decisão deverá seguir o formato:

- Identificador (DA-XXX)
- Título
- Contexto
- Problema
- Alternativas avaliadas
- Decisão adotada
- Justificativa
- Impactos
- Data
- Responsável

---

# Evolução

Este documento deverá ser atualizado sempre que uma decisão permanente for aprovada.
