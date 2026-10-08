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

Os services de domínio persistem inclusão de telefone/e-mail, eventual troca de principal e eventos mínimos de `person_contact_events` na mesma transação Prisma; falha no histórico cancela toda a operação. Índices funcionais únicos customizados no MySQL garantem principalidade única por coleção e foram aplicados pela migration `20261007183000_person_contacts`, validada em MySQL 8.0.46 e Prisma 7.10.0. O SQL customizado permanece versionado na migration. SQL raw excepcional no runtime, se necessário para bloqueio concorrente, continuará parametrizado e acessado através do Prisma, conforme a fronteira desta seção. A autenticação, os guards e a autorização ainda não foram implementados. A tabela de eventos não tem CHECK para coerência do tipo com a FK; o service deve manter essa regra.

# 13. Autenticação e autorização — padrões previstos

- A autenticação será centralizada em guard global. Rotas públicas deverão ser marcadas explicitamente; rota de negócio é protegida por padrão.
- Autorização usará metadados/decorators para declarar a permissão exigida e um guard para verificá-la. Rota protegida sem política declarada deve falhar fechada; ausência de permissão nega acesso.
- Um serviço central de política/permissões concentra a decisão de autorização. Não espalhar verificações ad hoc nem duplicar regras em controllers, services ou Frontend. Services ainda validam invariantes de domínio e autorização dependente do recurso quando necessário.
- A identidade usada em cada requisição deve vir da sessão autenticada e validada pelo Backend, nunca de um identificador de usuário fornecido livremente pelo cliente.
- Sessões serão opacas e mantidas no servidor. O cookie leva apenas o segredo; somente seu hash pode ser persistido. A sessão expira após 8 horas de inatividade: cada requisição autenticada válida atualiza `last_used_at` e renova o prazo a partir do último uso. Não há limite absoluto no primeiro recorte. A sessão pode ser revogada; logout revoga apenas a sessão atual. JWT/OIDC não fazem parte do recorte atual.
- Senhas terão no mínimo 10 caracteres e serão armazenadas com Argon2id. Não haverá troca periódica obrigatória. Recuperação de senha fica fora do primeiro recorte; troca manual por Administrador pode ficar para etapa posterior.
- Métodos mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) exigem proteção CSRF; `GET` não exige token. A forma técnica pode ser definida na implementação.
- O Log Administrativo será único para eventos administrativos e de segurança, sem exclusão automática no desenho inicial e com retenção inicialmente indefinida. Registrar IP, origem e user-agent quando disponíveis para falhas de login. Segredos de sessão, senhas e material de autenticação não devem ser registrados.
- Rotas de negócio são protegidas por padrão, ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. Administrador é a autoridade máxima; o serviço central de autorização concentra decisões.
- Estes são padrões aprovados para orientar o desenho; não indicam que Auth, guards ou tabelas já existam. O sistema é somente de uso interno neste momento e não está pronto para exposição externa operacional. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo depende de 2FA e fronteira confiável implementados; qualquer proxy reverso, VPN, túnel ou publicação exigirá nova decisão documental. Método e recuperação de 2FA continuam pendentes.
