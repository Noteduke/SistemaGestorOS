# Preparação da Homologação 1

**Estado:** preparação parcial; não liberar a homologação ainda.
**Atualizado:** 16/10/2026

## Escopo confirmado neste recorte

- Ciclo de vida dos atributos de conclusão técnica dos status, preservando o histórico e sem reclassificação automática.
- Impressão A4 do orçamento da OS, sem custos, lucro, margem ou informação administrativa restrita.
- As impressões de entrada, orçamento e saída incluem **DOCUMENTO DE TESTE — HOMOLOGAÇÃO** quando o Frontend foi compilado no modo `homologation`. O aviso e a marca d'água são fixos e não podem ser removidos pelo operador. Builds `production` não incluem o marcador, mesmo que a API reporte homologação; antes da operação, conferir que modo de build e ambiente do Backend correspondem ao ambiente escolhido.
- A identificação empresarial dos documentos vem da configuração central carregada do Backend: razão social, nome fantasia, CNPJ, endereço, telefone, e-mail e logotipo. Os campos iniciam vazios; não se devem inventar valores oficiais. Sem dados cadastrados, o documento informa que a identificação está incompleta. As três impressões continuam sendo geradas no navegador em A4.
- O registro de problemas é exclusivo do modo de homologação. Funcionários autenticados podem registrar descrição, tentativa, resultado, tela e OS opcional; Administradores consultam a lista e alteram a situação entre PENDENTE, EM CORREÇÃO, CORRIGIDO e VALIDADO. Capturas opcionais aceitam PNG/JPEG até 5 MiB, são salvas fora da raiz pública em diretório configurado e disponibilizadas somente a Administradores autenticados.
- Nenhuma funcionalidade financeira de contas a pagar/receber, compras, vendas, cobrança ou emissão fiscal faz parte deste preparo.

## Isolamento configurado e limites

- Banco exclusivo reservado: `gestor_os_homologation`; não foi criado nem conectado nesta etapa. A configuração precisa ser preenchida localmente a partir de `backend/.env.homologation.example`, com usuário e senha próprios e privilégios limitados ao banco de homologação.
- Banco de testes automatizados continua separado: `gestor_os_opening_test`.
- `npm run prisma:safe -- <gestor_os_opening_test|gestor_os_homologation> migrate <status|deploy>` exige alvo explícito e consulta `SELECT DATABASE()` antes de iniciar Prisma. `prisma.config.ts` bloqueia comandos Prisma de banco diretos; o marcador de preflight é passado somente pelo wrapper após a confirmação. `deploy` continua sendo uma operação de escrita e exige revisão/aprovação operacional própria.
- Para a homologação, o Backend exige `GOS_DEPLOYMENT_ENV=homologation`, destino `gestor_os_homologation` e `GOS_EXTERNAL_EFFECTS_ENABLED=false`. O arquivo exemplo contém apenas placeholders e não deve ser copiado para Git como segredo.
- Os logotipos ficam em armazenamento persistente privado configurado por `GOS_COMPANY_ASSETS_DIR`, separados automaticamente em subdiretórios `production` e `homologation`. O diretório precisa ser provisionado com permissões restritas e backup/restauração junto ao ambiente; logos PNG/JPEG são limitadas a 2 MiB. Esse armazenamento ainda não foi provisionado no host da equipe.
- O exemplo de Backend reserva a porta `3100`, que corresponde ao proxy configurado no exemplo do Frontend. Com o arquivo local `.env.homologation` revisado e preenchido com credencial exclusiva, iniciar o Backend com `$env:GOS_ENV_FILE='.env.homologation'; npm run start:dev`. Iniciar o Frontend separadamente com `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort --mode homologation`. Antes disso, confirmar o banco pelo wrapper `npm run prisma:safe -- gestor_os_homologation migrate status`. Não reutilizar serviços/portas do ambiente principal ou de `gestor_os_opening_test`.
- O repositório não possui um subsistema geral de anexos/arquivos nem geração de documentos persistida no servidor. A impressão dos documentos é gerada no navegador. Capturas de problemas usam armazenamento local isolado, configurado em `GOS_HOMOLOGATION_FILES_DIR`; essa configuração ainda precisa ser instalada e validada no host da equipe antes de receber arquivos.
- A captura de tela dos problemas é o primeiro armazenamento de arquivo da homologação e exige `GOS_HOMOLOGATION_FILES_DIR` apontando para diretório local segregado. A política de retenção, expurgo e backup dessas capturas ainda depende de definição operacional; não armazenar dados pessoais ou segredos nos relatos/capturas.
- Não há neste recorte integrações ativas de e-mail, cobrança, emissão fiscal ou serviços externos. O spike não importado dos Correios não é funcionalidade ativa. Qualquer integração futura deverá falhar fechada no modo de homologação.

