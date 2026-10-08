# PADRÕES DE CÓDIGO
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir os padrões de desenvolvimento que deverão ser seguidos em todo o Sistema Gestor OS.

# 2. Princípios Gerais

- Clareza acima de complexidade.
- Código legível.
- Simplicidade.
- Reutilização.
- Responsabilidade única quando aplicável.
- Documentação antes da implementação.

# 3. Organização do Código

Frontend e Backend permanecerão separados.

Cada módulo deverá possuir estrutura consistente.

Evitar duplicação de código.

# 4. Nomenclatura

- Classes: PascalCase.
- Métodos e funções: camelCase.
- Constantes: UPPER_SNAKE_CASE quando fizer sentido.
- Arquivos deverão seguir o padrão adotado pelo framework.

# 5. Comentários

Comentar apenas quando o código não for autoexplicativo.

Comentários devem explicar o "porquê", não o "como".

# 6. Git

Utilizar Conventional Commits.

Exemplos:

- feat:
- fix:
- docs:
- refactor:
- test:
- chore:

Commits pequenos e frequentes.

# 7. Tratamento de Erros

Centralizar sempre que possível.

Mensagens padronizadas.

# 8. Testes

Novos módulos deverão ser desenvolvidos considerando futura automação de testes.

# 9. Revisões

Nenhum código relevante deverá ser incorporado sem revisão.

# 10. Evolução

Este documento será ampliado com padrões específicos para React, NestJS, Prisma, SQL, Docker e documentação.

# 11. Backend NestJS e TypeScript

- O Backend utiliza ESM (`"type": "module"`) e TypeScript com `NodeNext`.
- Imports relativos entre arquivos TypeScript devem usar a extensão `.js`, conforme a resolução ESM emitida pelo compilador.
- O Prisma Client gerado é reproduzido por script e não deve ser editado manualmente. Seu caminho e política de versionamento estão definidos em `docs/03-Banco-de-Dados.md`.

# 12. Persistência no Backend

- `PrismaModule` e `PrismaService` ficam em `backend/src/infrastructure/prisma/`. `PrismaModule` não é `@Global()`; os módulos consumidores deverão importá-lo explicitamente.
- `PrismaService` é exclusivamente infraestrutura: constrói e configura o Prisma Client com o adapter aprovado, disponibiliza o Client e cuida da conexão, desconexão e ciclo de vida da aplicação.
- Validações e regras de clientes, equipamentos, OS, orçamentos, estoque, financeiro, compras, autorização e demais entidades não pertencem ao `PrismaService`. Services de domínio coordenarão os fluxos de negócio.
- Services de domínio poderão utilizar `PrismaService` diretamente. Repositories serão criados apenas quando consultas complexas ou reutilizadas, encapsulamento relevante, testabilidade ou uma fronteira específica de persistência trouxerem benefício concreto. Não criar repositories que apenas repitam `findUnique`, `findMany`, `create`, `update` ou `delete`.
- Prisma Client é o acesso padrão ao banco. SQL raw por `$queryRaw` ou `$executeRaw` será excepcional, parametrizado com segurança, identificado e revisável dentro da fronteira de persistência. Módulos não deverão criar clientes MySQL paralelos nem espalhar SQL pela aplicação.
- Services de negócio decidirão os limites das operações atômicas e usarão `$transaction` do Prisma. `PrismaService` não coordenará regras de negócio.
- Permanecem válidos ESM, `NodeNext` e a extensão `.js` em imports relativos, inclusive para o Prisma Client gerado.

## 12.1 Seeds de catálogos

Seeds de catálogos iniciais serão idempotentes e executados por comando controlado, não automaticamente a cada inicialização do Backend. Reexecutá-los não deve duplicar registros; devem criar valores ausentes, usar identificadores estáveis quando aplicável e preservar renomeações manuais permitidas. A estratégia técnica para identificar valores após renomeação será definida na implementação do seed.

## 12.2 Contatos de Pessoa — persistência implementada

Os services de domínio persistem inclusão de telefone/e-mail, eventual troca de principal e eventos mínimos de `person_contact_events` na mesma transação Prisma; falha no histórico cancela toda a operação. Índices funcionais únicos customizados no MySQL garantem principalidade única por coleção e foram aplicados pela migration `20261007183000_person_contacts`, validada em MySQL 8.0.46 e Prisma 7.10.0. O SQL customizado permanece versionado na migration. SQL raw excepcional no runtime, se necessário para bloqueio concorrente, continuará parametrizado e acessado através do Prisma, conforme a fronteira desta seção. Auth, guards e autorização estão implementados no código; a migration pendente no banco principal impede liberação operacional. A tabela de eventos não tem CHECK para coerência do tipo com a FK; o service deve manter essa regra.

