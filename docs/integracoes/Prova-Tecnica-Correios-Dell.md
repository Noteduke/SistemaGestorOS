# Prova técnica: rastreamento Correios e identificação de modelo Dell

**Data da pesquisa:** 2026-10-08  
**Tipo:** spike documental, sem integração de produção

## 1. Conclusão executiva

- **Correios:** viável com credencial/contrato e autorização para a API Rastro. A consulta oficial não é uma API pública anônima: a documentação informa que objetos vinculados a contratos são consultáveis apenas com as credenciais do remetente.
- **Dell:** o fluxo público oficial aceita Service Tag, mas a requisição HTTP direta feita nesta prova para uma tag fictícia recebeu **HTTP 403**. Não foi possível observar o HTML de uma consulta válida nem confirmar extração de modelo sem login por requisição simples.
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

Caminho de produto usado para a tentativa HTTP direta:

`https://www.dell.com/support/home/pt-br/product-support/servicetag/ABC1234/overview`

`ABC1234` foi usado apenas como identificador fictício de teste. Uma única requisição HTTP, com timeout de 20 segundos e um User-Agent comum, foi bloqueada pelo site com **HTTP 403**. Assim, não foi possível confirmar se a página redireciona, exige JavaScript ou headers específicos, inspecionar payload de consulta válida, verificar sem login numa sessão comum, nem extrair somente o modelo. A resposta 403 demonstra apenas o bloqueio dessa requisição automatizada; não prova que o uso público interativo exija login.

### Parser e riscos

Não foi implementado parser. Se uma próxima verificação autorizada obtiver a página de produto por HTTP, a estratégia preferida é extrair um campo de modelo explícito de JSON-LD ou de payload estruturado embutido no HTML e normalizar para `{ serviceTag, model, source }`. Evitar selecionar por posição ou texto genérico: a página contém também informações de garantia, suporte e outros dados que estão fora do escopo.

Riscos: mudanças no HTML/payload, nomes de propriedades, fluxo de redirecionamento, proteção anti-bot/limites, conteúdo renderizado por JavaScript e variação por país/idioma. Revalidar o parser com respostas mínimas, sem armazenar cookies, tokens, dados pessoais ou conteúdo de garantia. Fazer poucas requisições e definir timeout.

## 4. Automação, credenciais e execução

- Navegador automatizado/Playwright: **não utilizado**. Deve ser considerado somente após uma avaliação separada do fluxo interativo e das dependências/licenças; esta prova não confirma que seja necessário ou que contorne o bloqueio.
- Correios: integração oficial requer token e acesso CWS autorizado; nenhuma variável ou credencial foi criada nesta spike. Na implementação futura, usar variáveis/secrets fora do repositório, conforme os escopos e ambiente aprovados pelos Correios.
- Dell: nenhuma credencial foi identificada como necessária para visualizar a página pública, mas não foi possível verificar o acesso com tag válida por HTTP. Nenhuma variável de ambiente foi necessária.
- Não houve gravação em banco, alteração de schema, migration, endpoint, alteração do módulo OS ou requisição repetida.

## 5. Recomendação e próximos passos

1. **Correios — precisa de credencial:** confirmar no CWS contrato, chave, escopo Rastro, ambiente e host de produção; então validar uma consulta de homologação a objeto autorizado e mapear os eventos mínimos.
2. **Dell — viável ainda não confirmado; avaliar parser simples primeiro:** em uma etapa futura, com um Service Tag de teste autorizado, observar manualmente a consulta no site Dell e identificar o HTML/payload público. Repetir uma requisição simples controlada se permitido. Só considerar Playwright se a página depender comprovadamente de JavaScript e após revisão da abordagem.
3. Implementar cada consulta em módulo experimental isolado, com timeout, tratamento de 403/429/timeout e saída mínima; remover dados de resposta não necessários.
4. Fazer revisão técnica antes de integrar à OS. Esta spike não altera regras de negócio nem recomenda automação periódica ainda.

## 6. Arquivos e limitações desta spike

Arquivo criado: `docs/integracoes/Prova-Tecnica-Correios-Dell.md`.

Somente documentação foi criada. Não há comandos de execução de código experimental. O teste de Dell foi limitado a uma requisição HTTP bloqueada usando identificador fictício; o resultado não determina o comportamento com um Service Tag válido em navegador normal. Correios foi avaliado pela documentação oficial, sem chamada autenticada.
