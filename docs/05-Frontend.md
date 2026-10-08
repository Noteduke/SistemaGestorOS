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

Pessoas e equipamentos inativos não devem aparecer como opções padrão em novos lançamentos ou novas OS, respectivamente. Pessoa inativa pode ser consultada pelo filtro “incluir inativos”, mas não pode ser usada em novos vínculos de OS, venda ou como proprietária de Equipamento. Os registros históricos continuam apresentando as entidades normalmente. Pessoa nunca tem exclusão física; Equipamento só pode ser excluído por Administrador ou usuário com permissão equivalente quando não houver qualquer registro persistido relacionado. O Frontend não deve inferir vínculos históricos; segue o resultado fornecido pela API.

## 10.3 Cadastro de Equipamento

O formulário exige Proprietário, Tipo de Equipamento, Marca, Modelo e Status; o serial é opcional. Equipamento novo inicia com status Ativo. Tipos de Equipamento e Marcas inativos não aparecem como opções padrão para novos equipamentos, mas as referências existentes continuam visíveis nos históricos.

Quando houver serial, a API bloqueia repetição para o mesmo proprietário e retorna aviso não bloqueante para repetição associada a proprietário diferente; nesse segundo caso a interface permite cadastrar outro Equipamento e não sugere transferência. Sem serial, não se executa busca automática de duplicidade pela combinação Proprietário + Tipo + Marca + Modelo. O Backend/API é autoridade para validar duplicidade; a interface apresenta o resultado sem criar regras próprias.

O Frontend pode pesquisar equipamentos por Proprietário/Pessoa/Cliente, Tipo, Marca, Modelo, Número de Série e Status. Modelo aceita busca textual; serial aceita busca exata ou parcial; Status permite Ativo, Inativo ou Todos. Inativos ficam ocultos por padrão e aparecem quando o usuário inclui inativos pelo filtro. Essa pesquisa apenas localiza registros e não deve ser confundida com a validação de duplicidade no cadastro.

Máscaras de telefone e CEP são aplicadas somente na interface; o Backend salva esses valores apenas com números. CEP é opcional. Dados textuais são persistidos em caixa alta, exceto e-mail, que é salvo em minúsculas após remoção de espaços externos. O número de série é convertido para caixa alta sem remover símbolos ou alterar espaços, inclusive no início/fim; a interface não deve limpar ou ocultar essa diferença. Telefone com 10 dígitos é aceito como fixo; com 11, como celular se o primeiro dígito após o DDD for 9. Fora desses critérios, entre 1 e 32 dígitos, a API avisa e a interface permite confirmar e continuar; sem dígitos ou acima de 32, bloqueia no recorte aprovado.

Permissões são atribuídas por usuário/ação. Técnico e Usuário comum não são perfis rígidos; Administrador tem poderes máximos, e outro usuário pode executar ação administrativa específica se receber permissão equivalente. Usuários com permissão podem alterar Pessoa e Equipamento mesmo com histórico, sem justificativa obrigatória. Proprietário sem histórico pode ser corrigido diretamente; com histórico, a mudança usa transferência formal.

O Frontend apenas reflete as permissões e respostas fornecidas pela API. Pode ocultar ou desabilitar ações indisponíveis para orientar a interface, mas essa apresentação não concede nem nega autorização real; o Backend verifica cada operação e é a autoridade final. Não duplicar no Frontend as regras de autorização.

O histórico geral por entidade de Pessoa, Equipamento e OS aparece no contexto do respectivo cadastro/OS. A interface diferencia alteração de campo (valor anterior e novo) de evento/movimentação. Aviso e histórico técnico/auditoria exigem Administrador ou permissão equivalente. Não se deve presumir snapshot completo dos cadastros dentro da OS; a consulta de dados atuais é complementada pelo histórico de mudanças. A estrutura física continua pendente.

Antes de salvar qualquer alteração de Pessoa ou Equipamento, exibir a confirmação: “Estas alterações serão registradas no histórico. Deseja continuar?”. Confirmar salva e registra a alteração; cancelar não salva. O registro é automático e alteração comum não exige justificativa. Os detalhes finais de exibição, filtros, paginação e eventos permanecem pendentes.

Cada coleção de telefones, e-mails e endereços pode ter no máximo um principal e não precisa ter nenhum. Ao selecionar um registro como principal, desmarcar o anterior da mesma coleção; remover/inativar o principal pode deixar a coleção sem principal. São permitidos vários endereços do mesmo Tipo.

## 10.4 CPF e CNPJ

O campo de CPF aceita somente algarismos, com máscara visual opcional. O campo de CNPJ deve aceitar letras e números para permitir o formato alfanumérico oficial, além do formato numérico antigo. A máscara deve preservar as letras; antes do envio, o valor será encaminhado para normalização e validação pela API. A validação visual não substitui a validação do Backend. A API persiste CPF numérico e CNPJ sem pontuação, com letras em maiúsculas.

## 10.5 Telefones e e-mails — Backend implementado, interface futura

O Backend já implementa inclusão e listagem de telefones/e-mails como sub-recursos de Pessoa; a interface correspondente permanece futura. Todo `POST` exige `confirmPersonChange: true`. Quando a interface existir, deverá exibir a confirmação geral antes de salvar; esse campo, sozinho, não comprova que a mensagem foi apresentada. Para telefone fora do padrão, a API retorna `409 PHONE_CONFIRMATION_REQUIRED` sem gravar; a interface apresenta o aviso e só reenvia com `confirmNonstandardPhone: true` após confirmação. Mais de 32 dígitos são bloqueados. O Backend registra histórico mínimo de criação e mudança efetiva de principal. E-mail repetido na mesma Pessoa é bloqueado; entre Pessoas diferentes é permitido com aviso genérico. Pessoa inativa pode ter contatos consultados, mas não receber novos contatos. As rotas atuais não estão prontas para produção: ainda precisam de autenticação e autorização por ação.

### 10.6 Autenticação e autorização

O Frontend deverá usar a sessão autenticada conforme o contrato futuro da API, lidar com expiração, logout da sessão atual e respostas de autorização negada, e refletir as permissões devolvidas pelo Backend. Pode ocultar ou desabilitar ações indisponíveis, mas não duplica regras nem é autoridade de autorização. Chamadas mutáveis (`POST`, `PUT`, `PATCH`, `DELETE`) deverão incluir a proteção CSRF definida pela API; `GET` não exige token CSRF. O sistema é considerado de uso interno neste momento; acesso externo segue proibido até 2FA implementado e regra confiável de rede aprovada. A implementação do Frontend de autenticação permanece futura.

# 11. Evolução

Este documento será expandido com padrões de componentes, gerenciamento de estado, rotas, temas e biblioteca visual adotada.
