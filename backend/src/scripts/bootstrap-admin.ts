import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../infrastructure/prisma/prisma.service.js";
import { AuthService } from "../modules/auth/auth.service.js";

async function main(): Promise<void> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("O bootstrap exige terminal interativo para solicitar a senha sem eco.");
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  let username: string;
  try {
    const activeAdminCount = await app.get(PrismaService).user.count({
      where: { isAdmin: true, isActive: true },
    });
    if (activeAdminCount > 0) {
      throw new Error("Já existe Administrador ativo; bootstrap cancelado antes de solicitar credenciais.");
    }

    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      username = await prompt.question("Username do primeiro Administrador: ");
    } finally {
      prompt.close();
    }

    const password = await readSecret("Senha (mínimo de 10 caracteres): ");
    const confirmation = await readSecret("Confirme a senha: ");
    if (password !== confirmation) throw new Error("As senhas não coincidem; nenhuma conta foi criada.");

    await app.get(AuthService).bootstrapFirstAdmin(username, password);
  } finally {
    await app.close();
  }

  stdout.write(`Administrador ${username.trim().toLowerCase()} criado com sucesso.\n`);
}

function readSecret(label: string): Promise<string> {
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Bootstrap interrompido; nenhuma conta foi criada."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Falha no bootstrap; nenhuma senha foi exibida.";
  console.error(message);
  process.exitCode = 1;
});
