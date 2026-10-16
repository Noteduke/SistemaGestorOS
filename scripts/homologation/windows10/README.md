# Instalação nativa da Homologação 1 (Windows 10)

Este pacote apenas prepara build/configuração. Ele não baixa executáveis, cria banco, executa migrations ou instala serviço automaticamente.

## Pré-requisitos no host escolhido

1. Windows 10 atualizado, Node.js 24, Git e MySQL Server/client compatível. Caddy e WinSW devem ser obtidos e verificados pelo administrador a partir de suas fontes oficiais; esta pasta não inclui binários.
2. Provisionar por procedimento administrativo separado o banco `gestor_os_homologation` e uma conta de aplicação exclusiva com privilégio mínimo nesse banco. Preparar conta de backup, destino de backup e banco separado de restauração. Nunca configurar `gestor_os` ou `gestor_os_opening_test` nesta instalação.
3. Escolher DNS/hosts interno `gestor-os.home.arpa`, endereços LAN e política de confiança da CA interna nos computadores clientes.

## Ordem de preparação

Execute a partir do repositório no host de build:

```powershell
.scripts\homologation\windows10\Test-HomologationPrerequisites.ps1
Push-Location .\backend
npm run build
Pop-Location
.scripts\homologation\windows10\Build-HomologationFrontend.ps1
```

No host de destino, abra PowerShell elevado, revise o `-WhatIf` e então prepare os diretórios:

```powershell
.Prepare-HomologationDirectories.ps1 -WhatIf
.Prepare-HomologationDirectories.ps1
```

Copie ou clone o repositório para uma pasta de staging local e execute `Deploy-HomologationArtifacts.ps1` apontando `-RepositoryRoot` para essa cópia. Copie `Homologation.env.template` para `C:\ProgramData\GestorOS\homologation\config\.env.homologation`, substitua a senha localmente sem colocá-la em comando/histórico/Git, confirme que a URL seleciona somente `gestor_os_homologation` e mantenha a ACL restrita. Copie `Caddyfile.homologation.template` para a mesma pasta como `Caddyfile` e confira IPs, hostname e caminho `root`.

Copie os binários já verificados para caminhos locais explícitos, por exemplo `CaddyExe` e `WinSWExe`, e só após a revisão de host/ACL execute como Administrador:

```powershell
.Install-HomologationServices.ps1 -CaddyExe 'C:\staging\caddy.exe' -WinSWExe 'C:\staging\WinSW-x64.exe' -Apply
.Verify-HomologationServices.ps1
```

O instalador valida a configuração do Caddy, cria/instala dois serviços WinSW com início automático e conta `NT AUTHORITY\LocalService`, e aplica ACLs locais. O Frontend é estático; o Backend escuta somente em `127.0.0.1:3100`; Caddy publica HTTPS interno e restringe a requisição a IP de origem de faixa privada. Configure o Firewall do Windows para permitir as portas de publicação apenas na rede da equipe. Instale a CA raiz interna em cada cliente antes do primeiro acesso.

## Backup e atualização

Antes de migration aprovada, parar gravações, fazer dump apenas de `gestor_os_homologation`, conferir hash/conclusão e restaurar primeiro em banco separado de ensaio. As operações Prisma devem passar pelo wrapper seguro `npm run prisma:safe -- gestor_os_homologation migrate status|deploy`; conferir o destino antes de qualquer escrita. Não há comando de migration neste pacote e nenhum foi executado durante esta preparação.

Depois de instalar/atualizar, valide o início automático após reiniciar o host, login, OS numerada `HOS-*`, dois usuários concorrentes, impressões, upload privado do logo, backup e restauração. Não considere a H1 liberada apenas por build/teste automatizado.
