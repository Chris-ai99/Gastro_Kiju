import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const standaloneDirectory = resolve(".next/standalone/apps/web");
const serverPath = resolve(standaloneDirectory, "server.js");
const nextServerPath = resolve(standaloneDirectory, "server.next.js");

await rename(serverPath, nextServerPath);
await writeFile(
  serverPath,
  `const http = require("node:http");
const nextPort = Number(process.env.PORT ?? "3110");
const compatibilityPort = 3011;

if (nextPort !== compatibilityPort) {
  const proxy = http.createServer((incoming, outgoing) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: nextPort,
        path: incoming.url,
        method: incoming.method,
        headers: { ...incoming.headers, host: `127.0.0.1:${nextPort}` },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );

    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });

  proxy.listen(compatibilityPort, "127.0.0.1");
}

require("./server.next.js");
`,
  "utf8",
);
