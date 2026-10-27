# Primeiro login — correção candidata, sem implantação

## Evidência e limite da conclusão

O erro `FAIL stage=JS_PUBLIC_KEY code=PUBLIC_KEY_FORMAT` ocorre antes de qualquer conexão MySQL. Nesse ponto o diagnóstico anterior já havia passado pelas verificações de configuração, ACLs e hash. Não há evidência para atribuir essa falha às permissões MySQL ou às ACLs.

A chave pública real foi conferida em C:\GestorOS-Transfer\mysql-public-real.pem, sem alterá-la ou copiá-la para Git/pacotes. SHA-256 confirmado: 9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B. Formato exato: PEM SPKI PUBLIC KEY, RSA 2048, expoente 65537, ASCII/UTF-8 sem BOM, nove LF e **um byte NUL (0x00) terminal**, no offset 451 (base zero), total de 452 bytes.

**Causa comprovada:** o release aea5af9 chama String.trim(), que não remove NUL, e depois exige que a regex ancorada termine exatamente no END PUBLIC KEY. O NUL após o rodapé faz a primeira verificação falhar com PUBLIC_KEY_FORMAT. O código original, obtido diretamente do Git, reproduziu a falha; retirando apenas esse NUL em memória, o mesmo validador original passou. O parser oficial crypto.createPublicKey aceita o arquivo original intacto e identifica RSA 2048. Não foi falha de PKCS#1, comparação DER, hash, ACL ou autenticação MySQL.

O helper compilado corrigido e o auxiliar atual aceitam os 452 bytes originais com o pin aprovado. A exportação SPKI descarta o terminador somente na representação em memória passada ao driver, preservando a identidade pública. O driver MariaDB 3.5.4 instalado produziu o bloco RSA-OAEP de 256 bytes usando essa chave. A construção do Prisma Adapter/Client foi validada offline com sockets bloqueados. Isso ainda não comprova autenticação no MySQL do servidor; não houve conexão real.

Backend e auxiliares passam a usar o parser oficial do Node, exigindo um único bloco público SPKI/PKCS#1, RSA 2048 e ausência de chave privada. A igualdade DER e a regex do corpo Base64 foram removidas. O hash continua sendo conferido nos bytes originais, antes de qualquer transformação; somente o PEM passado ao driver é convertido para SPKI em memória. `allowPublicKeyRetrieval=false`, proibição de redirecionamento, escopo de homologação e proteções TLS permanecem.

As falhas agora distinguem `PUBLIC_KEY_ENVELOPE`, `PUBLIC_KEY_PARSE`, `PUBLIC_KEY_ALGORITHM`, `PUBLIC_KEY_SIZE` e `PUBLIC_KEY_EXPORT`. Não publicar o arquivo, URL, senha ou exceções nativas para investigar uma falha.

## Teste real ANTES de substituir o Backend

O ZIP DIAGNOSTICO-RSA-CHAVE-REAL-CANDIDATO.zip é exclusivo do teste somente leitura; não é aceito como release pelo atualizador. Extraí-lo em uma pasta nova de revisão, sem sobrescrever a instalação ativa. Conferir o SHA-256 do ZIP pelo relatório e o manifesto antes da execução. O executável único é `Test-MySqlRsaStaged.ps1`. Ele chama o diagnóstico compilado `dist/scripts/diagnose-homologation-mysql.js` de um Backend **inativo**, com o mesmo helper, Prisma Client 7.10.1, Adapter 7.10.1 e MariaDB Connector 3.5.4 usados pela aplicação corrigida. Não inicia Nest, serviços, bootstrap ou migrations.

A entrega candidata em `artifacts/first-login-rsa-real-key-review/server-diagnostic` tem `sourceCommit=null`: não é um release implantável. O Backend nessa entrega contém runtime completo e código compilado candidato. O manifesto cobre todos os arquivos do staging, inclusive os metadados; o hash do manifesto e do executável deve ser conferido por canal independente. Não modificar o manifesto para fazer um arquivo divergente passar.

Após autorização administrativa para o teste somente leitura, transferir a pasta completa para um diretório de revisão no servidor, fora da instalação ativa. Em Windows PowerShell 5.1, executar **somente**:

```powershell
# Executar dentro da pasta transferida, sem instrumentacao Node/debug herdada.
# Antes, verificar os hashes do executavel e do manifesto contra o relatorio local.
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
  -NoProfile -ExecutionPolicy Bypass -File .\Test-MySqlRsaStaged.ps1 `
  -StagedBackend (Join-Path (Get-Location) 'backend')
