import { PendingFormsProvider, usePendingForms } from "./components/PendingForms";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError, getCurrentIdentity, login, logout } from "./api/auth";
import type { AuthIdentity } from "./api/auth";
import { LoginPage } from "./pages/auth/LoginPage";
import { ServiceOrderDetailPage } from "./pages/service-orders/ServiceOrderDetailPage";
import { ServiceOrderListPage } from "./pages/service-orders/ServiceOrderListPage";
import { ServiceOrderOpeningPage } from "./pages/service-orders/ServiceOrderOpeningPage";
import { ServiceCatalogPage } from "./pages/services/ServiceCatalogPage";
import { ProductCatalogPage } from "./pages/products/ProductCatalogPage";
import { ServiceOrderStatusesPage } from "./pages/service-orders/ServiceOrderStatusesPage";
import { HomologationIssuesPage } from "./pages/homologation/HomologationIssuesPage";
import { CompanySettingsPage } from "./pages/company-settings/CompanySettingsPage";

type Route =
  | { view: "list"; page: number }
  | { view: "opening" }
  | { view: "services" }
  | { view: "products" }
  | { view: "statuses" }
  | { view: "homologation-issues" }
  | { view: "company-settings" }
  | { view: "detail"; publicId: string; section: "details" | "events" };

function positivePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function readRoute(): Route {
  const hash = window.location.hash;
  if (!hash || hash === "#") return { view: "list", page: 1 };

  const [path, queryString = ""] = hash.slice(1).split("?", 2);
  const segments = path.split("/").filter(Boolean);
  const query = new URLSearchParams(queryString);
  if (segments.length === 1 && segments[0] === "services") return { view: "services" };
  if (segments.length === 1 && segments[0] === "products") return { view: "products" };
  if (segments.length === 1 && segments[0] === "service-order-statuses") return { view: "statuses" };
  if (segments.length === 1 && segments[0] === "homologation-issues") return { view: "homologation-issues" };
  if (segments.length === 1 && segments[0] === "company-settings") return { view: "company-settings" };
  if (segments.length === 2 && segments[0] === "service-orders" && segments[1] === "opening") {
    return { view: "opening" };
  }
  if (segments.length === 2 && segments[0] === "service-orders") {
    return {
      view: "detail",
      publicId: decodeURIComponent(segments[1]),
      section: query.get("section") === "events" ? "events" : "details",
    };
  }
  return { view: "list", page: positivePage(query.get("page")) };
}

