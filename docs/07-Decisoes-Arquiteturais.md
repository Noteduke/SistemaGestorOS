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
Aprovada em 08/10/2026. Primeiro recorte implementado no Backend, já versionado localmente, ainda não enviado a origin. Migration aplicada no banco principal, seed de 24 permissões executado, bootstrap local concluído e testes HTTP autenticados principais aprovados. Auth permanece limitado a uso local/interno; não está liberado para produção ou acesso externo.

## Contexto
O Backend NestJS possui o primeiro recorte de autenticação, guards e autorização por usuário/ação, incluindo proteção das sete rotas de Pessoas. A implementação já foi versionada localmente, ainda não publicada. A migration de Auth foi aplicada no banco principal e o seed de 24 permissões passou duas vezes. O bootstrap local criou um Administrador ativo; os principais testes HTTP autenticados confirmaram login, identidade pública, acesso Admin paginado, CSRF e logout. A segunda execução do bootstrap aborta antes de solicitar credenciais se já há Administrador ativo.

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
- Falhas são contadas por username normalizado, inclusive para nomes inexistentes. Ao atingir cinco, registrar evento no Log Administrativo, sem bloquear a conta nem impedir novas tentativas. Login bem-sucedido zera o contador de usuário existente; username inexistente não cria usuário nem contador persistente e gera eventos de tentativa e, na quinta falha, de limiar atingido. A notificação inicial é exclusivamente pelo Log Administrativo, sem e-mail. Registrar IP remoto, origem e user-agent quando disponíveis sem revelar se a conta existe.
- Haverá um único Log Administrativo para eventos administrativos e de segurança, com retenção inicialmente indefinida e sem exclusão automática neste primeiro desenho. Eventos mínimos: login bem-sucedido, falha de login, logout, sessão revogada, usuário criado/alterado/inativado e permissão concedida/revogada.
- O primeiro Administrador será criado manualmente por comando/script interno controlado. O bootstrap aborta se já existir Administrador ativo, não promove conta existente, usa transação com controle efetivo de concorrência para impedir bootstraps simultâneos e registra o evento no Log Administrativo. O primeiro recorte não terá CRUD HTTP de usuários; o uso inicial será restrito ao Administrador bootstrapado. Usuários são inativados, não excluídos fisicamente, e qualquer alteração que deixe o sistema sem Administrador ativo deve ser bloqueada.
- `isAdmin` representa o nível máximo. Permissões granulares são atribuídas diretamente por usuário/ação, sem “Master”, `admin.full`, `system.admin` ou perfis rígidos obrigatórios de Técnico/Usuário comum. Administrador tem autoridade máxima no serviço de política, mas cada rota exige política explícita. Ausência de permissão nega acesso e rota protegida sem política explícita falha fechada. O Backend é a autoridade; o Frontend somente reflete permissões e respostas da API.
- `person_contact_events.user_id` é opcional e a escrita do ator é atômica com a alteração do contato; eventos existentes permanecem com `NULL`. A migration aplicada define FK `ON DELETE SET NULL` no banco principal.
- As sete rotas atuais de Pessoas estão protegidas no código por autenticação e autorização. A migration e o seed estão aplicados no banco principal; testes locais confirmaram `/people` autenticado como Admin com paginação explícita e a rejeição de mutação sem CSRF. A autorização dos testes não libera o sistema para produção nem para acesso externo.

## Justificativa
O modelo conserva revogação no servidor e atende ao aplicativo web próprio. Permissões por usuário/ação preservam a flexibilidade aprovada e o Log Administrativo único evita duplicar trilhas. O primeiro recorte está implementado no código e no schema Prisma; o banco principal recebeu a migration e o bootstrap local foi concluído com um Administrador ativo.

