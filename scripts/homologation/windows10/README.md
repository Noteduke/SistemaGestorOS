# Instalação nativa da Homologação 1 (Windows 10)

Este pacote apenas prepara build/configuração. Ele não baixa executáveis, cria banco, executa migrations ou instala serviço automaticamente.

## Pré-requisitos no host escolhido

1. Windows 10 atualizado, Node.js 24, Git e MySQL Server 8.0.46. Caddy e WinSW devem ser obtidos e verificados pelo administrador a partir de suas fontes oficiais; esta pasta não inclui binários.
2. Provisionar por procedimento administrativo separado o banco `gestor_os_homologation` e uma conta de aplicação exclusiva com privilégio mínimo nesse banco. Preparar conta de backup, destino de backup e banco separado de restauração. Nunca configurar `gestor_os` ou `gestor_os_opening_test` nesta instalação.
3. Escolher DNS/hosts interno `gestor-os.home.arpa`, endereços LAN e política de confiança da CA interna nos computadores clientes.

## Ordem de preparação

Execute a partir da raiz do repositório no host de build. Os caminhos abaixo são relativos à raiz:

```powershell
& .\scripts\homologation\windows10\Test-HomologationPrerequisites.ps1
Push-Location .\backend
npm run build
Pop-Location
& .\scripts\homologation\windows10\Build-HomologationFrontend.ps1
```

No host de destino, abra PowerShell elevado e revise os diretórios com `-WhatIf` antes de criá-los:

```powershell
& .\scripts\homologation\windows10\Prepare-HomologationDirectories.ps1 -WhatIf
& .\scripts\homologation\windows10\Prepare-HomologationDirectories.ps1 -Confirm
```

Para a instalação inicial, copie ou clone o repositório para uma pasta de staging local. A partir da raiz dessa cópia, execute `Deploy-HomologationArtifacts.ps1` apontando `-RepositoryRoot` para ela. Esse deploy copia diretamente e não oferece rollback transacional; não o use para atualizar uma instalação existente. Copie `Homologation.env.template` para `C:\ProgramData\GestorOS\homologation\config\.env.homologation`, substitua a senha localmente sem colocá-la em comando/histórico/Git, confirme que a URL seleciona somente `gestor_os_homologation` e mantenha a ACL restrita. Copie `Caddyfile.homologation.template` para a mesma pasta como `Caddyfile` e confira IPs, hostname e caminho `root`.

O script de build confirma que o bundle contém `DOCUMENTO DE TESTE — HOMOLOGAÇÃO` e grava `build-info.json` com ambiente, versão e commit de origem. O deploy recusa artefatos sem esse marcador/manifests. O diretório de artefatos é ignorado pelo Git.

Copie os binários já verificados para caminhos locais explícitos. Primeiro execute a prévia, que valida caminhos, variáveis (sem exibir valores), XMLs, manifesto e bundle, sem copiar arquivos, alterar ACLs ou registrar serviços:

```powershell
& .\scripts\homologation\windows10\Install-HomologationServices.ps1 -CaddyExe 'C:\staging\caddy.exe' -WinSWExe 'C:\staging\WinSW-x64.exe' -WhatIf
```

Se a prévia passar e os caminhos/artefatos forem revisados, execute em PowerShell elevado no host de destino:

```powershell
& .\scripts\homologation\windows10\Install-HomologationServices.ps1 -CaddyExe 'C:\staging\caddy.exe' -WinSWExe 'C:\staging\WinSW-x64.exe' -Apply -Confirm
& .\scripts\homologation\windows10\Verify-HomologationServices.ps1
```

## Primeiro Administrador da Homologação 1

Antes do bootstrap, configurar e validar a [autenticação MySQL compartilhada](MySQL-Authentication.md): TLS com CA/identidade verificadas é preferido; RSA pública fixada por SHA-256 é alternativa explícita somente local. Não usar os certificados do Caddy para MySQL nem habilitar recuperação indiscriminada da chave pela rede. O novo Backend recusa homologação sem configuração/material aprovado; nenhum bootstrap ou deploy é executado por essa preparação.

