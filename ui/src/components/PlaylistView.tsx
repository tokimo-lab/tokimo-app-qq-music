import { Download, Play, Search, Share2 } from "lucide-react";
import { useState, type ReactElement, type UIEvent } from "react";
import type { PlaylistDetailResp, SongDto } from "../types/domain";
import { shortCount } from "./format";
import { TrackTable, TrackTableHeader } from "./TrackTable";

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
  const [compact, setCompact] = useState(false);

  if (loading) return <StateText text="加载歌单中" />;
  if (error) return <StateText text={error} />;
  if (!detail) return <StateText text="选择一个歌单开始播放" />;

  const trackCount = detail.tracks.length || detail.info.count;

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const next = event.currentTarget.scrollTop > 92;
    setCompact((current) => (current === next ? current : next));
  }

  return (
    <div className="qq-scrollbar h-full overflow-y-auto px-10 pt-16 pb-10" onScroll={handleScroll}>
      <div data-playlist-sticky="true" className="sticky top-0 z-20 -mx-10 bg-[#1e1e1e] px-10 pt-4 pb-2">
        <div className="flex min-w-0 items-start gap-7">
          {detail.info.coverImgUrl ? (
            <img
              src={detail.info.coverImgUrl}
              alt=""
              className={`shrink-0 rounded object-cover transition-[width,height] duration-200 ${
                compact ? "h-14 w-14" : "h-44 w-44 shadow-xl"
              }`}
            />
          ) : (
            <div className={`shrink-0 rounded bg-neutral-800 transition-[width,height] duration-200 ${compact ? "h-14 w-14" : "h-44 w-44"}`} />
          )}

          <div className="min-w-0 flex-1">
            <div className={`min-w-0 transition-all duration-200 ${compact ? "flex items-center gap-4" : ""}`}>
              <div className="min-w-0">
                <h1 className={`truncate font-semibold text-neutral-100 transition-[font-size,line-height] duration-200 ${compact ? "text-base" : "text-3xl"}`}>
                  {detail.info.title}
                </h1>
                <div className={`flex min-w-0 items-center gap-3 text-sm text-neutral-400 transition-all duration-200 ${compact ? "mt-1" : "mt-3"}`}>
                  <span className="truncate">{detail.info.author || "QQ音乐"}</span>
                  <span className="shrink-0">{trackCount} 首</span>
                  {detail.info.count > 0 && <span className="shrink-0">播放 {shortCount(detail.info.count)}</span>}
                </div>
              </div>

              <div className={`flex shrink-0 gap-4 transition-all duration-200 ${compact ? "ml-auto" : "mt-8"}`}>
                <ActionButton icon={<Play className="h-4 w-4 fill-current" />} label="播放" primary onClick={onPlayAll} />
                <ActionButton icon={<Download className="h-4 w-4" />} label="下载" />
                <ActionButton icon={<Search className="h-4 w-4" />} label="批量" />
                <ActionButton icon={<Share2 className="h-4 w-4" />} label="分享" />
              </div>
            </div>

            <p className={`max-w-3xl text-sm text-neutral-500 transition-all duration-200 ${compact ? "mt-0 h-0 overflow-hidden opacity-0" : "mt-4 opacity-100"}`}>
              公共歌单信息来自 QQ 音乐。播放可用性以 QQ 返回的试听地址为准。
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-12 text-base transition-all duration-200 ${compact ? "mt-4" : "mt-10"}`}>
          <span className="border-b-4 border-emerald-400 pb-3 text-emerald-400">歌曲 {detail.tracks.length}</span>
          <span className="pb-3 text-neutral-300">最近收藏</span>
          <span className="pb-3 text-neutral-300">评论</span>
          <button type="button" className="ml-auto flex shrink-0 items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200">
            <Search className="h-4 w-4" />
            搜索
          </button>
        </div>
        <div className="mt-5">
          <TrackTableHeader />
        </div>
      </div>
      <TrackTable
        tracks={detail.tracks}
        currentSongmid={currentSongmid}
        isPlaying={isPlaying}
        onPlay={onPlayTrack}
        onPause={onPause}
        showHeader={false}
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: ReactElement;
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
