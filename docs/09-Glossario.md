# GLOSSÁRIO
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Padronizar toda a terminologia utilizada no Sistema Gestor OS.

Este documento é a referência oficial de nomenclatura para documentação, banco de dados, código-fonte, interfaces e comunicações.

---

# 2. Regras Gerais

- Cada termo possuirá apenas um significado oficial.
- Evitar sinônimos para conceitos do sistema.
- Novos termos deverão ser registrados antes de serem utilizados em documentação ou código.

---

# 3. Termos Oficiais

## ERP
Sistema integrado de gestão empresarial.

## OS (Ordem de Serviço)
Registro principal utilizado para controlar o atendimento técnico de um equipamento.

## Cliente
Pessoa física ou jurídica que contrata serviços ou adquire produtos.

## Administrador
Usuário com poderes máximos do sistema. Técnico e Usuário comum são designações operacionais, não perfis rígidos; permissões são atribuídas individualmente por usuário/ação. Um usuário pode receber permissão explícita equivalente para ação administrativa específica sem se tornar Administrador. O conceito Master não existe no sistema.

## Técnico
Designação operacional de usuário. Não implica conjunto fixo de permissões; cada ação depende das permissões concedidas ao usuário.

## Usuário comum
Designação operacional de usuário. Não implica conjunto fixo de permissões; as ações permitidas são determinadas individualmente.

## Permissão por usuário/ação
Autorização atribuída a um usuário para executar uma ação específica, sem depender de perfil rígido.

## Usuário do Sistema
Conta individual usada para autenticar uma pessoa no Gestor OS. É separada do cadastro de Pessoa usado em operações comerciais. O login usa nome de usuário único; contas são criadas somente por Administrador e não há auto-registro público. O primeiro recorte está implementado no Backend; a migration correspondente continua pendente no banco principal.

## Sessão opaca
Sessão autenticada cujo cookie contém apenas um segredo aleatório opaco. O Backend mantém a sessão e persiste somente o hash do segredo. Expira após 8 horas de inatividade, renovadas a cada requisição autenticada válida por `last_used_at`; não há limite absoluto no primeiro recorte. Está implementada no código; a migration Auth ainda está pendente no banco principal.

## Log Administrativo
Registro único para eventos administrativos e de segurança, incluindo autenticação, sessões, usuários e permissões. Não deve haver um histórico paralelo de segurança. O modelo Prisma e a migration foram criados, mas a migration continua pendente no banco principal. A retenção inicial é indefinida e não haverá exclusão automática neste primeiro desenho.

## 2FA
Autenticação em dois fatores. É obrigatória para acesso externo; o acesso externo permanece proibido até que o 2FA e uma fronteira confiável estejam implementados. Método e recuperação do segundo fator permanecem pendentes.

## Acesso interno
Acesso considerado somente interno neste momento; o Backend não está pronto para exposição externa operacional. Não confiar em `X-Forwarded-For`, headers de proxy, IP público ou origem informada por cabeçalhos. Acesso externo continua proibido até 2FA e fronteira confiável implementados. Proxy reverso, VPN, túnel ou publicação externa exigem nova decisão documental.

## Acesso externo
Acesso externo é proibido neste momento. Só poderá ser liberado depois que 2FA e uma fronteira confiável estiverem implementados; qualquer proxy reverso, VPN, túnel ou publicação exige nova decisão documental. Não se deve confiar em IP, `X-Forwarded-For` ou headers de proxy para classificar a origem antes dessa decisão.

## Guard
Componente do Backend que verifica autenticação ou autorização de uma requisição antes de permitir o acesso à rota. Guards de autenticação e permissão foram implementados no primeiro recorte; sua operação no banco principal depende da migration, seed e bootstrap ainda pendentes.

## CSRF
Falsificação de requisição entre sites. Métodos mutáveis `POST`, `PUT`, `PATCH` e `DELETE`, inclusive login, exigem proteção CSRF; `GET` não exige token. Antes do login, o token é obtido por `GET /api/v1/auth/csrf`, enviado em `X-CSRF-Token` e associado a contexto temporário de 15 minutos; depois do login, a sessão autenticada usa controle CSRF próprio.

