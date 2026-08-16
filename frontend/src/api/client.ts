import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "arete.token";

let memoryToken: string | null = null; // web fallback

export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return memoryToken;
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string) {
    if (Platform.OS === "web") {
      memoryToken = token;
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    if (Platform.OS === "web") {
      memoryToken = null;
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await tokenStore.get();
  const headers = new Headers(init.headers as HeadersInit);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- Typed endpoints ----------
export type User = { id: string; email: string; name?: string; created_at: string };
export type AuthOut = { token: string; user: User };

export type Page = {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  tags: string[];
  status: string;
  icon?: string | null;
  cover?: string | null;
  created_at: string;
  updated_at: string;
};

export type LinkRow = {
  id: string;
  source_id: string;
  source_title: string;
  target_id: string;
  target_title: string;
  relation: string;
  created_at: string;
};

export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  meta: any;
  created_at: string;
};

export type Stats = { pages: number; stubs: number; links: number; tags: number };

export const api = {
  register: (email: string, password: string, name?: string) =>
    apiFetch<AuthOut>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    apiFetch<AuthOut>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiFetch<User>("/auth/me"),

  listPages: (q?: string) =>
    apiFetch<Page[]>(`/pages${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createPage: (input: Partial<Page> & { title: string }) =>
    apiFetch<Page>("/pages", { method: "POST", body: JSON.stringify(input) }),
  getPage: (id: string) => apiFetch<Page>(`/pages/${id}`),
  getPageByTitle: (title: string) =>
    apiFetch<Page>(`/pages/by-title/${encodeURIComponent(title)}`),
  updatePage: (id: string, patch: Partial<Page>) =>
    apiFetch<Page>(`/pages/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deletePage: (id: string) => apiFetch<{ ok: true }>(`/pages/${id}`, { method: "DELETE" }),
  backlinks: (id: string) => apiFetch<LinkRow[]>(`/pages/${id}/backlinks`),
  outlinks: (id: string) => apiFetch<LinkRow[]>(`/pages/${id}/outlinks`),

  tags: () => apiFetch<{ tag: string; count: number }[]>("/tags"),
  search: (q: string) => apiFetch<{ pages: Page[] }>(`/search?q=${encodeURIComponent(q)}`),
  graph: () =>
    apiFetch<{ nodes: { id: string; label: string; status: string }[]; edges: { source: string; target: string; relation: string }[] }>(
      "/graph",
    ),
  activity: () => apiFetch<ActivityRow[]>("/activity"),
  stats: () => apiFetch<Stats>("/stats"),
};