# 13. Autenticação e autorização — padrões implementados no primeiro recorte

- A autenticação está centralizada em guard global. Rotas públicas são marcadas explicitamente; rota de negócio é protegida por padrão.
- Autorização usa metadados/decorators para declarar a permissão exigida e um guard para verificá-la. Rota protegida sem política declarada falha fechada; ausência de permissão nega acesso.
- Um serviço central de política/permissões concentra a decisão de autorização. Não espalhar verificações ad hoc nem duplicar regras em controllers, services ou Frontend. Services ainda validam invariantes de domínio e autorização dependente do recurso quando necessário.
- A identidade usada em cada requisição deve vir da sessão autenticada e validada pelo Backend, nunca de um identificador de usuário fornecido livremente pelo cliente.
- Sessões são opacas e mantidas no servidor. O cookie leva apenas o segredo; somente seu hash pode ser persistido. A sessão expira após 8 horas de inatividade: cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. A sessão pode ser revogada; logout revoga apenas a sessão atual. JWT/OIDC não fazem parte do recorte atual.
- Username é obrigatório e único, normalizado com `trim`, armazenado em minúsculas, com 3 a 50 caracteres e validado por `^[a-z0-9._-]{3,50}$`. Não usar e-mail de Pessoa como login.
- Senhas terão no mínimo 10 caracteres e serão armazenadas com Argon2id pelo pacote `argon2`, inicialmente com os parâmetros seguros padrão da biblioteca, sujeitos a validação e ajuste no ambiente. Nunca registrar senha, hash de senha ou parâmetros sensíveis. Não haverá troca periódica obrigatória. Recuperação fica fora do primeiro recorte.
- Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem CSRF, inclusive login; `GET` não exige token. Antes do login, obter contexto em `GET /api/v1/auth/csrf`, manter identificador opaco temporário em cookie `HttpOnly` e enviar o token em `X-CSRF-Token`; validade de 15 minutos. Após sucesso, descartar esse contexto e usar CSRF próprio da sessão autenticada.
- O Log Administrativo será único para eventos administrativos e de segurança, sem exclusão automática no desenho inicial e com retenção inicialmente indefinida. Falhas são contadas por username normalizado, inclusive usernames inexistentes; a quinta falha gera evento, sem bloquear a conta nem impedir tentativas posteriores. Login bem-sucedido zera o contador de usuário existente; username inexistente gera somente eventos, sem usuário ou contador persistente. Notificação inicial somente pelo Log Administrativo, sem e-mail. Registrar IP remoto, origem e user-agent quando disponíveis. Nunca registrar senha, hash, token ou segredo.
- Username inexistente deve receber o mesmo resultado genérico de autenticação inválida, sem revelar se a conta existe. Não criar usuário fictício para contagem ou auditoria.
- Rotas de negócio são protegidas por padrão, ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. `isAdmin` representa a autoridade máxima no serviço central de política, mas também exige metadado/política explícita na rota. Não criar `admin.full`, `system.admin` ou conceito Master.
- O bootstrap aborta se já houver Administrador ativo, não promove conta existente, cria a conta em transação e registra evento no Log Administrativo. O código foi revisado, mas o comando ainda não foi exercitado em terminal interativo real e a concorrência real do primeiro bootstrap não foi testada. O primeiro recorte não tem CRUD HTTP de usuários; o uso inicial é restrito ao Administrador bootstrapado.
- `PersonContactEvent.userId` é opcional no schema e na migration criada. Eventos existentes permanecem com `NULL`; o ator é gravado na mesma transação da alteração do contato. A migration permanece pendente no banco principal.
- A seed de permissões é idempotente e executada por comando controlado, nunca automaticamente no startup. A validação funcional ocorreu em banco isolado; no principal faltam migration, seed, bootstrap e validação. O serviço local escuta apenas em `127.0.0.1`. O sistema é somente de uso interno e não está pronto para exposição externa operacional. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo depende de 2FA e fronteira confiável implementados; qualquer proxy reverso, VPN, túnel ou publicação exigirá nova decisão documental. Método e recuperação de 2FA continuam pendentes. `npm install` reportou quatro vulnerabilidades high ainda não avaliadas.
