# API
# SISTEMA GESTOR OS

**Versão:** 1.0
**Status:** Em evolução

# 1. Objetivo

Definir o padrão oficial para todas as APIs do Sistema Gestor OS.

# 2. Arquitetura

- API REST.
- Backend em NestJS.
- Comunicação via HTTPS.
- JSON como formato padrão.

# 3. Versionamento

A API deverá suportar versionamento (ex.: /api/v1).

# 4. Autenticação

Será centralizada no backend.
Os detalhes serão definidos no documento de Segurança.

# 5. Padrão de Endpoints

Recursos utilizarão substantivos.

Exemplos:
GET /clientes
POST /clientes
PUT /clientes/{id}
DELETE /clientes/{id}

# 6. Respostas

Todas as respostas deverão seguir um padrão único.

Sucesso:
- dados
- paginação (quando aplicável)

Erro:
- código
- mensagem
- detalhes

# 7. Paginação

Listagens deverão suportar paginação.

# 8. Filtros

Filtros deverão ser padronizados para todos os módulos.

# 9. Upload de Arquivos

Uploads serão tratados por endpoints específicos.

# 10. Documentação

A API deverá possuir documentação centralizada e atualizada.

## 10.1 Regras de domínio para Cadastros

O Backend/API aplica as regras de duplicidade e normalização aprovadas em `docs/02-Regras-de-Negocio.md`. CPF/CNPJ informado é validado e duplicidade bloqueia. Sem documento, correspondência exata normalizada em nome, telefone ou e-mail retorna aviso não bloqueante. Serial repetido para o mesmo proprietário bloqueia; para proprietário diferente retorna aviso não bloqueante.

Para documentos de Pessoa, a API deverá validar CPF numérico para PF e CNPJ numérico ou alfanumérico oficial para PJ. CPF é persistido somente com números; CNPJ é persistido sem pontuação e em maiúsculas, preservando letras do padrão oficial. Validade matemática, compatibilidade com Tipo de Pessoa e unicidade são verificadas no Backend; não se deve normalizar CNPJ removendo tudo que não seja dígito.

A API não permite Pessoa inativa em novos vínculos operacionais. Permissões são avaliadas por usuário/ação; Administrador tem poderes máximos e uma permissão explícita equivalente pode autorizar usuário específico. Mudanças de principalidade devem preservar no máximo um principal em cada coleção, com atualização atômica.

Os contratos, formatos de resposta específicos para avisos, filtros e endpoints de Cadastros serão detalhados antes da implementação. Esta orientação não define rotas nem altera o schema atual.

# 11. Integrações

Integrações externas utilizarão serviços independentes sempre que possível.

# 12. Evolução

Este documento será expandido conforme novos módulos forem implementados.
