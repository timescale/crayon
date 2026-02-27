import { request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

const USER_APP_PORT = parseInt(process.env.USER_APP_PORT ?? "3000", 10);

const NOT_RUNNING_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>App not running</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#faf9f7;color:#1a1a1a}
.c{text-align:center;max-width:400px}a{color:#1a1a1a;text-decoration:underline}</style></head>
<body><div class="c"><h2>App not running</h2><p>Start your app, or open the <a href="/dev/">Dev UI</a>.</p></div></body></html>`;

export function proxyToUserApp(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const proxyReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: USER_APP_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(NOT_RUNNING_HTML);
  });

  req.pipe(proxyReq);
}
