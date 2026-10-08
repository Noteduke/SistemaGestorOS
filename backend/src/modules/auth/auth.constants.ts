export const AUTH_COOKIE_NAME = "gos_session";
export const PRE_AUTH_COOKIE_NAME = "gos_pre_auth";
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const PRE_AUTH_CSRF_TTL_MS = 15 * 60 * 1000;

export const PERMISSION_CATALOG = [
  ["people.read", "Consultar Pessoas."],
  ["people.create", "Cadastrar Pessoas."],
  ["people.update", "Alterar Pessoas."],
  ["people.inactivate", "Inativar Pessoas."],
  ["people.reactivate", "Reativar Pessoas."],
  ["people.contacts.read", "Consultar contatos de Pessoas."],
  ["people.contacts.add", "Adicionar contatos a Pessoas."],
  ["people.notice.create", "Criar avisos de Pessoas."],
  ["people.notice.update", "Alterar avisos de Pessoas."],
  ["people.notice.delete", "Excluir avisos de Pessoas."],
  ["people.history.read.operational", "Consultar histórico operacional."],
  ["people.history.read.sensitive", "Consultar histórico sensível."],
  ["equipment.read", "Consultar equipamentos."],
  ["equipment.create", "Cadastrar equipamentos."],
  ["equipment.update", "Alterar equipamentos."],
  ["equipment.inactivate", "Inativar equipamentos."],
  ["equipment.reactivate", "Reativar equipamentos."],
  ["equipment.delete_unlinked", "Excluir equipamento sem vínculos."],
  ["equipment.transfer_ownership", "Transferir titularidade de equipamentos."],
  ["users.read", "Consultar usuários."],
  ["users.create", "Criar usuários."],
  ["users.update", "Alterar usuários."],
  ["users.permissions.grant", "Conceder permissões a usuários."],
  ["users.permissions.revoke", "Revogar permissões de usuários."],
] as const;

export const AUTH_AUDIT_EVENT = {
  LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_FAILURE_THRESHOLD_REACHED: "LOGIN_FAILURE_THRESHOLD_REACHED",
  LOGOUT: "LOGOUT",
  SESSION_REVOKED: "SESSION_REVOKED",
  FIRST_ADMIN_BOOTSTRAPPED: "FIRST_ADMIN_BOOTSTRAPPED",
} as const;
