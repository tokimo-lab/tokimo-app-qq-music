import type { MediaCenterSnapshot } from "@tokimo/sdk";
import { ChevronDown, Heart, ListMusic, MessageCircle, MoreHorizontal, Pause, Play, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { imageProxyUrl } from "../api/client";
import type { SongDto } from "../types/domain";
import { duration } from "./format";

interface NowPlayingViewProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  lyric: string;
  liked: boolean;
  onClose: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
  onToggleLike: () => void;
}

export function NowPlayingView({ snapshot, current, lyric, liked, onClose, onToggle, onPrev, onNext, onSeek, onToggleLike }: NowPlayingViewProps) {
  const active = snapshot?.providerId === "qq-music" ? snapshot : null;
  const isPlaying = active?.isPlaying ?? false;
  const currentMs = active?.currentTimeMs ?? 0;
  const totalMs = active?.durationMs ?? current?.durationMs ?? 0;
  const progressPercent = totalMs > 0 ? Math.min(100, Math.max(0, (currentMs / totalMs) * 100)) : 0;
  const timedLines = useMemo(() => parseLyric(lyric), [lyric]);
  const artworkUrl = useMemo(() => (current?.artworkUrl ? imageProxyUrl(current.artworkUrl) : undefined), [current?.artworkUrl]);
  const theme = useCoverTheme(artworkUrl);
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
  const lyricViewportRef = useRef<HTMLDivElement | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const suppressScrollUntilRef = useRef(0);
  const manualScrollUntilRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  const [entered, setEntered] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewLine = previewIndex === null ? null : displayLines[previewIndex];
  const showPreviewSeek = timedLines.length > 0 && previewIndex !== null && previewIndex !== activeIndex && !!previewLine;
  const highlightedIndex = previewIndex ?? activeIndex;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (previewIndex !== null) return;
    if (Date.now() < manualScrollUntilRef.current) return;
    scrollLineToCenter(activeIndex, "smooth");
  }, [activeIndex, previewIndex]);

  useEffect(() => {
    setPreviewIndex(null);
    manualScrollUntilRef.current = 0;
    suppressScrollUntilRef.current = Date.now() + 1600;
  }, [current?.songmid, lyric]);

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    };
  }, []);

  function handleClose() {
    setEntered(false);
    window.setTimeout(onClose, 220);
  }

  function seekFromClientX(target: HTMLDivElement, clientX: number) {
    if (totalMs <= 0) return;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * totalMs);
  }

  function handleProgressPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.currentTarget, event.clientX);
  }

  function handleProgressPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.buttons & 1) === 0) return;
    seekFromClientX(event.currentTarget, event.clientX);
  }

  function scrollLineToCenter(index: number, behavior: ScrollBehavior) {
    const node = lineRefs.current[index];
    if (!node) return;
    suppressScrollUntilRef.current = Date.now() + 1600;
    node.scrollIntoView({ block: "center", behavior });
  }

  function lockManualLyricScroll() {
    suppressScrollUntilRef.current = 0; manualScrollUntilRef.current = Date.now() + 3000;
  }

  function previewLineFromScroll() {
    const viewport = lyricViewportRef.current;
    if (!viewport || timedLines.length === 0) return;
    if (Date.now() < suppressScrollUntilRef.current) return;
    manualScrollUntilRef.current = Date.now() + 3000;

    const viewportRect = viewport.getBoundingClientRect();
    const center = viewportRect.top + viewportRect.height / 2;
    let nextIndex = activeIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < displayLines.length; index += 1) {
      const node = lineRefs.current[index];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextIndex = index;
      }
    }

    setPreviewIndex(nextIndex);
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = window.setTimeout(() => {
      setPreviewIndex(null);
      manualScrollUntilRef.current = 0;
      scrollLineToCenter(activeIndexRef.current, "smooth");
    }, 3000);
  }

  function seekFromPreview() {
    if (!previewLine) return;
    onSeek(previewLine.timeMs);
    setPreviewIndex(null);
    manualScrollUntilRef.current = 0;
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
  }

  useEffect(() => {
    const node = lyricViewportRef.current;
    if (!node) return;
    const onScroll = () => previewLineFromScroll(), onManual = () => lockManualLyricScroll();
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("wheel", onManual, { passive: true });
    node.addEventListener("pointerdown", onManual);
    node.addEventListener("touchstart", onManual, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll); node.removeEventListener("wheel", onManual);
      node.removeEventListener("pointerdown", onManual); node.removeEventListener("touchstart", onManual);
    };
  }, [activeIndex, displayLines, timedLines.length]);

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col overflow-hidden"
      style={{
        background: theme.background,
        color: theme.text,
        transform: entered ? "translateY(0)" : "translateY(100%)",
        transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {artworkUrl && (
        <div
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-10 blur-3xl"
          style={{ backgroundImage: `url("${artworkUrl}")` }}
        />
      )}
      <div className="flex h-16 items-center px-7">
        <button type="button" className="relative cursor-pointer rounded p-2 text-black/55 hover:bg-black/5" onClick={handleClose}>
          <ChevronDown className="h-7 w-7" />
        </button>
      </div>
      <main className="relative flex flex-1 items-center justify-center gap-28 px-16">
        <div
          className="relative aspect-square w-[390px] min-w-[300px] max-w-[36vw] rounded-[30px] bg-white/95 shadow-2xl"
          style={{ boxShadow: `0 30px 70px ${theme.shadow}` }}
        >
          <div className="absolute inset-[14%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95)_0_24%,rgba(255,255,255,0)_25%),repeating-radial-gradient(circle_at_center,rgba(255,255,255,0.98)_0_6px,rgba(230,230,230,0.65)_7px_9px)] shadow-[inset_0_0_18px_rgba(0,0,0,0.08),0_10px_32px_rgba(0,0,0,0.12)]">
            <div
              className="absolute inset-[18%] rounded-full border-[18px] border-slate-900 bg-white shadow-inner"
              style={{
                animation: isPlaying ? "qq-disc-spin 18s linear infinite" : "none",
              }}
            >
              {artworkUrl && <img src={artworkUrl} alt="" className="h-full w-full rounded-full object-cover" />}
            </div>
          </div>
          <div className="absolute top-9 right-12 h-[70%] w-3 origin-top rotate-6 rounded-full bg-gradient-to-b from-white via-slate-200 to-slate-400 shadow-[0_8px_18px_rgba(0,0,0,0.18)]" />
          <div className="absolute top-6 right-9 h-12 w-6 rounded-full bg-gradient-to-b from-slate-200 to-slate-500 shadow-md" />
          <div className="absolute right-[16%] bottom-[18%] h-8 w-8 rounded-full bg-white shadow-md" />
          <div className="absolute right-6 bottom-6 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold" style={{ color: theme.accent }}>
            Q
          </div>
        </div>
        <div className="w-[520px] text-center">
          <h1 className="text-[24px] leading-8 font-semibold text-black/90">{current?.title ?? "QQ音乐"}</h1>
          <div className="mt-2 text-[16px] leading-6 text-black/55">{current?.artist ?? "未播放"}</div>
          <div className="relative mt-9 h-[350px]">
            <div
              ref={lyricViewportRef}
              className="qq-scrollbar h-full overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-28 text-black/50"
              style={{
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
              }}
            >
              {displayLines.map((line, index) => {
                const nextLine = displayLines[index + 1];
                const lineEnd = nextLine?.timeMs ?? totalMs;
                const currentLineDuration = Math.max(1200, lineEnd - line.timeMs);
                const playbackProgress =
                  index === activeIndex && timedLines.length > 0 && (previewIndex === null || previewIndex === activeIndex)
                    ? Math.max(0, Math.min(1, (currentMs - line.timeMs) / currentLineDuration))
                    : 0;
                const lineProgress = previewIndex === index && previewIndex !== activeIndex ? 1 : playbackProgress;
                return (
                  <LyricRow
                    key={`${line.timeMs}-${line.text}-${index}`}
                    refSetter={(node) => {
                      lineRefs.current[index] = node;
                    }}
                    line={line}
                    active={index === highlightedIndex}
                    progress={lineProgress}
                    accent={theme.accent}
                  />
                );
              })}
            </div>
            {showPreviewSeek && (
              <button
                type="button"
                className="absolute top-1/2 left-0 z-20 flex h-10 -translate-y-1/2 cursor-pointer items-center gap-3 rounded-full px-1 text-[22px] leading-8 font-medium text-black/62 transition-opacity"
                onClick={seekFromPreview}
                aria-label={`从 ${lyricTime(previewLine.timeMs)} 开始播放`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white shadow-lg">
                  <Play className="h-4 w-4 translate-x-0.5 fill-current" />
                </span>
                <span className="tabular-nums">{lyricTime(previewLine.timeMs)}</span>
              </button>
            )}
          </div>
        </div>
      </main>
      <footer className="relative flex h-24 items-center px-12 text-black/80">
        <div className="flex w-80 items-center gap-4">
          <div className="min-w-0">
            <div className="truncate text-[15px] leading-5 font-medium">{current?.title ?? "未播放"}</div>
            <div className="truncate text-[13px] leading-5 text-black/50">{current?.artist ?? "QQ音乐"}</div>
          </div>
          <button type="button" className={`cursor-pointer ${liked ? "text-red-400" : "text-black/45 hover:text-red-400"}`} onClick={onToggleLike}>
            <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
          </button>
          <MessageCircle className="h-5 w-5 text-black/45" />
          <MoreHorizontal className="h-5 w-5 text-black/45" />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <div className="flex items-center gap-7">
            <Shuffle className="h-5 w-5 text-black/65" />
            <button type="button" className="cursor-pointer" onClick={onPrev}>
              <SkipBack className="h-[22px] w-[22px] fill-current" />
            </button>
            <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white" style={{ background: theme.accent }} onClick={onToggle}>
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-0.5 fill-current" />}
            </button>
            <button type="button" className="cursor-pointer" onClick={onNext}>
              <SkipForward className="h-[22px] w-[22px] fill-current" />
            </button>
            <Volume2 className="h-[22px] w-[22px] text-black/65" />
          </div>
          <div className="mt-3 flex w-full max-w-[520px] items-center gap-3 text-[12px] text-black/50">
            <span>{duration(currentMs)}</span>
            <div className="h-4 flex-1 cursor-pointer touch-none py-[6px]" onPointerDown={handleProgressPointerDown} onPointerMove={handleProgressPointerMove}>
              <div className="relative h-[3px] rounded-full bg-black/10">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPercent}%`, background: theme.accent }} />
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm"
                  style={{ left: `${progressPercent}%`, background: theme.accent }}
                />
              </div>
            </div>
            <span>{duration(totalMs)}</span>
          </div>
        </div>
        <div className="flex w-80 justify-end gap-6 text-black/60">
          <span className="rounded border px-2 text-[12px] leading-5" style={{ borderColor: theme.accent, color: theme.accent }}>
            HQ
          </span>
          <span className="text-[13px] leading-5">词</span>
          <ListMusic className="h-5 w-5" />
        </div>
      </footer>
    </div>
  );
}

interface LyricLine { timeMs: number; text: string }

interface LyricRowProps {
  line: LyricLine;
  active: boolean;
  progress: number;
  accent: string;
  refSetter: (node: HTMLParagraphElement | null) => void;
}

function LyricRow({ line, active, progress, accent, refSetter }: LyricRowProps) {
  const textClass = active ? "font-semibold text-black/70" : "font-medium text-black/42";
  const rowStyle = active ? ({ "--qq-lyric-accent": accent } as CSSProperties) : undefined;

  return (
    <div className="relative flex min-h-[48px] items-center justify-center">
      <p
        ref={refSetter}
        className={`relative max-w-full overflow-hidden px-24 py-1 text-center text-[22px] leading-[40px] tracking-normal transition-all duration-200 ${
          active ? "scale-[1.02]" : ""
        }`}
        style={rowStyle}
      >
        <span className="relative inline-block max-w-full">
          <span className={textClass}>{line.text}</span>
          {active && (
            <span className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-[var(--qq-lyric-accent)]" style={{ width: `${progress * 100}%` }}>
              <span className="font-semibold">{line.text}</span>
            </span>
          )}
        </span>
      </p>
    </div>
  );
}

function lyricTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
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

interface PlayerTheme { background: string; text: string; accent: string; shadow: string }

const DEFAULT_THEME: PlayerTheme = {
  background: "linear-gradient(135deg, #fff8df 0%, #ffe8d6 54%, #ffeadf 100%)",
  text: "rgb(21 18 14)",
  accent: "rgb(255 136 52)",
  shadow: "rgb(159 96 43 / 0.28)",
};

function useCoverTheme(artworkUrl?: string): PlayerTheme {
  const [theme, setTheme] = useState<PlayerTheme>(DEFAULT_THEME);

  useEffect(() => {
    if (!artworkUrl) {
      setTheme(DEFAULT_THEME);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => {
      try {
        const color = extractDominantColor(image);
        if (!cancelled) setTheme(themeFromRgb(color));
      } catch {
        if (!cancelled) setTheme(DEFAULT_THEME);
      }
    };
    image.onerror = () => {
      if (!cancelled) setTheme(DEFAULT_THEME);
    };
    image.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  return theme;
}

function extractDominantColor(image: HTMLImageElement): RgbColor {
  const canvas = document.createElement("canvas");
  const size = 36;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { r: 255, g: 136, b: 52 };
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalWeight = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.45) continue;
    const pixel: RgbColor = { r: data[index], g: data[index + 1], b: data[index + 2] };
    const hsl = rgbToHsl(pixel);
    if (hsl.l < 0.12 || hsl.l > 0.92) continue;
    const saturationWeight = 0.45 + hsl.s * 1.65;
    const midtoneWeight = 1 - Math.abs(hsl.l - 0.5);
    const weight = alpha * saturationWeight * midtoneWeight;
    red += pixel.r * weight;
    green += pixel.g * weight;
    blue += pixel.b * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return { r: 255, g: 136, b: 52 };
  return {
    r: Math.round(red / totalWeight),
    g: Math.round(green / totalWeight),
    b: Math.round(blue / totalWeight),
  };
}

interface RgbColor { r: number; g: number; b: number }

interface HslColor { h: number; s: number; l: number }

function themeFromRgb(color: RgbColor): PlayerTheme {
  const hsl = rgbToHsl(color);
  const accentS = clamp(hsl.s * 100 + 16, 48, 82);
  const accentL = clamp(hsl.l * 100 - 2, 42, 56);
  const bgS = clamp(hsl.s * 100 * 0.42 + 18, 18, 48);
  const bgL1 = 93;
  const bgL2 = 88;
  const accent = `hsl(${Math.round(hsl.h)} ${Math.round(accentS)}% ${Math.round(accentL)}%)`;
  return {
    background: `linear-gradient(135deg, hsl(${Math.round(hsl.h)} ${Math.round(bgS)}% ${bgL1}%) 0%, hsl(${Math.round(hsl.h)} ${Math.round(bgS + 8)}% ${bgL2}%) 58%, hsl(${Math.round((hsl.h + 18) % 360)} ${Math.round(bgS + 4)}% 91%) 100%)`,
    text: "rgb(21 18 14)",
    accent,
    shadow: `hsl(${Math.round(hsl.h)} ${Math.round(bgS + 20)}% 42% / 0.25)`,
  };
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 28, s: 0, l: lightness };

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: hue * 60, s: saturation, l: lightness };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
