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
Aprovada em 08/10/2026. Documentada; implementação ainda não iniciada.

## Contexto
O Backend NestJS possui rotas de Pessoa e contatos, mas ainda não tem autenticação, guards nem autorização. As regras aprovadas exigem permissões por usuário/ação, autoridade central no Backend e proteção antes da exposição operacional ou de produção.

## Problema
Definir uma base de autenticação e autorização compatível com as regras de usuários, sessões, auditoria e evolução dos módulos, sem transformar designações operacionais em perfis rígidos nem confiar a segurança ao Frontend.

## Alternativas avaliadas
- Sessão opaca mantida no servidor: escolhida para o aplicativo web e revogação centralizada.
- JWT com tokens de acesso/renovação: não adotado neste recorte; não há necessidade aprovada que justifique acrescentar ciclo de refresh e revogação de tokens.
- Provedor externo de identidade OIDC: fora do escopo atual; nenhum provedor foi aprovado.
- Papéis fixos ou permissões granulares diretas: papéis rígidos não atendem à regra aprovada; concessões diretas por usuário/ação foram escolhidas, com Administrador como autoridade máxima.

## Decisão adotada
- O aplicativo web usará sessão opaca mantida no servidor. O cookie contém somente o segredo opaco e o banco persiste somente seu hash. A sessão expira após 8 horas de inatividade; cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. A sessão pode ser revogada. Sessões simultâneas são permitidas e auditadas; logout revoga somente a sessão atual. Cookies usam `HttpOnly`, `Secure` em ambiente HTTPS e `SameSite` adequado. JWT e OIDC ficam fora do recorte atual.
- O sistema é considerado somente de uso interno neste momento e o Backend não está pronto para exposição externa operacional. Acesso externo fica proibido até 2FA e fronteira confiável implementados. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Proxy reverso, VPN, túnel ou publicação externa exigirá nova decisão documental.
- Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem proteção CSRF; `GET` não exige token. A forma técnica fica para implementação.
- Senhas têm mínimo de 10 caracteres, são armazenadas com Argon2id e não exigem troca periódica. Recuperação fica fora do primeiro recorte; troca manual pelo Administrador pode ser tratada depois.
- Cinco falhas consecutivas geram registro e notificação sem bloquear a conta; login bem-sucedido zera a sequência. Registrar IP, origem e user-agent quando disponíveis. No primeiro recorte, a notificação pode ser apenas registro no Log Administrativo, sem e-mail; destinatários, frequência e parâmetros de limitação ainda devem ser detalhados.
- Haverá um único Log Administrativo para eventos administrativos e de segurança, com retenção inicialmente indefinida e sem exclusão automática neste primeiro desenho. Eventos mínimos: login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado e permissão concedida/revogada.
- O primeiro Administrador será criado manualmente por comando/script interno controlado no ambiente local ou na implantação inicial; o procedimento técnico será documentado antes da implementação. Usuários devem ser inativados, não excluídos fisicamente. O sistema bloqueará inativação do último Administrador ativo, remoção de sua permissão administrativa e qualquer alteração que deixe o sistema sem Administrador ativo.
- Administrador é autoridade máxima; permissões granulares são atribuídas diretamente por usuário/ação, sem “Master” ou perfis rígidos obrigatórios de Técnico/Usuário comum. Ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. O Backend é a autoridade de autorização; o Frontend somente reflete permissões e respostas da API.
- As sete rotas atuais de Pessoas devem ser protegidas por autenticação e autorização no primeiro recorte de implementação.

## Justificativa
O modelo conserva revogação no servidor e atende ao aplicativo web próprio. Permissões por usuário/ação preservam a flexibilidade aprovada e o Log Administrativo único evita duplicar trilhas. As decisões não alteram o schema atual e não significam que a implementação começou.

## Impactos
O desenho conceitual prevê `users`, `permissions`, `user_permissions`, `user_sessions` e `admin_audit_log`; esses nomes não são tabelas implementadas nem schema definitivo. Usuários usam nome de usuário único, são criados somente por Administrador e são inativados em vez de excluídos fisicamente. O primeiro Administrador será criado manualmente por comando/script interno controlado; o procedimento técnico deve ser documentado antes da implementação. O sistema não poderá ficar sem Administrador ativo. `user_sessions` permitirá controlar `last_used_at`, timeout de 8 horas por inatividade, renovado a cada requisição autenticada válida, e estado de revogação; limite absoluto fica fora do primeiro recorte. `person_contact_events` poderá referenciar opcionalmente o executor; se exclusão física de usuário vier a existir, a preferência é FK equivalente a `ON DELETE SET NULL`. A implementação, 2FA, recuperação de senha, fronteira de rede e frontend permanecem pendentes.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Pacotes inicial e complementar de decisões de Autenticação e Autorização aprovados por Marcos em 08/10/2026.

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
