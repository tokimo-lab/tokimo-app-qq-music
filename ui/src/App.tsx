import { useRuntimeCtx, type MediaCenterSnapshot, type MediaTrack } from "@tokimo/sdk";
import { useMediaCenter } from "@tokimo/sdk/react";
import { ChevronLeft, ChevronRight, Music2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, audioUrl } from "./api/client";
import { LoginDialog } from "./components/LoginDialog";
import { NowPlayingView } from "./components/NowPlayingView";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistView } from "./components/PlaylistView";
import { SearchView } from "./components/SearchView";
import { Sidebar } from "./components/Sidebar";
import type { AuthStatusResp, PlaylistDetailResp, PlaylistDto, SearchResp, SongDto } from "./types/domain";

type View = "playlist" | "search";

const PROVIDER_ID = "qq-music";

export default function App() {
  const ctx = useRuntimeCtx();
  const { snapshot, api: mediaApi } = useMediaCenter(ctx);
  const searchRef = useRef<HTMLInputElement>(null);
  const [auth, setAuth] = useState<AuthStatusResp | null>(null);
  const [recommended, setRecommended] = useState<PlaylistDto[]>([]);
  const [accountPlaylists, setAccountPlaylists] = useState<PlaylistDto[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>();
  const [playlist, setPlaylist] = useState<PlaylistDetailResp | null>(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResp | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [view, setView] = useState<View>("playlist");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [lastSong, setLastSong] = useState<SongDto | null>(null);
  const [lyric, setLyric] = useState("");

  const activeSnapshot = snapshot?.providerId === PROVIDER_ID ? snapshot : null;
  const currentSong = useMemo(() => currentSongFromSnapshot(activeSnapshot) ?? lastSong, [activeSnapshot, lastSong]);
  const currentSongmid = currentSong?.songmid;

  useEffect(() => {
    if (!mediaApi) return;
    return mediaApi.registerProvider(PROVIDER_ID, {
      displayName: "QQ音乐",
      resolveAudioUrl: (track) => audioUrl(track.id),
      onTrackChanged: (track) => {
        const song = songFromTrack(track);
        if (song) setLastSong(song);
      },
    });
  }, [mediaApi]);

  useEffect(() => {
    void initialLoad();
  }, []);

  useEffect(() => {
    if (!currentSong?.songmid) return;
    let cancelled = false;
    api
      .lyrics(currentSong.songmid)
      .then((data) => {
        if (!cancelled) setLyric(data.lyric);
      })
      .catch(() => {
        if (!cancelled) setLyric("");
      });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.songmid]);

  async function initialLoad(): Promise<void> {
    const [authData, recommendData] = await Promise.allSettled([api.authStatus(), api.recommendPlaylists()]);
    const authValue = authData.status === "fulfilled" ? authData.value : null;
    const recommendValue = recommendData.status === "fulfilled" ? recommendData.value.playlists : [];
    setAuth(authValue);
    setRecommended(recommendValue);
    if (authValue?.isLogin) {
      await refreshAccountPlaylists();
    }
    const first = recommendValue[0];
    if (first) void openPlaylist(first.id);
  }

  async function refreshAccountPlaylists(): Promise<void> {
    try {
      const data = await api.myPlaylists();
      const merged = [...data.created, ...data.favorite];
      setAccountPlaylists(merged);
      if (merged[0] && !selectedPlaylistId) void openPlaylist(merged[0].id);
    } catch {
      setAccountPlaylists([]);
    }
  }

  const openPlaylist = useCallback(async (id: string) => {
    setSelectedPlaylistId(id);
    setView("playlist");
    setPlaylistLoading(true);
    setPlaylistError(null);
    try {
      setPlaylist(await api.playlist(id));
    } catch (error) {
      setPlaylist(null);
      setPlaylistError(error instanceof Error ? error.message : "歌单加载失败");
    } finally {
      setPlaylistLoading(false);
    }
  }, []);

  async function doSearch(event?: React.FormEvent): Promise<void> {
    event?.preventDefault();
    if (!query.trim()) {
      searchRef.current?.focus();
      return;
    }
    setView("search");
    setSearchLoading(true);
    setSearchError(null);
    try {
      setSearchResults(await api.search(query.trim()));
    } catch (error) {
      setSearchResults(null);
      setSearchError(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setSearchLoading(false);
    }
  }

  async function saveCookie(cookie: string): Promise<void> {
    setLoginSaving(true);
    setLoginError(null);
    try {
      const next = await api.saveCookie(cookie);
      setAuth(next);
      setLoginOpen(false);
      await refreshAccountPlaylists();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoginSaving(false);
    }
  }

  async function logout(): Promise<void> {
    setAuth(await api.logout());
    setAccountPlaylists([]);
  }

  async function playSongs(songs: SongDto[], startIndex: number): Promise<void> {
    if (!mediaApi) return;
    const playable = songs.filter((song) => song.playable);
    if (playable.length === 0) return;
    const selected = songs[startIndex];
    const realIndex = Math.max(0, playable.findIndex((song) => song.songmid === selected?.songmid));
    const queue = playable.map(trackFromSong);
    const first = playable[realIndex] ?? playable[0];
    setLastSong(first ?? null);
    await mediaApi.play({ providerId: PROVIDER_ID, queue, startIndex: realIndex });
  }

  const togglePlay = useCallback(() => {
    if (!mediaApi) return;
    if (activeSnapshot?.isPlaying) mediaApi.pause();
    else mediaApi.resume();
  }, [activeSnapshot?.isPlaying, mediaApi]);

  return (
    <div className="relative flex h-full overflow-hidden bg-neutral-950 text-neutral-100">
      <Sidebar
        auth={auth}
        accountPlaylists={accountPlaylists}
        recommended={recommended}
        selectedId={selectedPlaylistId}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => void logout()}
        onOpenPlaylist={(id) => void openPlaylist(id)}
        onSearchFocus={() => searchRef.current?.focus()}
      />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-l-xl bg-neutral-900">
        <header className="absolute top-0 right-0 left-0 z-10 flex h-16 items-center gap-5 bg-neutral-900/90 px-10 backdrop-blur">
          <ChevronLeft className="h-7 w-7 text-neutral-500" />
          <ChevronRight className="h-7 w-7 text-neutral-700" />
          <form className="relative w-[320px]" onSubmit={(event) => void doSearch(event)}>
            <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索音乐"
              className="h-10 w-full rounded-xl bg-neutral-800 pr-4 pl-12 text-sm outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-emerald-400"
            />
          </form>
          <div className="ml-2 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700">
            <Music2 className="h-6 w-6 text-emerald-400" />
          </div>
        </header>

        {view === "playlist" ? (
          <PlaylistView
            detail={playlist}
            loading={playlistLoading}
            error={playlistError}
            currentSongmid={currentSongmid}
            isPlaying={activeSnapshot?.isPlaying ?? false}
            onPlayAll={() => void playSongs(playlist?.tracks ?? [], 0)}
            onPlayTrack={(index) => void playSongs(playlist?.tracks ?? [], index)}
            onPause={() => mediaApi?.pause()}
          />
        ) : (
          <SearchView
            query={query}
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            currentSongmid={currentSongmid}
            isPlaying={activeSnapshot?.isPlaying ?? false}
            onPlaySong={(index) => void playSongs(searchResults?.songs ?? [], index)}
            onPause={() => mediaApi?.pause()}
            onOpenPlaylist={(id) => void openPlaylist(id)}
          />
        )}

        <PlayerBar
          snapshot={snapshot}
          current={currentSong}
          onToggle={togglePlay}
          onPrev={() => mediaApi?.previous()}
          onNext={() => mediaApi?.next()}
          onSeek={(ms) => mediaApi?.seek(ms)}
          onNowPlaying={() => setNowPlayingOpen(true)}
        />
      </main>

      <LoginDialog open={loginOpen} saving={loginSaving} error={loginError} onClose={() => setLoginOpen(false)} onSave={saveCookie} />
      {nowPlayingOpen && (
        <NowPlayingView
          snapshot={snapshot}
          current={currentSong}
          lyric={lyric}
          onClose={() => setNowPlayingOpen(false)}
          onToggle={togglePlay}
          onPrev={() => mediaApi?.previous()}
          onNext={() => mediaApi?.next()}
        />
      )}
    </div>
  );
}

function trackFromSong(song: SongDto): MediaTrack {
  return {
    id: song.songmid,
    title: song.title,
    artist: song.artist,
    album: song.album,
    artworkUrl: song.artworkUrl,
    durationMs: song.durationMs,
    meta: { song },
  };
}

function currentSongFromSnapshot(snapshot: MediaCenterSnapshot | null): SongDto | null {
  if (!snapshot) return null;
  const track = snapshot.queue[snapshot.currentIndex];
  return track ? songFromTrack(track) : null;
}

function songFromTrack(track: MediaTrack): SongDto | null {
  const value = track.meta?.song;
  if (isSongDto(value)) return value;
  return null;
}

function isSongDto(value: unknown): value is SongDto {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.songmid === "string" && typeof record.title === "string";
}
