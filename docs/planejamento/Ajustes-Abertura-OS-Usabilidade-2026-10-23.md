# Ajustes de usabilidade da abertura — entrega local

## Resultado

Implementação preparada em 23/10/2026, sem publicação, migration, reinício de serviços,
commit ou push. O schema e as migrations preexistentes não foram alterados nesta missão.
Não houve acesso a banco de dados, inclusive homologação e produção.

## Comportamentos implementados

- PF sem campos IE/IM; PJ mantém os campos. País não aparece no formulário; novo endereço
  usa BR internamente. País e inscrições históricas são preservados na edição. Endereço
  vazio não é criado apenas pelo valor interno de país.
- Telefones opcionais com máscara nacional, DDD brasileiro válido, fixo de 10 dígitos ou
  celular de 11 dígitos, múltiplos contatos e principal independente dos e-mails. Novos
  números inválidos/internacionais são recusados; contatos legados inalterados permanecem.
- Cliente vinculado é apresentado em resumo com documento quando informado, endereço,
  telefones/e-mails e principal destacado. As ações são Alterar cliente e Substituir cliente.
- Alteração usa o formulário compartilhado, confirmação e revisão atual do cliente. O
  Backend limita a operação à abertura própria em andamento, usa locks/transação e registra
  dados anteriores/novos no Log Administrativo. IDs e registros de contatos são preservados;
  não há exclusão de contatos existentes por esta tela. Tipo de Pessoa, situação e aviso
  mantêm seus fluxos próprios. Exige permissões existentes, sem concedê-las automaticamente.
- Substituição pesquisa cliente existente, atualiza os equipamentos e mantém a decisão
  explícita de titularidade. O indicador persistido de cliente novo não é reiniciado.
- Sintoma identificado é o novo rótulo, sem renomear reportedDefect no banco/contrato.
  É opcional e inicia vazio. Confirmação sem sintoma mostra a pergunta aprovada, com
  Voltar e preencher ou Prosseguir sem informar. Voltar preserva os dados e focaliza o campo.
- Confirmar OS aguarda status inicial válido e cliente/equipamento salvos, sem edição ou
  operação pendente. A trava de envio impede confirmações duplicadas; Backend mantém suas
  regras de confirmação transacional e permissões.
- Histórico usa títulos legíveis e projeção explícita de dados relevantes, sem IDs,
  tokens/revisões ou JSON técnico bruto. Nada foi eliminado do histórico armazenado.
  A proteção de custos permanece no Backend.
- Encerramento/cancelamento ficam ao final do orçamento; ações continuam subordinadas
  ao estado da OS, controle exclusivo e permissões oficiais.
- Saída de OS aberta bloqueada na interface, no gerador e na API. O endpoint de impressão
  revalida o estado atual no Backend. Não há alterações financeiras.

## Impressão futura registrada, não implementada

Após confirmar abertura, perguntar se deseja imprimir a entrada. Entrada e saída terão
duas vias em uma folha A4, adequadas à separação/entrega. A saída será oferecida no fluxo
de encerramento, após a conclusão, ou posteriormente. Esta entrega não redesenha os modelos
nem implementa o novo diálogo; apenas bloqueia saída de OS ainda aberta.

## Validações concluídas

- Backend: build oficial `npm run build`; 137 testes aprovados, incluindo os testes novos.
- Frontend: TypeScript, build homologation e 186 testes aprovados em 16 arquivos.
- Prisma Client 7.10.1 local regenerado sem conexão, usando destino sintético e arquivo de
  configuração inexistente. Não foi executada migration. A primeira compilação apontou o
  Client local antigo; o build final passou após a geração correta.
- Empacotamento existente do Backend em staging local isolado: build, 137 testes, validação
  das dependências runtime e auditorias completa/runtime com zero vulnerabilidades.
- Validador oficial em Windows PowerShell 5.1: 9.535 arquivos do ZIP Backend com cobertura
  exata de hashes; hash incorreto, snapshot incorreto e falso commit rejeitados.
- Build por snapshot: sourceCommit nulo, baseCommit informado somente como base; nenhuma
  atribuição de commit antigo às mudanças novas.
- Navegador real local, com fetch inteiramente sintético, sem banco: resumo, pergunta sem
  sintoma, foco ao voltar, PF sem inscrições/país e PJ com inscrições conferidos.
- Abertura e formulário PJ sem transbordamento horizontal em 1366×768, 1920×1080, 375×812,
  1093×614 e 1536×864. As duas últimas dimensões verificam o espaço CSS equivalente a 125%
  nas resoluções solicitadas. O atalho de zoom real não foi aplicado pelo navegador de teste;
  zoom nativo 125% e maximizar/restaurar a janela do Windows continuam como validação
  operacional no navegador da equipe. Não foram declarados como executados.
- `git diff --check` aprovado; avisos de normalização CRLF/LF não são erros de whitespace.

## Revisão técnica e limites

Revisão local conforme o roteiro do Auditor Técnico, sem alegar auditor independente.
Não foram criados módulos, cadastros, permissões, tabelas ou estruturas administrativas.
O empacotador existente recebeu somente os dois caminhos necessários de fonte/teste novos.
Permissões da edição: service_orders.opening.create, people.update e people.contacts.add.
Leitura de saída exige service_orders.read, service_orders.budget.read e
service_orders.events.read. Não houve exposição de custos, alteração de RSA ou de credenciais.

O fluxo de edição tem testes sintéticos e compilação; ainda não foi executado contra o
MySQL de homologação. Não houve teste operacional mutável nem dados fictícios permanentes.
Essa limitação deve ser conferida após publicação autorizada, sem confundi-la com teste
de persistência real já realizado.

## Artefatos

Entrega: `scripts/homologation/windows10/artifacts/opening-usability-followup-20261023-v1`.
Inclui pacotes Backend completo e Frontend homologation, metadados, fontes selecionadas,
logs, capturas sintéticas e manifesto SHA-256. `PUBLICACAO-PENDENTE.md` descreve a aplicação
futura com o mecanismo existente e recuperação. A pasta de transferência não é origem
confiável para execução: verificar os bytes e hashes aprovados antes de qualquer script.

Não executar `Publicar.ps1 -Apply` sem autorização específica posterior. A próxima ação
humana é autorizar a publicação desta entrega. Nenhum comando manual é necessário agora.

## Evidência visual sintética

![Confirmação sem sintoma em largura de 375 px](../../scripts/homologation/windows10/artifacts/opening-usability-followup-20261023-v1/confirmation-mobile.png)