Depois de implantar os artefatos atualizados, abra PowerShell no host de homologação. O comando abaixo usa o bootstrap oficial, exige configuração explícita de homologação e recusa bancos que não sejam locais e `gestor_os_homologation`. Ele aborta antes de pedir credenciais se já houver Administrador ativo. A senha é digitada duas vezes em prompt sem eco; não a coloque em comando, variável, arquivo ou Git.

```powershell
Push-Location 'C:\ProgramData\GestorOS\homologation\backend'
try {
  $env:GOS_ENV_FILE = 'C:\ProgramData\GestorOS\homologation\config\.env.homologation'
  $env:GOS_DEPLOYMENT_ENV = 'homologation'
  $env:GOS_DATABASE_TARGET = 'gestor_os_homologation'
  $env:GOS_EXTERNAL_EFFECTS_ENABLED = 'false'
  npm run auth:bootstrap-homologation-admin
  if ($LASTEXITCODE -ne 0) { throw 'Bootstrap do Administrador falhou; consulte a mensagem segura acima.' }
} finally {
  Remove-Item Env:GOS_ENV_FILE, Env:GOS_DEPLOYMENT_ENV, Env:GOS_DATABASE_TARGET, Env:GOS_EXTERNAL_EFFECTS_ENABLED -ErrorAction SilentlyContinue
  Pop-Location
}
```

O bootstrap não roda na inicialização do serviço e não tem endpoint HTTP. Ele reutiliza `AuthService.bootstrapFirstAdmin`, que normaliza e valida o username, aplica Argon2id, atribui `isAdmin` conforme a política central e grava auditoria na mesma transação. O comando de implantação executa o JavaScript já compilado e não precisa de ferramentas de desenvolvimento no servidor.

Antes da primeira alteração, a instalação real confirma Node.js 24, adapta sintaticamente o Caddyfile sem iniciar o serviço, valida estruturalmente os dois XMLs e verifica a identidade do banco configurado sem abrir conexão SQL. A validação não usa `caddy validate`, que também provisiona módulos. Os XMLs são copiados ao lado dos executáveis como `GestorOSBackend.xml` e `GestorOSCaddy.xml`, nomes que o WinSW procura automaticamente. Se houver serviços ou arquivos de uma tentativa anterior, inclusive configurações `.exe.config`, o script para para revisão manual e não os sobrescreve nem remove. Os dois serviços usam início automático e conta `NT AUTHORITY\LocalService`; o usuário da conexão MySQL do Backend deve ser `gos_homologation_app`, no banco `gestor_os_homologation`, com efeitos externos desativados. O Frontend é estático; o Backend escuta somente em `127.0.0.1:3100`; Caddy publica HTTPS interno e restringe a requisição a IP de origem de faixa privada. O instalador não cria regras de Firewall. Em PowerShell elevado, informe a sub-rede privada real da equipe, confira a prévia e então aplique somente a regra TCP/443:

```powershell
& .\scripts\homologation\windows10\Configure-HomologationFirewall.ps1 -LanCidr '192.168.1.0/24' -WhatIf
& .\scripts\homologation\windows10\Configure-HomologationFirewall.ps1 -LanCidr '192.168.1.0/24' -Apply
```

Substitua o exemplo pela sub-rede validada no host. O script aceita somente CIDRs IPv4 RFC1918, não abre as portas 80, 3100 ou 3306 e não altera outras regras. Confirme o perfil ativo e as regras existentes antes de aplicar. Para verificar o MySQL, use `Get-Service MySQL80`; se estiver parado, após confirmar que está no host correto, um administrador pode executar `Start-Service -Name MySQL80` e verificar novamente `Get-Service MySQL80`. O serviço local inspecionado nesta preparação já está ativo e configurado para início automático. Instale a CA raiz interna em cada cliente antes do primeiro acesso.

## Backup e atualização

Antes de migration aprovada, provisionar `gestor_os_homologation` com conta exclusiva e privilégios mínimos, sem reutilizar usuários de `gestor_os` ou `gestor_os_opening_test`. Guardar a credencial apenas no arquivo local protegido `.env.homologation`. Antes de cada escrita, executar `SELECT DATABASE()` e exigir exatamente `gestor_os_homologation`; em seguida, usar somente o wrapper seguro. Os comandos são separados:

