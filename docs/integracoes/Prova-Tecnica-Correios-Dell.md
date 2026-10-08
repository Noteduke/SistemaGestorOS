# Prova técnica: rastreamento Correios e identificação de modelo Dell

**Data da pesquisa:** 2026-10-08  
**Tipo:** spike documental, sem integração de produção

## 1. Conclusão executiva

- **Correios:** viável com credencial/contrato e autorização para a API Rastro. A consulta oficial não é uma API pública anônima: a documentação informa que objetos vinculados a contratos são consultáveis apenas com as credenciais do remetente.
- **Dell:** confirmado no navegador que o fluxo público oficial aceita Service Tag sem login e mostra o nome/modelo do produto na página. A tag fictícia usada resolveu para `Dell 1600n Multifunction Mono Laser Printer`, então o fluxo foi confirmado, mas não foi validado com um notebook.
- **Resultado:** não foi criado código experimental. A investigação não usou credenciais reais, navegador automatizado, banco de dados ou uma tag de equipamento real.

## 2. Correios

### Fonte e autenticação

Foi consultado o [portal oficial de desenvolvedores dos Correios](https://www.correios.com.br/atendimento/developers/) e o [Manual para Integração Correios APIs](https://www.correios.com.br/atendimento/developers/arquivos/manual-para-integracao-correios-api.pdf), revisão 04/2025, versão 2.4.

O portal informa que o acesso às APIs é feito por chave de acesso concedida por cliente com contrato. Também informa que a consulta de rastreamento pela API Rastro está restrita a objetos vinculados ao contrato do remetente. Para obter token de API, o manual dos Correios descreve autenticação no serviço de token; o manual específico pode ser consultado em [Manual de uso da API Token](https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token). Portanto, será necessário contrato/credencial autorizada para o fluxo oficial avaliado. Não foram testadas credenciais nem chamadas de produção.

### Caminho técnico identificado

O manual documenta a API Rastro com base de homologação `https://apihom.correios.com.br/srorastro` e operação `GET /v1/objetos/{codigoObjeto}`. O exemplo do manual acrescenta `?resultado=T` e envia `Accept: application/json` e `Authorization: Bearer <token>`. O host de produção e os escopos efetivamente liberados devem ser confirmados no catálogo CWS para a conta/contrato que será usada.

Exemplo ilustrativo, sem credencial:

```http
GET https://apihom.correios.com.br/srorastro/v1/objetos/DG049186226BR?resultado=T
Accept: application/json
Authorization: Bearer <token obtido pelos meios oficiais>
```

O manual mostra resposta com `objetos[].eventos[]`, incluindo `dtHrCriado`, `descricao` e dados de `unidade`/endereço do evento. A implementação futura deve projetar somente o mínimo necessário, como último evento (status/descrição, horário e local) e uma lista resumida. Não há chamada realizada nesta spike; o código acima e a forma de saída são exemplos derivados da documentação.

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

O exemplo usa os dados demonstrativos do manual, não uma consulta atual. Se a chamada não tiver credencial autorizada, a integração futura deve apresentar uma mensagem clara indicando que o serviço requer credencial e vínculo/autorização do objeto com o contrato.

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
- Correios: integração oficial requer token e acesso CWS autorizado; nenhuma variável ou credencial foi criada nesta spike. Na implementação futura, usar variáveis/secrets fora do repositório, conforme os escopos e ambiente aprovados pelos Correios.
- Dell: nenhuma credencial foi identificada como necessária para visualizar a página pública, mas não foi possível verificar o acesso com tag válida por HTTP. Nenhuma variável de ambiente foi necessária.
- Não houve gravação em banco, alteração de schema, migration, endpoint, alteração do módulo OS ou requisição repetida.

## 5. Recomendação e próximos passos

1. **Correios — precisa de credencial:** confirmar no CWS contrato, chave, escopo Rastro, ambiente e host de produção; então validar uma consulta de homologação a objeto autorizado e mapear os eventos mínimos.
2. **Dell — viável com parser simples como primeira opção:** confirmar com uma Service Tag de notebook de teste autorizada se o modelo é apresentado na mesma rota pública. Inspecionar o HTML/payload e extrair somente o nome do modelo. Se a extração via HTTP simples não capturar o elemento porque ele é renderizado por JavaScript, avaliar navegador automatizado em spike separada.
3. Implementar cada consulta em módulo experimental isolado, com timeout, tratamento de 403/429/timeout e saída mínima; remover dados de resposta não necessários.
4. Fazer revisão técnica antes de integrar à OS. Esta spike não altera regras de negócio nem recomenda automação periódica ainda.

## 6. Arquivos e limitações desta spike

Arquivo criado: `docs/integracoes/Prova-Tecnica-Correios-Dell.md`.

Somente documentação foi criada. Não há comandos de execução de código experimental. No Dell, o caminho público foi confirmado no navegador com identificador fictício e mostrou nome/modelo sem login; falta confirmar uma Service Tag de notebook e a viabilidade de parse sem renderização de JavaScript. Correios foi avaliado pela documentação oficial, sem chamada autenticada.
