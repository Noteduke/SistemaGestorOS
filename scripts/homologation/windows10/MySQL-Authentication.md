# Autenticação MySQL da Homologação 1

O erro 45044 (`ER_CANNOT_RETRIEVE_RSA_KEY`), encapsulado pelo pool como 45028, confirmou que o caminho de autenticação completa de `caching_sha2_password` não encontrou TLS ou uma chave RSA confiável no cliente. Não alterar o plugin, a senha ou os grants para contornar esse erro.

Backend e bootstrap utilizam o mesmo `PrismaService`. A homologação exige `GOS_MYSQL_AUTH_MODE=tls` (preferido) ou `rsa-pinned` (alternativa explícita, somente local). A ausência de modo/material bloqueia a inicialização. Não há fallback automático entre modos; recuperar chave pela rede permanece desativado. O arquivo de material público é carregado em memória após verificar SHA-256, tipo e formato. Mudanças no arquivo depois da validação não substituem o conteúdo já passado ao driver.

## 1. Descobrir os arquivos públicos reais, sem executar alterações

Estas instruções são para revisão/execução manual posterior no servidor. Nenhum acesso ao servidor ou banco é executado pelo trabalho de implementação.

No cliente oficial MySQL já autenticado, selecionando exclusivamente `gestor_os_homologation`, confirmar primeiro `SELECT DATABASE(), CURRENT_USER();`. Só prosseguir se o banco e o usuário forem os autorizados. Consultar apenas variáveis públicas:

```sql
SHOW GLOBAL VARIABLES WHERE Variable_name IN
('port', 'datadir', 'have_ssl', 'ssl_ca', 'ssl_cert', 'tls_version',
 'caching_sha2_password_public_key_path');
SHOW STATUS LIKE 'Caching_sha2_password_rsa_public_key';
SHOW SESSION STATUS LIKE 'Ssl_cipher';
```

Os caminhos relativos são relativos ao `datadir` real. Não presumir nomes ou conteúdo. Não consultar/abrir `ssl_key`, `caching_sha2_password_private_key_path`, `private_key.pem` ou `server-key.pem`. A variável de status acima contém somente a chave **pública** efetivamente usada pelo plugin e permite conferir sua correspondência com o arquivo público indicado pelo servidor.

Um administrador deve verificar origem e ACLs do arquivo público e de seus diretórios, ligando-os à instalação MySQL conhecida. Calcular SHA-256 no arquivo público original confiável, registrar o resultado por canal administrativo independente e conferir novamente no destino. Calcular um hash apenas no arquivo recebido não comprova sua origem. Arquivos/diretórios não devem permitir substituição pelo usuário do Backend ou por usuários comuns.