```powershell
npm run prisma:safe -- gestor_os_homologation migrate status
# Somente após backup, revisão da migration e autorização operacional:
npm run prisma:safe -- gestor_os_homologation migrate deploy
```

Separar usuário de runtime e usuário de migration quando possível; não conceder privilégios globais. Parar gravações, fazer backup apenas de `gestor_os_homologation`, conferir hash/conclusão e restaurar primeiro em banco separado de ensaio. Nenhum comando de migration foi executado nesta preparação.

### Atualização com dependências e rollback

As versões Prisma 7.10.1 e a remoção do override temporário foram aprovadas no commit `ebd6b90`: o adapter oficial já fixa `mariadb 3.5.4`. O pacote antigo `GestorOS-Homologation1-update-1f98609.zip` não contém dependências e não serve para trocar uma instalação com Prisma 7.10.0. Sua recusa pelo atualizador é uma proteção esperada.

No computador de build Windows x64 com Node.js 24, gere um pacote completo a partir dos arquivos Backend/Frontend rastreados e sem modificações em relação ao HEAD:

```powershell
& .\scripts\homologation\windows10\Build-HomologationRelease.ps1
```

O processo cria um workspace exclusivo sob `artifacts\packages\runtime-<commit>-<UTC>`, usa o lockfile versionado com `npm ci`, gera o Prisma Client e compila o Backend nesse workspace. Executa os testes unitários, prepara outro `node_modules` isolado com omissão de dev/peer e remove somente os pacotes que não pertencem ao grafo de dependências runtime do lock. Isso também remove CLI Prisma/TypeScript que o npm pode manter por relações de peer. Não há nova resolução de versões ou alteração do lockfile. Testa Argon2, Sharp, Client gerado e imports compilados de Auth/Prisma, bloqueando sockets; não executa bootstrap ou cria contexto Nest. O Frontend é recompilado em `homologation` sem ler arquivos `.env` do projeto. As auditorias são gravadas fora do ZIP; qualquer advisory impede a conclusão do pacote.

O resultado fica em `build-result.json`, incluindo commit de origem, SHA256 do ZIP e validação do runtime. O ZIP contém `backend\dist`, `package.json`, `package-lock.json`, `node_modules`, `runtime-info.json`, o verificador offline e o Frontend homologation. Não contém credenciais, configuração de ambiente, dados, migrations ou fontes. Os hashes de todos os arquivos constam em `SHA256SUMS.txt`. O manifesto registra também hashes do empacotador e do verificador. Copie ao host de homologação somente:

- `Update-HomologationRelease.ps1`;
- o novo ZIP completo indicado no resultado do build.

Abra o Windows PowerShell 5.1 como Administrador, confira o SHA256 recebido por um canal independente e execute primeiro a pré-validação. Ela inspeciona a configuração local em memória, sem imprimir os valores da conexão, e não conecta ao MySQL:

```powershell
$Updater = 'C:\staging\Update-HomologationRelease.ps1'
$Package = 'C:\staging\GestorOS-Homologation1-runtime-<commit>.zip'
$ExpectedSha256 = '<SHA256 recebido e conferido por canal independente>'
$ExpectedCommit = '<commit de origem completo recebido com o pacote>'
$ActualSha256 = (Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ActualSha256 -cne $ExpectedSha256) { throw 'SHA256 do pacote não confere; atualização cancelada.' }
& $Updater -PackagePath $Package -ExpectedPackageSha256 $ExpectedSha256 -ExpectedSourceCommit $ExpectedCommit
```

Revise a pré-validação e simule o caminho de aplicação. `-Apply -WhatIf` repete as verificações, mas retorna antes de criar staging, lock ou journal, parar serviços, alterar ACLs ou substituir arquivos:

```powershell
& $Updater -PackagePath $Package -ExpectedPackageSha256 $ExpectedSha256 -ExpectedSourceCommit $ExpectedCommit -Apply -WhatIf
```

Somente após a revisão administrativa do resultado, solicite a atualização real:

```powershell
& $Updater -PackagePath $Package -ExpectedPackageSha256 $ExpectedSha256 -ExpectedSourceCommit $ExpectedCommit -Apply -Confirm
```

