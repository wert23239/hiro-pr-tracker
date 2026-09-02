#!/usr/bin/env node

const { createServer } = require("node:http");
const { createReadStream, existsSync, statSync } = require("node:fs");
const { extname, join, normalize, resolve } = require("node:path");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8092);
const username = process.env.HIRO_TRACKER_USER || "hiro";
const password = process.env.HIRO_TRACKER_PASSWORD || "openclaw";

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function unauthorized(res) {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Hiro PR Tracker", charset="UTF-8"',
    "Cache-Control": "no-store",
  });
  res.end("Authentication required");
}

function isAuthorized(req) {
  const header = req.headers.authorization || "";
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return header === expected;
}

function fileForUrl(url) {
  const path = normalize(decodeURIComponent(new URL(url, "http://localhost").pathname)).replace(/^(\.\.[/\\])+/, "");
  const resolved = resolve(root, path === "/" ? "index.html" : path.slice(1));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

createServer((req, res) => {
  if (!isAuthorized(req)) {
    unauthorized(res);
    return;
  }

  const file = fileForUrl(req.url);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": types[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`Hiro PR Tracker listening on http://${host}:${port}`);
});