Depois dessa validação e de autorização administrativa, copiar somente a CA pública ou a chave RSA pública para `C:\ProgramData\GestorOS\homologation\config\mysql\`. Não copiar certificados/chaves do Caddy. Não copiar chaves privadas. O atualizador preserva a pasta `config`; o material não pertence ao ZIP nem ao repositório.

Para um arquivo público cujo caminho já foi confirmado, `Get-FileHash -LiteralPath '<caminho público confirmado>' -Algorithm SHA256` e `Get-Acl -LiteralPath '<caminho público confirmado>'` são verificações somente leitura. Conferir também a cadeia de diretórios. LocalService e o operador do bootstrap precisam de leitura, sem permissão de escrita nesse material. Qualquer ajuste de ACL depende de revisão/autorização administrativa; não conceder escrita ampla nem privilégios MySQL adicionais.

## 2. Preferir TLS com identidade validada

A CA deve ser da instalação MySQL, válida e marcada como CA. O servidor precisa oferecer certificado válido encadeado a essa CA e identidade correspondente ao host utilizado. A configuração usa `rejectUnauthorized=true`, TLS >= 1.2 e a verificação oficial de identidade do Node.

Configurações adicionais no `.env.homologation`, preenchidas localmente sem mudar `DATABASE_URL` ou sua senha:

```dotenv
GOS_MYSQL_AUTH_MODE=tls
GOS_MYSQL_TLS_CA_FILE=C:/ProgramData/GestorOS/homologation/config/mysql/mysql-ca.pem
GOS_MYSQL_TLS_CA_SHA256=<SHA256 conferido do arquivo publico real>
```

Se o certificado tiver identidade DNS conhecida e verificada diferente do IP loopback, pode-se configurar `GOS_MYSQL_TLS_SERVER_NAME` com **essa identidade real**. Isso define a identidade esperada/SNI, não desativa a validação; não inventar um nome nem aceitar qualquer certificado. Sem essa variável, a identidade esperada é o host da URL (neste servidor, `127.0.0.1`, que exige SAN IP correspondente). Certificados automáticos antigos do MySQL podem não atender a essa condição. Não substituir certificados ou alterar o servidor nesta missão.

Após provisionamento autorizado, o cliente oficial pode verificar TLS com `--ssl-mode=VERIFY_IDENTITY`, `--ssl-ca` apontando para a CA pública, host compatível com a identidade real do certificado, porta 3306, `--database=gestor_os_homologation`, `--user=gos_homologation_app` e `--password` **sem valor**, digitado no prompt. Executar somente `SELECT DATABASE(), CURRENT_USER();` e `SHOW SESSION STATUS LIKE 'Ssl_cipher';`. Nunca usar `VERIFY_CA` como substituto de identidade, `--ssl-mode=DISABLED`, `rejectUnauthorized=false` ou certificados HTTPS do Caddy.

## 3. Alternativa local: chave RSA pública fixada

Se TLS com validação de identidade não estiver disponível, selecionar explicitamente este modo após validar a chave pública do plugin pela fonte local confiável descrita acima:

```dotenv
GOS_MYSQL_AUTH_MODE=rsa-pinned
GOS_MYSQL_RSA_PUBLIC_KEY_FILE=C:/ProgramData/GestorOS/homologation/config/mysql/caching-sha2-public.pem
GOS_MYSQL_RSA_PUBLIC_KEY_SHA256=<SHA256 conferido do arquivo publico real>
```

O arquivo deve ser PEM público RSA de 2048 bits, SPKI (`PUBLIC KEY`) ou PKCS#1 (`RSA PUBLIC KEY`), correspondente à chave ativa de `caching_sha2_password`. O SHA-256 é verificado nos bytes originais antes de qualquer conversão; somente em memória a chave é normalizada para SPKI e entregue ao driver. Não regravar o arquivo público para convertê-lo nem recalcular seu pin sem nova conferência de origem. Não fornecer chave privada, certificado TLS ou chave RSA de outro plugin. O modo é limitado a `gestor_os_homologation`, `gos_homologation_app`, loopback e porta 3306, com efeitos externos desativados. `allowPublicKeyRetrieval` continua falso. TLS e RSA não podem ser configurados simultaneamente.

Os auxiliares oficiais estão em `mysql-rsa/`. Regras NTFS `InheritOnly` não se aplicam ao objeto atual: são ignoradas ao verificar esse objeto, mas precisam ser verificadas novamente quando herdadas e efetivas em um filho. Essa interpretação não permite escrita de usuários não confiáveis no arquivo da chave ou no `.env`. A captura de processos Node usa stdout/stderr separados, exit code e prazo, sem publicar mensagens nativas. Uma nova alteração de Backend exige novo commit autorizado e novo ZIP; o pacote fcc1344 não contém esta revisão SPKI/PKCS#1.

Esta alternativa protege a senha no intercâmbio RSA; **não cifra o tráfego SQL posterior nem equivale ao canal TLS**. Não usá-la remotamente nem ampliar seu uso para produção. Rotação legítima da chave pública exige nova conferência da origem, hash e atualização administrativa da configuração; erro de hash nunca autoriza obter uma chave automaticamente pela rede.

## 4. Preparar e implantar a correção, separadamente

1. Revisar os arquivos da correção e validar testes/build local. Não copiar arquivos TypeScript para o Backend ativo nem executar `npm ci` nele.
2. Preparar um novo pacote Backend compilado com esta correção, incluindo o novo helper em `dist/infrastructure/prisma/`. O ZIP anterior não contém esta alteração. As versões/dependências permanecem as mesmas; não há migration.
3. Obter aprovação para configurar **um** dos modos com material público real e SHA-256 aprovado no servidor. Preservar a configuração anterior de forma restrita, sem incluí-la em ZIP, logs ou Git. Remover seletores do modo não escolhido. Não deixar `DATABASE_URL` ou seletores conflitantes herdados no terminal; não exibir seus valores. Serviço e bootstrap devem usar o mesmo `.env.homologation` e o mesmo Backend atualizado.
4. Fazer somente depois, com autorização separada, a atualização coordenada/rollback pelos scripts revisados. Preservar o conjunto anterior inteiro, `node_modules`, configuração e todos os journals pendentes; não reinterpretar nem limpar journals antigos. A configuração de autenticação deve ser restaurada junto com os artefatos se houver rollback para código anterior que não conhece estas opções.
5. Antes de qualquer bootstrap, executar diagnóstico de leitura usando a configuração compartilhada compilada (`buildMysqlConnectionOptions`) e o adapter instalado, conferindo `SELECT DATABASE(), CURRENT_USER(), 1`. Não reutilizar o diagnóstico antigo que monta apenas host/porta/usuário/senha, pois ele não aplica TLS/RSA agora configurados. Um teste só do mysql.exe não comprova o caminho Node.
6. Conferir serviço/API pelo HTTPS e somente então autorizar o bootstrap manual em etapa própria. Não executar bootstrap, migrations, grants ou gravações nesta validação de autenticação.

Referências: [MySQL caching_sha2_password](https://dev.mysql.com/doc/refman/8.0/en/caching-sha2-pluggable-authentication.html), [opções do Connector/Node.js](https://mariadb.com/docs/connectors/mariadb-connector-nodejs/node-js-connection-options).