## Sessão atual
Sessão autenticada usada na requisição corrente. O logout aprovado revoga somente essa sessão; encerrar todas as sessões de um usuário poderá ser considerado futuramente.

## Revogação de sessão
Invalidação de uma sessão antes de sua expiração. Sessões podem ser revogadas; a revogação deve gerar evento no Log Administrativo.

## Argon2id
Algoritmo aprovado para armazenar senhas por hash. A senha terá mínimo de 10 caracteres; troca periódica obrigatória não será exigida.

## Primeiro Administrador
Conta inicial de autoridade máxima, criada manualmente por comando/script interno controlado no ambiente local ou na implantação inicial. O procedimento técnico será documentado antes da implementação.

## Último Administrador
Único Administrador ativo restante. O sistema deve bloquear inativação, remoção da permissão administrativa ou qualquer alteração que deixe o sistema sem Administrador ativo.

## Retenção de Log
Período de preservação dos registros do Log Administrativo. A retenção é inicialmente indefinida e não haverá exclusão automática neste primeiro desenho.

## Rota pública
Rota explicitamente marcada para não exigir sessão autenticada, limitada às rotas públicas aprovadas. Ausência de metadados não torna uma rota pública; rotas de negócio protegidas devem falhar fechadas.

## Fornecedor
Pessoa física ou jurídica que fornece produtos ou serviços ao Gestor OS.

## Tipo de Pessoa
Classificação do cadastro unificado como Pessoa Física (PF) ou Pessoa Jurídica (PJ).

## CPF
Documento opcional de Pessoa Física, armazenado somente com números em 11 dígitos e validado matematicamente quando informado.

## CNPJ
Documento opcional de Pessoa Jurídica. Pode usar o padrão numérico antigo ou o padrão alfanumérico oficial da Receita Federal; é armazenado sem pontuação, com letras em maiúsculas, e validado matematicamente conforme o algoritmo aplicável.

## Transportadora
Tipo de Contato que classifica uma Pessoa como transportadora. Não possui cadastro de Pessoa separado.

## Tipo de Contato
Classificação de cadastro próprio que representa um papel exercido por uma Pessoa no sistema. Catálogo inicial: Cliente, Fornecedor, Transportadora, Prestador de Serviço e Parceiro. Uma Pessoa pode possuir vários Tipos de Contato simultaneamente.

## Pessoa de Contato
Outra Pessoa, vinculada a um cadastro de Pessoa como contato. Cada Pessoa pode ter zero ou uma Pessoa de Contato; o vínculo não representa um cadastro simplificado nem um papel da Pessoa.

## Registro principal
Telefone, e-mail ou endereço marcado como principal. Cada Pessoa pode ter no máximo um principal em cada coleção, sem obrigação de possuir um. O principal do endereço é único independentemente do Tipo; vários endereços podem ter o mesmo Tipo.

## Telefone da Pessoa
Sub-recurso implementado de Pessoa, com número persistido somente em dígitos. A API aceita de 1 a 32 dígitos: formato brasileiro de dez dígitos ou celular de onze com 9 após o DDD passa sem aviso; demais comprimentos dentro do limite exigem aviso e confirmação explícita antes da gravação. Valor sem dígitos ou acima de 32 é bloqueado. Pode ser principal, independentemente do e-mail principal. A API permite adicionar e listar; edição e remoção estão fora do recorte.

## E-mail da Pessoa
Sub-recurso implementado de Pessoa, salvo em minúsculas após `trim`, validado pela gramática ASCII da API e limitado a 254 caracteres. Repetição na mesma Pessoa bloqueia; entre Pessoas distintas é permitida com aviso não bloqueante. Pode ser principal, independentemente do telefone principal. A API permite adicionar e listar; edição e remoção estão fora do recorte.

## Histórico mínimo de contatos
Registro implementado em `person_contact_events` pela migration `20261007183000_person_contacts`, para inclusão de telefone/e-mail em Pessoa existente e mudança efetiva de principal. Todo `POST` bem-sucedido registra `PHONE_CREATED` ou `EMAIL_CREATED`; `PHONE_PRIMARY_CHANGED` ou `EMAIL_PRIMARY_CHANGED` registra também a mudança do principal efetivo, inclusive de nenhum para o primeiro. Dados, troca de principal e eventos são atômicos. Não há rota pública de consulta neste recorte. O schema Prisma e a migration Auth criada incluem `user_id` opcional para o usuário executor, mantendo registros anteriores com `NULL`; a migration Auth está pendente no banco principal. Não substitui o histórico geral definitivo, cuja estrutura física permanece pendente.