## Impactos
O schema Prisma e a migration criada `20261008120000_auth_foundation` definem `User`, `Permission`, `UserPermission`, `UserSession`, `PreAuthCsrfContext`, `AdminAuditLog` e a referência opcional `PersonContactEvent.userId`. A migration foi executada em SQL diretamente no banco isolado `gestor_os_shadow` para validação, sem registro em `_prisma_migrations`; no banco principal ela foi aplicada e `prisma migrate status` está limpo. O processo local escuta apenas em `127.0.0.1`. O bootstrap criou um Administrador ativo; a segunda execução foi validada para abortar antes dos prompts de credenciais. O controle transacional contra concorrência permanece no service, mas uma corrida real entre dois bootstraps ainda não foi testada. O seed de 24 permissões foi aplicado duas vezes no banco principal, sem duplicação; `admin.full`, `system.admin` e `Master` estão ausentes. Testes HTTP autenticados locais confirmaram CSRF pré-login, login com resposta pública, `/auth/me`, listagem paginada de Pessoas como Admin, bloqueio CSRF de mutação, logout e invalidação da sessão. `users` contém a conta bootstrapada. Frontend, CRUD HTTP de usuários, recuperação/troca de senha, 2FA e fronteira externa continuam pendentes. Uma credencial administrativa foi exposta acidentalmente durante teste manual; Marcos decidiu não trocá-la agora, mas ela deverá ser substituída antes de uso real, rede compartilhada, produção ou demonstração externa. Não há fluxo definitivo de troca/reset. Acesso externo é proibido. Vulnerabilidades high reportadas pelo `npm install` e a concessão MySQL antiga com `_` sem escape continuam pendentes de avaliação/revisão.

Não há endpoints de inativação ou rebaixamento de Administrador neste recorte. A aplicação da regra que impede deixar o sistema sem Administrador ativo deverá ser validada quando essas operações forem implementadas.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Pacotes inicial e complementar de decisões de Autenticação e Autorização aprovados por Marcos em 08/10/2026.

## Complemento aprovado em 08/10/2026

Este complemento atualiza a decisão adotada acima com as regras operacionais de username, falhas de autenticação, CSRF pré-login, pacote Argon2id, nível `isAdmin`, bootstrap concorrente, limite de uso inicial ao Administrador bootstrapado e autoria opcional de contatos. O primeiro recorte está implementado no Backend e no schema Prisma; a migration está aplicada no banco principal e o seed foi validado como idempotente. Os endpoints Auth existem no código, mas não há CRUD HTTP de usuários. O bootstrap local foi concluído; uma segunda execução aborta antes de solicitar credenciais quando já há Administrador ativo. Os principais testes HTTP autenticados passaram localmente, mas o teste de concorrência real permanece pendente.

---

# DA-019

## Título
Transições de status e reabertura de Ordem de Serviço.

## Situação
Aprovada por Marcos em 08/10/2026. Regras funcionais documentadas; modelo físico, API e implementação ainda não aprovados.

## Contexto
A OS já distingue situação operacional, status macro e resultado de encerramento. O fluxo também envolve itens de estoque, faturamento, pagamentos e trilha histórica, que não devem ser confundidos nem apagados em uma reabertura.

## Problema
Definir as permissões e os efeitos de mudanças de situação/status macro e das duas modalidades de reabertura, preservando o mesmo atendimento e rastreabilidade.

## Decisão adotada
- Depois da abertura em TRIAGEM, usuários autorizados podem mudar livremente para qualquer situação ativa; não existe sequência rígida. Mudanças geram histórico e não removem bloqueios específicos, como pendência aberta de conferência de estoque.
- Somente Administrador ou usuário com permissão específica altera o status macro para FECHADA ou CANCELADA. FECHADA↔CANCELADA não é transição direta; é necessário reabrir completamente para ABERTA antes da outra mudança.
- Reabertura simples permite correção textual, sem alterar situação, status macro, faturamento ou pagamentos, e gera histórico.
- Reabertura completa mantém a mesma OS/número, retorna a ABERTA e AGUARDANDO AVALIAÇÃO/ORÇAMENTO, cancela faturamento e pagamentos no financeiro ativo sem apagar o rastro, retorna peças vinculadas a ORÇADA, registra histórico e avisa o dashboard do Administrador. Também é permitida para OS CANCELADA, exceto à OS externa encerrada como Equipamento comprado/Doado após a criação da interna, que admite somente reabertura simples textual.
- Permissões futuras sugeridas: `os.close`, `os.cancel`, `os.reopen_text`, `os.reopen_full` e `stock.pending_review.resolve`.
- Reconciliação de peças anteriormente BAIXADAS, títulos liquidados/documentos fiscais e o mapeamento dos demais resultados de encerramento permanecem pendentes. Equipamento comprado/Doado fecha a OS externa como FECHADA e dispara o fluxo interno aprovado na DA-020. Esta decisão não aprova tabelas, contratos de API ou uma nova arquitetura de persistência.

