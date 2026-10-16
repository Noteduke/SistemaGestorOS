# Gestor OS — Diagnóstico de Ambiente 1.0.0

Ferramenta portátil para preparação do servidor Windows 10 x64. **Não substitui os testes funcionais da Homologação 1.** Não altera módulos de negócio e não libera automaticamente a homologação.

## Executar

Copie esta pasta inteira para o servidor e abra `Iniciar.cmd`, sem executar como Administrador. Requer apenas Windows PowerShell 5.1 e Windows Forms, incluídos no Windows 10. Não requer Node, npm, Git, Python, Docker ou instalação para funcionar. Política corporativa, AppLocker ou Constrained Language podem impedir a execução; consulte o responsável, sem alterar políticas da máquina. O CMD usa Bypass somente no processo iniciado, sem persistir a política.

Informe na janela os caminhos reais: raiz da instalação (contendo backend, frontend, config, files, company-assets e logs), diretório dos binários Caddy/WinSW, diretório bin do MySQL e destino dos backups. Caminhos vazios ficam como Não verificado. Binários não informados são procurados no PATH. Um diretório explicitamente informado tem precedência sobre PATH. Os wrappers esperados são GestorOSBackend.exe e GestorOSCaddy.exe, conforme instalador existente. Caminhos UNC são permitidos, sujeitos à disponibilidade e às permissões da sessão Windows.

Exemplo (adapte todos os caminhos):

```powershell
.\Iniciar.cmd -InstallRoot 'D:\GestorOS\homologation' -BinaryDirectory 'D:\GestorOS\bin' -MySqlBin 'C:\Program Files\MySQL\MySQL Server 8.0\bin' -BackupDirectory 'E:\Backups\homologation' -HttpsHost 'gestor-os.home.arpa'
```

O hostname é opcional: ao informá-lo, autoriza uma requisição HTTPS HEAD a `/`, sem credenciais, proxy ou redirecionamentos, com timeout de cinco segundos. A confiança do certificado não é desativada. Pode gerar logs de acesso no servidor. Confira também DNS/CA/acesso em cada cliente. A janela pode ficar ocupada durante consultas do Windows, acesso a caminhos UNC ou varredura dos bundles.

Selecione uma linha para ver encontrado, esperado, orientação e necessidade de administrador. **Como corrigir** apenas mostra a orientação; nenhum botão aplica correções. **Verificar novamente** refaz a coleta. **Salvar relatório** exporta TXT ou JSON pelo diálogo. **Copiar relatório** envia o TXT à área de transferência.

Modo sem interface, retornando objeto PowerShell (sem salvar automaticamente):

```powershell
$r = .\GestorOS-Diagnostico.ps1 -Console -InstallRoot 'D:\GestorOS\homologation'
$r.Resultados | Format-Table Item,Estado,Verificacao
```

## O que verifica

- Windows 10, arquitetura x64, PowerShell e endereços IPv4 ativos.
- Node 24.x, Git e MySQL Server exatamente 8.0.46 por metadados PE; npm por presença do CMD e versão no package.json da distribuição; Caddy e wrappers WinSW por presença/metadados.
- MySQL80, GestorOSBackendHomologation e GestorOSCaddyHomologation: presença, estado e início automático.
- Listeners 3306/3100/443 e interfaces. Escuta externa de 3306/3100 gera ATENÇÃO. Listener não prova identidade ou saúde do processo.
- Perfis do Firewall e contagem de regras de entrada Allow potencialmente relevantes (portas explícitas, Any e faixas). Escopo, regras de bloqueio e precedência exigem revisão administrativa; a ferramenta não certifica isolamento.
- Diretórios e artefatos backend/frontend/config, presença de .env.homologation e Caddyfile, manifesto frontend/build-info.json e marcador nos bundles JS/CSS.
- Destino de backup e existência de arquivos sql/dump/zip/gz/bak, sem abrir backups. Teste de restauração sempre exige evidência operacional separada.
- HTTPS interno opcional, com certificado confiável e HTTP 200.

