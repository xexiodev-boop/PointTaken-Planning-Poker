import { JIRA_CHANNEL, JIRA_SEARCH_PAGE_SIZE, jiraSiteOrigin } from "../shared/jira.js";
import { cookieValue, json } from "./http.js";
import { readJson } from "./room-logic.js";

const AUTHORIZE_URL = "https://auth.atlassian.com/authorize";
const TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const API_BASE = "https://api.atlassian.com";
const SCOPE = "read:jira-work";
const COOKIE_PATH = "/api/jira";
const STATE_COOKIE = "point_taken_jira_state";
const TOKEN_COOKIE = "point_taken_jira";
const STATE_LIFETIME_SECONDS = 10 * 60;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 60 * 60;
// Browsers drop cookies over ~4 KB and an Atlassian access token can get
// close to that, so it is spread over several.
const TOKEN_CHUNK_LENGTH = 3000;
const TOKEN_CHUNKS = 4;
const CLOUD_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_JQL_LENGTH = 2000;
const MAX_PAGE_TOKEN_LENGTH = 2000;
const PROJECT_PAGES = 3;

const EXPIRED_MESSAGE = "Your Jira connection expired. Connect again.";
const UNREACHABLE_MESSAGE = "Jira could not be reached. Try again shortly.";

const RESULT_COPY = {
  en: {
    connected: "Jira is connected. You can close this window and go back to your room.",
    failed: "Jira was not connected. Close this window and try again from your room.",
  },
  es: {
    connected: "Jira está conectado. Ya puedes cerrar esta ventana y volver a tu sala.",
    failed: "No se pudo conectar Jira. Cierra esta ventana e inténtalo de nuevo desde tu sala.",
  },
};

export function jiraConfigured(env) {
  return Boolean(env.JIRA_CLIENT_ID && env.JIRA_CLIENT_SECRET);
}

function redirectUri(url) {
  return `${url.origin}/api/jira/callback`;
}

function cookie(name, value, { maxAge, sameSite, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function tokenCookies(token, maxAge, secure) {
  const cookies = [];
  for (let index = 0; index < TOKEN_CHUNKS; index += 1) {
    const chunk = token.slice(index * TOKEN_CHUNK_LENGTH, (index + 1) * TOKEN_CHUNK_LENGTH);
    cookies.push(cookie(`${TOKEN_COOKIE}_${index}`, chunk, {
      maxAge: chunk ? maxAge : 0,
      sameSite: "Strict",
      secure,
    }));
  }
  return cookies;
}

export function readToken(request) {
  let token = "";
  for (let index = 0; index < TOKEN_CHUNKS; index += 1) {
    const chunk = cookieValue(request, `${TOKEN_COOKIE}_${index}`);
    if (!chunk) break;
    token += chunk;
  }
  return token || null;
}

function withCookies(response, cookies) {
  cookies.forEach((value) => response.headers.append("Set-Cookie", value));
  return response;
}

function disconnected(body, status, secure) {
  return withCookies(json(body, status), tokenCookies("", 0, secure));
}

export function authorizeUrl(env, url, state) {
  const target = new URL(AUTHORIZE_URL);
  target.search = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: env.JIRA_CLIENT_ID,
    scope: SCOPE,
    redirect_uri: redirectUri(url),
    state,
    response_type: "code",
    prompt: "consent",
  }).toString();
  return target.toString();
}

function connect(env, url, secure) {
  const state = crypto.randomUUID();
  const lang = url.searchParams.get("lang") === "es" ? "es" : "en";
  return withCookies(
    new Response(null, { status: 302, headers: { Location: authorizeUrl(env, url, state) } }),
    // Lax, not Strict: the callback arrives as a navigation from Atlassian.
    [cookie(STATE_COOKIE, `${state}.${lang}`, { maxAge: STATE_LIFETIME_SECONDS, sameSite: "Lax", secure })],
  );
}