## Confirmação de alteração da Pessoa
Declaração `confirmPersonChange: true` exigida pelo contrato atual em todo `POST` de telefone/e-mail para Pessoa existente. Não substitui autenticação nem comprova sozinha a exibição da mensagem ao operador. Telefone fora do padrão exige adicionalmente `confirmNonstandardPhone: true` após aviso da API.

## Tipo de Contribuinte
Classificação de cadastro próprio associada à Pessoa para uso fiscal. Catálogo inicial: Contribuinte ICMS, Contribuinte Isento e Não Contribuinte. Códigos e regras fiscais detalhadas permanecem pendentes.

## Tipo de Endereço
Classificação de cadastro próprio associada a um endereço de Pessoa. Catálogo inicial: Principal, Cobrança, Entrega e Instalação. Um endereço pode ser marcado como principal independentemente do tipo.

## Parceiro
Tipo de Contato para pessoa ou organização com relação de parceria comercial ou operacional com a empresa.

## Observações
Informação passiva registrada no cadastro de Pessoa, sem comportamento obrigatório de exibição em outros fluxos.

## Aviso
Campo único e informativo do cadastro de Pessoa. Nos contextos aprovados, o sistema pergunta se o operador deseja ver o conteúdo; não o exibe automaticamente e não bloqueia operações. As regras de apresentação e permissão estão em `docs/02-Regras-de-Negocio.md`.

## Marca
Cadastro único de identificação da marca de um equipamento, representando também seu fabricante para fins do Sistema Gestor OS. Catálogo inicial aprovado: Dell, HP, Lenovo, Samsung, Acer, Asus, Positivo, Apple, Epson, Brother, Canon, Lexmark, Ricoh, Xerox, BenQ, Intelbras, APC, SMS, TS Shara, Zebra, Elgin, D-Link, TP-Link, Ubiquiti, Mikrotik e Outro. Não é enum fixo; novas marcas podem ser adicionadas. A carga será feita por seed idempotente sob comando controlado; sua implementação permanece pendente.

## Produto
Item controlado em estoque e comercializado.

## Serviço
Atividade executada pela empresa, não representando item de estoque.

## Equipamento
Bem cuja titularidade atual é vinculada a uma Pessoa com Tipo de Contato Cliente e que pode gerar uma Ordem de Serviço. A Pessoa informada na OS não precisa ser o proprietário real.

## Tipo de Equipamento
Cadastro próprio que classifica o Equipamento. Catálogo inicial aprovado: Notebook, Computador/Desktop, Impressora, Projetor, Monitor, Nobreak, Roteador, Access Point, Switch, Servidor, Scanner, Leitor de Código de Barras, Coletor de Dados, Tablet, Celular/Smartphone e Outro. Não é enum fixo; novos tipos podem ser adicionados. A carga será feita por seed idempotente sob comando controlado; sua implementação permanece pendente.

## Normalização de dados
Regra de aplicação que converte dados textuais persistidos para MAIÚSCULAS, exceto e-mail. E-mail é salvo em minúsculas; telefone e CEP são salvos somente com números. Máscaras são visuais.

## Seed idempotente
Carga inicial executada por comando controlado que pode ser repetida sem duplicar dados, cria valores ausentes e preserva renomeações manuais permitidas. Não roda automaticamente na inicialização do Backend.

## Status do Equipamento
Estado funcional limitado nesta etapa a Ativo ou Inativo. Equipamento novo inicia Ativo; outros estados não fazem parte do escopo atual.

## Número de Série
Identificador opcional do Equipamento e principal critério de duplicidade quando informado. A comparação considera o proprietário atual. É salvo em caixa alta sem remover símbolos nem alterar espaços, inclusive no início/fim; `ABC-123` e `ABC123` são valores diferentes.

## Proprietário do Equipamento
Pessoa cadastrada que detém a titularidade atual do equipamento e possui Tipo de Contato Cliente.