O atualizador confere o hash externo e os hashes internos, a versão/commit, o lockfile e os marcadores de homologação, o `.env.homologation`, os serviços e as ACLs. O formato completo prepara e valida o novo Backend antes de parar os serviços. Depois troca `backend` inteiro (incluindo dependências), `frontend\dist` e `frontend\build-info.json`. O formato legado de quatro componentes continua aceito somente quando as declarações de dependências, devDependencies e overrides forem idênticas às instaladas e as versões runtime forem compatíveis. Não basta acrescentar node_modules a um ZIP legado: são exigidos o manifesto completo, lockfile, metadados e validação offline.

Não se executa npm na instalação ativa. Configuração `.env.homologation`, Caddyfile, certificados, contas/XML WinSW, firewall, logos, anexos, logs, backups e banco permanecem fora da troca. Se o diretório Backend ativo contiver entradas fora de `dist`, `node_modules`, `package.json`, `package-lock.json`, `runtime-info.json` e `release`, a atualização completa para antes de qualquer troca para revisão da preservação. Nenhum arquivo desconhecido é descartado. Não são executados SQL, migration, seed ou bootstrap.

O backup exclusivo fica em `C:\ProgramData\GestorOS\homologation\updates\backup-<UTC>-<GUID>`, com caminho exato no resultado e etapas no `journal.json`. No formato completo, preserva todo o Backend anterior, inclusive o node_modules 7.10.0 existente, e os dois artefatos do Frontend. Uma falha preserva artefatos novos em `failed-new` e restaura o conjunto anterior. As ACLs acompanham os diretórios renomeados; os novos arquivos recebem ACLs correspondentes e leitura/execução de LocalService é verificada antes da ativação. A troca não é atômica como um único conjunto: usa renomeações por componente no mesmo volume com serviços parados. Em falha, o script tenta restaurar, reiniciar a versão anterior e validar HTTPS e a API. Se informar `ROLLBACK INCOMPLETO`, preserve backup/journal/staging e mantenha os serviços parados para recuperação administrativa.

Reserve espaço para o runtime novo descompactado e o anterior. O ZIP é limitado a 1 GiB descompactado/50 MiB por arquivo. A simulação verifica pacote e destino, mas não escreve staging nem executa seu teste nativo; a compatibilidade nativa é testada no build e novamente no staging durante `-Apply`, antes de parar serviços. Um processo interrompido abruptamente pode deixar `artifact-update.lock`; só remova um lock residual após confirmar que não há atualizador em execução e revisar o journal. Falha de energia ou encerramento forçado exige recuperação assistida.

#### Recuperação manual

Para o journal `20261019T135746Z-22703eaa0abd437785a28432e975bace`, siga primeiro [o diagnóstico específico](Recovery-20261019T135746Z.md). Não execute o exemplo de restauração abaixo se os artefatos ativos nunca foram movidos. O diagnóstico e a autorização administrativa precisam preceder qualquer alteração real, inclusive a liberação de lock residual. O estado antigo `rollback-incomplete` não será reescrito automaticamente.

Uma falha de preparação deve produzir `preparation-failed`, sem parar serviços. Uma falha anterior à primeira troca deve verificar a identidade dos artefatos originais e a disponibilidade da versão anterior: `failed-before-activation-recovered` somente após validação; `pre-activation-service-restart-failed` ou `pre-activation-https-validation-failed` quando a etapa correspondente falhar. Após movimentações, `rolled-back` exige restauração, serviços e HTTPS validados. `rollback-incomplete` registra falha ao parar serviços/restaurar arquivos; `rollback-service-restart-failed` indica arquivos restaurados mas reinício não comprovado; `rollback-https-validation-failed` indica arquivos anteriores conferidos e serviços em execução, com HTTPS ainda não validado. Estes estados de falha nunca significam sucesso. O campo `recovery` registra verificações separadas, etapa da falha e diagnóstico, além da etapa e mensagem da falha original. Flags falsas não provam ausência de movimentação: uma interrupção pode acontecer entre a renomeação e a gravação do journal. As novas atualizações registram fingerprints dos artefatos anteriores para conferir a recuperação, inclusive de `node_modules`. Preparação e recuperação malsucedidas preservam o staging para diagnóstico.