## Justificativa
O fluxo preserva a distinção entre atualização operacional, correção textual e reversão completa de um encerramento, mantendo auditoria de operações financeiras e de estoque.

## Impactos
Os contratos futuros deverão manter número e histórico da OS, coordenar alterações de faturamento, pagamentos e peças e notificar o Administrador. O primeiro recorte não precisa implementar fechamento, cancelamento, reabertura, Financeiro ou Estoque.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Decisões complementares de reabertura de OS aprovadas por Marcos em 08/10/2026.

---

# DA-020

## Título
Aquisição/doação de equipamento de cliente e geração de OS interna.

## Situação
Aprovada por Marcos em 08/10/2026. Regras funcionais documentadas; modelo físico, API e implementação ainda não aprovados.

## Contexto
O resultado Equipamento comprado/Doado passa o equipamento do cliente para a própria empresa, que precisa continuar atendendo o mesmo equipamento em uma nova OS. A operação envolve titularidade, origem entre OS, histórico herdado, financeiro e estoque.

## Problema
Definir como encerrar a OS externa, identificar a Pessoa da empresa, abrir o novo atendimento interno e impedir cópias indevidas de valores/itens ativos ou cadeia infinita de OS internas.

## Decisão adotada
- Aplicável apenas a OS de cliente externo: a original fica FECHADA; o equipamento é transferido para a única Pessoa configurada como representante da própria empresa e uma OS interna é criada automaticamente para a mesma Pessoa/equipamento em ABERTA/TRIAGEM.
- A Pessoa da própria empresa deve estar ativa e cumprir elegibilidade já aprovada para titular, incluindo Tipo de Contato Cliente. Somente Administrador define, remove ou troca a configuração; a mudança gera histórico. Sem Pessoa configurada, bloquear o encerramento e informar a exigência.
- As OS mantêm referências recíprocas. Encerramento, transferência, criação e vínculo registram usuário e data/hora. A interna separa em histórico herdado os dados enumerados da origem dos campos operacionais próprios.
- Cobranças, pagamentos, serviços cobrados, peças UTILIZADAS/BAIXADAS e pendências abertas não são copiados como itens ativos na interna. Não registrar pagamento ao cliente nesta etapa; valor, forma, saída financeira e compra formal ficam futuros.
- Após criação da interna, a OS original não recebe movimentação técnica e somente admite reabertura simples textual. A OS interna segue regras normais, exceto que não pode ser encerrada como Equipamento comprado/Doado; o bloqueio impede cadeia de OS internas.
- A nova OS interna mantém referência à OS original, cliente original e mesmo equipamento, sem transformar histórico herdado em dados operacionais ou financeiros ativos.

## Justificativa
O equipamento segue em atendimento sem reabrir ou reescrever a OS que documentou a negociação com o cliente; os vínculos permitem consultar a origem e o histórico sem replicar cobranças, pagamentos ou movimentos.

## Impactos
A configuração da Pessoa da própria empresa, transferência, relações recíprocas, informação herdada e criação da OS interna ficam para recorte posterior ao primeiro módulo básico de OS. A implementação deverá tratar falhas para evitar fechamento sem transferência/criação, mas a estratégia de atomicidade/recuperação não foi definida. Efeitos fiscais, liquidação financeira e reconciliação física de estoque permanecem pendentes.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Decisões de encerramento Equipamento comprado/Doado e OS interna aprovadas por Marcos em 08/10/2026.

---

# DA-021

