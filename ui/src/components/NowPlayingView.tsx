import type { MediaCenterSnapshot } from "@tokimo/sdk";
import { ChevronDown, Heart, ListMusic, MessageCircle, MoreHorizontal, Pause, Play, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { SongDto } from "../types/domain";
import { duration } from "./format";

interface NowPlayingViewProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  lyric: string;
  onClose: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function NowPlayingView({ snapshot, current, lyric, onClose, onToggle, onPrev, onNext }: NowPlayingViewProps) {
  const active = snapshot?.providerId === "qq-music" ? snapshot : null;
  const isPlaying = active?.isPlaying ?? false;
  const lines = lyric
    .split("\n")
    .map((line) => line.replace(/\[[^\]]+\]/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const fallback = ["如果只是一场梦", "那该有多好", "未だにあなたのことを夢にみる", "你依旧出现在我梦里"];

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#dcfbf8] text-slate-900">
      <div className="flex h-16 items-center justify-between px-7">
        <button type="button" className="cursor-pointer rounded p-2 text-slate-600 hover:bg-black/5" onClick={onClose}>
          <ChevronDown className="h-7 w-7" />
        </button>
        <div className="flex gap-9 text-slate-500">
          <span>—</span>
          <span>□</span>
          <span>×</span>
        </div>
      </div>
      <main className="flex flex-1 items-center justify-center gap-28 px-16">
        <div className="relative h-[350px] w-[350px] rounded-[36px] bg-white shadow-2xl">
          <div className="absolute top-16 left-16 h-56 w-56 rounded-full border-[28px] border-slate-800 bg-[#d7fbf7] shadow-inner">
            {current?.artworkUrl && <img src={current.artworkUrl} alt="" className="h-full w-full rounded-full object-cover opacity-90" />}
          </div>
          <div className="absolute top-8 right-12 h-72 w-4 rotate-6 rounded-full bg-slate-300 shadow-lg" />
          <div className="absolute right-5 bottom-5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-500">Q</div>
        </div>
        <div className="w-[520px] text-center">
          <h1 className="text-2xl font-semibold">{current?.title ?? "QQ音乐"}</h1>
          <div className="mt-2 text-lg text-slate-600">{current?.artist ?? "未播放"}</div>
          <div className="mt-8 space-y-4 text-2xl leading-relaxed text-slate-500">
            {(lines.length > 0 ? lines : fallback).map((line, index) => (
              <p key={`${line}-${index}`} className={index === 1 ? "font-semibold text-emerald-500" : ""}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </main>
      <footer className="flex h-28 items-center px-14">
        <div className="flex w-80 items-center gap-4">
          <div className="min-w-0">
            <div className="truncate font-medium">{current?.title ?? "未播放"}</div>
            <div className="truncate text-sm text-slate-500">{current?.artist ?? "QQ音乐"}</div>
          </div>
          <Heart className="h-6 w-6 fill-red-400 text-red-400" />
          <MessageCircle className="h-6 w-6 text-slate-500" />
          <MoreHorizontal className="h-6 w-6 text-slate-500" />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <div className="flex items-center gap-8">
            <Shuffle className="h-5 w-5 text-slate-600" />
            <button type="button" className="cursor-pointer" onClick={onPrev}>
              <SkipBack className="h-6 w-6 fill-current" />
            </button>
            <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-emerald-400 text-white" onClick={onToggle}>
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-0.5 fill-current" />}
            </button>
            <button type="button" className="cursor-pointer" onClick={onNext}>
              <SkipForward className="h-6 w-6 fill-current" />
            </button>
            <Volume2 className="h-6 w-6 text-slate-600" />
          </div>
          <div className="mt-4 flex w-full max-w-[520px] items-center gap-3 text-xs text-slate-500">
            <span>{duration(active?.currentTimeMs ?? 0)}</span>
            <div className="h-1 flex-1 rounded-full bg-slate-300" />
            <span>{duration(active?.durationMs ?? current?.durationMs ?? 0)}</span>
          </div>
        </div>
        <div className="flex w-80 justify-end gap-7 text-slate-600">
          <span className="rounded border border-emerald-500 px-2 text-emerald-500">HQ</span>
          <span>词</span>
          <ListMusic className="h-6 w-6" />
        </div>
      </footer>
    </div>
  );
}

