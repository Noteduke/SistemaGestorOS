# Auditoria dos cadastros — Homologação 1

Data: 23/10/2026. Projeto: Sistema Gestor OS — NoteDuke.

## Escopo e evidências

Auditoria somente leitura de regras, navegação, formulários, endpoints, serviços e Prisma. Nenhuma pendência desta auditoria foi implementada. A publicação autorizada é tratada separadamente abaixo.

Referências principais: `docs/Especificacao-GestorOS.md`, `docs/Especificacoes-Nao-Documentadas.md`, `docs/02-Regras-de-Negocio.md`, `docs/03-Banco-de-Dados.md`, `docs/04-API.md`, `docs/05-Frontend.md`, `docs/07-Decisoes-Arquiteturais.md`, planos dos módulos e desenho técnico do cadastro de Produtos.

Código inspecionado: `frontend/src/App.tsx`, páginas e APIs correspondentes; módulos Backend de Pessoas, Equipamentos, Produtos, Serviços, Status, Autenticação, Empresa e Homologação; `backend/prisma/schema.prisma`. O inventário considera o candidato Backend `c53c68e4` e Frontend `5c248daa` autorizado para publicação.

**Limite de comprovação:** o navegador abriu o login HTTPS e exibiu AMBIENTE DE HOMOLOGAÇÃO. Não havia sessão autenticada disponível. Operações visuais autenticadas de criação, edição, pesquisa e inativação estão **NÃO VERIFICADAS em homologação**, mesmo quando a implementação e testes isolados existem. Não foram solicitadas credenciais nem criados registros fictícios permanentes.

COMPLETO abaixo significa requisitos do recorte indicado evidenciados por código e testes existentes; não equivale à homologação operacional da equipe. PARCIAL indica lacuna aprovada; AUSENTE indica ausência de implementação utilizável; NÃO VERIFICADO identifica evidência operacional indisponível.

Prioridades sugeridas: P1 impacto direto no atendimento ou administração da equipe; P2 manutenção e consistência; P3 etapas futuras, especialmente dependentes de financeiro. Não representam autorização para desenvolvimento.

## Publicação autorizada

- Manifesto aprovado: `A628026BDE91A02ED0F8DFA130BE4C796543DB5AE7DEE9CE7683E3F920721ECF`.
- Backup completo validado: `C:\GestorOS-Operacional\evidence\homologation-before-opening-20261023T165131378Z.sql`.
- SHA-256 do backup: `2521DB6981460CECE114D68483E836E1AC4A43417272C7BFE0624DF395EA457F`.
- Recibo remoto: MIGRATION_AND_CATALOGS_APPLIED; banco `gestor_os_homologation`; migration `20261024130000_opening_customer_form`.
- Catálogos confirmados pelo recibo: 16 tipos e 27 marcas. A carga insere ausentes, preserva registros existentes e não roda no startup.
- Pré-validação dos pacotes: PUBLICATION_PREFLIGHT_OK. Publicação concluída: PUBLICATION_SUCCESS; journal `success`.
- Backup dos artefatos anteriores, incluindo node_modules: `C:\ProgramData\GestorOS\homologation\updates\backup-20261023T165618Z-835fe00446054ce699adc0cbadb266d8`. Presença dos artefatos de rollback confirmada.
- Backend e Frontend publicados pelos snapshots aprovados; sem atribuir commit antigo ao código modificado. Somente Backend reiniciado; Caddy não reiniciado. Hash e ACL da configuração preservados pelo validador da transação.
- Validação posterior: serviços Running; driver e Prisma OK; migration VERIFIED; Administrador ativo PRESENT; modelos Pessoas/Equipamentos/Aberturas/OS consultados somente por leitura; catálogos 16/27.
- HTTPS: página inicial 200; auth/me, people/customers, equipment-types e service-orders/openings retornam 401 sem autenticação. Isso comprova disponibilidade e proteção, não o fluxo autenticado de gravação.
- HTML, CSS e JavaScript servidos por HTTPS correspondem aos hashes dos arquivos instalados do pacote aprovado.
- Evidências anteriores do candidato: 130 testes Backend, 173 testes Frontend, builds, validação de 9.532 arquivos do pacote Backend e integração HTTP no banco isolado `gestor_os_opening_test`. A adaptação administrativa também passou em regressões BigInt, falhas intermediárias, retomada de serviço e carga idempotente 16/27 seguida de 0/0 no ambiente isolado. Não foram repetidos testes mutáveis em homologação.
- Banco de produção não acessado. Nenhum commit ou push realizado.

