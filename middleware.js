export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(request) {
  const expectedPassword = process.env.HIRO_TRACKER_PASSWORD || "openclaw";
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Basic ${btoa(`hiro:${expectedPassword}`)}`;

  if (authHeader === expected) {
    return;
  }

  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Hiro PR Tracker", charset="UTF-8"',
    },
  });
}
