import type {
  AuthStatusResp,
  LikeSongResp,
  LikedSongsResp,
  LyricsResp,
  MyPlaylistsResp,
  PlaylistDetailResp,
  RecommendPlaylistsResp,
  SearchResp,
} from "../types/domain";

const BASE = "/api/apps/qq-music";

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error ?? `${response.status} ${response.statusText}`);
  }
  if (payload.data === undefined) {
    throw new Error("Empty response");
  }
  return payload.data;
}

function params(input: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const api = {
  authStatus: () => request<AuthStatusResp>("/auth/status"),
  saveCookie: (cookieHeader: string) =>
    request<AuthStatusResp>("/auth/cookie", {
      method: "PUT",
      body: JSON.stringify({ cookieHeader }),
    }),
  logout: () => request<AuthStatusResp>("/auth/cookie", { method: "DELETE" }),
  myPlaylists: () => request<MyPlaylistsResp>("/me/playlists"),
  likedSongs: () => request<LikedSongsResp>("/me/liked-songs"),
  likeSong: (songmid: string) =>
    request<LikeSongResp>(`/me/liked-songs/${encodeURIComponent(songmid)}`, { method: "PUT" }),
  unlikeSong: (songmid: string, songId?: string) =>
    request<LikeSongResp>(`/me/liked-songs/${encodeURIComponent(songmid)}${params({ songId })}`, { method: "DELETE" }),
  recommendPlaylists: (limit = 18) =>
    request<RecommendPlaylistsResp>(`/recommend/playlists${params({ limit })}`),
  playlist: (id: string) => request<PlaylistDetailResp>(`/playlists/${encodeURIComponent(id)}`),
  search: (query: string, types = "songs,playlists", page = 1, limit = 30) =>
    request<SearchResp>(`/search${params({ query, types, page, limit })}`),
  lyrics: (songmid: string) => request<LyricsResp>(`/lyrics/${encodeURIComponent(songmid)}`),
};

export function audioUrl(songmid: string): string {
  return `${BASE}/audio/${encodeURIComponent(songmid)}`;
}

export function imageProxyUrl(url: string): string {
  return `${BASE}/image-proxy${params({ url })}`;
}
