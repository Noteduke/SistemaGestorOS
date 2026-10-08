# Prova técnica: rastreamento Correios e identificação de modelo Dell

**Data da pesquisa:** 2026-10-08  
**Tipo:** spike isolada, sem integração de produção

## 1. Conclusão executiva

- **Correios:** viável com credencial/contrato e autorização para a API Rastro. A consulta oficial não é uma API pública anônima: a documentação informa que objetos vinculados a contratos são consultáveis apenas com as credenciais do remetente.
- **Dell:** confirmado no navegador que o fluxo público oficial aceita Service Tag sem login e mostra o nome/modelo do produto na página. A tag fictícia usada resolveu para `Dell 1600n Multifunction Mono Laser Printer`, então o fluxo foi confirmado, mas não foi validado com um notebook.
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

## 3. Dell

### Página pública e tentativa HTTP

A página oficial [Manuais Dell Brasil](https://www.dell.com/support/home/pt-br/Products?app=manuals&lwp=rt) apresenta um campo que aceita etiqueta de serviço, ID de produto ou modelo. A página oficial [Localize a etiqueta de serviço do notebook](https://www.dell.com/support/contents/pt-br/article/Product-Support/Self-support-Knowledgebase/locate-service-tag/Notebook) orienta a consulta do identificador no site de suporte.

Caminho de produto observado após a resolução da Service Tag:

`https://www.dell.com/support/product-details/pt-br/servicetag/{serviceTag}/overview`

`ABC1234` foi usado apenas como identificador fictício de teste. A navegação interativa no site público chegou à página do produto sem solicitar login e apresentou o modelo `Dell 1600n Multifunction Mono Laser Printer` junto à Service Tag. Essa confirmação demonstra que o modelo pode ser obtido do fluxo público no navegador; como o identificador de teste retornou uma impressora, ainda falta confirmar o resultado para um notebook.

Uma chamada HTTP direta fora do navegador para a rota `/support/home/pt-br/product-support/servicetag/ABC1234/overview`, com timeout de 20 segundos e User-Agent comum, recebeu **HTTP 403**. O site redirecionou a navegação do browser para o caminho canônico `/support/product-details/pt-br/servicetag/ABC1234/overview`. O 403, portanto, é uma limitação do acesso HTTP automatizado usado na prova e não indica que o fluxo público em navegador exija login.

### Parser e riscos

Não foi implementado parser nesta spike documental. A estratégia recomendada agora é simples: consultar a rota pública de produto, identificar o elemento de título/nome do produto (`hero-product-image`/`dep_showDeviceDetails` eram sinais visíveis na página observada), validar que o conteúdo corresponde ao identificador consultado e normalizar para `{ serviceTag, model, source: "dell_public_site" }`. Extrair somente o nome/modelo; não coletar garantia, suporte, proprietário ou demais dados.

Riscos: mudanças no HTML/payload, nomes de propriedades, fluxo de redirecionamento, proteção anti-bot/limites, conteúdo renderizado por JavaScript e variação por país/idioma. O navegador carregou a página com seu comportamento normal, mas não foi verificado se a requisição direta devolve o mesmo campo sem execução de JavaScript. Revalidar o parser com respostas mínimas, sem armazenar cookies, tokens, dados pessoais ou conteúdo de garantia. Fazer poucas requisições e definir timeout.

## 4. Automação, credenciais e execução

- Consulta Dell no navegador: **realizada manualmente pela superfície de navegação**, sem Playwright ou automação de navegador. A página pública exibiu o nome/modelo sem login. Ainda não se concluiu se o parser poderá operar com HTTP simples ou se precisará renderizar JavaScript.
- Correios: o código lê credenciais somente do ambiente do processo e não as imprime. Configure-as localmente fora do repositório. O manual usa `idCorreios` mais o código de acesso às APIs criado no CWS para Basic Auth; esse código não é necessariamente a senha de login do site Meu Correios. Variáveis esperadas:
  - `CORREIOS_ID`: idCorreios da pessoa jurídica.
  - `CORREIOS_API_CODE`: código de acesso às APIs criado no CWS.
  - `CORREIOS_AUTH_MODE`: `contract` ou `posting-card`.
  - `CORREIOS_CONTRACT_NUMBER`: número do contrato para `contract`; opcional para `posting-card`.
  - `CORREIOS_POSTING_CARD`: número do cartão quando `posting-card`.
  - `CORREIOS_DR`: diretoria regional numérica, opcional se não exigida.
  - `CORREIOS_ENV`: `homologation` (padrão) ou `production`; produção deve ser escolhida explicitamente.
- A autenticação obtém um token via API Token e então chama Rastro com Bearer token. O manual orienta que homologação requer primeiro o acesso em produção e replicação/liberação do contrato no ambiente de homologação.
- Com Node.js 24, executar da raiz do projeto: `node --experimental-strip-types backend/src/integrations/_spikes/correios-tracking.ts <codigo-rastreio>`.
- O cliente valida formato de código de 13 caracteres, aplica timeout de 15 segundos e retorna no máximo dez eventos resumidos. Não grava respostas nem tokens.
- Dell: nenhuma credencial foi identificada como necessária para visualizar a página pública, mas não foi possível verificar o acesso com tag válida por HTTP. Nenhuma variável de ambiente foi necessária.
- Não houve gravação em banco, alteração de schema, migration, endpoint, alteração do módulo OS ou requisição repetida.

## 5. Recomendação e próximos passos

1. **Correios — preparado para validação autenticada:** usuário configurar as variáveis locais acima, confirmar no CWS o acesso à API Rastro e fornecer um código de objeto associado ao contrato/ambiente. Então executar uma única consulta e revisar o formato real da resposta.
2. **Dell — viável com parser simples como primeira opção:** confirmar com uma Service Tag de notebook de teste autorizada se o modelo é apresentado na mesma rota pública. Inspecionar o HTML/payload e extrair somente o nome do modelo. Se a extração via HTTP simples não capturar o elemento porque ele é renderizado por JavaScript, avaliar navegador automatizado em spike separada.
3. Validar o comportamento de timeout, credenciais sem permissão, objeto não disponível e respostas sem eventos antes de qualquer evolução do spike.
4. Fazer revisão técnica antes de integrar à OS. Esta spike não altera regras de negócio nem recomenda automação periódica ainda.

## 6. Arquivos e limitações desta spike

Arquivos criados: `docs/integracoes/Prova-Tecnica-Correios-Dell.md` e `backend/src/integrations/_spikes/correios-tracking.ts`.

O código Correios foi validado quanto à sintaxe, mas ainda não foi executado contra os Correios porque as credenciais não foram configuradas no ambiente desta sessão e nenhum código de rastreio válido vinculado ao contrato foi fornecido. No Dell, o caminho público foi confirmado no navegador com identificador fictício e mostrou nome/modelo sem login; falta confirmar uma Service Tag de notebook e a viabilidade de parse sem renderização de JavaScript.
