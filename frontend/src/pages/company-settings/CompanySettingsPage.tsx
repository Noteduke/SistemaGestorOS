import { useEffect, useState, type FormEvent } from "react";
import { getCompanySettings, removeCompanyLogo, updateCompanySettings, uploadCompanyLogo, type CompanySettings } from "../../api/companySettings";

type FormValues = Pick<CompanySettings, "legalName" | "tradeName" | "cnpj" | "fullAddress" | "phone" | "email">;
const EMPTY_FORM: FormValues = { legalName: "", tradeName: "", cnpj: "", fullAddress: "", phone: "", email: "" };

export function CompanySettingsPage({ csrfToken }: { csrfToken: string }) {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await getCompanySettings(signal);
      setSettings(response.data);
      setForm({ legalName: response.data.legalName ?? "", tradeName: response.data.tradeName ?? "", cnpj: response.data.cnpj ?? "",
        fullAddress: response.data.fullAddress ?? "", phone: response.data.phone ?? "", email: response.data.email ?? "" });
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível consultar os dados da empresa.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const response = await updateCompanySettings(form, csrfToken);
      setSettings(response.data); setSuccess("Dados da empresa salvos.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar os dados."); }
    finally { setSaving(false); }
  }

  async function sendLogo() {
    if (!file) return;
    setSaving(true); setError(""); setSuccess("");
    try { const response = await uploadCompanyLogo(file, csrfToken); setSettings(response.data); setFile(null); setSuccess("Logo atualizada."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a logo."); }
    finally { setSaving(false); }
  }

  async function clearLogo() {
    if (!window.confirm("Remover a logo cadastrada?")) return;
    setSaving(true); setError(""); setSuccess("");
    try { const response = await removeCompanyLogo(csrfToken); setSettings(response.data); setFile(null); setSuccess("Logo removida."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível remover a logo."); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="state-card" role="status">Carregando configuração da empresa…</section>;

  return <section className="catalog-page company-settings-page" aria-labelledby="company-settings-title">
    <div className="page-heading"><div><p className="eyebrow">Configuração administrativa</p><h1 id="company-settings-title">Identificação da empresa</h1><p>Os dados cadastrados serão usados nos documentos da Ordem de Serviço.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="inline-success" role="status">{success}</p>}
    {settings?.logoUnavailable && <p className="form-error" role="alert">A logo cadastrada não está disponível. Envie outra imagem ou remova o registro.</p>}
    <form className="catalog-form" onSubmit={(event) => void submit(event)}>
      <label>Razão social<input maxLength={191} value={form.legalName ?? ""} onChange={(event) => setForm({ ...form, legalName: event.target.value })} /></label>
      <label>Nome fantasia<input maxLength={191} value={form.tradeName ?? ""} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} /></label>
      <label>CNPJ<input maxLength={32} inputMode="text" value={form.cnpj ?? ""} onChange={(event) => setForm({ ...form, cnpj: event.target.value })} /></label>
      <label>Endereço completo<textarea maxLength={4000} rows={3} value={form.fullAddress ?? ""} onChange={(event) => setForm({ ...form, fullAddress: event.target.value })} /></label>
      <label>Telefone<input maxLength={30} value={form.phone ?? ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      <label>E-mail<input type="email" maxLength={254} value={form.email ?? ""} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <div className="company-logo-field"><strong>Logotipo</strong>
        {settings?.logoDataUrl ? <img className="company-logo-preview" src={settings.logoDataUrl} alt="Logo cadastrada da empresa" /> : <p>Nenhuma logo cadastrada.</p>}
        <p className="field-hint">PNG ou JPEG, até 2 MiB. A imagem fica em armazenamento persistente privado deste ambiente.</p>
        <div className="company-logo-actions"><input aria-label="Selecionar logo" type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <button className="button button--secondary" type="button" disabled={!file || saving} onClick={() => void sendLogo()}>Enviar / substituir logo</button>
          <button className="button button--secondary" type="button" disabled={(!settings?.logoDataUrl && !settings?.logoUnavailable) || saving} onClick={() => void clearLogo()}>Remover logo</button></div>
      </div>
      <div className="catalog-form__actions"><button className="button button--primary" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar dados da empresa"}</button></div>
    </form>
  </section>;
}
