# Preparação da Homologação 1

**Estado:** preparação parcial; não liberar a homologação ainda.
**Atualizado:** 16/10/2026

## Escopo confirmado neste recorte

- Ciclo de vida dos atributos de conclusão técnica dos status, preservando o histórico e sem reclassificação automática.
- Impressão A4 do orçamento da OS, sem custos, lucro, margem ou informação administrativa restrita.
- Em modo de build `homologation`, a impressão de orçamento inclui a identificação fixa **DOCUMENTO DE TESTE — HOMOLOGAÇÃO**, tanto como aviso visível quanto marca d'água impressa. Não há controle na tela para removê-la. Builds de produção não incluem a identificação.
- Impressões de entrada e saída da OS usam o mesmo marcador somente no build `homologation`; a impressão é produzida pelo navegador em A4 e a inclusão do marcador é decidida no build, sem opção de remoção pela interface. Produção não contém a identificação.
- O registro de problemas é exclusivo do modo de homologação. Funcionários autenticados podem registrar descrição, tentativa, resultado, tela e OS opcional; Administradores consultam a lista e alteram a situação entre PENDENTE, EM CORREÇÃO, CORRIGIDO e VALIDADO. Capturas opcionais aceitam PNG/JPEG até 5 MiB, são salvas fora da raiz pública em diretório configurado e disponibilizadas somente a Administradores autenticados.
- Nenhuma funcionalidade financeira de contas a pagar/receber, compras, vendas, cobrança ou emissão fiscal faz parte deste preparo.

## Isolamento configurado e limites

- Banco exclusivo reservado: `gestor_os_homologation`; não foi criado nem conectado nesta etapa. A configuração precisa ser preenchida localmente a partir de `backend/.env.homologation.example`, com usuário e senha próprios e privilégios limitados ao banco de homologação.
- Banco de testes automatizados continua separado: `gestor_os_opening_test`.
- `npm run prisma:safe -- <gestor_os_opening_test|gestor_os_homologation> migrate <status|deploy>` exige alvo explícito e consulta `SELECT DATABASE()` antes de iniciar Prisma. `prisma.config.ts` bloqueia comandos Prisma de banco diretos; o marcador de preflight é passado somente pelo wrapper após a confirmação. `deploy` continua sendo uma operação de escrita e exige revisão/aprovação operacional própria.
- Para a homologação, o Backend exige `GOS_DEPLOYMENT_ENV=homologation`, destino `gestor_os_homologation` e `GOS_EXTERNAL_EFFECTS_ENABLED=false`. O arquivo exemplo contém apenas placeholders e não deve ser copiado para Git como segredo.
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

O identificador `283NLZ1` não foi associado a um modelo de forma verificável nesta preparação. A consulta pelo formulário público da Dell, feita no navegador, após o envio mostrou uma ficha com outro Service Tag; portanto o modelo exibido não foi associado a `283NLZ1` e não foi registrado como resultado. A página carrega conteúdo dinâmico por JavaScript. Nenhum endpoint interno ou API TechDirect foi usado e não foi implementado scraper nem contornado bloqueio. Alternativa provisória para a equipe: confirmar o modelo pela etiqueta física ou informações do próprio equipamento e preenchê-lo manualmente; isso não valida a integração Dell. A OS não pode depender da disponibilidade Dell.

## Documentos de impressão

| Documento | Situação |
|---|---|
| Orçamento da OS | Implementado; modo `homologation` inclui marca fixa de teste. Ainda requer inspeção visual A4 em navegador/impressora. |
| Entrada/recebimento da OS | Implementada em A4 a partir dos retratos da OS, reclamação/observações persistidas e espaços em branco para condição física, acessórios e assinaturas. Os campos em branco não são campos obrigatórios do sistema. |
| Saída/entrega da OS | Implementada em A4 com cliente/equipamento, resultado de encerramento, itens e valores registrados no orçamento e assinaturas. O sistema ainda não registra cobrança/pagamento: a saída declara que o total exibido é do orçamento e não comprovante de cobrança. Não inventa vencimento ou garantia. |

O orçamento existente mantém seu próprio gerador A4. Os três documentos exibem a marca de teste somente no build homologation e a marca não pode ser removida pelo operador. A validação visual em impressora ou pré-visualização A4 ainda é necessária.

## Registro de problemas

O endpoint e a tela são exclusivos de `GOS_DEPLOYMENT_ENV=homologation` e do build Frontend `homologation`. Todos os funcionários autenticados podem criar registros; apenas Administradores podem consultar, alterar situação e baixar captura. O servidor armazena usuário, horário e versão do sistema. A captura é opcional, PNG/JPEG verificada pelo conteúdo e limitada a 5 MiB. Nenhum segredo ou documento pessoal deve ser incluído. Retenção e expurgo continuam pendentes de decisão operacional.

## Status e dados existentes

Os dez status originais preservados mantêm a classificação inicial `NOT_COMPLETED`; os já usados permanecem imutáveis e não foram reclassificados. A consulta de leitura ao banco `gestor_os_opening_test` nesta etapa encontrou também quatro registros “Status de validação” de testes anteriores; todos os 14 registros estavam classificados `NOT_COMPLETED`, e os marcados como usados permanecem imutáveis. Os quatro registros adicionais confirmam que o banco automatizado contém dados de teste e não deve ser promovido/reutilizado como base limpa de homologação. Nenhum status ou dado foi alterado nesta etapa. Novos status podem ser criados pelo Administrador e receber classificação apropriada, desde que ainda não utilizados.

## Validação ainda necessária

Antes de liberar a Homologação 1:

1. Criar `gestor_os_homologation` por procedimento administrativo autorizado, com acesso isolado e credenciais próprias. Não reutilizar banco de produção ou de testes automatizados.
2. Instalar configuração local ignorada pelo Git e validar o alvo com `SELECT DATABASE()`; não imprimir URL nem senha. Configurar também `GOS_HOMOLOGATION_FILES_DIR` para local isolado e não público.
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