function useHashRoute(onExternalNavigation: (target: string) => boolean): [Route, (hash: string) => void] {
  const [route, setRoute] = useState(readRoute);
  const currentHash = useRef(window.location.hash);
  const allowHashChange = useRef(false);

  useEffect(() => {
    const update = () => {
      const target = window.location.hash;
      if (allowHashChange.current) {
        allowHashChange.current = false;
        currentHash.current = target;
        setRoute(readRoute());
        return;
      }
      if (target !== currentHash.current && !onExternalNavigation(target)) {
        allowHashChange.current = true;
        window.location.hash = currentHash.current;
        return;
      }
      currentHash.current = target;
      setRoute(readRoute());
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [onExternalNavigation]);

  return [route, (hash) => { allowHashChange.current = true; window.location.hash = hash; }];
}

export function App() { return <PendingFormsProvider><Application /></PendingFormsProvider>; }
function Application() {
  const [entryPrintOffer,setEntryPrintOffer]=useState<string|null>(null);
  const pendingForms=usePendingForms();
  const [saveThenLeave,setSaveThenLeave]=useState(false);
  const [saveNotice,setSaveNotice]=useState("");
  const [unsavedTick,setUnsavedTick]=useState(0);
  const unsavedChangesRef = useRef(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [discardChangesVersion, setDiscardChangesVersion] = useState(0);
  const onExternalNavigation = useCallback((target: string) => {
    if (!unsavedChangesRef.current && !pendingForms.entries.size) return true;
    setPendingLeaveAction(() => () => navigate(target));
    return false;
  }, []);
  const [route, navigate] = useHashRoute(onExternalNavigation);
  const [session, setSession] = useState<
    | { status: "checking" }
    | { status: "anonymous"; message?: string }
    | { status: "authenticated"; identity: AuthIdentity }
  >({ status: "checking" });
  const [logoutMessage, setLogoutMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getCurrentIdentity(controller.signal).then(
      (identity) => setSession({ status: "authenticated", identity }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AuthApiError && error.status === 401) {
          setSession({ status: "anonymous" });
        } else {
          setSession({ status: "anonymous", message: "Não foi possível verificar sua sessão. Você pode tentar entrar." });
        }
      },
    );
    return () => controller.abort();
  }, []);

  async function handleLogin(username: string, password: string) {
    const identity = await login(username, password);
    setSession({ status: "authenticated", identity });
    navigate("/service-orders");
  }

  function requestLeave(action: () => void) {
    if (unsavedChangesRef.current || pendingForms.entries.size) {
      setPendingLeaveAction(() => action);
      return;
    }
    action();
  }

  function confirmLeaveWithoutSaving() {
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    unsavedChangesRef.current = false; setSaveThenLeave(false);
    for(const entry of pendingForms.entries.values()) entry.discard?.();
    setDiscardChangesVersion((version) => version + 1);
    action?.();
  }

  useEffect(()=>{if(saveThenLeave && !pendingForms.entries.size && !unsavedChangesRef.current){const action=pendingLeaveAction;setPendingLeaveAction(null);setSaveThenLeave(false);action?.();}},[saveThenLeave,pendingForms.version,pendingLeaveAction,unsavedTick]);
  function navigateSafely(hash: string) {
    requestLeave(() => navigate(hash));
  }

  async function performLogout() {
    if (session.status !== "authenticated") return;
    setLogoutMessage("");
    try {
      await logout(session.identity.csrfToken);
      setSession({ status: "anonymous" });
      navigate("/service-orders");
    } catch {
      setLogoutMessage("Não foi possível encerrar a sessão. Tente novamente.");
    }
  }

  function handleLogout() { requestLeave(() => void performLogout()); }

  function openOrder(publicId: string) {
    navigateSafely(`/service-orders/${encodeURIComponent(publicId)}`);
  }

  function startOpening() {
    navigateSafely("/service-orders/opening");
  }

  function changeDetailSection(section: "details" | "events") {
    if (route.view !== "detail") return;
    const query = new URLSearchParams();
    if (section === "events") query.set("section", "events");
    navigateSafely(`/service-orders/${encodeURIComponent(route.publicId)}${query.size ? `?${query}` : ""}`);
  }

  if (session.status === "checking") {
    return <main className="session-check" role="status">Verificando sessão…</main>;
  }

  if (session.status === "anonymous") {
    return <LoginPage onLogin={handleLogin} sessionMessage={session.message} />;
  }

  const canManageServices = session.identity.isAdmin || session.identity.permissions.includes("services.manage");
  const canManageProducts = session.identity.isAdmin || session.identity.permissions.includes("products.manage");
  const canManageStock = session.identity.isAdmin || session.identity.permissions.includes("products.stock.manage");
  const canAccessProducts = canManageProducts || canManageStock;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/service-orders" onClick={(event) => { event.preventDefault(); navigateSafely("/service-orders"); }} aria-label="Sistema Gestor OS, início">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span><strong>Gestor OS</strong><small>Operação técnica</small></span>
        </a>
        <div className="topbar-meta">
          {(session.identity.isAdmin || session.identity.permissions.includes("service_orders.read") || (session.identity.isAdmin || session.identity.permissions.includes("service_orders.opening.create"))) && <nav className="os-main-menu" aria-label="Ordens de Serviço"><strong>Ordens de Serviço</strong>{(session.identity.isAdmin || session.identity.permissions.includes("service_orders.read")) && <a href="#/service-orders" onClick={e=>{e.preventDefault();navigateSafely("/service-orders");}}>Listagem de Ordens de Serviço</a>}{(session.identity.isAdmin || session.identity.permissions.includes("service_orders.opening.create")) && <a href="#/service-orders/opening" onClick={e=>{e.preventDefault();navigateSafely("/service-orders/opening");}}>Nova Ordem de Serviço</a>}</nav>}
          {canManageServices && <a className="topbar-link" href="#/services" onClick={(event) => { event.preventDefault(); navigateSafely("/services"); }}>Serviços</a>}
          {canAccessProducts && <a className="topbar-link" href="#/products" onClick={(event) => { event.preventDefault(); navigateSafely("/products"); }}>Produtos / Estoque</a>}
          {session.identity.isAdmin && <a className="topbar-link" href="#/service-order-statuses" onClick={(event) => { event.preventDefault(); navigateSafely("/service-order-statuses"); }}>Status de OS</a>}
          {session.identity.isAdmin && <a className="topbar-link" href="#/company-settings" onClick={(event) => { event.preventDefault(); navigateSafely("/company-settings"); }}>Empresa</a>}
          {import.meta.env.MODE === "homologation" && <a className="topbar-link" href="#/homologation-issues" onClick={(event) => { event.preventDefault(); navigateSafely("/homologation-issues"); }}>{session.identity.isAdmin ? "Problemas da homologação" : "Reportar problema"}</a>}
          <span className="connection-dot" />
          <span>{session.identity.username}</span>
          {logoutMessage && <span role="status">{logoutMessage}</span>}
          <button className="text-button logout-button" type="button" onClick={() => void handleLogout()}>Sair</button>
        </div>
      </header>
      <main className="content" key={discardChangesVersion}>
        {route.view === "homologation-issues" ? (
          import.meta.env.MODE === "homologation" ? <HomologationIssuesPage csrfToken={session.identity.csrfToken} isAdmin={session.identity.isAdmin} /> : <section className="state-card">Recurso disponível apenas na Homologação 1.</section>
        ) : route.view === "company-settings" ? (
          session.identity.isAdmin ? <CompanySettingsPage csrfToken={session.identity.csrfToken} /> : <section className="state-card">Somente Administradores podem alterar a identificação da empresa.</section>
        ) : route.view === "products" ? (
          canAccessProducts ? <ProductCatalogPage
            csrfToken={session.identity.csrfToken}
            canManageProducts={canManageProducts}
            canManageStock={canManageStock}
            canReadCosts={session.identity.isAdmin || session.identity.permissions.includes("products.cost.read")}
            canUpdateCosts={session.identity.isAdmin || session.identity.permissions.includes("products.cost.update")}
          /> : <section className="state-card">Você não tem permissão para consultar Produtos ou Estoque.</section>
        ) : route.view === "services" ? (
          canManageServices ? <ServiceCatalogPage csrfToken={session.identity.csrfToken} /> : <section className="state-card">Você não tem permissão para administrar Serviços.</section>
        ) : route.view === "statuses" ? (
          session.identity.isAdmin ? <ServiceOrderStatusesPage csrfToken={session.identity.csrfToken} /> : <section className="state-card">Somente Administradores podem configurar status de OS.</section>
        ) : route.view === "list" ? (
          <ServiceOrderListPage
            page={route.page}
            onPageChange={(page) => navigateSafely(`/service-orders?page=${page}`)}
            onOpen={openOrder}
            onStartOpening={startOpening}
            canStartOpening={session.identity.isAdmin || session.identity.permissions.includes("service_orders.opening.create")}
          />
        ) : route.view === "opening" ? (
          <ServiceOrderOpeningPage
            csrfToken={session.identity.csrfToken}
            canCreateEquipment={session.identity.isAdmin || session.identity.permissions.includes("equipment.create")}
            canUpdateCustomer={session.identity.isAdmin || ["people.update", "people.contacts.add"].every(p => session.identity.permissions.includes(p))}
            canCreateCustomer={session.identity.isAdmin || session.identity.permissions.includes("people.create")}
            canUpdateEquipment={session.identity.isAdmin || session.identity.permissions.includes("equipment.update")}
            canReadEquipmentHistory={session.identity.isAdmin || session.identity.permissions.includes("service_orders.read")}
            canAssignTechnician={session.identity.isAdmin || session.identity.permissions.includes("service_orders.assignment.manage")}
            canTransferEquipmentOwnership={session.identity.isAdmin || session.identity.permissions.includes("equipment.transfer_ownership")}
            canConfirmServiceOrderOpening={session.identity.isAdmin || (
              session.identity.permissions.includes("service_orders.opening.create")
              && session.identity.permissions.includes("service_orders.create")
            )}
            onBack={() => navigateSafely("/service-orders")}
            onConfirmed={(publicId) => {setEntryPrintOffer(publicId);openOrder(publicId);}}
          />
        ) : (
          <ServiceOrderDetailPage
            key={route.publicId}
            offerEntryPrint={entryPrintOffer===route.publicId}
            onDismissEntryPrint={()=>setEntryPrintOffer(null)}
            publicId={route.publicId}
            csrfToken={session.identity.csrfToken}
            canCreateNote={session.identity.isAdmin || session.identity.permissions.includes("service_orders.update")}
            canManageEdit={session.identity.isAdmin || ["service_orders.update", "service_orders.situation.update", "service_orders.assignment.manage", "service_orders.budget.update", "os.close", "os.cancel"].some((permission) => session.identity.permissions.includes(permission))}
            canClose={session.identity.isAdmin || session.identity.permissions.includes("os.close")}
            canCancel={session.identity.isAdmin || session.identity.permissions.includes("os.cancel")}
            canTakeoverEdit={session.identity.isAdmin || session.identity.permissions.includes("service_orders.edit.takeover")}
            canUpdateSituation={session.identity.isAdmin || session.identity.permissions.includes("service_orders.situation.update")}
            canManageAssignments={session.identity.isAdmin || session.identity.permissions.includes("service_orders.assignment.manage")}
            currentUsername={session.identity.username}
            canReadBudget={session.identity.isAdmin || session.identity.permissions.includes("service_orders.read")}
            canReadEvents={session.identity.isAdmin || session.identity.permissions.includes("service_orders.events.read")}
            canEditBudget={session.identity.isAdmin || session.identity.permissions.includes("service_orders.budget.update")}
            canManageStock={session.identity.isAdmin || session.identity.permissions.includes("products.stock.manage")}
            canReadBudgetCosts={session.identity.isAdmin || session.identity.permissions.includes("service_orders.budget.costs.read")}
            canUpdateBudgetCosts={session.identity.isAdmin || (
              session.identity.permissions.includes("service_orders.budget.update")
              && session.identity.permissions.includes("service_orders.budget.costs.read")
              && session.identity.permissions.includes("service_orders.budget.costs.update")
            )}
            section={route.section}
            onSectionChange={changeDetailSection}
            onBack={() => navigateSafely("/service-orders")}
            discardChangesVersion={discardChangesVersion}
            onUnsavedChange={(dirty) => { if(unsavedChangesRef.current !== dirty){unsavedChangesRef.current=dirty;setUnsavedTick(v=>v+1);} }}
          />
        )}
      </main>
      {pendingLeaveAction && <div className="unsaved-backdrop" role="presentation">
        <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" aria-describedby="unsaved-dialog-description">
          <h2 id="unsaved-dialog-title">Alterações não salvas</h2>
          <p id="unsaved-dialog-description">Existem alterações não salvas. Deseja sair mesmo assim?</p>
          {saveNotice && <p role="status">{saveNotice}</p>}
          <div className="unsaved-dialog__actions">
            {pendingForms.entries.size===1 && [...pendingForms.entries.values()][0]?.save && <button className="button button--primary" disabled={saveThenLeave} onClick={()=>{setSaveNotice("Salvamento solicitado. A saída ocorrerá somente após sucesso; se houver erro, continue editando.");setSaveThenLeave(true);[...pendingForms.entries.values()][0].save?.();}}>Salvar</button>}
            <button className="button button--secondary" type="button" onClick={() => {setPendingLeaveAction(null);setSaveThenLeave(false);setSaveNotice("");}}>Continuar editando</button>
            <button className="button button--primary" type="button" onClick={confirmLeaveWithoutSaving}>Sair sem salvar</button>
          </div>
        </section>
      </div>}
      <footer className="app-footer">Sistema Gestor OS <span>·</span> consultas e atualização operacional</footer>
    </div>
  );
}
