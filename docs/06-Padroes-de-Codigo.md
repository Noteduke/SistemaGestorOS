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