As regras compartilhadas ficam em `Homologation.Rules.psd1`; os scripts de pré-requisitos, build, deploy e verificação em `scripts/homologation/windows10/` importam esse mesmo arquivo no repositório. Ao copiar só os scripts de implantação, inclua também a pasta tools na mesma estrutura. O diagnóstico pode ser copiado isoladamente com seu PSD1. O CMD, o programa e o PSD1 são os três arquivos necessários à execução portátil.

## Estados e limites

OK confirma apenas a inspeção descrita. PENDENTE indica requisito ausente/incompatível ou serviço/porta indisponível. ATENÇÃO indica risco, revisão manual ou **Não verificado**. Falta de acesso não é classificada como falha do servidor. Não é necessário elevar o programa; se a consulta for bloqueada, registre a limitação e solicite inspeção do responsável. Não há versão mínima de Git/Caddy/WinSW fixada pelos scripts originais; metadados não comprovam assinatura, procedência ou que o serviço usa aquele binário.

**Nenhum arquivo .env é lido e nenhuma conexão SQL é implementada**, mesmo se o serviço estiver disponível. O nome efetivo do banco, schema e migrations ficam Não verificado; não se infere banco ativo a partir de templates. O responsável deve confirmar localmente `gestor_os_homologation` e os flags de segurança descritos no template. Nunca acessar `gestor_os`. Uma futura inspeção SQL exigiria implementação e autorização explícita separadas; esta versão não oferece esse recurso. Configuração efetiva de backend/frontend, caminhos persistentes configurados, ACLs, retenção/integridade de backup e restauração permanecem sujeitos à revisão manual.

Não instala programas, executa binários descobertos, inicia serviços, altera Firewall, configura arquivos, cria bancos ou executa migrations. As únicas escritas da aplicação são o relatório escolhido pelo usuário e a área de transferência. Relatórios são montados com campos controlados: não incluem conteúdo de .env, backups, manifesto arbitrário, configurações, nomes de arquivos de backup, URLs com credenciais, mensagens de exceção ou comandos de serviços. Incluem nome do computador e IPs, conforme escopo do diagnóstico; compartilhe-os apenas com a equipe responsável.

## Testes e revisão

```powershell
powershell.exe -NoProfile -File .\Test-Diagnostico.ps1
```

Sem Pester ou dependências. Simula ambiente ausente, parcial, configurado e acesso negado, cobrindo dependência ausente, versão incompatível, serviço parado, porta indisponível, diretório ausente e limitação de permissão. Confere JSON/TXT, segredo sentinela, restauração não inferida, sintaxe 5.1 e comandos proibidos. Compara hashes dos arquivos de fixture antes/depois da coleta. O teste cria/remove uma pasta temporária própria e gera os exemplos desta pasta; o programa principal não faz isso. Exemplos são dados simulados, não laudos do servidor real. Mesmo o cenário configurado conserva pendências de inspeções manuais.

Teste opcional da janela: `powershell.exe -NoProfile -STA -File .\Test-Interface.ps1`. Abre a interface, executa coleta local somente leitura e fecha automaticamente. Não informa hostname HTTPS nem conecta bancos. Verifica abertura/coleta/fechamento; não substitui inspeção visual e testes dos botões.

Validação manual no host de destino: abrir CMD por duplo clique em sessão comum; conferir redimensionamento, seleção, cinco botões, salvar TXT/JSON em pasta gravável, cancelar o diálogo, copiar/colar e repetir coleta. Testar HTTPS com CA confiável e sem confiança, servidor ausente e caminhos sem acesso. Confirmar ausência de alterações em serviços, Firewall, configuração e bancos. Consultas reais bloqueadas no ambiente de desenvolvimento não substituem esses testes no servidor.
