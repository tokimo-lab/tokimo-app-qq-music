import { Download, Play, Search, Share2 } from "lucide-react";
import type { PlaylistDetailResp, SongDto } from "../types/domain";
import { shortCount } from "./format";
import { TrackTable } from "./TrackTable";

interface PlaylistViewProps {
  detail: PlaylistDetailResp | null;
  loading: boolean;
  error: string | null;
  currentSongmid?: string;
  isPlaying: boolean;
  onPlayAll: () => void;
  onPlayTrack: (index: number) => void;
  onPause: () => void;
}

export function PlaylistView({
  detail,
  loading,
  error,
  currentSongmid,
  isPlaying,
  onPlayAll,
  onPlayTrack,
  onPause,
}: PlaylistViewProps) {
  if (loading) return <StateText text="加载歌单中" />;
  if (error) return <StateText text={error} />;
  if (!detail) return <StateText text="选择一个歌单开始播放" />;

  return (
    <div className="qq-scrollbar h-full overflow-y-auto px-10 pt-16 pb-32">
      <div className="flex gap-7">
        {detail.info.coverImgUrl ? (
          <img src={detail.info.coverImgUrl} alt="" className="h-44 w-44 rounded object-cover shadow-xl" />
        ) : (
          <div className="h-44 w-44 rounded bg-neutral-800" />
        )}
        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="truncate text-3xl font-semibold text-neutral-100">{detail.info.title}</h1>
          <div className="mt-3 flex items-center gap-3 text-sm text-neutral-400">
            <span>{detail.info.author || "QQ音乐"}</span>
            <span>{detail.tracks.length || detail.info.count} 首</span>
            {detail.info.count > 0 && <span>播放 {shortCount(detail.info.count)}</span>}
          </div>
          <p className="mt-4 max-w-3xl text-sm text-neutral-500">公共歌单信息来自 QQ 音乐。播放可用性以 QQ 返回的试听地址为准。</p>
          <div className="mt-8 flex gap-4">
            <ActionButton icon={<Play className="h-4 w-4 fill-current" />} label="播放" primary onClick={onPlayAll} />
            <ActionButton icon={<Download className="h-4 w-4" />} label="下载" />
            <ActionButton icon={<Search className="h-4 w-4" />} label="批量" />
            <ActionButton icon={<Share2 className="h-4 w-4" />} label="分享" />
          </div>
        </div>
      </div>
      <div className="mt-10">
        <div className="mb-7 flex gap-12 text-base">
          <span className="border-b-4 border-emerald-400 pb-3 text-emerald-400">歌曲 {detail.tracks.length}</span>
          <span className="pb-3 text-neutral-300">最近收藏</span>
          <span className="pb-3 text-neutral-300">评论</span>
        </div>
        <TrackTable
          tracks={detail.tracks}
          currentSongmid={currentSongmid}
          isPlaying={isPlaying}
          onPlay={onPlayTrack}
          onPause={onPause}
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: React.ReactElement;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-full px-6 text-sm ${
        primary ? "bg-emerald-400 text-black hover:bg-emerald-300" : "bg-white/8 text-neutral-100 hover:bg-white/12"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function StateText({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-neutral-400">{text}</div>;
}

