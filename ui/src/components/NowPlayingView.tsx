import type { MediaCenterSnapshot } from "@tokimo/sdk";
import { ChevronDown, Heart, ListMusic, MessageCircle, MoreHorizontal, Pause, Play, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const currentMs = active?.currentTimeMs ?? 0;
  const timedLines = useMemo(() => parseLyric(lyric), [lyric]);
  const fallback = useMemo(
    () => ["如果只是一场梦", "那该有多好", "未だにあなたのことを夢にみる", "你依旧出现在我梦里"].map((text, index) => ({ text, timeMs: index * 4000 })),
    [],
  );
  const displayLines = timedLines.length > 0 ? timedLines : fallback;
  const activeIndex = useMemo(() => {
    if (displayLines.length === 0) return -1;
    if (timedLines.length === 0) return 1;
    let index = 0;
    for (let i = 0; i < displayLines.length; i += 1) {
      if (displayLines[i].timeMs <= currentMs + 180) index = i;
      else break;
    }
    return index;
  }, [currentMs, displayLines, timedLines.length]);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    lineRefs.current[activeIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  function handleClose() {
    setEntered(false);
    window.setTimeout(onClose, 220);
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-[#dcfbf8] text-slate-900"
      style={{
        transform: entered ? "translateY(0)" : "translateY(100%)",
        transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex h-16 items-center px-7">
        <button type="button" className="cursor-pointer rounded p-2 text-slate-600 hover:bg-black/5" onClick={handleClose}>
          <ChevronDown className="h-7 w-7" />
        </button>
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
          <div className="qq-scrollbar mt-8 h-[340px] overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-28 text-slate-500">
            {displayLines.map((line, index) => (
              <p
                key={`${line.timeMs}-${line.text}-${index}`}
                ref={(node) => {
                  lineRefs.current[index] = node;
                }}
                className={`py-2 text-2xl leading-relaxed transition-all duration-300 ${
                  index === activeIndex ? "scale-[1.08] font-semibold text-emerald-500" : "opacity-70"
                }`}
              >
                {line.text}
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

interface LyricLine {
  timeMs: number;
  text: string;
}

function parseLyric(value: string): LyricLine[] {
  const result: LyricLine[] = [];
  const timePattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of value.split("\n")) {
    const matches = Array.from(rawLine.matchAll(timePattern));
    const text = rawLine.replace(timePattern, "").trim();
    if (!text || matches.length === 0) continue;
    for (const match of matches) {
      const minutes = Number.parseInt(match[1], 10);
      const seconds = Number.parseInt(match[2], 10);
      const fraction = match[3] ?? "0";
      const ms = Number.parseInt(fraction.padEnd(3, "0").slice(0, 3), 10);
      result.push({ timeMs: minutes * 60_000 + seconds * 1000 + ms, text });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}
