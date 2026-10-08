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
- O aplicativo web usará sessão opaca mantida no servidor. O cookie contém somente o segredo opaco e o banco persiste somente seu hash. JWT e OIDC ficam fora do recorte atual.
- Sessões têm expiração e podem ser revogadas; sessões simultâneas são permitidas e auditadas. Cookies usam `HttpOnly`, `Secure` em ambiente HTTPS e `SameSite` adequado. Proteção CSRF e detalhes de ciclo de sessão serão definidos antes da implementação.
- Administrador é autoridade máxima; permissões granulares são atribuídas diretamente por usuário/ação, sem “Master” ou perfis rígidos obrigatórios de Técnico/Usuário comum. Ausência de permissão nega acesso e rota protegida sem política explícita falha fechada.
- O Backend é a autoridade de autorização; o Frontend somente reflete permissões e respostas da API.
- Haverá um único Log Administrativo para eventos administrativos e de segurança; não será criado histórico paralelo de segurança.
- Acesso externo fica proibido até 2FA. O recorte inicial pode operar somente como interno; método de 2FA, recuperação e fronteira de rede permanecem pendentes. Não se presume confiança em IPs, headers ou proxies sem fronteira documentada e aprovada.
- As sete rotas atuais de Pessoas devem ser protegidas por autenticação e autorização no primeiro recorte de implementação.

## Justificativa
O modelo conserva revogação no servidor e atende ao aplicativo web próprio. Permissões por usuário/ação preservam a flexibilidade aprovada e o Log Administrativo único evita duplicar trilhas. As decisões não alteram o schema atual e não significam que a implementação começou.

## Impactos
O desenho conceitual prevê `users`, `permissions`, `user_permissions`, `user_sessions` e `admin_audit_log`; esses nomes não são tabelas implementadas nem schema definitivo. Usuários usam nome de usuário único, são criados somente por Administrador e não têm auto-registro público. O primeiro Administrador será provisionado por procedimento controlado interno, a documentar antes da implementação; o sistema não poderá ficar sem Administrador ativo. Cinco falhas consecutivas geram registro e notificação sem bloquear a conta; login bem-sucedido zera a sequência. `person_contact_events` poderá referenciar opcionalmente o executor, após decisão sobre FK e retenção. O catálogo inicial de permissões e as sete políticas de rota estão nos documentos de regras e API. Implementação, 2FA, recuperação de senha, fronteira de rede e frontend permanecem pendentes.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Pacote inicial de decisões de Autenticação e Autorização aprovado por Marcos.

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
