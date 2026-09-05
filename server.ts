import "dotenv/config";
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachSocketServer } from "./src/lib/socket-server";

function readArg(flags: string[]): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (flags.includes(argv[i]) && argv[i + 1]) return argv[i + 1];
    for (const f of flags) {
      if (argv[i].startsWith(`${f}=`)) return argv[i].slice(f.length + 1);
    }
  }
  return undefined;
}

const dev = process.env.NODE_ENV !== "production";
const hostname =
  (process.platform !== "win32" ? process.env.HOSTNAME : undefined) ||
  readArg(["-H", "--hostname"]) ||
  "0.0.0.0";
const port = Number(process.env.PORT || readArg(["-p", "--port"]) || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  attachSocketServer(httpServer);

  httpServer.once("error", (err) => {
    console.error("[server] failed to start", err);
    process.exit(1);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`[server] ready on http://${hostname}:${port} (${dev ? "development" : "production"})`);
  });

  const shutdown = () => {
    console.log("[server] shutting down");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[server] fatal", err);
  process.exit(1);
});