## Título
Numeração visível, abertura e titularidade operacional da OS.

## Situação
Aprovada por Marcos em 08/10/2026. Regras funcionais registradas; modelo físico, contratos de API e implementação permanecem futuros.

## Contexto
A assistência precisa identificar e etiquetar o equipamento durante a abertura. O número deve ser utilizável pelo cliente/equipe, e a OS oficial só deve existir depois da confirmação dos dados mínimos.

## Problema
Definir formato e ciclo do número antes da confirmação, distinguir rascunho de OS aberta, estabelecer comportamento de desistência e manter coerência entre cliente da OS e titular operacional do equipamento.

## Decisão adotada
- Toda OS recebe durante a abertura um número visível `OS-` + seis dígitos, global, crescente, único e imutável. É usado em atendimento, impressão, etiqueta, consulta, WhatsApp e comunicação com o cliente; IDs internos/técnicos podem coexistir. Reabertura, cancelamento, fechamento e edição não alteram o número. OS interna recebe número próprio e conserva vínculo com a origem.
- O número é gerado antes da confirmação. Até salvar cliente e equipamento, há abertura em andamento, não OS oficialmente aberta. Confirmar cria OS ABERTA/TRIAGEM. Cliente e equipamento são os únicos mínimos para confirmação; defeito/reclamação começa vazio e é opcional.
- Se a abertura for abandonada, o número pode ser reaproveitado quando não houver número maior usado. Se houver, registrar ABERTURA CANCELADA para auditoria e nunca reutilizar esse número. Imprimir etiqueta não consome o número definitivamente.
- O equipamento pode ser existente ou criado na abertura; o novo fica vinculado ao cliente informado. A Pessoa indicada pelo nome é cliente e proprietário operacional do equipamento para aquela OS; não se controla portador/entregador.
- Se o equipamento existente tiver outro titular, alertar e permitir cancelar a seleção, abrir em nome do titular atual ou transferir ao cliente informado com Administrador ou `equipment.transfer_ownership`. A transferência é explícita, mostra a consequência, identifica o usuário e gera histórico.

## Justificativa
O número deve estar disponível para o atendimento físico antes de a OS ser confirmada, sem confundir rascunho com atendimento oficial nem permitir mudança silenciosa do titular.

## Impactos
A análise de prontidão recomenda controle global de sequência/reservas com concorrência segura, abertura separada da OS confirmada e validação final de titularidade. Isso não aprova tabela, campos, constraints, locking, rotas ou migration. Permanecem para desenho a definição técnica de “número maior usado”, reservas concorrentes, reaproveitamento/auditoria, expiração de aberturas e comportamento após `OS-999999`.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Regras de numeração visível, abertura e titularidade operacional da OS aprovadas por Marcos em 08/10/2026.

---

# DA-022

## Título
Retrato cadastral histórico e correção de cliente/equipamento da OS.

## Situação
Aprovada por Marcos em 08/10/2026. Regras funcionais aprovadas; modelo físico, contratos de API e implementação permanecem futuros.

## Contexto
A OS permanece vinculada aos cadastros atuais de Pessoa e Equipamento, mas precisa preservar como os dados principais estavam quando a abertura foi confirmada. Também é necessário corrigir vínculos após a confirmação sem apagar a origem histórica.

## Problema
Definir o momento, finalidade e imutabilidade do retrato cadastral; estabelecer quais dados a interface apresenta; e permitir correções posteriores de vínculo com autorização e histórico.

