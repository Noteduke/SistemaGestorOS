const labels: Record<string, string> = {
  name: "Pessoa",
  document: "Documento",
  primaryPhone: "Telefone principal",
  primaryEmail: "E-mail principal",
  address: "Endereço",
  type: "Tipo",
  brand: "Marca",
  model: "Modelo",
  serialNumber: "Número de série",
  mainIdentification: "Identificação",
  snapshotVersion: "Versão do retrato",
  capturedAt: "Capturado em",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, nested]) => `${labels[key] ?? key}: ${displayValue(nested)}`)
      .join(" · ");
  }
  return "Não informado";
}

interface SnapshotCardProps {
  title: string;
  snapshot: unknown;
}

export function SnapshotCard({ title, snapshot }: SnapshotCardProps) {
  const snapshotRecord = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown>
    : undefined;
  const fields = snapshotRecord
    ? Object.entries(snapshotRecord).filter(([key]) => key !== "snapshotVersion" && key !== "capturedAt")
    : [];
  const capturedAt = snapshotRecord?.capturedAt;
  const version = snapshotRecord?.snapshotVersion;

  return (
    <section className="snapshot-card" aria-label={title}>
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          <p>Retrato histórico capturado na confirmação da OS</p>
        </div>
        {typeof version === "number" && <span className="badge">Versão {version}</span>}
      </div>
      {fields.length ? (
        <dl className="snapshot-grid">
          {fields.map(([key, value]) => (
            <div key={key}>
              <dt>{labels[key] ?? key}</dt>
              <dd>{displayValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="muted">Retrato histórico indisponível.</p>}
      {typeof capturedAt === "string" && <p className="snapshot-date">Capturado em {new Date(capturedAt).toLocaleString("pt-BR")}</p>}
    </section>
  );
}