if ($LASTEXITCODE -ne 0) { throw 'PARAR: diagnostico RSA nao comprovou a conexao; nao implantar.' }
```

O diagnóstico lê exclusivamente `C:\ProgramData\GestorOS\homologation\config\.env.homologation`, recusa duplicações/conflitos/herança divergente e valida **antes de construir o Adapter**: MySQL, `127.0.0.1:3306`, usuário `gos_homologation_app`, banco `gestor_os_homologation`, ambiente `homologation` e efeitos externos `false`.

As três opções RSA aprovadas são aplicadas somente a um objeto em memória. O arquivo `.env` e `process.env` não são modificados. Pin obrigatório: `9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B`; arquivo público `C:/ProgramData/GestorOS/homologation/config/mysql/caching-sha2-public.pem`. Configuração TLS ou RSA conflitante causa abortamento.

A única consulta explícita é `SELECT DATABASE() AS db, CURRENT_USER() AS account, 1 AS ok`; o Adapter também pode consultar `SELECT VERSION()` para descobrir capacidades. Exige-se exatamente uma linha, banco autorizado, `gos_homologation_app@127.0.0.1` e `ok=1`. Saída de sucesso, com exit code zero:

```text
READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1
```

Falhas têm `FAIL stage=... code=...`, com saída não zero. Autenticação, RSA, conexão, timeout e pool são classificados sem publicar mensagens brutas. Um simples `$connect()` não basta: o teste exige a resposta SELECT e a desconexão. Não executar este teste no DIRETOR contra o servidor remoto; ele é destinado à execução local posterior no servidor.

## Commit, release e implantação controlada

1. Autorizar o **novo commit seletivo** do diff entregue. Não reutilizar `aea5af9` como sourceCommit do código candidato. Preservar alterações anteriores do atualizador e seus testes.
2. Após esse commit, reutilizar `Build-HomologationRelease.mjs` e `Prepare-MySqlRsaTools.ps1`, passando HEAD completo e ZIP efetivamente gerados. Exigir manifesto completo, sourceCommit correto e hashes novos. O ZIP anterior é histórico e não contém esta correção. Não implantar a pasta de diagnóstico como se fosse o pacote de aplicação.
3. Exigir o sucesso do diagnóstico acima **antes** de configurar ou substituir o Backend. Conferir que o helper e o diagnóstico `.js` do ZIP novo correspondem aos arquivos testados no staging. Se diferirem, parar e repetir a validação com o código correto.
4. Executar `Set-MySqlRsaConfiguration.ps1 -Action Check`; simular Configure com `-WhatIf` e o atualizador oficial 20933130 com `-Apply -WhatIf`, usando `-PackagePath`, `-ExpectedPackageSha256` e `-ExpectedSourceCommit` explícitos do release novo. Parar em qualquer exit code não zero.
5. Somente em execução administrativa autorizada: Configure com `-Confirm`, preservando o backup protegido, seguido do atualizador com os mesmos argumentos e `-Apply -Confirm`. Não executar migrations, reinstalação, limpeza de journals ou alteração de credenciais. Preservar a instalação anterior completa, inclusive node_modules.
6. Exigir a versão nova e HTTPS 200 no Frontend / 401 na API protegida, com curl exit zero e `--ssl-revoke-best-effort` quando necessário no Windows. Executar `Test-MySqlRsaReadOnly.ps1` do release pronto, agora contra o helper instalado.

**Recuperação:** parar ao falhar; preservar journal, staging e backup. O atualizador existente restaura artefatos completos; conferir separadamente arquivos, serviços e HTTPS. Só restaurar a configuração RSA anterior via `Set-MySqlRsaConfiguration.ps1 -Action Restore -BackupDirectory '<backup protegido retornado>' -PreviousApplicationVerified -Confirm` depois de comprovar que a versão anterior realmente voltou. Não presumir rollback por serviços Running. Nunca apagar evidências nem repetir Apply para tentar destravar uma tentativa incompleta.

## Bootstrap e login, somente depois da conexão comprovada

O comando oficial `auth:bootstrap-homologation-admin` executa `node dist/scripts/bootstrap-admin.js`, sem ferramentas de desenvolvimento. Solicita **username**, senha oculta e confirmação oculta; não há campos nome/e-mail nesse mecanismo. Argon2id e transação Serializable são usados pelo AuthService. Há checagem de Administrador ativo antes do prompt e outra, com bloqueio, na transação. Username preexistente também é recusado.

Após implantação e autorização específica para criar o primeiro Administrador, usar um PowerShell novo, sem variáveis de conexão/debug herdadas. O comando abaixo é uma instrução futura; não foi executado nesta missão:

```powershell
& {
  $ErrorActionPreference='Stop'
  $config='C:\ProgramData\GestorOS\homologation\config\.env.homologation'
  $backend='C:\ProgramData\GestorOS\homologation\backend'
  $node='C:\Program Files\nodejs\node.exe'
  foreach ($name in @('DATABASE_URL','GOS_DEPLOYMENT_ENV','GOS_DATABASE_TARGET','GOS_EXTERNAL_EFFECTS_ENABLED','GOS_MYSQL_AUTH_MODE','GOS_MYSQL_RSA_PUBLIC_KEY_FILE','GOS_MYSQL_RSA_PUBLIC_KEY_SHA256','GOS_MYSQL_TLS_CA_FILE','GOS_MYSQL_TLS_CA_SHA256','GOS_MYSQL_TLS_SERVER_NAME','GOS_ENV_FILE','NODE_OPTIONS','NODE_PATH','NODE_V8_COVERAGE','DEBUG','NODE_DEBUG')) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))) { throw 'Use PowerShell novo, sem configuracao de conexao/debug herdada; nao exibir valores.' }
  }
  if (-not (Test-Path -LiteralPath $config -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $backend 'dist\scripts\bootstrap-admin.js') -PathType Leaf)) { throw 'Configuracao ou bootstrap compilado ausente.' }
  Push-Location -LiteralPath $backend
  try {
    $env:GOS_ENV_FILE=$config
    & $node ('--env-file='+$config) 'dist/scripts/bootstrap-admin.js'
    if ($LASTEXITCODE -ne 0) { throw 'Bootstrap recusado/falhou. Nao repetir sem examinar a mensagem segura.' }
  } finally { Remove-Item Env:GOS_ENV_FILE -ErrorAction SilentlyContinue; Pop-Location }
}
```

Digitar a senha somente no prompt local; não colar no chat. O guard exige homologação, banco autorizado, efeitos externos desativados e `.env.homologation` selecionado; o helper compartilhado exige a conta e o destino permitidos. Se já existir Administrador ativo, o comando cancela sem criar outro. Sucesso: `Administrador <username> criado com sucesso.` Após isso testar login em `https://gestor-os.home.arpa`, confirmar identificação de homologação, acesso autenticado e logout. Nenhuma dessas operações foi executada localmente nesta preparação. Homologação não está declarada liberada.
