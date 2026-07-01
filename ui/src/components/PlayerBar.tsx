import type { MediaCenterSnapshot, MediaTrack, RepeatMode } from "@tokimo/sdk";
import { Heart, MoreHorizontal, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import type { AudioQualityId, SongDto } from "../types/domain";
import { duration } from "./format";
import { CommentsControl, PlaybackModeControl, QualityControl, QueueControl, VolumeControl } from "./PlaybackMenus";

interface PlayerBarProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  liked: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
  onNowPlaying: () => void;
  onToggleLike: () => void;
  quality: AudioQualityId;
  onSetShuffle: (on: boolean) => void;
  onSetRepeat: (mode: RepeatMode) => void;
  onSetVolume: (volume: number) => void;
  onSetQuality: (quality: AudioQualityId) => void;
  onSkipToIndex: (index: number) => void;
  onSetQueue: (queue: MediaTrack[], startIndex?: number) => void;
  onClearQueue: () => void;
}

export function PlayerBar({
  snapshot,
  current,
  liked,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onNowPlaying,
  onToggleLike,
  quality,
  onSetShuffle,
  onSetRepeat,
  onSetVolume,
  onSetQuality,
  onSkipToIndex,
  onSetQueue,
  onClearQueue,
}: PlayerBarProps) {
  const active = snapshot?.providerId === "qq-music" ? snapshot : null;
  const isPlaying = active?.isPlaying ?? false;
  const currentMs = active?.currentTimeMs ?? 0;
  const totalMs = active?.durationMs || current?.durationMs || 0;
  const progress = totalMs > 0 ? Math.min(100, (currentMs / totalMs) * 100) : 0;
  const [openMenu, setOpenMenu] = useState<"mode" | "volume" | "quality" | "queue" | "comments" | null>(null);
  const menuProps = {
    snapshot,
    current,
    liked,
    quality,
    openMenu,
    onOpenMenu: setOpenMenu,
    onSetShuffle,
    onSetRepeat,
    onSetVolume,
    onSetQuality,
    onSkipToIndex,
    onSetQueue,
    onClearQueue,
    onToggleLike,
    iconClass: "h-6 w-6",
  };

  function seekFromClientX(target: HTMLDivElement, clientX: number) {
    if (totalMs <= 0) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * totalMs);
  }

  function handleSeekPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.currentTarget, event.clientX);
  }

  function handleSeekPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.buttons & 1) === 0) return;
    seekFromClientX(event.currentTarget, event.clientX);
  }

  return (
    <footer className="flex h-[88px] shrink-0 items-center rounded-[14px] bg-[#181818] px-5 text-neutral-200">
      <div
        className="flex w-[300px] min-w-0 max-w-[34%] shrink cursor-pointer items-center gap-3 text-left"
        role="button"
        tabIndex={0}
        onClick={onNowPlaying}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onNowPlaying();
        }}
      >
        {current?.artworkUrl ? (
          <img src={current.artworkUrl} alt="" className="h-14 w-14 rounded object-cover" />
        ) : (
          <div className="h-14 w-14 rounded bg-neutral-800" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm text-white">{current?.title ?? "未播放"}</div>
          <div className="truncate text-xs text-neutral-400">{current?.artist ?? "QQ音乐"}</div>
          <div className="mt-2 flex items-center gap-4 text-neutral-400">
            <button
              type="button"
              className={`cursor-pointer ${liked ? "text-red-400" : "text-neutral-400 hover:text-red-300"}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleLike();
              }}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
            </button>
            <CommentsControl {...menuProps} commentsButtonClass="relative cursor-pointer text-neutral-400 hover:text-white" iconClass="h-4 w-4" />
            <MoreHorizontal className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="flex min-w-[260px] flex-1 flex-col items-center justify-center px-5">
        <div className="flex items-center gap-7">
          <PlaybackModeControl {...menuProps} modeButtonClass="cursor-pointer text-neutral-400 hover:text-white" iconClass="h-5 w-5" />
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
          <VolumeControl {...menuProps} volumeButtonClass="cursor-pointer text-neutral-400 hover:text-white" />
        </div>
        <div className="mt-3 flex w-full max-w-[520px] items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-neutral-500">{duration(currentMs)}</span>
          <div className="h-4 flex-1 cursor-pointer touch-none py-[7px]" onPointerDown={handleSeekPointerDown} onPointerMove={handleSeekPointerMove}>
            <div className="h-1 rounded-full bg-neutral-700">
              <div className="h-1 rounded-full bg-white" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className="w-10 text-xs tabular-nums text-neutral-500">{duration(totalMs)}</span>
        </div>
      </div>

      <div className="flex w-[220px] shrink-0 justify-end gap-5 text-neutral-400">
        <QualityControl
          {...menuProps}
          qualityButtonClass="cursor-pointer rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-400"
          qualityLabelClass=""
        />
        <span className="text-xs">词</span>
        <QueueControl {...menuProps} queueButtonClass="cursor-pointer text-neutral-400 hover:text-white" />
      </div>
    </footer>
  );
}
