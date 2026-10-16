import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createHomologationIssue, listHomologationIssues, updateHomologationIssueStatus, type HomologationIssue, type HomologationIssueStatus } from "../../api/homologation";

const STATUSES: HomologationIssueStatus[] = ["PENDENTE", "EM CORREÇÃO", "CORRIGIDO", "VALIDADO"];
export function HomologationIssuesPage({ csrfToken, isAdmin }: { csrfToken: string; isAdmin: boolean }) {
  const [description, setDescription] = useState(""); const [attemptedAction, setAttemptedAction] = useState(""); const [observedResult, setObservedResult] = useState("");
  const [screenReference, setScreenReference] = useState(""); const [serviceOrderPublicId, setServiceOrderPublicId] = useState(""); const [screenshot, setScreenshot] = useState<File>();
  const [issues, setIssues] = useState<HomologationIssue[]>([]); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function refresh() { if (!isAdmin) return; try { setIssues((await listHomologationIssues()).data); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os registros."); } }
  useEffect(() => { void refresh(); }, [isAdmin]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const result = await createHomologationIssue({ description, attemptedAction, observedResult, screenReference, serviceOrderPublicId, screenshot }, csrfToken); setDescription(""); setAttemptedAction(""); setObservedResult(""); setScreenReference(""); setServiceOrderPublicId(""); setScreenshot(undefined); setMessage(`Problema registrado (${result.data.publicId}).`); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar o problema."); }
    finally { setBusy(false); }
  }
  async function changeStatus(issue: HomologationIssue, status: HomologationIssueStatus) { try { await updateHomologationIssueStatus(issue.publicId, status, csrfToken); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a situação."); } }
  return <section className="page-section"><div className="page-heading"><div><p className="eyebrow">Homologação 1</p><h1>Reportar problema</h1><p className="muted">Não inclua senhas, documentos pessoais ou outros dados sensíveis na descrição ou na captura.</p></div></div>
    <form className="info-card issue-form" onSubmit={(event) => void submit(event)}>
      <label>Descrição do problema<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} required /></label>
      <label>O que estava tentando fazer<textarea value={attemptedAction} onChange={(event) => setAttemptedAction(event.target.value)} maxLength={2000} required /></label>
      <label>Resultado observado<textarea value={observedResult} onChange={(event) => setObservedResult(event.target.value)} maxLength={5000} required /></label>
      <label>Tela ou referência (opcional)<input value={screenReference} onChange={(event) => setScreenReference(event.target.value)} maxLength={191} /></label>
      <label>Número público da OS (opcional)<input value={serviceOrderPublicId} onChange={(event) => setServiceOrderPublicId(event.target.value)} maxLength={36} /></label>
      <label>Captura PNG/JPEG (opcional, máximo 5 MiB)<input type="file" accept="image/png,image/jpeg" onChange={(event) => setScreenshot(event.target.files?.[0])} /></label>
      <button className="button button--primary" disabled={busy}>{busy ? "Registrando…" : "Registrar problema"}</button>
      {message && <p role="status">{message}</p>}{error && <p className="form-message--error" role="alert">{error}</p>}
    </form>
    {isAdmin && <section className="info-card"><h2>Problemas registrados</h2>{issues.map((issue) => <article className="issue-card" key={issue.publicId}>
      <h3>{issue.status} · {new Date(issue.createdAt).toLocaleString("pt-BR")}</h3><p>Relatado por {issue.reportedBy.username} · versão {issue.systemVersion}{issue.serviceOrderNumber ? ` · OS ${issue.serviceOrderNumber}` : ""}</p>
      <dl><dt>Descrição</dt><dd>{issue.description}</dd><dt>Tentativa</dt><dd>{issue.attemptedAction}</dd><dt>Resultado observado</dt><dd>{issue.observedResult}</dd>{issue.screenReference && <><dt>Tela</dt><dd>{issue.screenReference}</dd></>}</dl>
      {issue.screenshotMime && <a href={`/api/v1/homologation/issues/${encodeURIComponent(issue.publicId)}/screenshot`}>Baixar captura</a>}
      <label>Situação<select value={issue.status} onChange={(event) => void changeStatus(issue, event.target.value as HomologationIssueStatus)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
    </article>)}</section>}
  </section>;
}
