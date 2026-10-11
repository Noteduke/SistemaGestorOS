import { useEffect, useState } from "react";
import { AuthApiError, getCurrentIdentity, login, logout } from "./api/auth";
import type { AuthIdentity } from "./api/auth";
import { LoginPage } from "./pages/auth/LoginPage";
import { ServiceOrderDetailPage } from "./pages/service-orders/ServiceOrderDetailPage";
import { ServiceOrderListPage } from "./pages/service-orders/ServiceOrderListPage";

type Route =
  | { view: "list"; page: number }
  | { view: "detail"; publicId: string; section: "details" | "events"; eventsPage: number };

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
  if (segments.length === 2 && segments[0] === "service-orders") {
    return {
      view: "detail",
      publicId: decodeURIComponent(segments[1]),
      section: query.get("section") === "events" ? "events" : "details",
      eventsPage: positivePage(query.get("eventsPage")),
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

  function changeDetailSection(section: "details" | "events") {
    if (route.view !== "detail") return;
    const query = new URLSearchParams();
    if (section === "events") query.set("section", "events");
    if (section === "events" && route.eventsPage > 1) query.set("eventsPage", String(route.eventsPage));
    navigate(`/service-orders/${encodeURIComponent(route.publicId)}${query.size ? `?${query}` : ""}`);
  }

  function changeEventsPage(page: number) {
    if (route.view !== "detail") return;
    const query = new URLSearchParams({ section: "events", eventsPage: String(page) });
    navigate(`/service-orders/${encodeURIComponent(route.publicId)}?${query}`);
  }

  if (session.status === "checking") {
    return <main className="session-check" role="status">Verificando sessão…</main>;
  }

  if (session.status === "anonymous") {
    return <LoginPage onLogin={handleLogin} sessionMessage={session.message} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/service-orders" aria-label="Sistema Gestor OS, início">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span><strong>Gestor OS</strong><small>Operação técnica</small></span>
        </a>
        <div className="topbar-meta">
          <span className="connection-dot" />
          <span>{session.identity.username}</span>
          {logoutMessage && <span role="status">{logoutMessage}</span>}
          <button className="text-button logout-button" type="button" onClick={() => void handleLogout()}>Sair</button>
        </div>
      </header>
      <main className="content">
        {route.view === "list" ? (
          <ServiceOrderListPage
            page={route.page}
            onPageChange={(page) => navigate(`/service-orders?page=${page}`)}
            onOpen={openOrder}
          />
        ) : (
          <ServiceOrderDetailPage
            publicId={route.publicId}
            csrfToken={session.identity.csrfToken}
            section={route.section}
            eventsPage={route.eventsPage}
            onSectionChange={changeDetailSection}
            onEventsPageChange={changeEventsPage}
            onBack={() => navigate("/service-orders")}
          />
        )}
      </main>
      <footer className="app-footer">Sistema Gestor OS <span>·</span> consultas e atualização operacional</footer>
    </div>
  );
}