function resultPage(status, lang, cookies) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const copy = RESULT_COPY[lang][status === "connected" ? "connected" : "failed"];
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Point Taken</title>
<style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;font:600 15px/1.5 system-ui,sans-serif;color:#17251e;background:#fffdf8;text-align:center}p{max-width:34ch}</style>
</head>
<body>
<p>${copy}</p>
<script nonce="${nonce}">
try { new BroadcastChannel(${JSON.stringify(JIRA_CHANNEL)}).postMessage(${JSON.stringify(status)}); } catch {}
window.close();
</script>
</body>
</html>`;
  const response = new Response(html, {
    status: status === "connected" ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
  return withCookies(response, cookies);
}

async function callback(env, url, request, secure) {
  const [expectedState, storedLang] = (cookieValue(request, STATE_COOKIE) ?? "").split(".");
  const lang = storedLang === "es" ? "es" : "en";
  const clearState = cookie(STATE_COOKIE, "", { maxAge: 0, sameSite: "Lax", secure });
  const code = url.searchParams.get("code");
  if (!expectedState || url.searchParams.get("state") !== expectedState || !code) {
    return resultPage("failed", lang, [clearState]);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(url),
    }),
  });
  const grant = response.ok ? await response.json().catch(() => null) : null;
  const token = typeof grant?.access_token === "string" ? grant.access_token : "";
  if (!token || token.length > TOKEN_CHUNK_LENGTH * TOKEN_CHUNKS) {
    console.log({ event: "jira_token_exchange_failed", status: response.status });
    return resultPage("failed", lang, [clearState]);
  }
  const lifetime = Number.isFinite(grant.expires_in) && grant.expires_in > 0
    ? Math.floor(grant.expires_in)
    : DEFAULT_TOKEN_LIFETIME_SECONDS;
  return resultPage("connected", lang, [clearState, ...tokenCookies(token, lifetime, secure)]);
}

function atlassian(token, path, init = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
}

async function status(env, request, secure) {
  if (!jiraConfigured(env)) return json({ available: false, connected: false, sites: [] });
  const token = readToken(request);
  if (!token) return json({ available: true, connected: false, sites: [] });

  const response = await atlassian(token, "/oauth/token/accessible-resources");
  if (response.status === 401) {
    return disconnected({ available: true, connected: false, sites: [] }, 200, secure);
  }
  if (!response.ok) return json({ error: UNREACHABLE_MESSAGE }, 502);
  const resources = await response.json();
  const sites = (Array.isArray(resources) ? resources : [])
    .filter((site) => CLOUD_ID.test(site?.id) && site.scopes?.includes(SCOPE) && jiraSiteOrigin(site.url))
    .map((site) => ({ id: site.id, name: String(site.name ?? ""), url: jiraSiteOrigin(site.url) }));
  return json({ available: true, connected: true, sites });
}

async function jiraError(response, secure) {
  if (response.status === 401) return disconnected({ error: EXPIRED_MESSAGE }, 401, secure);
  if (response.status === 400) {
    const detail = await response.json().catch(() => null);
    const message = detail?.errorMessages?.[0];
    if (typeof message === "string" && message) return json({ error: message.slice(0, 300) }, 400);
  }
  return json({ error: UNREACHABLE_MESSAGE }, 502);
}

async function projects(url, token, secure) {
  const cloudId = url.searchParams.get("cloudId") ?? "";
  if (!CLOUD_ID.test(cloudId)) return json({ error: "Choose a Jira site." }, 400);

  const found = [];
  for (let page = 0; page < PROJECT_PAGES; page += 1) {
    const response = await atlassian(
      token,
      `/ex/jira/${cloudId}/rest/api/3/project/search?orderBy=name&maxResults=100&startAt=${found.length}`,
    );
    if (!response.ok) return jiraError(response, secure);
    const data = await response.json();
    const values = Array.isArray(data.values) ? data.values : [];
    found.push(...values.map(({ key, name }) => ({ key: String(key), name: String(name ?? key) })));
    if (data.isLast !== false || values.length === 0) break;
  }
  return json({ projects: found });
}

async function search(request, token, secure) {
  const input = await readJson(request);
  if (!CLOUD_ID.test(input.cloudId ?? "")) return json({ error: "Choose a Jira site." }, 400);
  const jql = typeof input.jql === "string" ? input.jql.trim() : "";
  if (!jql || jql.length > MAX_JQL_LENGTH) return json({ error: "Enter a Jira search." }, 400);
  const pageToken = typeof input.nextPageToken === "string"
    ? input.nextPageToken.slice(0, MAX_PAGE_TOKEN_LENGTH)
    : "";

  const response = await atlassian(token, `/ex/jira/${input.cloudId}/rest/api/3/search/jql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql,
      maxResults: JIRA_SEARCH_PAGE_SIZE,
      fields: ["summary"],
      ...(pageToken ? { nextPageToken: pageToken } : {}),
    }),
  });
  if (!response.ok) return jiraError(response, secure);
  const data = await response.json();
  const issues = (Array.isArray(data.issues) ? data.issues : []).map((issue) => ({
    key: String(issue.key),
    title: String(issue.fields?.summary ?? ""),
  }));
  return json({ issues, nextPageToken: data.nextPageToken ?? null });
}

export async function handleJira(request, env, url) {
  const secure = url.protocol === "https:";
  const route = `${request.method} ${url.pathname.slice(COOKIE_PATH.length)}`;

  if (route === "GET /status") return status(env, request, secure);
  if (!jiraConfigured(env)) return json({ error: "Not found" }, 404);
  if (route === "GET /connect") return connect(env, url, secure);
  if (route === "GET /callback") return callback(env, url, request, secure);
  if (route === "POST /disconnect") return disconnected({ connected: false }, 200, secure);

  if (route === "GET /projects" || route === "POST /search") {
    const token = readToken(request);
    if (!token) return json({ error: EXPIRED_MESSAGE }, 401);
    return route === "GET /projects" ? projects(url, token, secure) : search(request, token, secure);
  }
  return json({ error: "Not found" }, 404);
}