## Preservação, backup, atualização e rollback

- Os dados de homologação devem ser preservados entre versões: OS, clientes, equipamentos, produtos, estoque e registros de problemas. É proibido executar `migrate reset`, limpeza geral, truncamento ou reinicialização do banco sem autorização administrativa explícita.
- Antes de cada atualização que altere o banco, interromper as gravações da homologação e produzir um dump com data/hora, usando conta local restrita ao banco `gestor_os_homologation`, senha solicitada interativamente e sem `--databases`. Armazenar o arquivo em pasta de backup protegida por ACL e disco criptografado; não gravar senha em linha de comando, variável, arquivo ou histórico.
- Exemplo a adaptar somente depois da escolha do servidor físico e da provisão da conta de backup:

  ```powershell
  $mysqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
  $backupDir = 'D:\GestorOS\backups\homologation'
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  icacls $backupDir /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F"
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dump = Join-Path $backupDir "gestor_os_homologation-$stamp.sql"
  & "$mysqlBin\mysqldump.exe" --host=127.0.0.1 --port=3306 --user=gos_homologation_backup --password --single-transaction --quick --routines --events --triggers --hex-blob --result-file="$dump" gestor_os_homologation
  if ($LASTEXITCODE -ne 0) { throw 'Backup falhou; não iniciar a atualização.' }
  if (-not (Test-Path -LiteralPath $dump) -or (Get-Item -LiteralPath $dump).Length -eq 0) { throw 'Dump vazio/ausente; não iniciar a atualização.' }
  if (-not (Select-String -LiteralPath $dump -Pattern '^-- Dump completed on ' -Quiet)) { throw 'Dump sem marcador de conclusão; não iniciar a atualização.' }
  if (Select-String -LiteralPath $dump -Pattern '^\s*(CREATE DATABASE|USE\s)' -Quiet) { throw 'Dump contém seleção/criação de banco; não restaurar até revisar.' }
  Get-FileHash -Algorithm SHA256 -LiteralPath $dump
  ```

- A validação de restauração deve ocorrer em um banco novo e isolado, por exemplo `gestor_os_homologation_restore_check`, nunca em `gestor_os`, `gestor_os_opening_test` ou sobre o banco ativo de homologação. Confirmar `SELECT DATABASE()` no mesmo cliente antes de executar `source C:/.../gestor_os_homologation-<data-hora>.sql`; o dump sem `--databases` evita selecionar/criar o banco de origem. Comparar tabelas, contagens e amostras não sensíveis, executar `migrate status` somente depois de configurar um alvo seguro e registrar hash/resultado. A restauração só estará validada após esse ensaio.
- Atualização: confirmar alvo pelo wrapper `prisma:safe`, fazer backup, conferir hash/rodapé do dump, revisar migration e executar `migrate status`; aplicar migrations aprovadas com parada de escrita e monitoramento; conferir o status e a estrutura no banco de homologação. Não reutilizar `.env` do banco de testes automatizados.
- Rollback: MySQL pode confirmar implicitamente DDL, portanto não usar `ROLLBACK` como recuperação. Parar o ambiente, preservar o banco possivelmente parcial para diagnóstico e restaurar o backup em um novo banco isolado. Validar essa cópia e somente então, com aprovação administrativa, reconfigurar a homologação para a cópia restaurada. Não apagar ou sobrescrever o original durante a recuperação; não executar `DROP`/reset automaticamente.
- Este procedimento está documentado, mas ainda não foi executado nem validado. Faltam escolher/provisionar o host MySQL de homologação, conta de backup, banco separado para ensaio de restauração, pasta protegida e política de retenção dos dumps.

## Consulta pública Dell