As duas requisições HTTPS (Frontend 200 HTML e API protegida 401 JSON) são centralizadas em `Assert-HomologationHttps`, reutilizada após implantação e após rollback. No Windows/Schannel com a CA local do Caddy, `--ssl-revoke-best-effort` tolera apenas listas de revogação ausentes/offline, preservando identidade, confiança da cadeia e rejeição de certificado comprovadamente revogado ([documentação oficial do curl](https://curl.se/docs/manpage.html#--ssl-revoke-best-effort)). O primeiro argumento `--disable` impede opções inesperadas de curlrc; não se usa modo inseguro nem desativação global de TLS. Exigem-se saída zero do processo, HTTP e tipo de conteúdo esperados. A captura separada de stdout/stderr evita perder o exit code por exceções de comandos nativos do PowerShell 5.1; o diagnóstico conserva exit code/HTTP/códigos TLS conhecidos sem publicar stderr bruto.

O journal do servidor `20261019T183621Z-4aecc2fa28e34c41a762d806ace07442` deve permanecer inalterado como evidência. Esta correção não o reclassifica nem executa recuperação. Os serviços Running e os resultados manuais 200/401 com best effort são evidências informadas pelo operador, não validação realizada por este trabalho. A recuperação administrativa exige revisão separada das identidades dos artefatos e do diagnóstico original; falha somente HTTPS não autoriza mover arquivos novamente nem parar serviços saudáveis automaticamente.

As operações retornadas pela fábrica vinculam explicitamente as funções locais antes de criar closures do PowerShell 5.1. A confirmação de `ShouldProcess` autoriza a atualização uma vez; os comandos internos de ACL, serviços e limpeza usam `-Confirm:$false`, sem mudar a preferência global nem os direitos concedidos. `-WhatIf` continua retornando antes de qualquer escrita.

Use o caminho de backup exato impresso pelo atualizador. Revise o journal e confirme que os artefatos anteriores e os destinos ativos existem. O exemplo reconhece os três componentes completos ou os quatro legados. Se o rollback automático já restaurou parte dos componentes, faltarem backups/destinos ou houver ambiguidade, pare e investigue cada registro do journal; não execute restauração integral por cima dos arquivos.

Em PowerShell elevado, use o `$ExpectedCommit` da atualização e substitua `$BackupRoot` pelo caminho exato registrado. O bloco valida todos os backups e destinos antes de parar serviços, preserva a versão ativa em uma pasta exclusiva e restaura o conjunto anterior, inclusive dependências, antes de reiniciar:

```powershell
$ErrorActionPreference = 'Stop'
$InstallRoot = 'C:\ProgramData\GestorOS\homologation'
$BackupRoot = 'C:\ProgramData\GestorOS\homologation\updates\backup-<UTC>-<GUID>'
$UpdatesPrefix = [IO.Path]::GetFullPath((Join-Path $InstallRoot 'updates')).TrimEnd('\') + '\'
$BackupRoot = [IO.Path]::GetFullPath($BackupRoot)
if (-not $BackupRoot.StartsWith($UpdatesPrefix, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($BackupRoot) -ine $UpdatesPrefix.TrimEnd('\') -or -not (Split-Path -Leaf $BackupRoot).StartsWith('backup-', [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de backup fora da instalação homologation.' }
$PathCursor = $BackupRoot
while (-not [string]::IsNullOrWhiteSpace($PathCursor)) {
  if ((Test-Path -LiteralPath $PathCursor) -and ((Get-Item -LiteralPath $PathCursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Caminho de backup contém reparse point.' }
  $PathParent = Split-Path -Parent $PathCursor
  if ([string]::IsNullOrWhiteSpace($PathParent) -or $PathParent -eq $PathCursor) { break }
  $PathCursor = $PathParent
}
$JournalPath = Join-Path $BackupRoot 'journal.json'
$Journal = Get-Content -LiteralPath $JournalPath -Raw | ConvertFrom-Json -ErrorAction Stop
if ($Journal.environment -cne 'homologation' -or $Journal.sourceCommit -cne $ExpectedCommit) { throw 'Journal não corresponde à atualização homologation esperada.' }
$Names = @($Journal.artifacts | ForEach-Object { $_.name })
if (($Names -join ';') -cne 'backend;frontend/dist;frontend/build-info.json' -and ($Names -join ';') -cne 'backend/dist;backend/package.json;frontend/dist;frontend/build-info.json') { throw 'Conjunto inesperado de artefatos no journal.' }
$Artifacts = @($Names | ForEach-Object { @{ Relative = ($_ -replace '/', '\'); IsDirectory = ($_ -in @('backend', 'backend/dist', 'frontend/dist')) } })
foreach ($item in $Artifacts) {
  $active = Join-Path $InstallRoot $item.Relative
  $saved = Join-Path $BackupRoot $item.Relative
  $kind = if ($item.IsDirectory) { 'Container' } else { 'Leaf' }
  if (-not (Test-Path -LiteralPath $active -PathType $kind) -or -not (Test-Path -LiteralPath $saved -PathType $kind)) { throw "Artefato ausente ou tipo incorreto; nenhum serviço foi parado: $($item.Relative)" }
}
$FailedRoot = Join-Path $BackupRoot ('failed-new-manual-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $FailedRoot) { throw 'Destino de preservação já existe; nenhum serviço foi parado.' }
function Save-ManualRollbackJournal {
  param([string]$Path, [psobject]$Value)
  $suffix = [guid]::NewGuid().ToString('N')
  $temporary = $Path + '.' + $suffix + '.tmp'
  $previous = $Path + '.' + $suffix + '.previous'
  try {
    [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $Value -Depth 8), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::Replace($temporary, $Path, $previous)
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue }
  }
}
$ServiceNames = @('GestorOSBackendHomologation', 'GestorOSCaddyHomologation')
$ServiceStates = @{}
foreach ($serviceName in $ServiceNames) {
  $ServiceStates[$serviceName] = [string](Get-Service -Name $serviceName -ErrorAction Stop).Status
  if ($ServiceStates[$serviceName] -notin @('Running', 'Stopped')) { throw "Serviço $serviceName está em transição; nenhum serviço foi parado." }
}
try {
  if ($ServiceStates['GestorOSCaddyHomologation'] -eq 'Running') { Stop-Service -Name GestorOSCaddyHomologation }
  if ($ServiceStates['GestorOSBackendHomologation'] -eq 'Running') { Stop-Service -Name GestorOSBackendHomologation }
  (Get-Service GestorOSCaddyHomologation).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
  (Get-Service GestorOSBackendHomologation).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
  if (@(Get-CimInstance Win32_Service | Where-Object { $_.Name -in $ServiceNames -and $_.ProcessId -ne 0 }).Count -gt 0) { throw 'Processo WinSW ainda ativo.' }
  if (@(Get-NetTCPConnection -State Listen -LocalPort 3100,443 -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Portas ainda ocupadas; nenhum artefato deve ser movido.' }
  foreach ($item in $Artifacts) {
    $active = Join-Path $InstallRoot $item.Relative
    $failed = Join-Path $FailedRoot $item.Relative
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $failed))
    Move-Item -LiteralPath $active -Destination $failed
  }
  foreach ($item in $Artifacts) {
    $saved = Join-Path $BackupRoot $item.Relative
    $active = Join-Path $InstallRoot $item.Relative
    Move-Item -LiteralPath $saved -Destination $active
  }
  $Journal.status = 'manual-rollback-files-restored'
  $Journal.message = 'Artefatos anteriores restaurados manualmente; aguardando validação dos serviços.'
  $Journal.updatedAtUtc = [DateTime]::UtcNow.ToString('o')
  Save-ManualRollbackJournal -Path $JournalPath -Value $Journal
  Start-Service -Name GestorOSBackendHomologation
  (Get-Service GestorOSBackendHomologation).WaitForStatus('Running', [TimeSpan]::FromSeconds(45))
  Start-Service -Name GestorOSCaddyHomologation
  (Get-Service GestorOSCaddyHomologation).WaitForStatus('Running', [TimeSpan]::FromSeconds(45))
  $frontend = & curl.exe --disable --ssl-revoke-best-effort --silent --show-error --noproxy '*' --connect-timeout 5 --max-time 15 --resolve 'gestor-os.home.arpa:443:127.0.0.1' --output 'NUL' --write-out '%{http_code}|%{content_type}' 'https://gestor-os.home.arpa/'
  if ($LASTEXITCODE -ne 0 -or (($frontend -join '') -notmatch '^200\|text/html')) { throw 'Validação do Frontend após rollback falhou.' }
  $api = & curl.exe --disable --ssl-revoke-best-effort --silent --show-error --noproxy '*' --connect-timeout 5 --max-time 15 --resolve 'gestor-os.home.arpa:443:127.0.0.1' --output 'NUL' --write-out '%{http_code}|%{content_type}' 'https://gestor-os.home.arpa/api/v1/auth/me'
  if ($LASTEXITCODE -ne 0 -or (($api -join '') -notmatch '^401\|application/json')) { throw 'Validação da API após rollback falhou.' }
  $Journal.status = 'manual-rollback-success'
  $Journal.message = 'Versão anterior restaurada manualmente; serviços e verificações locais aprovados.'
  $Journal.updatedAtUtc = [DateTime]::UtcNow.ToString('o')
  Save-ManualRollbackJournal -Path $JournalPath -Value $Journal
} catch {
  foreach ($serviceName in @('GestorOSCaddyHomologation', 'GestorOSBackendHomologation')) {
    try { Stop-Service -Name $serviceName -ErrorAction SilentlyContinue } catch { }
  }
  throw 'Recuperação manual incompleta. Mantenha os serviços parados, preserve o backup e a pasta failed-new-manual, e continue a recuperação administrativa sem sobrescrever arquivos.'
}
```

O exemplo mantém os serviços parados e sinaliza falhas para recuperação assistida. Se o journal ou qualquer artefato não passar na pré-validação, não execute o bloco; preserve os arquivos e investigue. A recuperação restaura somente artefatos e não acessa nem altera o banco.

### Validação e auditoria do empacotamento (19/10/2026)

O Backend compilado em workspace isolado passou em 94 testes unitários. Os cinco testes do contrato de dependências cobrem lockfile divergente, Prisma desalinhado, dependência transitiva ausente/adulterada e origem não aprovada. A suíte Windows PowerShell 5.1 valida formatos legado/completo, falhas de preparo, ativação, inicialização/HTTP e rollback; verifica a restauração conjunta de código, lockfile e node_modules e a preservação de configurações/arquivos persistentes. O caminho real de entrada `-Apply -WhatIf` é exercitado com destino e serviços simulados, sem alcançar operações mutáveis. A leitura do lockfile usa o serializador .NET para preservar `packages[""]`, que `ConvertFrom-Json` do PowerShell 5.1 não aceita.

O teste do ZIP completo inclui hashes, extração e execução do verificador offline no Backend extraído, sem contexto Nest, bootstrap ou conexão SQL. Argon2 e Sharp são testados de fato com os binários Windows x64 instalados no staging. A auditoria de dependências completa e a de runtime reportaram zero advisories na data acima; essa é uma fotografia do registry consultado, não uma garantia permanente. A validação final dos serviços reais, confiança TLS e operação autenticada permanece para a atualização administrada no servidor. Não houve execução no servidor, acesso a banco real ou liberação da Homologação 1 nessa preparação.

A regressão de escopo executa a fábrica `New-ServiceOperations` real, suas funções locais de movimentação e validação e a transação sobre três artefatos temporários. Serviços e HTTP são fronteiras simuladas. Reintroduzir a chamada local sem vínculo reproduz a falha de `Move-UpdateArtifact`, comprovando que o teste a detecta. Cobrem-se falhas antes/depois da primeira movimentação (inclusive antes da flag), HTTP, restauração integral de código/lock/dependências e nova execução da recuperação após reler o journal. Um host PowerShell isolado conta exatamente uma confirmação externa com ACLs NTFS e journal reais; `-WhatIf` preserva hashes, caminhos, ACLs e contadores de serviço. Não é um ensaio de WinSW no servidor.

Depois de instalar/atualizar, valide o início automático após reiniciar o host, login, OS numerada `HOS-*`, dois usuários concorrentes, impressões, upload privado do logo, backup e restauração. Não considere a H1 liberada apenas por build/teste automatizado.
