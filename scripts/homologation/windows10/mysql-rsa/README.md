# RSA MySQL — fontes oficiais e sequência consolidada

## Revisão candidata (ainda sem commit autorizado)

**Procedimento prioritário:** [PRIMEIRO-LOGIN-RSA.md](PRIMEIRO-LOGIN-RSA.md). O teste Prisma real com runtime candidato deve ocorrer ANTES de configurar ou substituir o Backend ativo. A sequência abaixo permanece como referência de empacotamento/recuperação, subordinada a essa pré-condição.

Esta pasta é a fonte oficial dos auxiliares. O diretório antigo `artifacts/mysql-rsa-fcc1344-review` e o ZIP fcc1344 são evidência histórica: preservados, mas **não incluem a correção no Backend**. Não implantar apenas o validador corrigido junto com aquele ZIP. A chave pública real foi conferida sem alteração: SPKI RSA 2048 com um NUL terminal, 452 bytes e pin aprovado. O código original aea5af9 rejeita esse NUL na regex ancorada; o parser oficial do Node e os validadores corrigidos aceitam o arquivo intacto. Ver PRIMEIRO-LOGIN-RSA.md. A chave não está incluída no Git ou nos pacotes.

São aceitos SPKI `PUBLIC KEY` e PKCS#1 `RSA PUBLIC KEY`, exatamente RSA 2048 bits. Primeiro confere-se SHA-256 dos bytes originais, sem regravar o material público; depois o parser criptográfico oficial valida a chave pública, e a conversão para SPKI ocorre só em memória. Certificados, chaves privadas, material concatenado, RSA de outro tamanho ou pin divergente são recusados. TLS continua preferencial; RSA fixada é alternativa somente na homologação local, sem recuperação automática da chave pela rede. Backend e bootstrap compartilham PrismaService e o mesmo helper compilado.

A comparação com DER reexportado foi removida: o Node aceita RSA 2048 com AlgorithmIdentifier sem o NULL opcional, mas normaliza essa representação ao exportar; exigir igualdade de bytes rejeitava indevidamente essa chave válida. O hash dos bytes originais continua obrigatório. Esse caso DER era um teste sintético adicional; não é a causa da chave real. A causa real comprovada foi o NUL terminal após o rodapé SPKI, recusado pela regex antiga e aceito pelo parser oficial. Falhas agora distinguem envelope, parser, algoritmo, tamanho e exportação.

`InheritOnly` não concede direitos ao objeto atual; essas regras são ignoradas somente nessa verificação. Quando efetivas no filho, regras de escrita não confiáveis e leitura pública de backups continuam bloqueadas. Proprietários fora de SYSTEM/Administradores continuam exigindo revisão, sem alteração automática. Não conceder escrita a LocalService na chave ou no arquivo de configuração.

stdout e stderr dos processos Node são capturados separadamente com prazo e exit code. Nenhum stderr bruto, senha, URL ou conteúdo de `.env` é publicado. `Check` continua somente leitura e `WhatIf` não cria backups, arquivos, ACLs, locks ou journals. Os testes desse fluxo usam arquivos temporários, chaves sintéticas e identidades adaptadas apenas nas fixtures; não comprovam as ACLs do servidor.

## Bloqueio deliberado de proveniência

O `Release-Context.json` desta fonte contém `status=uncommitted-candidate`, `clean=false` e `sourceCommit=null`. Não atribui fcc1344 ao código novo. Check/diagnóstico offline são possíveis, mas Configure/Restore real e diagnóstico pós-implantação exigem um contexto `ready` gerado **depois do commit autorizado e do novo ZIP**. Não editar esse contexto manualmente para contornar o bloqueio. O bootstrap não é chamado por estes scripts.

## Preparação após autorização do único commit seletivo

1. Revisar o diff seletivo preparado; registrar somente Backend/teste RSA, documentação MySQL e esta pasta. Preservar alterações anteriores de updater/README/testes fora deste escopo e o arquivo pessoal não aberto.
2. Criar o commit somente após autorização específica. Não fazer push.
3. Executar `node scripts/homologation/windows10/Build-HomologationRelease.mjs`. O empacotador existente exige Backend/Frontend correspondentes ao HEAD, prepara dependências em staging isolado, gera Client sem banco, executa build/testes/auditorias e cria um novo runtime completo. Nunca executar npm ci na instalação ativa. Não reutilizar um ZIP com sourceCommit antigo.
4. Em PowerShell 5.1, preparar os auxiliares locais com o hash do novo commit e o caminho real do novo ZIP:

```powershell
# Substituir os campos somente pelos valores efetivamente gerados apos commit autorizado.
.\scripts\homologation\windows10\mysql-rsa\Prepare-MySqlRsaTools.ps1 `
  -ReleaseCommit '<NOVO_COMMIT_COMPLETO>' `
  -PackagePath '<CAMINHO_ABSOLUTO_DO_NOVO_ZIP>' `
  -UpdaterPath 'C:\Projetos\SistemaGestorOS\scripts\homologation\windows10\Update-HomologationRelease-20933130.ps1' `
  -Destination 'C:\Projetos\SistemaGestorOS\scripts\homologation\windows10\artifacts\deployment-rsa-novo' -WhatIf
# Revisar e repetir sem -WhatIf para gerar APENAS a entrega local; nao instala no servidor.
```

O preparador recusa fontes pendentes no escopo de aplicação/RSA, commit diferente do HEAD, ZIP de outra versão, código sem a correção e atualizador diferente do 20933130. Produz contexto ready e manifesto externo; não inclui `.env`, senhas, material criptográfico, arquivos pessoais, journals ou backups.

## Execução no servidor somente em etapa autorizada separada

Transferir a entrega completa, verificar o manifesto por canal independente e preservar todos os journals/locks existentes. Não limpar tentativas antigas. Usar Windows PowerShell 5.1 no contexto administrativo autorizado, sem instrumentação Node/debug/coverage herdados. Não acessar produção.

1. Conferir todos os hashes de `SHA256SUMS-DEPLOYMENT.txt`; conferir que `Release-Context.json` corresponde ao commit/hash do novo ZIP.
2. Executar `Diagnose-MySqlRsaPrecheck.ps1` e `Set-MySqlRsaConfiguration.ps1 -Action Check` (offline, sem MySQL). O diagnóstico identifica etapas por códigos seguros. Resolver qualquer falha concreta antes de prosseguir.
3. Simular `Set-MySqlRsaConfiguration.ps1 -Action Configure -WhatIf` e o atualizador com `-Apply -WhatIf`, passando explicitamente `-PackagePath`, `-ExpectedPackageSha256` e `-ExpectedSourceCommit` **novos**. Os defaults do atualizador são antigos.
4. Só após revisão/autorização, executar Configure -Confirm. Registrar o caminho do backup protegido; ele contém a configuração anterior sensível, com acesso apenas a SYSTEM/Administradores. Credenciais e ACL do `.env` permanecem preservadas. Pin aprovado: `9C2384DBD2B09A2CCE97D276A7ECAB92B565B9FA15978162C82EFAFB90A8C73B`; arquivo `C:\ProgramData\GestorOS\homologation\config\mysql\caching-sha2-public.pem`. Não converter/regravar esse arquivo.
5. Somente na implantação autorizada, chamar o atualizador 20933130 com os três argumentos explícitos e `-Apply -Confirm`. Ele valida staging, preserva Backend completo/node_modules anterior, Frontend e metadados; conserva configurações, Caddyfile/certificados, LocalService, ACLs, uploads/logos, backups e journals. Não executar migrations ou bootstrap.
6. Depois de validar versão/HTTPS, executar `Test-MySqlRsaReadOnly.ps1`. Reconfirma a conexão MySQL que já deve ter sido comprovada pelo diagnóstico de staging anterior à implantação: o helper compilado valida banco `gestor_os_homologation`, conta de conexão `gos_homologation_app`, host `127.0.0.1:3306`, pin e efeitos externos desativados antes de criar o adapter. A única consulta explícita é SELECT DATABASE(), CURRENT_USER(), 1 (o adapter pode consultar VERSION). Exigir conta autenticada **exata** `gos_homologation_app@127.0.0.1`, sem aceitar localhost, curingas ou outras contas. A saída final deve ser:

```text
READ_ONLY_OK database=gestor_os_homologation account=gos_homologation_app@127.0.0.1 prisma=7.10.1
```

## Recuperação coordenada (não executada nesta missão)

Não repetir Apply ao falhar; preservar staging/journal/backup. Separar falha de preparação, restauração dos artefatos, reinício dos serviços e validação HTTPS. `rollback-incomplete` ou falha só HTTPS nunca provam sucesso e não autorizam nova movimentação automática.

Comprovar a recuperação integral da aplicação anterior, inclusive dependências, pelo novo journal/fingerprints e verificação de versão. Somente então executar Restore com `-BackupDirectory '<backup desta atualização>' -PreviousApplicationVerified -WhatIf`; revisar e autorizar Restore -Confirm. O script exige hash do runtime anterior, backup íntegro/restrito, configuração sem edição posterior e ACL original. Não depende da chave RSA nova para restaurar a configuração antiga. A afirmação PreviousApplicationVerified não substitui a inspeção administrativa da aplicação. Após restaurar configuração, reler via reinício controlado do Backend e validar HTTPS/serviços em etapa autorizada. Não editar ou excluir journals antigos; não alterar MySQL, certificados ou senha.

Configuração e artefatos não são uma única transação. Se a aplicação estiver misturada ou o rollback falhar, manter recuperação pendente e solicitar inspeção específica, sem apagar evidências. A versão antiga pode manter o defeito RSA original. A correção não libera a Homologação 1 por si só.
