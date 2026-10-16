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

Copie ou clone o repositório para uma pasta de staging local. A partir da raiz dessa cópia, execute `Deploy-HomologationArtifacts.ps1` apontando `-RepositoryRoot` para ela. Copie `Homologation.env.template` para `C:\ProgramData\GestorOS\homologation\config\.env.homologation`, substitua a senha localmente sem colocá-la em comando/histórico/Git, confirme que a URL seleciona somente `gestor_os_homologation` e mantenha a ACL restrita. Copie `Caddyfile.homologation.template` para a mesma pasta como `Caddyfile` e confira IPs, hostname e caminho `root`.

O script de build confirma que o bundle contém `DOCUMENTO DE TESTE — HOMOLOGAÇÃO` e grava `build-info.json` com ambiente, versão e commit de origem. O deploy recusa artefatos sem esse marcador/manifests. O diretório de artefatos é ignorado pelo Git.

Copie os binários já verificados para caminhos locais explícitos e só após a revisão de host/ACL execute como Administrador:

```powershell
& .\scripts\homologation\windows10\Install-HomologationServices.ps1 -CaddyExe 'C:\staging\caddy.exe' -WinSWExe 'C:\staging\WinSW-x64.exe' -Apply
& .\scripts\homologation\windows10\Verify-HomologationServices.ps1
```

O instalador valida a configuração do Caddy, cria/instala dois serviços WinSW com início automático e conta `NT AUTHORITY\LocalService`, e aplica ACLs locais. O Frontend é estático; o Backend escuta somente em `127.0.0.1:3100`; Caddy publica HTTPS interno e restringe a requisição a IP de origem de faixa privada. O instalador não cria regras de Firewall. Em PowerShell elevado, informe a sub-rede privada real da equipe, confira a prévia e então aplique somente a regra TCP/443:

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

Depois de instalar/atualizar, valide o início automático após reiniciar o host, login, OS numerada `HOS-*`, dois usuários concorrentes, impressões, upload privado do logo, backup e restauração. Não considere a H1 liberada apenas por build/teste automatizado.
