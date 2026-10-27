import { TrackedForm } from "../../components/PendingForms";
import { useId, useRef, useState } from "react";
import type { PersonFormInput } from "../../api/people";
import { formatBrazilianPhone, validBrazilianPhone } from "./brazilian-phone";
import { ApiError } from "../../api/serviceOrders";

const initial = (): PersonFormInput => ({ personType: "PF", name: "", document: "", tradeName: "", stateRegistration: "", municipalRegistration: "", contactName: "", observations: "", warning: "", isActive: true,
  address: { postalCode: "", street: "", number: "", complement: "", district: "", city: "", state: "", country: "BR" }, phones: [], emails: [] });

/** Complete reusable Person form; the caller chooses the general/opening API. */
export function PersonForm({ onSave, onCancel, initialValue, editing = false }: { initialValue?: PersonFormInput; editing?: boolean; onSave: (data: PersonFormInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PersonFormInput>(() => {
    const blank = initial(); if (!initialValue) return blank;
    return { ...blank, ...Object.fromEntries(Object.keys(blank).map(key => [key, initialValue[key as keyof PersonFormInput] ?? blank[key as keyof PersonFormInput]])), ...Object.fromEntries(Object.entries(blank).filter(([, v]) => typeof v === "string").map(([key]) => [key, initialValue[key as keyof PersonFormInput] ?? ""])), address: { ...blank.address, ...Object.fromEntries(Object.entries(initialValue.address ?? {}).map(([key, value]) => [key, value ?? ""])) } };
  }); const [saving, setSaving] = useState(false);
  const [formSaved,setFormSaved]=useState(0);
  const [error, setError] = useState(""); const [invalid, setInvalid] = useState<Record<string, string>>({});
  const busy = useRef(false); const id = useId(); const ref = useRef<HTMLFormElement>(null);
  const labels = { name: "Nome / Razão social", document: "CPF/CNPJ (opcional)", tradeName: "Nome fantasia", stateRegistration: "Inscrição estadual", municipalRegistration: "Inscrição municipal", contactName: "Pessoa de contato da empresa", observations: "Observações", warning: "Aviso" };
  function text(key: keyof typeof labels, required = false) {
    return <label key={key}>{labels[key]}{required && <span aria-hidden="true"> *</span>}<input aria-label={labels[key]} name={key} required={required} autoFocus={key === "name"} maxLength={key === "observations" || key === "warning" ? 2000 : key === "document" ? 30 : key.endsWith("Registration") ? 50 : 191} value={form[key]} aria-invalid={!!invalid[key]} aria-describedby={invalid[key] ? `${id}-${key}` : undefined} onChange={e => { setForm({ ...form, [key]: e.target.value }); setInvalid({ ...invalid, [key]: "" }); }} />{invalid[key] && <span className="field-error" id={`${id}-${key}`}>{invalid[key]}</span>}</label>;
  }
  return <TrackedForm saved={formSaved} formRef={ref} className="opening-equipment__draft-fields person-form" noValidate onInvalidCapture={event => { const field = event.target as HTMLInputElement; setInvalid(current => ({ ...current, [field.name]: field.validity.valueMissing ? "Preencha este campo." : "Revise o valor informado." })); }} onSubmit={async event => {
    event.preventDefault(); if (busy.current) return;
    setError(""); setInvalid({});
    if (!form.name.trim()) { setInvalid({ name: "Preencha este campo." }); ref.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus(); return; }
    const badPhone = form.phones.findIndex(phone => phone.number.trim() && !validBrazilianPhone(phone.number) && !(editing && phone.publicId && initialValue?.phones.some(old => old.publicId === phone.publicId && old.number === phone.number)));
    if (badPhone >= 0) { setInvalid({ [`phone${badPhone}`]: "Informe DDD e telefone fixo ou celular brasileiro válido." }); ref.current?.querySelector<HTMLElement>(`[name="phone${badPhone}"]`)?.focus(); return; }
    if (!event.currentTarget.checkValidity()) { event.currentTarget.querySelector<HTMLElement>(":invalid")?.focus(); return; }
    busy.current = true; setSaving(true);
    try { if (editing && !window.confirm("Confirmar alterações no cadastro deste cliente?")) return; await onSave({ ...form, phones: form.phones.filter(x => x.number.trim()), emails: form.emails.filter(x => x.address.trim()) }); setFormSaved(n=>n+1); }
    catch (reason) {
      const message = reason instanceof ApiError ? reason.message : "Não foi possível salvar. Os dados foram preservados.";
      const supplied = reason instanceof ApiError && typeof reason.details?.field === 'string' ? reason.details.field : '';
      const safeField = ['name','document','isActive','address.postalCode','address.street','address.number','address.complement','address.district','address.city','address.state','address.country'].includes(supplied) ? supplied : supplied === 'phones' ? 'phone0' : supplied === 'emails' ? 'email0' : undefined;
      const field = safeField ?? (reason instanceof ApiError && /CPF|CNPJ|DOCUMENT/.test(reason.code ?? "") ? "document" : reason instanceof ApiError && /PHONE/.test(reason.code ?? "") ? "phone0" : reason instanceof ApiError && /EMAIL/.test(reason.code ?? "") ? "email0" : undefined);
      setError(field ? "Revise o campo destacado. Os dados foram preservados." : message); if (field) { setInvalid({ [field]: message }); ref.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus(); }
    } finally { busy.current = false; setSaving(false); }
  }}>
    <p>* Campo obrigatório</p>{editing && <p className="muted">Confirme as alterações antes de salvar. Situação, aviso e contatos históricos são preservados; contatos existentes podem ser corrigidos, mas não excluídos por este formulário.</p>}
    <fieldset disabled={saving}><legend>Identificação</legend>
      <label>Tipo de pessoa<select disabled={editing} value={form.personType} onChange={e => setForm({ ...form, personType: e.target.value as "PF" | "PJ", tradeName: "", contactName: "" })}><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label>
      {text("name", true)}{text("document")}
      {form.personType === "PJ" && <>{text("tradeName")}{text("contactName")}{text("stateRegistration")}{text("municipalRegistration")}</>}
      <label>Situação cadastral<select disabled={editing} name="isActive" aria-invalid={!!invalid.isActive} value={form.isActive ? "active" : "inactive"} onChange={e => setForm({ ...form, isActive: e.target.value === "active" })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select>{invalid.isActive && <span className="field-error">{invalid.isActive}</span>}</label>
      {text("observations")}{!editing && text("warning")}
    </fieldset>
    <fieldset disabled={saving}><legend>Endereço único (opcional)</legend>{(Object.entries({ postalCode: "CEP", street: "Logradouro", number: "Número", complement: "Complemento", district: "Bairro", city: "Cidade", state: "UF" }) as Array<[keyof PersonFormInput["address"], string]>).map(([key, label]) => <label key={key}>{label}<input name={`address.${key}`} aria-invalid={!!invalid[`address.${key}`]} aria-describedby={invalid[`address.${key}`] ? `${id}-address-${key}` : undefined} maxLength={key === "state" || key === "country" ? 2 : key === "postalCode" ? 16 : key === "number" ? 32 : key === "street" ? 191 : 100} value={form.address[key]} onChange={e => setForm({ ...form, address: { ...form.address, [key]: e.target.value } })} />{invalid[`address.${key}`] && <span className="field-error" id={`${id}-address-${key}`}>{invalid[`address.${key}`]}</span>}</label>)}</fieldset>
    <fieldset disabled={saving}><legend>Telefones (opcionais)</legend>{form.phones.map((phone, index) => <div key={index} className="person-form__contact"><label>Telefone {index + 1}<input name={`phone${index}`} aria-label={`Telefone ${index + 1}`} type="tel" inputMode="tel" placeholder="(11) 99999-9999" value={phone.number} maxLength={50} aria-invalid={!!invalid[`phone${index}`]} onChange={e => setForm({ ...form, phones: form.phones.map((x, i) => i === index ? { ...x, number: formatBrazilianPhone(e.target.value) } : x) })} />{invalid[`phone${index}`] && <span className="field-error">{invalid[`phone${index}`]}</span>}</label>
      <label><input type="checkbox" checked={phone.isPrimary} onChange={e => setForm({ ...form, phones: form.phones.map((x, i) => ({ ...x, isPrimary: i === index && e.target.checked })) })} />Telefone principal {index + 1}</label>
      <button type="button" disabled={editing && !!phone.publicId} onClick={() => setForm({ ...form, phones: form.phones.filter((_, i) => i !== index) })}>Remover telefone {index + 1}</button></div>)}<button type="button" disabled={form.phones.length >= 50} onClick={() => setForm({ ...form, phones: [...form.phones, { number: "", isPrimary: false, confirmNonstandardPhone: false }] })}>Adicionar telefone</button></fieldset>
    <fieldset disabled={saving}><legend>E-mails (opcionais)</legend>{form.emails.map((email, index) => <div key={index} className="person-form__contact"><label>E-mail {index + 1}<input type="email" aria-label={`E-mail ${index + 1}`} name={`email${index}`} maxLength={254} value={email.address} aria-invalid={!!invalid[`email${index}`]} onChange={e => setForm({ ...form, emails: form.emails.map((x, i) => i === index ? { ...x, address: e.target.value } : x) })} />{invalid[`email${index}`] && <span className="field-error">{invalid[`email${index}`]}</span>}</label><label><input type="checkbox" checked={email.isPrimary} onChange={e => setForm({ ...form, emails: form.emails.map((x, i) => ({ ...x, isPrimary: i === index && e.target.checked })) })} />E-mail principal {index + 1}</label><button type="button" disabled={editing && !!email.publicId} onClick={() => setForm({ ...form, emails: form.emails.filter((_, i) => i !== index) })}>Remover e-mail {index + 1}</button></div>)}<button type="button" disabled={form.emails.length >= 50} onClick={() => setForm({ ...form, emails: [...form.emails, { address: "", isPrimary: false }] })}>Adicionar e-mail</button></fieldset>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <div className="opening-confirmation-actions"><button type="button" disabled={saving} onClick={() => { if(ref.current?.dataset.dirty && !window.confirm("Descartar alterações deste cliente?")) return; onCancel(); }}>{editing ? "Cancelar alterações" : "Cancelar cadastro"}</button><button className="button button--primary" disabled={saving}>{saving ? (editing ? "Salvando…" : "Cadastrando…") : editing ? "Salvar alterações do cliente" : "Cadastrar cliente"}</button></div>
  </TrackedForm>;
}
