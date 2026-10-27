import { useEffect, useState } from "react";
import { errorMessage, listServiceOrders, listServiceOrderStatuses, listFilterTechnicians, type ServiceOrderStatus, type ServiceOrderFilters, type Paginated, type ServiceOrderSummary } from "../../api/serviceOrders";
import { AsyncState } from "../../components/AsyncState";
import { PaginationControls } from "../../components/PaginationControls";

const PAGE_SIZE = 20;

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

interface ServiceOrderListPageProps {
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (publicId: string) => void;
  onStartOpening: () => void;
  canStartOpening?: boolean;
}

export function ServiceOrderListPage({ page, onPageChange, onOpen, onStartOpening, canStartOpening = true }: ServiceOrderListPageProps) {
  const [result, setResult] = useState<Paginated<ServiceOrderSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<ServiceOrderFilters>({});
  const [applied, setApplied] = useState<ServiceOrderFilters>({});
  const [statuses, setStatuses] = useState<ServiceOrderStatus[]>([]);
  const [technicians, setTechnicians] = useState<Array<{publicId: string; username: string}>>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [filteredPage, setFilteredPage] = useState<number | null>(null);
  const [dateMode, setDateMode] = useState("range");
  async function loadOptions() {
    if (optionsLoaded) return;
    try { const [s,t] = await Promise.all([listServiceOrderStatuses(), listFilterTechnicians()]); setStatuses(s.data); setTechnicians(t.data); setOptionsLoaded(true); }
    catch { setFilterError("Não foi possível carregar as opções. Tente selecionar o filtro novamente."); }
  }
  function change(key: keyof ServiceOrderFilters, value: string) { setFilters(current => ({...current,[key]: value})); }
  const activeLabels = Object.entries(applied).filter(([,value]) => value).map(([key,value]) => {
    const names: Record<string,string> = { statusPublicId:"Status",state:"Estado",technicianPublicId:"Técnico",unassigned:"Técnico",dateField:"Data",dateFrom:"De",dateTo:"Até" };
    const states: Record<string,string> = { OPEN:"Aberta",CLOSED:"Encerrada",CANCELED:"Cancelada",entry:"Entrada",exit:"Encerramento (saída)",true:"Sem técnico" };
    return `${names[key]}: ${statuses.find(s=>s.publicId===value)?.name ?? technicians.find(t=>t.publicId===value)?.username ?? states[value] ?? value}`;
  });
  const [awaitingPickup, setAwaitingPickup] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listServiceOrders(filteredPage ?? page, PAGE_SIZE, controller.signal, awaitingPickup, applied)
      .then(setResult)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason, "list"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, filteredPage, reload, awaitingPickup, applied]);

  const hasRows = Boolean(result?.data.length);

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Atendimento técnico</p>
          <h1>Ordens de Serviço</h1>
          <p className="muted">Consulte ordens confirmadas e seus registros.</p>
        </div>
        <div className="page-heading__actions">
          <label className="compact-filter"><input type="checkbox" checked={awaitingPickup} onChange={(event) => {setAwaitingPickup(event.target.checked);setFilteredPage(1);}} />Aguardando retirada</label>
          <span className="count-pill">{result?.pagination.total ?? "—"} registros</span>
          {canStartOpening && <button className="button button--primary" type="button" onClick={onStartOpening}>Nova OS</button>}
        </div>
      </div>

      <form className="os-filters info-card" aria-label="Filtros de Ordens de Serviço" onSubmit={event => {
        event.preventDefault(); setFilterError("");
        if (dateMode === "range" && filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) { setFilterError("Data inicial deve ser anterior ou igual à final."); return; }
        setApplied({...filters, ...(dateMode === "specific" && filters.dateFrom ? {dateTo:filters.dateFrom}: {})}); setFilteredPage(1);
      }}>
        <label>Status operacional<select value={filters.statusPublicId ?? ""} onFocus={() => void loadOptions()} onChange={e=>change("statusPublicId",e.target.value)}><option value="">Todos</option>{statuses.map(s=><option key={s.publicId} value={s.publicId}>{s.name}{!s.isActive?" (inativo)":""}</option>)}</select></label>
        <label>Estado<select value={filters.state ?? ""} onChange={e=>change("state",e.target.value)}><option value="">Todos</option><option value="OPEN">Aberta</option><option value="CLOSED">Encerrada</option><option value="CANCELED">Cancelada</option></select></label>
        <label>Garantia<select disabled aria-describedby="warranty-pending"><option>Todas</option><option disabled>Em garantia</option><option disabled>Fora de garantia</option></select></label>
        <p id="warranty-pending">Garantia: classificação e cobertura ainda não implementadas; não é possível filtrar com segurança.</p>
        <label>Técnico responsável<select value={filters.unassigned ? "none" : filters.technicianPublicId ?? ""} onFocus={() => void loadOptions()} onChange={e=>setFilters(f=>({...f,unassigned:e.target.value==="none"?"true":"",technicianPublicId:e.target.value==="none"?"":e.target.value}))}><option value="">Todos</option><option value="none">Sem técnico atribuído</option>{technicians.map(t=><option key={t.publicId} value={t.publicId}>{t.username}</option>)}</select></label>
        <label>Campo de data<select value={filters.dateField ?? "entry"} onChange={e=>change("dateField",e.target.value)}><option value="entry">Data de entrada</option><option value="exit">Data de encerramento (saída)</option></select></label>
        <label>Período<select value={dateMode} onChange={e=>setDateMode(e.target.value)}><option value="range">Intervalo</option><option value="specific">Data específica</option></select></label>
        <label>{dateMode === "specific"?"Data específica":"Data inicial"}<input type="date" value={filters.dateFrom ?? ""} onChange={e=>setFilters(f=>({...f,dateField:f.dateField??"entry",dateFrom:e.target.value}))}/></label>
        {dateMode === "range" && <label>Data final<input type="date" value={filters.dateTo ?? ""} onChange={e=>setFilters(f=>({...f,dateField:f.dateField??"entry",dateTo:e.target.value}))}/></label>}
        <p>Datas usam America/Sao_Paulo. Saída usa o evento de encerramento; não representa entrega física não registrada.</p>
        {filterError && <p role="alert">{filterError}</p>}
        <div className="form-actions"><button className="button button--primary" type="submit">Filtrar</button><button className="button button--secondary" type="button" onClick={()=>{setFilters({});setApplied({});setFilteredPage(1);setAwaitingPickup(false);setFilterError("");}}>Limpar filtros</button></div>
        {!!activeLabels.length && <p role="status">Filtros ativos: {activeLabels.join(" · ")}</p>}
      </form>

      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyMessage={result?.pagination.total ? "Não há Ordens de Serviço nesta página." : "Ainda não há Ordens de Serviço confirmadas."}
        onRetry={() => setReload((value) => value + 1)}
      />

      {hasRows && result && (
        <>
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Número</th><th>Cliente</th><th>Equipamento</th><th>Situação</th><th>Aberta em</th><th><span className="sr-only">Ação</span></th></tr>
                </thead>
                <tbody>
                  {result.data.map((order) => (
                    <tr key={order.publicId}>
                      <td><span className="order-number">{order.visibleNumber}</span><span className="table-subtext">{order.macroStatus}</span></td>
                      <td>{order.customer.name}</td>
                      <td><span>{[order.equipment.type, order.equipment.brand, order.equipment.model].filter(Boolean).join(" · ")}</span><span className="table-subtext">Série: {order.equipment.serialNumber || "Não identificada"}</span></td>
                      <td><span className="status-badge">{order.operationalSituation}</span></td>
                      <td>{dateLabel(order.confirmedAt || order.openedAt || order.createdAt)}</td>
                      <td><button className="text-button" onClick={() => onOpen(order.publicId)}>Ver detalhes <span aria-hidden="true">→</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <PaginationControls page={result.pagination.page} totalPages={result.pagination.totalPages} total={result.pagination.total} onPageChange={value => { if(Object.keys(applied).length || filteredPage !== null) setFilteredPage(value); else onPageChange(value); }} />
        </>
      )}
    </section>
  );
}