## Inventário e matriz de pendências

| Cadastro | Campo ou funcionalidade | Requisito aprovado | Situação atual | Pendência | Referência documental/código | Prioridade sugerida |
|---|---|---|---|---|---|---|
| Pessoas / Clientes | PF/PJ e identificação | Nome; documento opcional; campos específicos de PJ | PARCIAL no cadastro geral; formulário de criação implementado | Não há página geral navegável de manutenção; formulário é usado na abertura | Especificação §2; `pages/people/PersonForm.tsx`; `people.controller.ts` | P1 — requisito não implementado |
| Pessoas / Clientes | Campos completos de criação | Nome, CPF/CNPJ, fantasia, IE/IM, contato PJ, observações, aviso e situação | COMPLETO no recorte de criação autorizado | Funcionamento visual autenticado NÃO VERIFICADO | `PersonForm.tsx`; `dto/complete-person.dto.ts`; `PeopleService.createCompletePerson` | P1 — validar operação |
| Pessoas | Endereço e contatos | Endereço único no formulário mais recente; múltiplos telefones/e-mails | COMPLETO no recorte de criação; PARCIAL na manutenção | Há adicionar/listar contatos; faltam manutenção completa e interface geral | `PersonForm.tsx`; `people.controller.ts`; modelos PersonAddress/Phone/Email | P1/P2 |
| Pessoas | Endereço múltiplo / contato relacionado | Documentos antigos descrevem vários endereços e contato como Pessoa | PARCIAL / divergência documental | Consolidar regra geral; não impor regra antiga ao formulário de abertura aprovado recentemente | Especificação; Especificações não documentadas; adendos de 23/10 em docs 02–05 | P2 — decisão documental |
| Pessoas | Alteração de dados | Edição confirmada com histórico | PARCIAL | POST e GET existem; não há PATCH geral de Pessoa nem tela correspondente | `people.controller.ts`; Especificação, regras de edição | P1 |
| Pessoas | Ativar/inativar; alterar aviso | Administrador ou autorização explícita, confirmação e histórico | PARCIAL | Criação possui situação/aviso; manutenção dessas propriedades não está disponível | docs 02, regra de situação e Aviso; `people.controller.ts` | P1 |
| Pessoas | Papéis simultâneos | Cadastro único para cliente, fornecedor, transportadora e demais tipos | PARCIAL | Enum e relação existem; criação completa atribui CUSTOMER; não há manutenção utilizável dos demais papéis | `PersonRole`; `PersonRoleAssignment`; `PeopleService.createCompletePerson` | P1 |
| Fornecedores | Cadastro e manutenção no cadastro único | Reutilizar Pessoa, não criar cadastro paralelo | AUSENTE como funcionalidade utilizável | Falta interface/fluxo para cadastrar e manter fornecedor; enum isolado não é cadastro concluído | Especificação; `PersonRole.SUPPLIER`; `App.tsx` | P2 |
| Transportadoras | Cadastro e manutenção no cadastro único | Reutilizar Pessoa | AUSENTE como funcionalidade utilizável | Falta interface/fluxo de transportadora | Especificação:289; `PersonRole.CARRIER`; `App.tsx` | P2/P3 |
| Tipos de contato | Catálogo dinâmico e múltiplos vínculos | Cliente, fornecedor, transportadora, prestador e parceiro | AUSENTE como catálogo dinâmico | Enum provisório tem quatro papéis; parceiro e manutenção do catálogo não existem | docs 02, Tipos de Contato; schema `PersonRole`; Especificações não documentadas | P2 |
| Equipamentos | Proprietário, tipo, marca, modelo, série | Tipo obrigatório; marca/modelo com opções controladas; série ou não identificado | PARCIAL no cadastro geral; abertura implementada | Cadastro novo ocorre como rascunho da OS; não há página geral de equipamentos | Especificação:205; `ServiceOrderOpeningPage.tsx`; modelo Equipment | P1 |
| Equipamentos | Alterar dados permanentes | Tipo, marca, modelo e série editáveis, confirmação e histórico | PARCIAL | PATCH existe; falta acesso por ficha geral navegável | Especificação:225; `equipment.controller.ts`; `equipment-lookup.service.ts` | P1 |
| Equipamentos | Titularidade | Transferência explícita autorizada, com histórico | PARCIAL | Fluxo na abertura existe; manutenção independente de OS não está disponível na navegação | Especificação:213; módulo de confirmação da abertura | P2 |
| Equipamentos | Inativar/reativar e localizar inativos | Situação ativo/inativo; preservação histórica | PARCIAL | Campo persiste; busca de abertura usa ativos; faltam manutenção e filtro geral de inativos | Especificação:205; modelo Equipment; endpoint opening-search | P1/P2 |
| Tipos de equipamento | Catálogo inicial e seleção | 16 valores aprovados, manutenção própria | PARCIAL | Lista/criação Backend e carga existem; sem tela própria de manutenção | docs 02:107; EquipmentType; `equipment.controller.ts` | P1 |
| Marcas / Fabricantes | Catálogo único | 27 valores aprovados; marca também representa fabricante | PARCIAL | Sem tela própria de manutenção; não criar fabricante paralelo | Especificação:205–211; EquipmentBrand; `equipment.controller.ts` | P1 |
| Tipos / Marcas | Ciclo de vida | Renomear e inativar; excluir somente sem uso; histórico | PARCIAL | Modelos não têm isActive; endpoints de alteração/inativação/exclusão não existem | Especificação:211; schema modelos EquipmentType/Brand | P2 |
| Produtos / Peças | Cadastro básico | Código próprio opcional, descrição, categoria, situação e pesquisa | COMPLETO no recorte básico; PARCIAL na visão futura ampla | Visão 360 e relacionamentos futuros não estão implementados; não são regressão desta publicação | desenho Recorte 3 Produtos; `ProductCatalogPage.tsx`; modelo Product | P2 |
| Produtos | Preço e custo | NULL diferente de zero; não negativos; permissões independentes | COMPLETO por implementação/testes | Operação visual com perfis distintos NÃO VERIFICADA nesta missão | ProductsService; products.cost.read/update; testes de Produtos | P1 — validar perfis |
| Produtos | Lucro estimado | Custo NULL impede cálculo; custo zero válido; proteção de custo | COMPLETO no recorte previsto | Não acrescentar margem/relatórios como requisito deste recorte | Especificação, cadastro básico; DTOs/projeção Produtos | P2 |
| Produtos | Exclusão física e seriais individuais | Não exigidos no cadastro básico; seriais futuros | COMPLETO quanto ao limite do recorte | Ausência de DELETE e controle individual não é defeito deste recorte | desenho técnico Recorte 3; ProductsController | Sem correção |
| Categorias de produtos | Cadastro auxiliar próprio | Categoria aprovada no escopo amplo | AUSENTE como cadastro dinâmico | Recorte básico usa enum PART/RESALE_GOOD aprovado; expansão é etapa futura | Especificação:289; plano Produtos; ProductCategory enum | P2 |
| Unidades de medida | Cadastro auxiliar | Aprovado | AUSENTE | Não há modelo, API ou página; detalhes além da aprovação precisam ser definidos | Especificação:289; schema; navegação | P3 |
| Serviços | Criar, pesquisar, preço, situação e exclusão controlada | Nome imutável até 120, unicidade, preço obrigatório não negativo | PARCIAL | Defeito concreto: campo de criação aceita 240 caracteres, Backend rejeita acima de 120 | `ServiceCatalogPage.tsx:122`; `domain/service-name.ts:11` | P1 — defeito comprovado |
| Serviços | Manutenção e histórico | Alterar preço/situação; excluir só nunca associado | COMPLETO por implementação do recorte | Operação visual autenticada NÃO VERIFICADA | ServicesController/Service; ServiceCatalog; testes existentes | P2 — validar operação |
| Mão de obra avulsa | Item de orçamento | Permitir serviço sem catálogo | COMPLETO como processo de orçamento | Não criar outro cadastro de mão de obra sem decisão de negócio | módulo de orçamento; painel de itens | Sem cadastro adicional |
| Bancos | Cadastro auxiliar | Aprovado no escopo amplo | AUSENTE | Modelo/API/interface ausentes; campos financeiros detalhados não definidos integralmente | Especificação:289,315; schema/App | P3 |
| Centros de custo | Cadastro auxiliar | Aprovado | AUSENTE | Modelo/API/interface ausentes | Especificação:289,315; schema/App | P3 |
| Condições de pagamento | Cadastro para fluxos financeiros | Aprovado; sem implementar financeiro nesta missão | AUSENTE | Modelo/API/interface ausentes; finalizar detalhes quando houver etapa financeira autorizada | Especificação:311; schema/App | P3 |
| Formas de pagamento | Cadastro auxiliar financeiro | Previsto para faturamento | AUSENTE | Não confundir com autorização do orçamento; não implementar durante esta auditoria | Especificação, seção financeira; schema/App | P3 |
| Status da OS | Nome, atributo técnico, ativação e reativação | Atributo imutável após uso atual ou histórico | COMPLETO por código/testes no recorte técnico | Operação visual autenticada NÃO VERIFICADA | `ServiceOrderStatusesPage.tsx`; StatusService; everAssigned/technicalCompletion | P1 — validar operação |
| Status da OS | Manutenção auxiliar geral | Preservar propriedades e ciclo de vida documentado | PARCIAL | Sem exclusão de status nunca usado; propriedade allowsBudgetWithdrawal não editável no formulário; definir escopo de edição antes de ampliá-lo | DTO/StatusService; schema ServiceOrderStatus; regra geral de auxiliares | P2 — escopo a consolidar |
| Usuários | Contas individuais e permissões | Administrador e concessões individuais; sem perfis rígidos/Master | PARCIAL | Autenticação, bootstrap e estrutura existem; falta tela/API administrativa de criação/manutenção e concessões | docs 02/07; User/Permission/UserPermission; App/Auth | P1 |
| Perfis | Perfis rígidos | Explicitamente não adotados | COMPLETO quanto à decisão | Não implementar perfis fixos como se fossem requisito ausente | docs 02, usuários; docs 07, autorização individual | Sem correção |
| Empresa | Identificação centralizada e logo | Razão, fantasia, CNPJ, endereço, telefone, e-mail, logo; somente Admin altera | COMPLETO no recorte de identificação por código/testes | Operação visual autenticada NÃO VERIFICADA; sem dados fictícios oficiais | `CompanySettingsPage.tsx`; CompanySettingsService; schema:278 | P1 — validar operação |
| Empresa | Logo segura e documentos | PNG/JPEG até 2 MiB; decodificação, dimensões, isolamento e uso nos documentos | COMPLETO por implementação/testes | Não exigir lista/pesquisa de empresas para configuração única | CompanySettingsService; testes; componentes de impressão | P2 — validar visual |
| Tipos de contribuinte | Classificação fiscal | Opcional no cadastro geral; regras fiscais futuras | AUSENTE | Não tornar obrigatório para abrir OS; faltam catálogo e decisões fiscais completas | Especificação, cadastro Pessoa; Especificações não documentadas | P3 |
| Tipos de endereço | Catálogo dinâmico | Principal, cobrança, entrega, instalação nos documentos antigos | AUSENTE | Sem catálogo dinâmico; conciliar com endereço único aprovado para abertura | docs 02; PersonAddress; formulário novo | P2 — divergência de escopo |
| Problemas de homologação | Registro, consulta Admin, situações e captura | Ferramenta exclusiva de homologação; usuário/horário/versão automáticos | COMPLETO no recorte por código; operação NÃO VERIFICADA | Confirmar fluxo visual e captura com perfis diferentes; não é catálogo de defeitos técnicos | `HomologationIssuesPage.tsx`; HomologationIssuesService/Controller | P1 — validar operação |
| Defeitos / problemas de equipamento | Cadastro auxiliar genérico | Proposta rejeitada | COMPLETO quanto à exclusão do escopo | Não implementar; distinto do registro de problemas da homologação | Especificação:289 | Sem correção |

