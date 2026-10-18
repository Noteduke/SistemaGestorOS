import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginPage } from "./LoginPage";

describe("identificação do ambiente na tela de login", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("mostra HOMOLOGAÇÃO antes da autenticação em builds homologation", () => {
    vi.stubEnv("MODE", "homologation");
    render(<LoginPage onLogin={vi.fn(async () => undefined)} />);

    expect(screen.getByText("AMBIENTE DE HOMOLOGAÇÃO")).toBeInTheDocument();
  });

  it("não mostra a identificação de homologação em produção", () => {
    vi.stubEnv("MODE", "production");
    render(<LoginPage onLogin={vi.fn(async () => undefined)} />);

    expect(screen.queryByText("AMBIENTE DE HOMOLOGAÇÃO")).not.toBeInTheDocument();
  });
});
