# Prova técnica: rastreamento Correios e identificação de modelo Dell

**Data da pesquisa:** 2026-10-08  
**Tipo:** spike isolada, sem integração de produção

## 1. Conclusão executiva

- **Correios:** viável com credencial/contrato e autorização para a API Rastro. A consulta oficial não é uma API pública anônima: a documentação informa que objetos vinculados a contratos são consultáveis apenas com as credenciais do remetente.
- **Dell:** confirmado com uma Service Tag de notebook fornecida pelo usuário que a página pública identifica o produto sem login e mostra o modelo **Latitude 3420**. A etiqueta não foi copiada para este relatório.
- **Resultado:** foi criado um cliente experimental isolado para a API Rastro. Ainda não foi executada uma chamada autenticada; as credenciais devem ser configuradas localmente pelo usuário. Não há integração com banco, OS ou endpoints do sistema.

## 2. Correios

### Fonte e autenticação

Foi consultado o [portal oficial de desenvolvedores dos Correios](https://www.correios.com.br/atendimento/developers/) e o [Manual para Integração Correios APIs](https://www.correios.com.br/atendimento/developers/arquivos/manual-para-integracao-correios-api.pdf), revisão 04/2025, versão 2.4.

O portal informa que o acesso às APIs é feito por chave de acesso concedida por cliente com contrato. Também informa que a consulta de rastreamento pela API Rastro está restrita a objetos vinculados ao contrato do remetente. Para obter token de API, o manual dos Correios descreve autenticação no serviço de token; o manual específico pode ser consultado em [Manual de uso da API Token](https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token). Portanto, será necessário contrato/credencial autorizada para o fluxo oficial avaliado. Não foram testadas credenciais nem chamadas de produção.

### Portal público de rastreamento

Também foi inspecionada a [página pública de rastreamento](https://rastreamento.correios.com.br/app/index.php). O formulário aceita CPF/CNPJ ou até 20 códigos de rastreamento e apresenta um CAPTCHA obrigatório antes do botão **Consultar**. A página pública permite que uma pessoa consulte eventos depois de preencher o formulário, mas a barreira CAPTCHA impede tratar o fluxo como uma fonte de consulta automatizada confiável. Não foi submetido formulário nem tentado resolver ou contornar o CAPTCHA; nenhum código de rastreio foi fornecido para esta análise.

Conclusão sobre extração: os eventos podem ser vistos no portal após uma consulta humana, mas não foi verificado um endpoint público estável nem um formato de resposta automatizável por trás do formulário. Fazer scraping da página não é recomendado como integração do sistema; além do CAPTCHA, o HTML e o comportamento do site podem mudar. Para consulta automática, usar a API Rastro oficial com autorização e credenciais, conforme o caminho técnico abaixo.

### Caminho técnico identificado

O manual documenta a API Rastro com base de homologação `https://apihom.correios.com.br/srorastro` e operação `GET /v1/objetos/{codigoObjeto}`. O exemplo do manual acrescenta `?resultado=T` e envia `Accept: application/json` e `Authorization: Bearer <token>`. O host de produção e os escopos efetivamente liberados devem ser confirmados no catálogo CWS para a conta/contrato que será usada.

Exemplo ilustrativo, sem credencial:

```http
GET https://apihom.correios.com.br/srorastro/v1/objetos/DG049186226BR?resultado=T
Accept: application/json
Authorization: Bearer <token obtido pelos meios oficiais>
```

O manual mostra resposta com `objetos[].eventos[]`, incluindo `dtHrCriado`, `descricao` e dados de `unidade`/endereço do evento. O cliente experimental criado projeta somente uma lista resumida de eventos, status/descrição, horário e local. Ainda não há chamada autenticada realizada; a forma de saída abaixo é ilustrativa, baseada no manual.

Exemplo de saída normalizada esperada:

```json
{
  "success": true,
  "code": "DG049186226BR",
  "status": "Objeto entregue ao destinatário",
  "lastEventAt": "2022-03-11T17:03:00",
  "lastLocation": "XAPURI/AC",
  "events": [
    {
      "description": "Objeto entregue ao destinatário",
      "occurredAt": "2022-03-11T17:03:00",
      "location": "XAPURI/AC"
    }
  ]
}
```

O exemplo usa os dados demonstrativos do manual, não uma consulta atual. Se a chamada não tiver credencial autorizada, o cliente retorna uma mensagem clara indicando que o serviço requer credencial e vínculo/autorização do objeto com o contrato.

## 3. Dell — prova técnica, não aceite funcional da Homologação 1

### Página pública e resultado observado

A página oficial [Manuais Dell Brasil](https://www.dell.com/support/home/pt-br/Products?app=manuals&lwp=rt) apresenta um campo que aceita etiqueta de serviço, ID de produto ou modelo. A página oficial [Localize a etiqueta de serviço do notebook](https://www.dell.com/support/contents/pt-br/article/Product-Support/Self-support-Knowledgebase/locate-service-tag/Notebook) orienta a consulta do identificador no site de suporte.

Caminho de produto observado após a resolução da Service Tag:

`https://www.dell.com/support/product-details/pt-br/servicetag/{serviceTag}/overview`

Na consulta solicitada pelo usuário, a navegação para a rota pública chegou à página do produto sem solicitar login. O título e os detalhes visíveis da página identificaram o equipamento como **Latitude 3420**. O modelo também constava no texto alternativo da imagem principal do produto. A Service Tag consultada foi omitida do relatório.

O proprietário confirmou que a consulta pública da Dell é permitida para consultar a etiqueta e obter o modelo. Na referência GT63PT3, o resultado manual já observado anteriormente foi **Latitude 3420**. Nesta preparação foi feita uma única requisição HTTP GET simples por etiqueta, sem sessão, credenciais, cookies, repetição ou tentativa de contornar proteção. A Dell respondeu **HTTP 403** para GT63PT3 e para 283NLZ1. Para 283NLZ1, nenhum modelo foi confirmado. Não se recebeu HTML nem redirecionamento para inspecionar: não é possível afirmar com esta chamada se o modelo consta no HTML inicial ou depende de JavaScript. Uma observação anterior do formulário identificou conteúdo dinâmico na página, mas não prova que a rota canônica dependa de JavaScript para expor o modelo.

### Parser e riscos

Foi implementado no Backend um endpoint autenticado/permissão de abertura, com timeout, sem seguir redirecionamento, e erros distintos para tag inválida, produto não encontrado, timeout, bloqueio, redirecionamento, ausência de modelo e falha de rede. O parser é deliberadamente conservador: só aceita registro JSON-LD que contenha, no mesmo registro, a Service Tag consultada e o campo de modelo. Não tenta inferir modelo a partir do título/texto genérico nem utiliza mapeamentos fixos. A resposta real atualmente é 403, então não foi possível validar o parser com amostra real; testes de unidade com HTML sintético verificam a regra de associação e os caminhos de falha, mas não comprovam consulta online. A integração permanece limitada ao modelo; não consulta garantia, suporte, proprietário ou histórico.

Na interface de novo equipamento da abertura de OS, a consulta fica disponível quando a marca selecionada é Dell e a série está identificada. O operador aplica explicitamente o modelo sugerido; se já houver modelo preenchido, a interface pede confirmação de substituição. Falha/indisponibilidade informa o motivo e mantém a edição manual disponível, sem impedir a abertura da OS.

Riscos: mudanças no HTML/payload, nomes de propriedades, fluxo de redirecionamento, proteção anti-bot/limites, conteúdo renderizado por JavaScript e variação por país/idioma. O modelo foi confirmado visualmente no fluxo público, mas não foi verificado se uma requisição HTTP simples devolve o mesmo campo sem renderização. Revalidar o parser com respostas mínimas, sem armazenar cookies, tokens, Service Tags ou conteúdo de garantia. Fazer poucas requisições e definir timeout.

## 4. Automação, credenciais e execução

- Consulta Dell: o resultado manual previamente informado/observado para a referência GT63PT3 é `Latitude 3420`. As duas consultas HTTP simples atuais retornaram 403. Nenhum HTML foi obtido e nenhuma conclusão de dependência JavaScript foi tomada. O endpoint e parser conservador foram implementados, mas a extração online está pendente de uma resposta pública verificável. Não foi usada automação visual.
- Correios: o código lê credenciais somente do ambiente do processo e não as imprime. Configure-as localmente fora do repositório. O manual usa `idCorreios` mais o código de acesso às APIs criado no CWS para Basic Auth; esse código não é necessariamente a senha de login do site Meu Correios. Variáveis esperadas:
  - `CORREIOS_ID`: idCorreios da pessoa jurídica.
  - `CORREIOS_PASS`: senha/código de acesso às APIs criado no CWS (não a senha de login do Meu Correios).
  - `CORREIOS_AUTH_MODE`: `contract` ou `posting-card`.
  - `CORREIOS_CONTRACT_NUMBER`: número do contrato para `contract`; opcional para `posting-card`.
  - `CORREIOS_POSTING_CARD`: número do cartão quando `posting-card`.
  - `CORREIOS_DR`: diretoria regional numérica, opcional se não exigida.
  - `CORREIOS_ENV`: `homologation` (padrão) ou `production`; produção deve ser escolhida explicitamente.
- A autenticação obtém um token via API Token e então chama Rastro com Bearer token. O manual orienta que homologação requer primeiro o acesso em produção e replicação/liberação do contrato no ambiente de homologação.
- Com Node.js 24, executar da raiz do projeto: `node --experimental-strip-types backend/src/integrations/_spikes/correios-tracking.ts <codigo-rastreio>`.
- O cliente valida formato de código de 13 caracteres, aplica timeout de 15 segundos e retorna no máximo dez eventos resumidos. Não grava respostas nem tokens.
- Dell: nenhuma credencial foi necessária para a consulta manual do notebook. Nenhuma variável de ambiente foi necessária; a Service Tag não foi armazenada no relatório.
- Não houve gravação em banco, alteração de schema, migration, endpoint, alteração do módulo OS ou requisição repetida.

## 5. Recomendação e próximos passos

1. **Correios — preparado para validação autenticada:** usuário configurar as variáveis locais acima, confirmar no CWS o acesso à API Rastro e fornecer um código de objeto associado ao contrato/ambiente. Então executar uma única consulta e revisar o formato real da resposta.
2. **Dell — consulta pública de modelo para H1 ainda pendente:** GT63PT3 foi observado manualmente como Latitude 3420, mas o HTTP direto respondeu 403; para 283NLZ1 o modelo continua desconhecido e o HTTP direto também respondeu 403. Não obtivemos HTML inicial para análise, nem comprovamos dependência de JavaScript. O endpoint atual falha fechado e a interface permite entrada manual. Revalidar somente por acesso público permitido e sem contornar proteções. TechDirect, garantia e demais consultas permanecem fora do escopo.
3. Validar o comportamento de timeout, credenciais sem permissão, objeto não disponível e respostas sem eventos antes de qualquer evolução do spike.
4. Fazer revisão técnica antes de integrar à OS. Esta spike não altera regras de negócio nem recomenda automação periódica ainda.

## 6. Arquivos e limitações desta spike

Arquivos criados: `docs/integracoes/Prova-Tecnica-Correios-Dell.md` e `backend/src/integrations/_spikes/correios-tracking.ts`.

O código Correios foi validado quanto à sintaxe, mas ainda não foi executado contra os Correios porque as credenciais e os dados do contrato/cartão não estavam configurados no ambiente da sessão. As variáveis de autenticação são `CORREIOS_ID` e `CORREIOS_PASS`; a segunda deve ser o código de acesso às APIs do CWS, não a senha do portal Meu Correios. No Dell, GT63PT3 foi observado manualmente como `Latitude 3420`, porém uma requisição HTTP simples retornou 403; para 283NLZ1 também retornou 403 e modelo segue desconhecido. O endpoint foi integrado ao rascunho de equipamento, mas nenhuma extração real foi validada. Não se obteve HTML, e dependência JavaScript não pode ser concluída neste estado.
