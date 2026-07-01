import { ChevronRight, Music2, Play } from "lucide-react";
import type { PlaylistDto } from "../types/domain";
import { shortCount } from "./format";

interface HomeViewProps {
  recommended: PlaylistDto[];
  onOpenPlaylist: (id: string) => void;
  onLogin: () => void;
}

export function HomeView({ recommended, onOpenPlaylist, onLogin }: HomeViewProps) {
  const hero = recommended[0];
  const daily = recommended.slice(1, 4);
  const privatePicks = recommended.slice(4, 12);

  return (
    <div className="qq-scrollbar h-full overflow-y-auto px-10 pt-8 pb-10">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-100">hi 今日为你推荐</h1>
        <button type="button" className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-base text-neutral-500 hover:text-neutral-300" onClick={onLogin}>
          查看你的听歌报告
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-[minmax(360px,1.25fr)_repeat(3,minmax(150px,0.58fr))] gap-7">
        <button
          type="button"
          className="group relative min-h-[174px] cursor-pointer overflow-hidden rounded bg-gradient-to-br from-sky-300 to-blue-500 text-left"
          onClick={() => hero && onOpenPlaylist(hero.id)}
        >
          <div className="absolute inset-y-0 right-12 flex items-center opacity-45">
            <div className="flex h-36 w-36 items-center justify-center rounded-full bg-neutral-300/60 shadow-2xl">
              <div className="h-16 w-16 rounded-full bg-neutral-400/40" />
            </div>
          </div>
          <div className="relative flex h-full flex-col justify-center px-8 text-neutral-950">
            <div className="text-3xl font-semibold">打打盹</div>
            <div className="mt-4 max-w-full truncate whitespace-nowrap text-lg leading-7">尝试来点儿音乐提提神吧~</div>
            <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400 text-neutral-950 transition group-hover:scale-105">
              <Play className="h-5 w-5 translate-x-0.5 fill-current" />
            </div>
          </div>
        </button>

        {daily.map((playlist, index) => (
          <DailyCard key={playlist.id} playlist={playlist} label={index === 0 ? "Daily 30" : index === 1 ? "Favorites" : "New Songs"} onOpen={() => onOpenPlaylist(playlist.id)} />
        ))}
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-neutral-100">你的私荐歌单</h2>
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-8 gap-y-10">
          {(privatePicks.length > 0 ? privatePicks : recommended).map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => onOpenPlaylist(playlist.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DailyCard({ playlist, label, onOpen }: { playlist: PlaylistDto; label: string; onOpen: () => void }) {
  return (
    <button type="button" className="group min-w-0 cursor-pointer text-left" onClick={onOpen}>
      <div className="relative aspect-square overflow-hidden rounded bg-neutral-800">
        {playlist.coverImgUrl ? (
          <img src={playlist.coverImgUrl} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            <Music2 className="h-10 w-10 text-neutral-500" />
          </div>
        )}
        <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-neutral-950/75 to-transparent px-3 py-2 text-2xl text-white">
          {label}
        </div>
        <div className="absolute right-0 bottom-3 h-5 w-5 rounded-full bg-emerald-400" />
      </div>
      <div className="mt-3 line-clamp-1 text-base text-neutral-300">{playlist.title}</div>
      <div className="mt-1 truncate whitespace-nowrap text-sm text-neutral-500">{playlist.author || "每日30首"}</div>
    </button>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: PlaylistDto; onOpen: () => void }) {
  return (
    <button type="button" className="group min-w-0 cursor-pointer text-left" onClick={onOpen}>
      <div className="relative aspect-square overflow-hidden rounded bg-neutral-800">
        {playlist.coverImgUrl ? (
          <img src={playlist.coverImgUrl} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            <Music2 className="h-10 w-10 text-neutral-500" />
          </div>
        )}
        {playlist.count > 0 && (
          <div className="absolute right-2 bottom-2 rounded bg-neutral-950/55 px-2 py-0.5 text-sm text-white">{shortCount(playlist.count)}</div>
        )}
      </div>
      <div className="mt-3 line-clamp-2 text-base leading-6 text-neutral-300">{playlist.title}</div>
      <div className="mt-1 truncate text-sm text-neutral-500">{playlist.author || "QQ音乐"}</div>
    </button>
  );
}
