import { useRuntimeCtx, type MediaCenterSnapshot, type MediaTrack } from "@tokimo/sdk";
import { useMediaCenter } from "@tokimo/sdk/react";
import { ChevronLeft, ChevronRight, Music2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, audioUrl } from "./api/client";
import { HomeView } from "./components/HomeView";
import { LoginDialog } from "./components/LoginDialog";
import { NowPlayingView } from "./components/NowPlayingView";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistView } from "./components/PlaylistView";
import { SearchView } from "./components/SearchView";
import { Sidebar } from "./components/Sidebar";
import type { AuthStatusResp, LyricsResp, PlaylistDetailResp, PlaylistDto, SearchResp, SongDto } from "./types/domain";

type View = "home" | "playlist" | "search";

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
  const [view, setView] = useState<View>("home");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [lastSong, setLastSong] = useState<SongDto | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResp | null>(null);
  const [likedSongmids, setLikedSongmids] = useState<Set<string>>(() => new Set());

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
    if (!currentSong?.songmid) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyrics(null);
    api
      .lyrics(currentSong)
      .then((data) => {
        if (!cancelled) setLyrics(data);
      })
      .catch(() => {
        if (!cancelled) setLyrics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.album, currentSong?.artist, currentSong?.durationMs, currentSong?.songId, currentSong?.songmid, currentSong?.title]);

  async function initialLoad(): Promise<void> {
    const [authData, recommendData] = await Promise.allSettled([api.authStatus(), api.recommendPlaylists()]);
    const authValue = authData.status === "fulfilled" ? authData.value : null;
    const recommendValue = recommendData.status === "fulfilled" ? recommendData.value.playlists : [];
    setAuth(authValue);
    setRecommended(recommendValue);
    if (authValue?.isLogin) {
      await Promise.all([refreshAccountPlaylists(), refreshLikedSongs()]);
    } else {
      setLikedSongmids(new Set());
      setView("home");
    }
  }

  async function refreshAccountPlaylists(): Promise<void> {
    try {
      const data = await api.myPlaylists();
      const merged = [...data.created, ...data.favorite];
      setAccountPlaylists(merged);
      if (merged[0] && !selectedPlaylistId) {
        void openPlaylist(merged[0].id);
      } else if (!selectedPlaylistId) {
        setView("home");
      }
    } catch {
      setAccountPlaylists([]);
    }
  }

  async function refreshLikedSongs(): Promise<void> {
    try {
      const data = await api.likedSongs();
      setLikedSongmids(new Set(data.songmids));
    } catch {
      setLikedSongmids(new Set());
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
      await Promise.all([refreshAccountPlaylists(), refreshLikedSongs()]);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoginSaving(false);
    }
  }

  async function logout(): Promise<void> {
    setAuth(await api.logout());
    setAccountPlaylists([]);
    setLikedSongmids(new Set());
    setSelectedPlaylistId(undefined);
    setPlaylist(null);
    setView("home");
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

  async function toggleLike(song: SongDto): Promise<void> {
    if (!auth?.isLogin) {
      setLoginOpen(true);
      return;
    }
    const wasLiked = likedSongmids.has(song.songmid);
    setLikedSongmids((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(song.songmid);
      else next.add(song.songmid);
      return next;
    });
    try {
      if (wasLiked) await api.unlikeSong(song.songmid, song.songId);
      else await api.likeSong(song.songmid);
    } catch (error) {
      setLikedSongmids((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(song.songmid);
        else next.delete(song.songmid);
        return next;
      });
      console.error("qq-music like toggle failed", error);
    }
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-[#171717] text-neutral-100">
      <Sidebar
        auth={auth}
        accountPlaylists={accountPlaylists}
        selectedId={selectedPlaylistId}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => void logout()}
        onHome={() => setView("home")}
        onOpenPlaylist={(id) => void openPlaylist(id)}
        onSearchFocus={() => searchRef.current?.focus()}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden bg-[#171717] p-3 pl-0">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[#1e1e1e]">
          <header className="flex h-16 shrink-0 items-center gap-5 bg-[#1e1e1e] px-10">
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

          <div className="min-h-0 flex-1 overflow-hidden">
            {view === "home" ? (
              <HomeView recommended={recommended} onOpenPlaylist={(id) => void openPlaylist(id)} onLogin={() => setLoginOpen(true)} />
            ) : view === "playlist" ? (
              <PlaylistView
                detail={playlist}
                loading={playlistLoading}
                error={playlistError}
                currentSongmid={currentSongmid}
                isPlaying={activeSnapshot?.isPlaying ?? false}
                onPlayAll={() => void playSongs(playlist?.tracks ?? [], 0)}
                onPlayTrack={(index) => void playSongs(playlist?.tracks ?? [], index)}
                onPause={() => mediaApi?.pause()}
                likedSongmids={likedSongmids}
                onToggleLike={(song) => void toggleLike(song)}
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
                likedSongmids={likedSongmids}
                onToggleLike={(song) => void toggleLike(song)}
              />
            )}
          </div>
        </section>

        <PlayerBar
          snapshot={snapshot}
          current={currentSong}
          liked={currentSong ? likedSongmids.has(currentSong.songmid) : false}
          onToggle={togglePlay}
          onPrev={() => mediaApi?.previous()}
          onNext={() => mediaApi?.next()}
          onSeek={(ms) => mediaApi?.seek(ms)}
          onNowPlaying={() => setNowPlayingOpen(true)}
          onToggleLike={() => currentSong && void toggleLike(currentSong)}
        />
      </main>

      <LoginDialog open={loginOpen} saving={loginSaving} error={loginError} onClose={() => setLoginOpen(false)} onSave={saveCookie} />
      {nowPlayingOpen && (
        <NowPlayingView
          snapshot={snapshot}
          current={currentSong}
          lyrics={lyrics}
          liked={currentSong ? likedSongmids.has(currentSong.songmid) : false}
          onClose={() => setNowPlayingOpen(false)}
          onToggle={togglePlay}
          onPrev={() => mediaApi?.previous()}
          onNext={() => mediaApi?.next()}
          onSeek={(ms) => mediaApi?.seek(ms)}
          onToggleLike={() => currentSong && void toggleLike(currentSong)}
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
