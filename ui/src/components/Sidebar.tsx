import { Clock3, Download, Heart, Home, ListMusic, LogIn, Music2, Plus, Search, ShoppingBag } from "lucide-react";
import type { AuthStatusResp, PlaylistDto } from "../types/domain";

interface SidebarProps {
  auth: AuthStatusResp | null;
  accountPlaylists: PlaylistDto[];
  recommended: PlaylistDto[];
  selectedId?: string;
  onLogin: () => void;
  onLogout: () => void;
  onOpenPlaylist: (id: string) => void;
  onSearchFocus: () => void;
}

export function Sidebar({
  auth,
  accountPlaylists,
  recommended,
  selectedId,
  onLogin,
  onLogout,
  onOpenPlaylist,
  onSearchFocus,
}: SidebarProps) {
  const user = auth?.user;
  const visiblePlaylists = accountPlaylists.length > 0 ? accountPlaylists : recommended.slice(0, 5);

  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-neutral-950 text-neutral-300">
      <div className="flex h-24 items-center gap-3 px-5">
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl font-bold text-neutral-950">
            QQ
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{user?.nickname ?? "QQ音乐"}</div>
          <div className="mt-1 flex gap-1 text-[10px]">
            <span className="rounded border border-amber-400/70 px-1 text-amber-300">{user?.vipLabel || "SVIP7 年"}</span>
            <span className="rounded bg-purple-500/70 px-1 text-white">48勋章</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">
        <button className="flex h-14 cursor-pointer items-center justify-center rounded-lg bg-neutral-900 hover:bg-neutral-800">
          <Home className="h-5 w-5" />
        </button>
        <button
          className="flex h-14 cursor-pointer items-center justify-center rounded-lg bg-neutral-900 hover:bg-neutral-800"
          onClick={onSearchFocus}
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        className="mx-5 mt-3 flex h-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
      >
        <Plus className="h-4 w-4" />
      </button>

      <nav className="mt-9 space-y-6 px-7 text-sm">
        <NavItem icon={<Heart />} label="喜欢" meta="372" />
        <NavItem icon={<Clock3 />} label="最近播放" meta="500" />
        <NavItem icon={<Download />} label="本地和下载" />
        <NavItem icon={<ShoppingBag />} label="已购音乐" meta="11" />
        <NavItem icon={<ListMusic />} label="试听列表" />
      </nav>

      <div className="mt-9 flex items-center justify-between px-7 text-xs text-neutral-400">
        <span>自建歌单</span>
        <span className="text-neutral-600">|</span>
        <span>收藏歌单</span>
        <button type="button" className="cursor-pointer text-neutral-400 hover:text-white">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="qq-scrollbar mt-3 flex-1 overflow-y-auto px-4 pb-4">
        {visiblePlaylists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className={`mb-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
              selectedId === playlist.id ? "bg-neutral-800 text-white" : "hover:bg-neutral-900"
            }`}
            onClick={() => onOpenPlaylist(playlist.id)}
          >
            {playlist.coverImgUrl ? (
              <img src={playlist.coverImgUrl} alt="" className="h-9 w-9 rounded object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded bg-neutral-800">
                <Music2 className="h-4 w-4" />
              </div>
            )}
            <span className="min-w-0 truncate text-sm">{playlist.title}</span>
          </button>
        ))}
      </div>

      <div className="flex h-16 items-center justify-between border-t border-white/5 px-6">
        <button type="button" className="cursor-pointer text-xs text-neutral-500 hover:text-white" onClick={auth?.isLogin ? onLogout : onLogin}>
          {auth?.isLogin ? "退出登录" : "导入 QQ Cookie"}
        </button>
        {!auth?.isLogin && (
          <button type="button" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-emerald-400 text-black" onClick={onLogin}>
            <LogIn className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}

function NavItem({ icon, label, meta }: { icon: React.ReactElement; label: string; meta?: string }) {
  return (
    <div className="flex items-center gap-4 text-neutral-300">
      {icon}
      <span>{label}{meta ? `·${meta}` : ""}</span>
    </div>
  );
}

