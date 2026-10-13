import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelServiceOrderOpening,
  createServiceOrderOpening,
  getCurrentServiceOrderOpening,
  type ServiceOrderOpening,
} from "../../api/serviceOrders";

interface ServiceOrderOpeningPageProps {
  csrfToken: string;
  onBack: () => void;
}

function openingErrorMessage(error: unknown, action: "load" | "cancel"): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou ou não está autenticada. Entre novamente para continuar.";
    if (error.status === 403) return "Você não tem permissão para iniciar ou cancelar abertura de OS.";
    if (error.status === 404) return action === "cancel" ? "A abertura de OS não foi encontrada." : "Não foi possível localizar a abertura em andamento.";
    if (error.status === 409) return "A abertura mudou de estado. Atualize a tela e tente novamente.";
    if (error.status === 400 || error.status === 422) return "A solicitação não foi aceita. Atualize a tela e tente novamente.";
  }
  return "Não foi possível conectar ao serviço. Tente novamente.";
}

export function ServiceOrderOpeningPage({ csrfToken, onBack }: ServiceOrderOpeningPageProps) {
  const [opening, setOpening] = useState<ServiceOrderOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canceled, setCanceled] = useState<ServiceOrderOpening | null>(null);
  const started = useRef(false);

  async function loadOrCreateOpening() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCanceled(null);
    setOpening(null);

    try {
      try {
        const current = await getCurrentServiceOrderOpening();
        setOpening(current.data);
        return;
      } catch (currentError) {
        if (!(currentError instanceof ApiError) || currentError.status !== 404) throw currentError;
      }

      try {
        const created = await createServiceOrderOpening(csrfToken);
        setOpening(created.data);
      } catch (createError) {
        if (createError instanceof ApiError && createError.status === 409) {
          const current = await getCurrentServiceOrderOpening();
          setOpening(current.data);
          setNotice("Já existe uma abertura de OS em andamento. Ela foi carregada para continuação.");
        } else {
          throw createError;
        }
      }
    } catch (reason) {
      setError(openingErrorMessage(reason, "load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadOrCreateOpening();
  }, []);

  async function cancelOpening() {
    if (!opening || canceling) return;
    setCanceling(true);
    setError(null);
    try {
      const result = await cancelServiceOrderOpening(opening.publicId, csrfToken);
      setCanceled(result.data);
      setOpening(null);
    } catch (reason) {
      setError(openingErrorMessage(reason, "cancel"));
    } finally {
      setCanceling(false);
    }
  }

  return (
    <section className="page-section opening-page" aria-labelledby="opening-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Atendimento técnico</p>
          <h1 id="opening-title">Abertura de OS</h1>
          <p className="muted">Inicie ou retome uma abertura em andamento.</p>
        </div>
        <button className="text-button" type="button" onClick={onBack}>Voltar para lista</button>
      </div>

      {loading && <p className="inline-state" role="status">Verificando abertura em andamento…</p>}
      {error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => void loadOrCreateOpening()}>Tentar novamente</button>
        </div>
      )}
      {notice && <p className="inline-success" role="status">{notice}</p>}

      {opening && !loading && (
        <article className="opening-card" aria-label="Abertura de OS em andamento">
          <div className="opening-card__heading">
            <div>
              <p className="eyebrow">Número reservado</p>
              <p className="opening-number">{opening.visibleNumber}</p>
            </div>
            <span className="status-badge">Em andamento</span>
          </div>
          <p className="opening-warning">
            Esta OS ainda não foi confirmada. Cliente e equipamento serão informados nas próximas etapas.
          </p>
          <p className="muted">A abertura permanece como rascunho e ainda não aparece na lista de OS confirmadas.</p>
          <div className="opening-actions">
            <button className="button button--danger" type="button" onClick={() => void cancelOpening()} disabled={canceling}>
              {canceling ? "Cancelando…" : "Cancelar abertura"}
            </button>
            <button className="text-button" type="button" onClick={onBack}>Voltar para lista</button>
          </div>
        </article>
      )}

      {canceled && !loading && (
        <article className="opening-card opening-card--canceled">
          <p className="inline-success" role="status">A abertura {canceled.visibleNumber} foi cancelada.</p>
          <p className="muted">
            {canceled.numberReleased
              ? "O número reservado foi liberado."
              : "O número reservado foi mantido como consumido, conforme a sequência de numeração."}
          </p>
          <button className="button" type="button" onClick={onBack}>Voltar para lista de OS</button>
        </article>
      )}
    </section>
  );
}