## Usabilidade e validações

1. **Defeito comprovado:** limite de nome do serviço divergente (240 no formulário, 120 no Backend). Não foi corrigido, por limite expresso desta etapa.
2. **Sugestão de consistência, P2:** Serviços, Produtos e Status usam required do HTML e erros gerais; não seguem integralmente o padrão recente de asterisco/legenda, erro por campo e foco do formulário de Pessoa. Não inventar novas obrigatoriedades; uniformizar apenas a comunicação das existentes.
3. **Lacuna aprovada, P1:** não há acesso geral navegável para manutenção de Pessoas/Equipamentos. Ter endpoint ou formulário dentro da OS não equivale a cadastro geral concluído.
4. **Lacuna aprovada, P1/P2:** tipos/marcas podem ser selecionados na abertura, mas não há manutenção própria acessível. A remoção dos botões de criação dentro da abertura foi decisão aprovada, não regressão a desfazer.
5. No formulário novo, CPF/CNPJ, telefones, e-mails e endereço são opcionais; nome é obrigatório. PF/PJ controla os campos próprios. Não há respaldo para transformar documento ou contatos em obrigatórios.
6. Dados do rascunho de entrada (estado físico, acessórios etc.) pertencem à OS, não ao cadastro permanente do equipamento. A auditoria não propõe misturá-los.

