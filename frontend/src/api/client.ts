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

  // ---- Daimōn (AI) ----
  aiStatus: () => apiFetch<{ enabled: boolean; model: string }>("/ai/status"),
  aiSummarize: (page_id: string) =>
    apiFetch<{ summary: string }>("/ai/summarize", {
      method: "POST",
      body: JSON.stringify({ page_id, save: true }),
    }),
  aiSuggestLinks: (page_id: string) =>
    apiFetch<{ suggestions: string[] }>("/ai/suggest-links", {
      method: "POST",
      body: JSON.stringify({ page_id }),
    }),
  aiExpand: (prompt: string, page_id?: string) =>
    apiFetch<{ text: string }>("/ai/expand", {
      method: "POST",
      body: JSON.stringify({ prompt, page_id }),
    }),
  aiChat: (message: string, session_id?: string) =>
    apiFetch<{ answer: string; session_id: string }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id }),
    }),
  aiChatHistory: (session_id: string) =>
    apiFetch<{ role: string; content: string; created_at: string }[]>(
      `/ai/chat/history?session_id=${encodeURIComponent(session_id)}`,
    ),

  // ---- CORE: generic entities ----
  listEntities: (type: string, q?: string) =>
    apiFetch<Entity[]>(`/entities/${type}${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createEntity: (type: string, data: Record<string, any>) =>
    apiFetch<any>(`/entities/${type}`, { method: "POST", body: JSON.stringify(data) }),
  getEntity: (type: string, id: string) => apiFetch<any>(`/entities/${type}/${id}`),
  updateEntity: (type: string, id: string, patch: Record<string, any>) =>
    apiFetch<any>(`/entities/${type}/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteEntity: (type: string, id: string) =>
    apiFetch<{ ok: true }>(`/entities/${type}/${id}`, { method: "DELETE" }),
  entityContext: (type: string, id: string, depth = 3) =>
    apiFetch<EntityContext>(`/entities/${type}/${id}/context?depth=${depth}`),

  // ---- CORE: relations ----
  createRelation: (r: {
    source_type: string;
    source_id: string;
    target_type: string;
    target_id: string;
    relation_type: string;
  }) => apiFetch<any>("/relations", { method: "POST", body: JSON.stringify(r) }),
  deleteRelation: (id: string) => apiFetch<{ ok: true }>(`/relations/${id}`, { method: "DELETE" }),
  relationTypes: () => apiFetch<{ types: string[] }>("/relation-types"),

  // ---- CORE: universal search ----
  universalSearch: (q: string, types?: string) =>
    apiFetch<{ results: Entity[]; counts: Record<string, number>; total: number }>(
      `/search/universal?q=${encodeURIComponent(q)}${types ? `&types=${types}` : ""}`,
    ),

  // ---- Piliers / Académies ----
  pillars: () => apiFetch<Pillar[]>("/pillars"),

  // ---- Suivi / Tracking ----
  tracking: () =>
    apiFetch<{ journals: any[]; workouts: any[]; studies: any[] }>("/tracking"),
};

export type Pillar = {
  id: string;
  slug: string;
  title: string;
  description: string;
  subsections: string[];
  icon?: string;
  order: number;
  status?: string;
};

export type Entity = {
  id: string;
  entity_type: string;
  title: string;
  slug?: string;
  status?: string;
  archived?: boolean;
  summary?: string;
  updated_at?: string;
  created_at?: string;
};

export type EntityContext = {
  entity: any;
  outgoing: { relation_id: string; relation_type: string; entity: Entity }[];
  backlinks: { relation_id: string; relation_type: string; entity: Entity }[];
  related_entities: Entity[];
  goals: Entity[];
  projects: Entity[];
  tasks: Entity[];
  knowledge: Entity[];
  books: Entity[];
  sources: Entity[];
  journal_entries: Entity[];
  telos: Entity[];
  notes: Entity[];
  people: Entity[];
  recent_activity: any[];
};

// Human labels for entity types (French)
export const ENTITY_LABELS: Record<string, string> = {
  knowledge: "Connaissance",
  telos: "Telos",
  goal: "Objectif",
  project: "Projet",
  task: "Tâche",
  journal: "Journal",
  book: "Livre",
  source: "Source",
  person: "Personne",
  note: "Note",
};
