import { useEffect, useState } from "react";
import { AuthApiError, getCurrentIdentity, login, logout } from "./api/auth";
import type { AuthIdentity } from "./api/auth";
import { LoginPage } from "./pages/auth/LoginPage";
import { ServiceOrderDetailPage } from "./pages/service-orders/ServiceOrderDetailPage";
import { ServiceOrderListPage } from "./pages/service-orders/ServiceOrderListPage";
import { ServiceOrderOpeningPage } from "./pages/service-orders/ServiceOrderOpeningPage";
import { ServiceCatalogPage } from "./pages/services/ServiceCatalogPage";

type Route =
  | { view: "list"; page: number }
  | { view: "opening" }
  | { view: "services" }
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

function useHashRoute(): [Route, (hash: string) => void] {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return [route, (hash) => { window.location.hash = hash; }];
}

export function App() {
  const [route, navigate] = useHashRoute();
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

  async function handleLogout() {
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

  function openOrder(publicId: string) {
    navigate(`/service-orders/${encodeURIComponent(publicId)}`);
  }

  function startOpening() {
    navigate("/service-orders/opening");
  }

  function changeDetailSection(section: "details" | "events") {
    if (route.view !== "detail") return;
    const query = new URLSearchParams();
    if (section === "events") query.set("section", "events");
    navigate(`/service-orders/${encodeURIComponent(route.publicId)}${query.size ? `?${query}` : ""}`);
  }

  if (session.status === "checking") {
    return <main className="session-check" role="status">Verificando sessão…</main>;
  }

  if (session.status === "anonymous") {
    return <LoginPage onLogin={handleLogin} sessionMessage={session.message} />;
  }

  const canManageServices = session.identity.isAdmin || session.identity.permissions.includes("services.manage");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/service-orders" aria-label="Sistema Gestor OS, início">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span><strong>Gestor OS</strong><small>Operação técnica</small></span>
        </a>
        <div className="topbar-meta">
          {canManageServices && <a className="topbar-link" href="#/services">Serviços</a>}
          <span className="connection-dot" />
          <span>{session.identity.username}</span>
          {logoutMessage && <span role="status">{logoutMessage}</span>}
          <button className="text-button logout-button" type="button" onClick={() => void handleLogout()}>Sair</button>
        </div>
      </header>
      <main className="content">
        {route.view === "services" ? (
          canManageServices ? <ServiceCatalogPage csrfToken={session.identity.csrfToken} /> : <section className="state-card">Você não tem permissão para administrar Serviços.</section>
        ) : route.view === "list" ? (
          <ServiceOrderListPage
            page={route.page}
            onPageChange={(page) => navigate(`/service-orders?page=${page}`)}
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
            onBack={() => navigate("/service-orders")}
            onConfirmed={(publicId) => openOrder(publicId)}
          />
        ) : (
          <ServiceOrderDetailPage
            publicId={route.publicId}
            csrfToken={session.identity.csrfToken}
            canCreateNote={session.identity.isAdmin || session.identity.permissions.includes("service_orders.update")}
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
            onBack={() => navigate("/service-orders")}
          />
        )}
      </main>
      <footer className="app-footer">Sistema Gestor OS <span>·</span> consultas e atualização operacional</footer>
    </div>
  );
}