GT63PT3 foi associado manualmente ao modelo Latitude 3420 em observação anterior; a requisição HTTP direta atual recebeu 403. Para 283NLZ1 a requisição HTTP direta também recebeu 403 e o modelo permanece desconhecido. O 403 não trouxe HTML/redirect para inspeção, então não há conclusão verificável sobre campo no HTML inicial ou dependência de JavaScript. Implementado endpoint com timeout, redirect manual e extração conservadora de JSON-LD associado à mesma tag, mais ação explícita na tela de novo equipamento Dell. Sem associação verificável, devolve falha; não consulta garantia, proprietário ou histórico, não usa TechDirect e não contorna bloqueios. A aplicação do modelo requer confirmação do operador e substituição de modelo já preenchido requer confirmação adicional. Consulta indisponível não bloqueia preenchimento manual nem abertura da OS. A extração real online continua pendente.

## Preparação nativa do Windows 10

Foram preparados scripts em `scripts/homologation/windows10`: verificação de pré-requisitos, build do Frontend em `homologation`, staging de artefatos, preparação de diretórios persistentes, instalação explícita de serviços WinSW e verificação de início automático/portas. Os templates Caddy usam HTTPS interno, bind LAN, bloqueio de IPs fora de faixas privadas e proxy para Backend em loopback. Os serviços usam a conta Windows LocalService com ACLs de leitura e gravação limitadas aos diretórios necessários. O instalador exige `-Apply`, elevação administrativa, binários Caddy/WinSW fornecidos localmente, arquivo de configuração local e validação do Caddyfile. Nenhuma instalação ou criação de diretório foi executada nesta preparação. No host atual falta Caddy, WinSW, MySQL ativo e o banco de homologação. A implantação precisa ainda configurar DNS/hosts para `gestor-os.home.arpa`, confiar a CA interna do Caddy nos clientes LAN, revisar ACLs dos arquivos/segredos e validar firewall e inicialização após reinicialização.

