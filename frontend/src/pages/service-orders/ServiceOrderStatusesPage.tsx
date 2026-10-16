import { useEffect, useState } from "react";
import { listServiceOrderStatuses, saveServiceOrderStatus, type ServiceOrderStatus, type TechnicalCompletion } from "../../api/serviceOrders";

const completionOptions: Array<{ value: TechnicalCompletion; label: string }> = [
  { value: "NOT_COMPLETED", label: "Não concluído" },
  { value: "COMPLETED_WITH_REPAIR", label: "Concluído com reparo" },
  { value: "COMPLETED_WITHOUT_REPAIR", label: "Concluído sem reparo" },
];
const empty = { publicId: "", name: "", technicalCompletion: "NOT_COMPLETED" as TechnicalCompletion };

export function ServiceOrderStatusesPage({ csrfToken }: { csrfToken: string }) {
  const [statuses, setStatuses] = useState<ServiceOrderStatus[]>([]);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try { setStatuses((await listServiceOrderStatuses()).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível consultar os status."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      await saveServiceOrderStatus({ name: form.name, technicalCompletion: form.technicalCompletion, ...(form.publicId ? { publicId: form.publicId, version: statuses.find((status) => status.publicId === form.publicId)?.version } : {}) }, csrfToken);
      setMessage("Status salvo. A configuração passa a valer nas próximas transições; OS e eventos anteriores não são reclassificados.");
      setForm(empty); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o status."); }
    finally { setSaving(false); }
  }

  return <section className="page-section">
    <div className="page-heading"><div><p className="eyebrow">Configuração administrativa</p><h1>Status de OS</h1><p>Defina o atributo técnico de cada status. O nome não determina se houve conclusão.</p></div></div>
    <div className="detail-content">
      <form className="info-card form-grid" onSubmit={(event) => void submit(event)}>
        <h2>{form.publicId ? "Editar status" : "Novo status"}</h2>
        <p>Editar o atributo não reclassifica OS existentes nem altera eventos anteriores; a configuração nova vale quando a situação da OS for alterada.</p>
        <label>Nome do status<input maxLength={191} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Conclusão técnica<select value={form.technicalCompletion} onChange={(event) => setForm({ ...form, technicalCompletion: event.target.value as TechnicalCompletion })}>{completionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="form-actions"><button className="button button--primary" disabled={saving}>{saving ? "Salvando…" : "Salvar status"}</button><button className="button button--secondary" type="button" onClick={() => setForm(empty)}>Limpar</button></div>
        {message && <p role="status" className="form-message form-message--success">{message}</p>}{error && <p role="alert" className="form-message form-message--error">{error}</p>}
      </form>
        <section className="info-card"><h2>Status cadastrados</h2>{loading ? <p>Carregando…</p> : statuses.length === 0 ? <p>Nenhum status cadastrado.</p> : <div className="table-scroll"><table><thead><tr><th>Nome</th><th>Conclusão técnica</th><th></th></tr></thead><tbody>{statuses.map((status) => <tr key={status.publicId}><td>{status.name}</td><td>{completionOptions.find((item) => item.value === status.technicalCompletion)?.label}</td><td><button className="text-button" type="button" onClick={() => setForm({ publicId: status.publicId, name: status.name, technicalCompletion: status.technicalCompletion })}>Editar</button></td></tr>)}</tbody></table></div>}</section>
    </div>
  </section>;
}
