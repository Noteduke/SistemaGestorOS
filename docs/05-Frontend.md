# FRONTEND
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir a arquitetura e os padrões oficiais do Frontend do Sistema Gestor OS.

# 2. Tecnologias

- React
- TypeScript

# 3. Responsabilidades

O Frontend será responsável exclusivamente por:

- Interface do usuário;
- Navegação;
- Validação visual;
- Consumo da API;
- Experiência do usuário.

Toda regra de negócio permanecerá no Backend.

# 4. Organização

A aplicação será organizada em componentes reutilizáveis.

As telas deverão seguir um padrão único de layout.

# 5. Navegação

O sistema utilizará menu lateral como navegação principal.

Novos módulos deverão seguir a estrutura oficial de navegação.

# 6. Componentes

Sempre que possível utilizar componentes reutilizáveis.

Evitar duplicação de código.

# 7. Formulários

Todos os formulários deverão possuir comportamento consistente:

- validação visual;
- mensagens padronizadas;
- atalhos de teclado quando aplicável.

# 8. Padrão Visual

Toda a identidade visual deverá permanecer consistente em todos os módulos.

# 9. Responsividade

O sistema deverá funcionar corretamente em diferentes resoluções.

# 10. Integração

Todo acesso aos dados ocorrerá exclusivamente através da API oficial.

## 10.1 Apresentação do Aviso da Pessoa

Nos contextos de visualização do cadastro da Pessoa, abertura de OS para ela e venda para ela, quando houver Aviso preenchido, a interface apresenta a pergunta “Há informação a ser visualizada. Deseja visualizar agora?”. A interface só apresenta o conteúdo se o operador escolher Sim. Ao escolher Não, apresenta “Não deixe de verificar as mensagens pendentes antes de continuar.” A operação continua normalmente nos dois casos. Não exibir o conteúdo automaticamente.

A pergunta volta a ocorrer em cada ocorrência de um contexto aprovado, sem dispensa por sessão, atendimento ou usuário. Nesta etapa, não há log de leitura, registro da resposta, confirmação formal de ciência ou histórico de leituras. A interface segue a regra fornecida pela API; validações e permissões permanecem responsabilidade do Backend.

## 10.2 Pessoas e equipamentos inativos

Pessoas e equipamentos inativos não devem aparecer como opções padrão em novos lançamentos ou novas OS, respectivamente. A pesquisa deve permitir incluir inativos por filtro, e os registros históricos continuam apresentando as entidades normalmente. O Frontend não deve inferir ou implementar critérios de vínculo histórico para exclusão; deve seguir o resultado e as regras fornecidas pela API.

## 10.3 Cadastro de Equipamento

O formulário exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; o serial é opcional. Equipamento novo inicia com status Ativo. Tipos de Equipamento e Marcas inativos não aparecem como opções padrão para novos equipamentos, mas as referências existentes continuam visíveis nos históricos.

Quando houver serial, a API bloqueia repetição para o mesmo proprietário e retorna aviso não bloqueante para repetição associada a proprietário diferente; nesse segundo caso a interface permite cadastrar outro Equipamento e não sugere transferência. Sem serial, não se executa busca automática de duplicidade pela combinação Proprietário + Tipo + Marca + Modelo. O Backend/API é autoridade para validar duplicidade; a interface apresenta o resultado sem criar regras próprias.

O Frontend pode pesquisar equipamentos por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; Status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem quando o usuário inclui inativos pelo filtro. Essa pesquisa apenas localiza registros e não deve ser confundida com a validação de duplicidade no cadastro.

Máscaras de telefone e CEP são aplicadas somente na interface; o Backend salva esses valores apenas com números. CEP é opcional. Dados textuais são persistidos em caixa alta, exceto e-mail, que é salvo em minúsculas após remoção de espaços externos. O número de série é convertido para caixa alta sem remover símbolos ou alterar espaços, inclusive no início/fim; a interface não deve limpar ou ocultar essa diferença. Se a API avisar que o telefone está fora do formato esperado, a interface informa o operador e permite confirmar e continuar.

Ao alterar na ficha do Equipamento o Tipo, Marca, Modelo ou Número de Série, a interface deverá respeitar a autorização retornada pela API: sem histórico, usuário comum pode corrigir; com histórico, somente administrador. Proprietário sem histórico pode ser corrigido diretamente; com histórico, a mudança usa transferência formal. Justificativa e auditoria para alterações com histórico ainda dependem de definição futura. Transferência pode ocorrer fora de OS ou durante uma OS, com associação opcional à OS; transferências nunca alteram OS antigas.

# 11. Evolução

Este documento será expandido com padrões de componentes, gerenciamento de estado, rotas, temas e biblioteca visual adotada.