Referências oficiais consultadas para preparar a configuração: [WinSW v3 — arquivo XML e conta de serviço](https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md), [Caddy — matcher `remote_ip`](https://caddyserver.com/docs/caddyfile/matchers) e [Caddy — TLS interno](https://caddyserver.com/docs/caddyfile/directives/tls). A CA raiz interna precisa ser confiada explicitamente nos computadores clientes; nenhum certificado/CA foi distribuído nesta preparação.

Para usar no host escolhido: primeiro provisionar `gestor_os_homologation` e conta exclusiva, preencher o arquivo local ignorado pelo Git com URL somente desse banco, revisar caminho/ACLs, executar os scripts de build e staging, copiar os templates para `config`, validar o Caddyfile e somente então considerar `Install-HomologationServices.ps1 -Apply` em PowerShell elevado. Este documento é preparação; não significa que o host esteja pronto.

## Validação de logo e preservação

O backend agora decodifica completamente PNG/JPEG com Sharp após verificar assinatura/MIME, limitando arquivo a 2 MiB, largura e altura a 6.000 pixels, total a 16 megapixels e rejeitando animação/múltiplas páginas. O armazenamento continua privado e separado por ambiente. O diretório local ainda precisa ser provisionado e ACL/backup configurados no host.

## Documentos de impressão

| Documento | Situação |
|---|---|
| Orçamento da OS | Implementado; usa a identificação empresarial cadastrada e inclui a marca fixa de teste em build Frontend `homologation`. Ainda requer inspeção visual A4 em navegador/impressora. |
| Entrada/recebimento da OS | Implementada em A4 a partir dos retratos da OS, reclamação/observações persistidas e espaços em branco para condição física, acessórios e assinaturas. Os campos em branco não são campos obrigatórios do sistema. |
| Saída/entrega da OS | Implementada em A4 com cliente/equipamento, resultado de encerramento, itens e valores registrados no orçamento e assinaturas. O sistema ainda não registra cobrança/pagamento: a saída declara que o total exibido é do orçamento e não comprovante de cobrança. Não inventa vencimento ou garantia. |

Os três documentos usam a identificação empresarial persistida e exibem a marca de teste quando o Frontend foi compilado no modo `homologation`; a marca não pode ser removida pelo operador e não está presente nos builds `production`. Não exibem custos internos, lucro, margem ou logs administrativos. A validação visual em impressora ou pré-visualização A4 ainda é necessária.

## Cadastro empresarial e numeração de OS

Foi implementada a tela **Identificação da empresa**, editável somente por Administrador. A configuração singleton permanece vazia até cadastro explícito e a API entrega apenas os campos públicos necessários aos documentos. A logo aceita PNG/JPEG até 2 MiB, tem assinatura verificada, é persistida fora da raiz pública e em diretório segregado por ambiente. A migration `20261023120000_company_settings` foi aplicada pelo wrapper seguro somente em `gestor_os_opening_test`; `migrate status` confirmou schema atualizado. Nenhuma aplicação foi feita em `gestor_os` ou no banco de homologação ainda não provisionado.

O Backend apresenta OS como `OS-000001` em produção e `HOS-0000001` em homologação. O identificador numérico persistido e a alocação transacional existente não foram alterados; bancos separados têm sequências naturalmente independentes. A preservação operacional da sequência HOS, concorrência de criação, impressão com dados/logo reais e ausência do marcador em produção ainda exigem teste no host de homologação.

## Registro de problemas

O endpoint e a tela são exclusivos de `GOS_DEPLOYMENT_ENV=homologation` e do build Frontend `homologation`. Todos os funcionários autenticados podem criar registros; apenas Administradores podem consultar, alterar situação e baixar captura. O servidor armazena usuário, horário e versão do sistema. A captura é opcional, PNG/JPEG verificada pelo conteúdo e limitada a 5 MiB. Nenhum segredo ou documento pessoal deve ser incluído. Retenção e expurgo continuam pendentes de decisão operacional.

## Status e dados existentes

Os dez status originais preservados mantêm a classificação inicial `NOT_COMPLETED`; os já usados permanecem imutáveis e não foram reclassificados. A consulta de leitura ao banco `gestor_os_opening_test` nesta etapa encontrou também quatro registros “Status de validação” de testes anteriores; todos os 14 registros estavam classificados `NOT_COMPLETED`, e os marcados como usados permanecem imutáveis. Os quatro registros adicionais confirmam que o banco automatizado contém dados de teste e não deve ser promovido/reutilizado como base limpa de homologação. Nenhum status ou dado foi alterado nesta etapa. Novos status podem ser criados pelo Administrador e receber classificação apropriada, desde que ainda não utilizados.

## Validação ainda necessária

Antes de liberar a Homologação 1:

1. Criar `gestor_os_homologation` por procedimento administrativo autorizado, com acesso isolado e credenciais próprias. Não reutilizar banco de produção ou de testes automatizados.
2. Instalar configuração local ignorada pelo Git e validar o alvo com `SELECT DATABASE()`; não imprimir URL nem senha. Configurar `GOS_HOMOLOGATION_FILES_DIR` e `GOS_COMPANY_ASSETS_DIR` para diretórios persistentes isolados e não públicos.
3. Aplicar migrations somente via comando seguro após inspeção e autorização operacional própria.
4. Criar usuários descartáveis e dados de homologação; impedir tráfego/ações externas reais.
5. Validar visualmente em A4 entrada, orçamento e saída; confirmar que produção não inclui o marcador.
6. Obter resultado funcional verificável da consulta pública Dell para modelo apenas; preencher manualmente é fallback, não valida a integração.
7. Validar orçamento A4 visualmente, testar permissões com perfis distintos e o controle exclusivo em duas sessões autenticadas.
8. Definir formalmente critérios e roteiro completo da Homologação 1 e escopo da Homologação 2. Definir retenção/expurgo de capturas e decidir se os documentos de saída precisam futuramente incluir cobrança registrada; atualmente não há essa informação no sistema.
9. Escolher e provisionar servidor/instância MySQL exclusivos para homologação, com rede/porta próprias, banco `gestor_os_homologation`, usuário próprio e configuração local ignorada pelo Git. O ambiente atual não tem MySQL escutando na porta local e não possui `.env.homologation`; nenhuma conexão foi tentada porque o wrapper falhou fechado antes de conectar.
10. Provisionar diretórios segregados para capturas e backups, conta restrita de backup e banco isolado para ensaio de restauração; executar e registrar o primeiro backup e teste de restauração antes de uma atualização de schema.
11. Completar o ciclo autenticado de cliente, equipamento, OS, orçamento, autorização, aplicação de peças, status, encerramento e saída; testar também cancelamento e encerramento sem reparo, perfis distintos e duas sessões simultâneas. Nenhum endpoint operacional foi chamado nesta preparação, pois não havia serviços ativos nem banco de homologação configurado.

Os testes automatizados, sozinhos, não liberam a homologação.
