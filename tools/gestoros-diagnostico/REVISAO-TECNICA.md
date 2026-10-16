# Revisão técnica — versão 1.0.0

Realizada em 16/10/2026 sobre o código local, sem subagentes.

- Compatibilidade: sintaxe analisada e execução real no Windows PowerShell 5.1; interface Windows Forms abriu, coletou 30 resultados e fechou pelo teste de smoke.
- Regras: versões, serviços e marcador centralizados em PSD1 consumido pelo diagnóstico e pelos scripts existentes de pré-requisitos/build/deploy/verificação. Nenhum script de provisionamento foi executado.
- Somente leitura: inspeções CIM, TCP, Firewall, sistema de arquivos e metadados. Não executa binários descobertos. Sem cliente SQL, migrations, alteração de serviço, configuração ou Firewall. Exportação e clipboard são ações explícitas do usuário.
- Segredos: .env apenas tem sua presença conferida. Conteúdo não é aberto. Manifesto não é exportado; apenas valida campos esperados. Exceções e linhas de comando dos serviços não são expostas. Valores de versões exportados são numéricos.
- Falta de acesso: capturada como Não verificado/ATENÇÃO. Ausência confirmada e incompatibilidade são PENDENTE. A coleta segue após limitações individuais.
- Validação: 38 asserções aprovadas, com ambientes simulados ausente/parcial/configurado/sem acesso; relatório JSON e TXT, segredo sentinela, hashes de arquivos antes/depois, AST de comandos e dos scripts consumidores das regras.
- Limites: os mocks de dependências exercitam a classificação dos cenários, não emulam todos os formatos PE ou versões de fornecedores. Não houve servidor H1 completo para teste de integração. Consultas reais do host sujeitas a bloqueio foram registradas como Não verificado.
- Pendências operacionais: validação visual da janela, salvar/copiar pelos botões, HTTPS com CA interna e nos clientes, escopo efetivo do Firewall, configuração efetiva do banco/paths/flags e evidência de restauração. Existência de binários, serviços, arquivos ou listeners não comprova funcionamento da aplicação.

Nenhum banco foi conectado, lido ou alterado. Não representa aprovação dos testes funcionais da Homologação 1.
