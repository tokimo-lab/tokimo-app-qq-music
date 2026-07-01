import type { MediaCenterSnapshot } from "@tokimo/sdk";
import { Heart, ListMusic, MessageCircle, MoreHorizontal, Pause, Play, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { SongDto } from "../types/domain";
import { duration } from "./format";

interface PlayerBarProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
  onNowPlaying: () => void;
}

export function PlayerBar({ snapshot, current, onToggle, onPrev, onNext, onSeek, onNowPlaying }: PlayerBarProps) {
  const active = snapshot?.providerId === "qq-music" ? snapshot : null;
  const isPlaying = active?.isPlaying ?? false;
  const currentMs = active?.currentTimeMs ?? 0;
  const totalMs = active?.durationMs || current?.durationMs || 0;
  const progress = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;

  function handleSeek(event: React.MouseEvent<HTMLDivElement>) {
    if (totalMs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * totalMs);
  }

  return (
    <footer className="flex h-[88px] shrink-0 items-center rounded-[14px] bg-[#181818] px-5 text-neutral-200">
      <button type="button" className="flex w-[300px] min-w-0 max-w-[34%] shrink cursor-pointer items-center gap-3 text-left" onClick={onNowPlaying}>
        {current?.artworkUrl ? (
          <img src={current.artworkUrl} alt="" className="h-14 w-14 rounded object-cover" />
        ) : (
          <div className="h-14 w-14 rounded bg-neutral-800" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm text-white">{current?.title ?? "未播放"}</div>
          <div className="truncate text-xs text-neutral-400">{current?.artist ?? "QQ音乐"}</div>
          <div className="mt-2 flex items-center gap-4 text-neutral-400">
            <Heart className="h-4 w-4 text-red-400" />
            <MessageCircle className="h-4 w-4" />
            <MoreHorizontal className="h-4 w-4" />
          </div>
        </div>
      </button>

      <div className="flex min-w-[260px] flex-1 flex-col items-center justify-center px-5">
        <div className="flex items-center gap-7">
          <button type="button" className="cursor-pointer text-neutral-400 hover:text-white">
            <Shuffle className="h-5 w-5" />
          </button>
          <button type="button" className="cursor-pointer hover:text-white" onClick={onPrev}>
            <SkipBack className="h-6 w-6 fill-current" />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-emerald-400 text-black hover:bg-emerald-300"
            onClick={onToggle}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-0.5 fill-current" />}
          </button>
          <button type="button" className="cursor-pointer hover:text-white" onClick={onNext}>
            <SkipForward className="h-6 w-6 fill-current" />
          </button>
          <button type="button" className="cursor-pointer text-neutral-400 hover:text-white">
            <Volume2 className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-3 flex w-full max-w-[520px] items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-neutral-500">{duration(currentMs)}</span>
          <div className="h-4 flex-1 cursor-pointer py-[7px]" onClick={handleSeek}>
            <div className="h-1 rounded-full bg-neutral-700">
              <div className="h-1 rounded-full bg-white" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className="w-10 text-xs tabular-nums text-neutral-500">{duration(totalMs)}</span>
        </div>
      </div>

      <div className="flex w-[220px] shrink-0 justify-end gap-5 text-neutral-400">
        <span className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-400">HQ</span>
        <span className="text-xs">词</span>
        <ListMusic className="h-6 w-6" />
      </div>
    </footer>
  );
}
