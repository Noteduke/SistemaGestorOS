# Auditoria técnica — preparação H1 e consulta pública Dell

**Data:** 16/10/2026
**Escopo:** diff da missão Noteduke; sem conexão com banco e sem operações administrativas no host.

## 1. Conclusão executiva

As alterações implementadas estão coerentes com a arquitetura revisada e podem receber commit local. Os testes focados do Backend e Frontend passaram; o build homologation do Frontend e o build/teste do Backend passaram. A suíte completa do Frontend apresentou 159 aprovações e uma falha em `ServiceOrderDetailPage.test.tsx`, teste de liberação do controle de edição que não toca nos arquivos alterados nesta missão. A Homologação 1 continua **não liberada**: falta validar o ambiente operacional e a consulta Dell online permanece sem resposta extraível.

## 2. Arquivos e evidências analisados

- Backend: serviço/controlador/módulo de consulta Dell, validação do logo e testes unitários de serviços.
- Frontend: API e formulário de rascunho de equipamento na abertura da OS, testes do fluxo Dell.
- Preparação Windows 10: scripts PowerShell, templates Caddy e WinSW.
- Documentação: prova Correios/Dell, preparação H1 e regras do agente auditor.
- Schema e código existente da numeração: `service_order_number_control`, `service_order_number_allocations`, abertura transacional e confirmação de OS.
- Estado inicial do Git: `main`, `80a12f7`, 28 commits locais à frente de `origin/main`, sem alterações antes desta missão.

## 3. Aderência e achados

### Bloqueadores

- Nenhum bloqueador de implementação identificado no escopo inspecionado.
- A Homologação 1 permanece bloqueada para uso operacional até provisionar e testar o banco `gestor_os_homologation`, serviços, usuários, ciclo de OS, backup/restauração e testes simultâneos.

### Importantes

- Dell: duas requisições HTTP GET diretas sem sessão/cookies/credenciais retornaram **403**. O HTML inicial não foi recebido. Portanto, não há evidência para afirmar se o modelo está no HTML ou depende de JavaScript. GT63PT3 tem resultado manual previamente observado como **Latitude 3420**; esse resultado não é extração automatizada. Para 283NLZ1 o modelo continua desconhecido.
- O parser só aceita JSON-LD quando o mesmo registro associa Service Tag exata e modelo. Não há amostra Dell real para validar essa forma. Os testes de contrato usam resposta sintética e comprovam somente os critérios locais; o serviço corretamente falha fechado com 403. A integração online permanece pendente de resposta pública verificável.
- A suíte completa do Frontend teve uma falha no teste existente `libera a OS anterior ao navegar para outra OS na mesma tela`, no arquivo `ServiceOrderDetailPage.test.tsx`; 159 outros testes passaram. Os dois arquivos de teste focados nos componentes alterados passaram com 67 testes.
- A revisão de schema/código mostra alocação de OS sob lock transacional da linha singleton de controle, alocação de número com chave primária, `openingId` único e `ServiceOrder.numberValue` único. Isso sustenta a proteção de unicidade no banco/código, mas não comprova concorrência real, persistência após reinicialização ou continuidade da sequência HOS sem o ensaio no banco operacional de homologação.
- Caddy/WinSW e MySQL não estão instalados/ativos no host inspecionado. Scripts e templates estão preparados e sintaxe PowerShell/XML foi validada; Caddyfile não pôde ser validado pelo binário ausente. Nenhum script de instalação ou provisionamento foi executado.

### Ajustes futuros

- Obter resposta HTML pública Dell permitida e uma amostra real mínima para validar o parser ou ajustar o campo estruturado, sem armazenar dados de garantia/histórico e sem contornar 403.
- Executar `Verify-HomologationServices.ps1` após instalação e validar nome/DNS, confiança da CA interna, firewall LAN, login, OS/numeração em sessões simultâneas, impressão, logo, backup e restauração.
- Definir retenção/expurgo de capturas, conta MySQL exclusiva com privilégio mínimo, pasta de backup protegida e instância isolada para restauração.

## 4. Segurança, API e banco

- A consulta Dell é uma rota POST sob `service_orders.opening.create`; não usa TechDirect. O parser não usa nome/título genérico como prova, não faz mapeamento por tag e não retorna outros dados Dell.
- O HTTP tem timeout de 8 s, redirect manual (não seguido), resposta limitada a 2 MiB e classifica tag inválida, 404, 403/429, redirecionamento, timeout, modelo ausente e falha de rede.
- O upload do logotipo preserva PNG/JPEG e máximo de 2 MiB; Sharp verifica dimensões até 6.000 × 6.000, 16 megapixels, página única e decodificação integral. O caminho de armazenamento continua privado e segregado por ambiente.
- Não houve conexão, consulta, migration ou alteração de banco. `gestor_os` não foi acessado; `gestor_os_opening_test` não foi usado como banco operacional.
- Os templates Windows usam LocalService e ACLs dedicadas; configuração/segredo tem ACL restrita. A instalação exige `-Apply` e elevação. O proxy Caddy restringe IPs de origem a faixas privadas, usa TLS interno e backend em loopback. A confiança da CA nos clientes é uma ação operacional futura.

## 5. Validações executadas

- Backend: `npm run build` — passou.
- Backend: `node --test test/services.test.mjs` — 25/25 passaram, incluindo parser Dell, bloqueio/timeout/redirect/rede e decode/limites de imagem.
- Numeração de abertura/confirmação: `node --test test/service-order-openings.test.mjs test/service-order-confirmation.test.mjs` — 15/15 passaram em harnesses unitários, incluindo sequenciamento e proteção transacional simulada.
- Frontend: `npm run build -- --mode homologation` — typecheck e build passaram.
- Frontend: `npx vitest run src/pages/service-orders/ServiceOrderOpeningPage.test.tsx src/pages/company-settings/CompanySettingsPage.test.tsx` — 67/67 passaram.
- Suíte completa Frontend `npm test` — 159 passaram, 1 falhou pelo controle de edição em `ServiceOrderDetailPage.test.tsx`.
- Parser PowerShell e XML WinSW — passaram. Validação Caddy real não executada porque o binário não está disponível.
- Nenhum teste de concorrência real, reinício com persistência, integração/E2E ou numeração operacional foi executado: não há serviço MySQL ativo nem banco H1 provisionado. Os testes de sequência são simulações unitárias, não substituem o ensaio no MySQL H1.

## 6. Status do Git e recomendação

As alterações ficam limitadas à consulta Dell no rascunho de equipamento, proteção do logo, preparação Windows 10 e documentação/auditoria solicitadas. Não há migration nova. Recomendação: **pode commitar**, mantendo como pendentes a única falha da suíte completa do Frontend e a validação online Dell/operacional. Não fazer push e não declarar H1 liberada.
