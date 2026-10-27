import type { OpeningCustomer } from "../../api/serviceOrders";
import { createOpeningCustomer } from "../../api/openingWorkflow";
import { PersonForm } from "../people/PersonForm";
export function OpeningCustomerForm({ csrfToken, openingPublicId, onCreated, onCancel }: { csrfToken: string; openingPublicId: string; onCreated: (customer: OpeningCustomer, warning?: string) => void; onCancel: () => void }) {
  return <div className="opening-confirmation-backdrop"><section className="opening-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="new-customer-title">
    <h2 id="new-customer-title">Novo cliente</h2><p>Cadastro completo de Pessoa. CPF/CNPJ e contatos são opcionais.</p>
    <PersonForm onCancel={onCancel} onSave={async data => { const result = await createOpeningCustomer({ ...data, openingPublicId }, csrfToken); onCreated(result.data, result.warnings.map(w => w.message).join(" ")); }} />
  </section></div>;
}
