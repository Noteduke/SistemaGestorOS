import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError, getCurrentIdentity, login, logout } from "./api/auth";
import type { AuthIdentity } from "./api/auth";
import { LoginPage } from "./pages/auth/LoginPage";
import { ServiceOrderDetailPage } from "./pages/service-orders/ServiceOrderDetailPage";
import { ServiceOrderListPage } from "./pages/service-orders/ServiceOrderListPage";
import { ServiceOrderOpeningPage } from "./pages/service-orders/ServiceOrderOpeningPage";
import { ServiceCatalogPage } from "./pages/services/ServiceCatalogPage";
import { ProductCatalogPage } from "./pages/products/ProductCatalogPage";

type Route =
  | { view: "list"; page: number }
  | { view: "opening" }
  | { view: "services" }
  | { view: "products" }
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

export function App() {
  const unsavedChangesRef = useRef(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [discardChangesVersion, setDiscardChangesVersion] = useState(0);
  const onExternalNavigation = useCallback((target: string) => {
    if (!unsavedChangesRef.current) return true;
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
    if (unsavedChangesRef.current) {
      setPendingLeaveAction(() => action);
      return;
    }
    action();
  }

  function confirmLeaveWithoutSaving() {
    const action = pendingLeaveAction;
    setPendingLeaveAction(null);
    unsavedChangesRef.current = false;
    setDiscardChangesVersion((version) => version + 1);
    action?.();
  }

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/service-orders" onClick={(event) => { event.preventDefault(); navigateSafely("/service-orders"); }} aria-label="Sistema Gestor OS, início">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span><strong>Gestor OS</strong><small>Operação técnica</small></span>
        </a>
        <div className="topbar-meta">
          {canManageServices && <a className="topbar-link" href="#/services" onClick={(event) => { event.preventDefault(); navigateSafely("/services"); }}>Serviços</a>}
          {canManageProducts && <a className="topbar-link" href="#/products" onClick={(event) => { event.preventDefault(); navigateSafely("/products"); }}>Produtos</a>}
          <span className="connection-dot" />
          <span>{session.identity.username}</span>
          {logoutMessage && <span role="status">{logoutMessage}</span>}
          <button className="text-button logout-button" type="button" onClick={() => void handleLogout()}>Sair</button>
        </div>
      </header>
      <main className="content">
        {route.view === "products" ? (
          canManageProducts ? <ProductCatalogPage csrfToken={session.identity.csrfToken} canManageCosts={session.identity.isAdmin} /> : <section className="state-card">Você não tem permissão para administrar Produtos.</section>
        ) : route.view === "services" ? (
          canManageServices ? <ServiceCatalogPage csrfToken={session.identity.csrfToken} /> : <section className="state-card">Você não tem permissão para administrar Serviços.</section>
        ) : route.view === "list" ? (
          <ServiceOrderListPage
            page={route.page}
            onPageChange={(page) => navigateSafely(`/service-orders?page=${page}`)}
            onOpen={openOrder}
            onStartOpening={startOpening}
          />
        ) : route.view === "opening" ? (
          <ServiceOrderOpeningPage
            csrfToken={session.identity.csrfToken}
            canCreateEquipment={session.identity.isAdmin || session.identity.permissions.includes("equipment.create")}
            canTransferEquipmentOwnership={session.identity.isAdmin || session.identity.permissions.includes("equipment.transfer_ownership")}
            canConfirmServiceOrderOpening={session.identity.isAdmin || (
              session.identity.permissions.includes("service_orders.opening.create")
              && session.identity.permissions.includes("service_orders.create")
            )}
            onBack={() => navigateSafely("/service-orders")}
            onConfirmed={(publicId) => openOrder(publicId)}
          />
        ) : (
          <ServiceOrderDetailPage
            key={route.publicId}
            publicId={route.publicId}
            csrfToken={session.identity.csrfToken}
            canCreateNote={session.identity.isAdmin || session.identity.permissions.includes("service_orders.update")}
            canManageEdit={session.identity.isAdmin || ["service_orders.update", "service_orders.situation.update", "service_orders.assignment.manage", "service_orders.budget.update"].some((permission) => session.identity.permissions.includes(permission))}
            canTakeoverEdit={session.identity.isAdmin || session.identity.permissions.includes("service_orders.edit.takeover")}
            canUpdateSituation={session.identity.isAdmin || session.identity.permissions.includes("service_orders.situation.update")}
            canManageAssignments={session.identity.isAdmin || session.identity.permissions.includes("service_orders.assignment.manage")}
            currentUsername={session.identity.username}
            canReadBudget={session.identity.isAdmin || session.identity.permissions.includes("service_orders.read")}
            canEditBudget={session.identity.isAdmin || session.identity.permissions.includes("service_orders.budget.update")}
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
            onUnsavedChange={(dirty) => { unsavedChangesRef.current = dirty; }}
          />
        )}
      </main>
      {pendingLeaveAction && <div className="unsaved-backdrop" role="presentation">
        <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title" aria-describedby="unsaved-dialog-description">
          <h2 id="unsaved-dialog-title">Alterações não salvas</h2>
          <p id="unsaved-dialog-description">Existem alterações não salvas. Deseja sair mesmo assim?</p>
          <div className="unsaved-dialog__actions">
            <button className="button button--secondary" type="button" onClick={() => setPendingLeaveAction(null)}>Continuar editando</button>
            <button className="button button--primary" type="button" onClick={confirmLeaveWithoutSaving}>Sair sem salvar</button>
          </div>
        </section>
      </div>}
      <footer className="app-footer">Sistema Gestor OS <span>·</span> consultas e atualização operacional</footer>
    </div>
  );
}