## Pessoa informada na abertura da OS
Pessoa registrada como informada no atendimento no momento em que uma OS é aberta. Não há separação obrigatória em relação ao proprietário real do equipamento. A evolução dos dados cadastrais é consultada pelo histórico; não haverá cópia completa dos dados em cada OS.

## Histórico de alterações e movimentações
Histórico geral conceitualmente ligado a cada entidade, que acompanha alterações de campos e eventos relevantes sem duplicar todos os dados cadastrais dentro de cada OS. A estrutura física ainda será definida.

## Alteração de campo
Tipo de registro de histórico que identifica, quando aplicável, entidade, campo, valor anterior, novo valor, data/hora e usuário responsável quando definido.

## Evento ou movimentação
Tipo de registro de histórico para ação relevante que não é apenas a troca simples de um valor, como abertura de OS, transferência ou entrega de equipamento.

## Histórico operacional básico
Parte do histórico acessível ao usuário comum, conforme os eventos que forem definidos para essa categoria. A lista final de eventos permanece pendente.

## Histórico sensível ou auditoria
Registros que exigem Administrador ou permissão explícita equivalente, incluindo histórico de Aviso e histórico técnico/auditoria. A classificação final dos eventos permanece pendente.

## Transferência de titularidade
Operação que altera o proprietário atual do equipamento e registra evento de titularidade, sem reescrever OS anteriores. Pode ocorrer fora de OS ou durante uma OS; o vínculo com OS é opcional.

## Orçamento
Proposta comercial apresentada ao cliente antes da execução ou venda.

## Faturamento
Conversão de uma venda aprovada em documento financeiro.

## XML
Arquivo eletrônico utilizado para importação de documentos fiscais.

## API
Interface de comunicação entre Frontend, Backend e integrações externas.

## Migration
Alteração versionada da estrutura do banco de dados realizada pelo Prisma.

## Username
Identificador obrigatório e único de login. É normalizado com `trim`, armazenado em minúsculas, aceita de 3 a 50 caracteres e deve corresponder a `^[a-z0-9._-]{3,50}$`. Não é o e-mail de contato de Pessoa.

## CSRF pré-login
Contexto temporário obtido antes do login por `GET /api/v1/auth/csrf`. O servidor retorna o token e grava identificador opaco em cookie `HttpOnly`; o token é enviado em `X-CSRF-Token`, expira em 15 minutos e é descartado após login bem-sucedido. `PreAuthCsrfContext` é a entidade Prisma e tabela definida pela migration criada; essa tabela ainda não existe no banco principal, onde a migration está pendente. A sessão autenticada passa a usar controle CSRF próprio.

## `PreAuthCsrfContext`
Modelo Prisma e tabela da migration Auth criada para persistir temporariamente os hashes do identificador opaco e do token CSRF pré-login, com timestamps de expiração e uso. Não tem vínculo com usuário. A tabela ainda não existe no banco principal porque `20261008120000_auth_foundation` está pendente.

## Administrador bootstrapado
Primeiro Administrador criado por comando interno controlado, fora de auto-registro e das rotas HTTP de usuários. O primeiro uso do sistema fica restrito a essa conta até a gestão de usuários ser implementada.

O comando está implementado e revisado no código, mas ainda não foi executado em terminal interativo real; o teste real de concorrência de bootstraps também está pendente. A migration e o seed no banco principal ainda precisam ser aplicados.

## `isAdmin`
Campo do modelo Prisma que indica que a conta tem nível máximo de Administrador. A migration correspondente ainda está pendente no banco principal. Não é a permissão `admin.full` ou `system.admin` e não substitui a política explícita de cada rota.

## Cinco falhas consecutivas
Sequência de falhas de autenticação contada pelo username normalizado, inclusive quando não existe usuário. A quinta gera evento no Log Administrativo, sem bloquear a conta nem impedir novas tentativas; autenticação bem-sucedida zera o contador do usuário existente.

## Log Administrativo
Registro único para eventos administrativos e de segurança. No primeiro recorte, também é o único canal de notificação para o evento de cinco falhas consecutivas; envio de e-mail fica fora.

---

# 4. Evolução

Este glossário deverá crescer continuamente durante o desenvolvimento do projeto.

Toda nova nomenclatura aprovada deverá ser registrada neste documento.