## Divergências documentais e limites de interpretação

- Documentos antigos descrevem múltiplos endereços e contato PJ por Pessoa vinculada; a decisão recente implementada na abertura usa endereço único e contato livre. É necessário consolidar o escopo geral de Pessoas antes de ampliar o módulo. O formulário publicado segue a decisão recente.
- Tipos de contato são documentados como catálogo dinâmico com parceiro; o modelo atual mantém enum provisório de quatro papéis. O cadastro de clientes não comprova manutenção de todos os papéis.
- O escopo amplo de Produtos menciona visão 360 e relacionamentos ainda futuros; o plano do cadastro básico delimita enum de categoria e ausência de seriais individuais. Isso é diferença de etapa, não defeito automático.
- Perfis rígidos e usuário Master aparecem em textos históricos; as decisões consolidadas adotam Administrador e permissões individuais. Não criar um módulo de perfis fixos para preencher uma falsa lacuna.
- Alguns textos descrevem estoque/encerramento como futuro, embora já existam módulos correspondentes. Consultar os adendos e código antes de usar tais trechos como prova de ausência.
- Bancos, centros de custo, unidades e condições de pagamento estão aprovados no escopo amplo, mas sua ausência não autoriza desenvolver Compras, Vendas ou Financeiro nesta missão.

## Próxima etapa recomendada

Autorizar uma etapa limitada de manutenção de Pessoas/Equipamentos e gestão individual de usuários, com correção do limite de nome de serviço. Antes de alterar o modelo geral de Pessoas, consolidar as divergências de endereço/contato e o alcance dos tipos de contato. Em seguida, concluir manutenção de tipos e marcas. Auxiliares financeiros ficam para a etapa própria.

Realizar validação visual autenticada da publicação com dados legítimos do operador. A auditoria de código e os testes isolados não substituem o aceite funcional da equipe.

Nenhum commit, staging ou push foi realizado. Alterações anteriores do repositório foram preservadas.