## Decisão adotada
- Ao confirmar a abertura, gravar uma única vez um retrato histórico cadastral parcial. Não gravá-lo durante a abertura em andamento. Incluir, no mínimo, nome do cliente e identificação principal do equipamento; copiar documento, contatos principais, endereço, tipo, marca, modelo, serial e observações/campos principais do equipamento quando disponíveis.
- O retrato não é editável, não é recalculado ou substituído por alterações cadastrais, reabertura ou correção posterior do vínculo. Permitir consulta no histórico a usuários com permissão para visualizar a OS, identificando-o como retrato do momento da abertura.
- Tela e impressão padrão usam os dados atuais dos cadastros vinculados. Não exigir aviso automático de divergência nem oferecer impressão própria do retrato.
- O retrato cadastral não contém checklist ou recebimento físico: estado, acessórios, senha, avarias e itens ausentes pertencem a fluxo futuro separado.
- Após a confirmação, corrigir cliente ou equipamento é operação controlada, não nova abertura. Permitir somente a Administrador ou usuário com permissão específica; `os.correct_customer` e `os.correct_equipment` são permissões futuras sugeridas, não catálogo aprovado/implementado.
- Toda correção preserva número e retrato original, atualiza o vínculo operacional e gera histórico obrigatório com usuário, data/hora, campo e valores anterior/novo. Motivo não é obrigatório; poderá existir futuramente como campo opcional, conforme complemento da DA-023.

## Justificativa
Preservar evidência histórica da abertura sem tornar dados desatualizados a apresentação operacional, permitindo correção rastreável dos vínculos quando necessário.

## Impactos
É necessária modelagem futura para persistência imutável do retrato e histórico das correções, além de contratos de API e autorização. Nenhuma tabela, campo, formato de armazenamento, endpoint ou migration está aprovado por esta decisão.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Regras de retrato histórico cadastral e correção controlada de vínculos aprovadas por Marcos em 08/10/2026.

---

# DA-023

## Título
Política administrativa para correção de cliente e equipamento vinculados à OS.

## Situação
Aprovada por Marcos em 08/10/2026 como complemento da DA-022. Regras funcionais aprovadas; API, modelo físico e implementação continuam futuros.

## Contexto
A DA-022 permitiu correção controlada dos vínculos de cliente/equipamento após a confirmação, com histórico obrigatório. Faltavam definir o motivo, estados macro permitidos, efeitos financeiros/estoque e como a correção interage com a titularidade atual do equipamento.

## Problema
Evitar que uma correção administrativa reabra a OS, modifique registros financeiros ou transfira titularidade silenciosamente, sem restringir a correção a OS abertas.

## Decisão adotada
- Correção de vínculo não exige motivo obrigatório; um campo de motivo poderá ser opcional no futuro. Histórico é obrigatório e registra usuário, data/hora, campo e valores anterior/novo.
- Administrador ou usuário com permissão específica pode corrigir cliente/equipamento mesmo com a OS FECHADA ou CANCELADA. A correção não reabre a OS nem altera status macro, número ou retrato cadastral histórico.
- A correção não altera faturamento, cobrança, pagamento ou estoque, mesmo quando existam registros financeiros vinculados. Ajustes financeiros necessários são operações próprias, com regras e histórico próprios.
- Ao corrigir equipamento, se houver divergência entre proprietário atual e cliente da OS, alertar e exigir escolha explícita entre cancelar, corrigir também o cliente (com permissão) ou transferir a titularidade (Administrador ou `equipment.transfer_ownership`).
- Ao corrigir o cliente, se o equipamento continuar vinculado ao cliente anterior, exigir decisão explícita sobre transferência. Sem autorização ou aceite da transferência necessária, cancelar a correção. Nunca transferir titularidade silenciosamente.
- Uma operação pode corrigir cliente e equipamento em conjunto, desde que toda autorização e titularidade sejam validadas. A operação é atômica e registra cada campo alterado no histórico.
- Não é obrigatório gerar alerta automático no painel do Administrador. Relatórios/filtros de auditoria podem ser considerados futuramente.

## Justificativa
Permitir ajuste rastreável dos vínculos sem alterar o ciclo de vida da OS nem produzir efeitos colaterais financeiros, de estoque ou titularidade não confirmados.

## Impactos
Contratos de API e modelo físico deverão preservar histórico e atomicidade, validar as permissões aplicáveis e respeitar a titularidade. Nenhum endpoint, tabela, campo ou migration está aprovado por esta decisão.

## Data de aprovação
08/10/2026.

## Responsável
Marcos.

## Procedência
Política complementar de correção administrativa de cliente/equipamento aprovada por Marcos em 08/10/2026.

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
