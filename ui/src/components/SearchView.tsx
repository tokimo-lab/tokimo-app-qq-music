import { ListMusic, Play } from "lucide-react";
import type { PlaylistDto, SearchResp, SongDto } from "../types/domain";
import { TrackTable } from "./TrackTable";

interface SearchViewProps {
  query: string;
  results: SearchResp | null;
  loading: boolean;
  error: string | null;
  currentSongmid?: string;
  isPlaying: boolean;
  likedSongmids: ReadonlySet<string>;
  onPlaySong: (index: number) => void;
  onPause: () => void;
  onOpenPlaylist: (id: string) => void;
  onToggleLike: (track: SongDto) => void;
}

export function SearchView({
  query,
  results,
  loading,
  error,
  currentSongmid,
  isPlaying,
  likedSongmids,
  onPlaySong,
  onPause,
  onOpenPlaylist,
  onToggleLike,
}: SearchViewProps) {
  return (
    <div className="qq-scrollbar h-full overflow-y-auto px-10 pt-8 pb-10">
      <h1 className="text-3xl font-semibold text-neutral-100">搜索音乐</h1>
      <p className="mt-2 text-sm text-neutral-500">{query ? `“${query}” 的搜索结果` : "在顶部输入关键词搜索歌曲和歌单"}</p>
      {loading && <State text="搜索中" />}
      {error && <State text={error} />}
      {!loading && !error && results && (
        <div className="mt-8 space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-100">
              <Play className="h-5 w-5 text-emerald-400" />
              歌曲
            </div>
            <TrackTable
              tracks={results.songs}
              currentSongmid={currentSongmid}
              isPlaying={isPlaying}
              likedSongmids={likedSongmids}
              onPlay={onPlaySong}
              onPause={onPause}
              onToggleLike={onToggleLike}
              dense
            />
          </section>
          <section>
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-100">
              <ListMusic className="h-5 w-5 text-emerald-400" />
              歌单
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
              {results.playlists.map((playlist) => (
                <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => onOpenPlaylist(playlist.id)} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: PlaylistDto; onOpen: () => void }) {
  return (
    <button type="button" className="min-w-0 cursor-pointer text-left" onClick={onOpen}>
      {playlist.coverImgUrl ? (
        <img src={playlist.coverImgUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
      ) : (
        <div className="aspect-square w-full rounded-md bg-neutral-800" />
      )}
      <div className="mt-2 line-clamp-2 text-sm text-neutral-100">{playlist.title}</div>
      <div className="mt-1 truncate text-xs text-neutral-500">{playlist.author || "QQ音乐"}</div>
    </button>
  );
}

function State({ text }: { text: string }) {
  return <div className="mt-20 text-center text-sm text-neutral-400">{text}</div>;
}
