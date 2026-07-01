import { Clock3, Compass, Download, Gamepad2, Home, ListMusic, LogIn, Music2, Plus, Search, Settings, Shirt } from "lucide-react";
import type { AuthStatusResp, PlaylistDto } from "../types/domain";

interface SidebarProps {
  auth: AuthStatusResp | null;
  accountPlaylists: PlaylistDto[];
  selectedId?: string;
  onLogin: () => void;
  onLogout: () => void;
  onHome: () => void;
  onOpenPlaylist: (id: string) => void;
  onSearchFocus: () => void;
}

export function Sidebar({
  auth,
  accountPlaylists,
  selectedId,
  onLogin,
  onLogout,
  onHome,
  onOpenPlaylist,
  onSearchFocus,
}: SidebarProps) {
  const user = auth?.user;
  const isLogin = auth?.isLogin ?? false;
  const visiblePlaylists = isLogin ? accountPlaylists : [];

  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-[#171717] text-neutral-300">
      <button type="button" className="flex h-24 cursor-pointer items-center gap-3 px-5 text-left" onClick={isLogin ? undefined : onLogin}>
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xl font-bold text-white">
            ♪
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{user?.nickname ?? "点击登录"}</div>
          {isLogin && (
            <div className="mt-1 flex gap-1 text-[10px]">
              <span className="rounded border border-amber-400/70 px-1 text-amber-300">{user?.vipLabel || "VIP"}</span>
              <span className="rounded bg-purple-500/70 px-1 text-white">QQ音乐</span>
            </div>
          )}
        </div>
      </button>

      {!isLogin && (
        <button
          type="button"
          className="mx-5 mb-5 flex h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-xl bg-neutral-900 px-3 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          onClick={onLogin}
        >
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">会员畅听VIP曲库</span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-neutral-950">立即开通</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 px-5">
        <button className="flex h-14 cursor-pointer items-center justify-center rounded-lg bg-neutral-900 hover:bg-neutral-800" onClick={onHome}>
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

      <div className="qq-scrollbar mt-9 flex-1 overflow-y-auto px-4 pb-4">
        <nav className="space-y-6 px-3 text-sm">
          {isLogin && <NavItem icon={<Music2 />} label="喜欢" meta={String(accountPlaylists.length)} />}
          <NavItem icon={<Clock3 />} label="最近播放" />
          <NavItem icon={<Download />} label="本地和下载" />
          <NavItem icon={<ListMusic />} label="试听列表" />
        </nav>

        {isLogin && (
          <div className="mt-9 flex items-center justify-between px-3 text-xs text-neutral-400">
            <span>自建歌单</span>
            <span className="text-neutral-600">|</span>
            <span>收藏歌单</span>
            <button type="button" className="cursor-pointer text-neutral-400 hover:text-white">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-3">
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
      </div>

      <div className="flex h-16 items-center justify-between border-t border-white/5 px-6">
        <div className="flex items-center gap-5 text-neutral-400">
          <Settings className="h-5 w-5" />
          <Shirt className="h-5 w-5" />
          <Gamepad2 className="h-5 w-5" />
        </div>
        <button type="button" className="cursor-pointer text-xs text-neutral-500 hover:text-white" onClick={auth?.isLogin ? onLogout : onLogin}>
          {auth?.isLogin ? "退出" : <LogIn className="h-4 w-4" />}
        </button>
        {!auth?.isLogin && (
          <button type="button" className="cursor-pointer text-neutral-400 hover:text-white" onClick={onSearchFocus}>
            <Compass className="h-5 w-5" />
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
      <span className="whitespace-nowrap">{label}{meta ? `·${meta}` : ""}</span>
    </div>
  );
}
