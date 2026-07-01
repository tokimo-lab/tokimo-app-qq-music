import type { MediaCenterSnapshot, MediaTrack, RepeatMode } from "@tokimo/sdk";
import {
  ChevronDown,
  Heart,
  MoreHorizontal,
  Pause,
  Play,
  Shirt,
  SkipBack,
  SkipForward,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { imageProxyUrl } from "../api/client";
import type { AudioQualityId, LyricsResp, SongDto } from "../types/domain";
import { duration } from "./format";
import { CommentsControl, PlaybackModeControl, QualityControl, QueueControl, VolumeControl } from "./PlaybackMenus";

interface NowPlayingViewProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  lyrics: LyricsResp | null;
  liked: boolean;
  onClose: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
  onToggleLike: () => void;
  quality: AudioQualityId;
  onSetShuffle: (on: boolean) => void;
  onSetRepeat: (mode: RepeatMode) => void;
  onSetVolume: (volume: number) => void;
  onSetQuality: (quality: AudioQualityId) => void;
  onSkipToIndex: (index: number) => void;
  onSetQueue: (queue: MediaTrack[], startIndex?: number) => void;
  onClearQueue: () => void;
  onLargeOverlayChange?: (open: boolean) => void;
}

export function NowPlayingView({
  snapshot,
  current,
  lyrics,
  liked,
  onClose,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onToggleLike,
  quality,
  onSetShuffle,
  onSetRepeat,
  onSetVolume,
  onSetQuality,
  onSkipToIndex,
  onSetQueue,
  onClearQueue,
  onLargeOverlayChange,
}: NowPlayingViewProps) {
  const active = snapshot?.providerId === "qq-music" ? snapshot : null;
  const isPlaying = active?.isPlaying ?? false;
  const reportedCurrentMs = active?.currentTimeMs ?? 0;
  const totalMs = active?.durationMs ?? current?.durationMs ?? 0;
  const currentMs = useSmoothPlaybackTime(reportedCurrentMs, isPlaying, totalMs, current?.songmid);
  const progressPercent = totalMs > 0 ? Math.min(100, Math.max(0, (currentMs / totalMs) * 100)) : 0;
  const timedLines = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
  const artworkUrl = current?.artworkUrl;
  const themeArtworkUrl = useMemo(() => (current?.artworkUrl ? imageProxyUrl(current.artworkUrl) : undefined), [current?.artworkUrl]);
  const theme = useCoverTheme(themeArtworkUrl, artworkUrl);
  const fallback = useMemo(
    () =>
      ["如果只是一场梦", "那该有多好", "未だにあなたのことを夢にみる", "你依旧出现在我梦里"].map((text, index) => ({
        text,
        timeMs: index * 4000,
        endMs: (index + 1) * 4000,
        words: [],
      })),
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
  const [openMenu, setOpenMenu] = useState<"mode" | "volume" | "quality" | "queue" | "comments" | null>(null);
  const previewLine = previewIndex === null ? null : displayLines[previewIndex];
  const showPreviewSeek = timedLines.length > 0 && previewIndex !== null && previewIndex !== activeIndex && !!previewLine;
  const highlightedIndex = previewIndex ?? activeIndex;
  const visibleLyricStart = Math.max(0, highlightedIndex - 1);
  const visibleLyricLines = displayLines.slice(visibleLyricStart, visibleLyricStart + 8);
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
    iconClass: "h-[24px] w-[24px]",
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const largeOverlayOpen = openMenu === "queue" || openMenu === "comments";
    onLargeOverlayChange?.(largeOverlayOpen);
    return () => onLargeOverlayChange?.(false);
  }, [openMenu, onLargeOverlayChange]);

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
  }, [current?.songmid, lyrics]);

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
      className="absolute inset-0 z-40 overflow-hidden rounded-[inherit]"
      style={{
        background: theme.background,
        color: QQ_TEXT,
        transform: entered ? "translateY(0)" : "translateY(100%)",
        transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {artworkUrl && (
        <div
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-[0.12] blur-3xl"
          style={{ backgroundImage: `url("${artworkUrl}")` }}
        />
      )}

      <button
        type="button"
        className="absolute left-[24px] top-[27px] z-30 flex h-10 w-10 cursor-pointer items-center justify-center text-[#66645d] transition-colors hover:text-[#33312d]"
        onClick={handleClose}
        aria-label="收起播放页"
      >
        <ChevronDown className="h-[25px] w-[25px] stroke-[1.75]" />
      </button>

      <main className="absolute inset-0">
        <div className="absolute left-[206px] top-[198px] h-[258px] w-[278px] rounded-[30px] bg-white/92" style={{ boxShadow: `32px 34px 54px ${theme.shadow}` }}>
          <div className="absolute left-[26px] top-[25px] h-[218px] w-[218px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55)_0_17%,rgba(255,255,255,0)_18%),radial-gradient(circle_at_43%_42%,rgba(246,248,248,0.62)_0_32%,rgba(255,255,255,0)_48%),conic-gradient(from_42deg,rgba(142,151,159,0.48),rgba(226,231,233,0.54),rgba(152,162,170,0.50),rgba(222,227,230,0.52),rgba(142,151,159,0.48)),repeating-radial-gradient(circle_at_center,rgba(114,125,134,0.14)_0_1px,rgba(251,251,249,0.16)_2px_5px)] shadow-[inset_0_0_18px_rgba(0,0,0,0.08),0_12px_28px_rgba(0,0,0,0.14)]">
            <div
              className="qq-disc-rotor absolute left-[44px] top-[44px] h-[130px] w-[130px] overflow-hidden rounded-full border-[18px] border-[#4c3b31] bg-[#4c3b31] shadow-[0_6px_15px_rgba(0,0,0,0.26)]"
              style={{
                animationPlayState: isPlaying ? "running" : "paused",
              }}
            >
              {artworkUrl && <img src={artworkUrl} alt="" className="h-full w-full rounded-full object-cover" />}
              <div className="absolute inset-[40%] rounded-full bg-[#2f271f]" />
            </div>
          </div>
          <div className="absolute left-[233px] top-[-11px] h-[35px] w-[18px] rounded-[4px] bg-gradient-to-b from-[#8f9294] via-[#e9e9e9] to-[#747677] shadow-[0_3px_5px_rgba(0,0,0,0.24)]" />
          <div className="absolute left-[242px] top-[18px] h-[190px] w-[6px] origin-top rotate-[1.5deg] rounded-full bg-gradient-to-b from-[#f8f8f8] via-[#b7bab8] to-[#6f706d] shadow-[5px_3px_8px_rgba(0,0,0,0.20)]" />
          <div className="absolute left-[224px] top-[25px] flex h-[40px] w-[40px] items-center justify-center rounded-full bg-white/80 shadow-[0_4px_10px_rgba(0,0,0,0.16)]">
            <div className="h-[18px] w-[18px] rounded-full bg-white shadow-inner" />
          </div>
          <div className="absolute left-[218px] top-[190px] h-[21px] w-[21px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.18)]" />
          <div className="absolute right-[12px] bottom-[16px] flex h-[24px] w-[24px] items-center justify-center rounded-full bg-white text-[12px] font-bold" style={{ color: QQ_GREEN }}>
            Q
          </div>
        </div>

        <div className="absolute left-[560px] top-[160px] w-[380px] text-center">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-[18px] leading-[23px] font-semibold text-black/92">{current?.title ?? "QQ音乐"}</h1>
            <span className="rounded-[5px] border-2 px-[7px] text-[12px] leading-[16px] font-semibold" style={{ borderColor: QQ_GREEN, color: QQ_GREEN }}>
              VIP
            </span>
          </div>
          <div className="mt-[5px] text-[16px] leading-[23px] text-black/50">{current?.artist ?? "未播放"}</div>
        </div>

        <div className="absolute left-[572px] top-[214px] h-[292px] w-[390px]">
            <div
              ref={lyricViewportRef}
              className="qq-scrollbar qq-lyrics-viewport h-full overflow-hidden text-black/50"
              style={{
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 84%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, transparent 0%, black 10%, black 84%, transparent 100%)",
              }}
            >
              {visibleLyricLines.map((line, visibleIndex) => {
                const index = visibleLyricStart + visibleIndex;
                const nextLine = displayLines[index + 1];
                const lineEnd = line.endMs > line.timeMs ? line.endMs : (nextLine?.timeMs ?? totalMs);
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
                    currentMs={currentMs}
                    accent={QQ_BLUE}
                    top={visibleIndex * 34}
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

        <button type="button" className="absolute right-[31px] top-[563px] flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[7px] border-2 border-[#77716a] text-[15px] leading-none text-[#77716a]">
          伴
        </button>
      </main>

      <footer className="absolute inset-x-0 bottom-0 h-[116px] text-black/80">
        <div className="absolute left-[75px] top-[50px] flex items-center gap-2">
          <div className="min-w-0 text-[14px] leading-[18px] font-medium">
            <span>{current?.title ?? "未播放"}</span>
            <span className="mx-1 text-black/40">-</span>
            <span className="text-black/50">{current?.artist ?? "QQ音乐"}</span>
          </div>
          <span className="rounded-[4px] border px-[6px] text-[10px] leading-[13px] font-semibold" style={{ borderColor: QQ_GREEN, color: QQ_GREEN }}>
            VIP
          </span>
        </div>

        <button
          type="button"
          className="absolute left-[20px] top-[58px] flex h-[38px] w-[38px] cursor-pointer items-center justify-center text-[#6d6b62] transition-colors hover:text-[#33312d]"
          onClick={handleClose}
          aria-label="收起播放页"
        >
          <svg className="h-[38px] w-[38px]" viewBox="0 0 38 38" fill="none" aria-hidden="true">
            <path d="M22 8v8h8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 24h8v8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={`absolute left-[76px] top-[77px] cursor-pointer ${liked ? "text-[#ff6c6c]" : "text-black/42 hover:text-[#ff6c6c]"}`} onClick={onToggleLike}>
          <Heart className={`h-[24px] w-[24px] ${liked ? "fill-current" : ""}`} />
        </button>
        <div className="absolute left-[119px] top-[78px]">
          <CommentsControl
            {...menuProps}
            commentsButtonClass="relative cursor-pointer text-black/45 hover:text-[#3d8cff]"
            commentsPopoverClass="left-[420px] bottom-[46px]"
            commentsPopoverFrameClass="h-[597px] w-[470px]"
            commentsPopoverBodyClass="p-5"
            iconClass="h-[24px] w-[24px]"
          />
        </div>
        <MoreHorizontal className="absolute left-[167px] top-[80px] h-[24px] w-[24px] text-black/45" />

        <div className="absolute left-[398px] top-[42px] flex h-[42px] w-[254px] items-center justify-center gap-[25px]">
          <PlaybackModeControl {...menuProps} modeButtonClass="cursor-pointer text-black/82 hover:text-black" iconClass="h-[20px] w-[20px]" />
          <button type="button" className="cursor-pointer" onClick={onPrev}>
            <SkipBack className="h-[24px] w-[24px] fill-current text-black/90" />
          </button>
          <button type="button" className="flex h-[40px] w-[40px] cursor-pointer items-center justify-center rounded-full text-white" style={{ background: QQ_BLUE }} onClick={onToggle}>
            {isPlaying ? <Pause className="h-[19px] w-[19px] fill-current" /> : <Play className="h-[21px] w-[21px] translate-x-0.5 fill-current" />}
          </button>
          <button type="button" className="cursor-pointer" onClick={onNext}>
            <SkipForward className="h-[24px] w-[24px] fill-current text-black/90" />
          </button>
          <VolumeControl {...menuProps} volumeButtonClass="cursor-pointer text-black/78 hover:text-black" iconClass="h-[24px] w-[24px]" />
        </div>

        <div className="absolute left-[362px] top-[87px] flex items-center gap-[10px] text-[12px] leading-[18px] text-black/50">
          <span className="w-[26px] text-right tabular-nums">{duration(currentMs)}</span>
          <div className="h-4 w-[254px] cursor-pointer touch-none py-[6px]" onPointerDown={handleProgressPointerDown} onPointerMove={handleProgressPointerMove}>
            <div className="relative h-[3px] rounded-full bg-black/10">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPercent}%`, background: QQ_PROGRESS }} />
              <div
                className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${progressPercent}%`, background: QQ_PROGRESS }}
              />
            </div>
          </div>
          <span className="w-[26px] tabular-nums">{duration(totalMs)}</span>
        </div>

        <div className="absolute right-[20px] top-[72px] flex items-center gap-[25px] text-black/60">
          <Shirt className="h-[23px] w-[23px]" />
          <QualityControl
            {...menuProps}
            qualityButtonClass="cursor-pointer rounded-[5px] border-2 border-[#3d8cff] px-[9px] text-[12px] leading-[18px] text-[#3d8cff]"
            qualityLabelClass=""
            preloadQuality
          />
          <Waves className="h-[26px] w-[26px]" />
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] border-2 border-black/42 text-[15px] leading-none">词</span>
          <QueueControl
            {...menuProps}
            queueButtonClass="cursor-pointer text-black/60 hover:text-[#3d8cff]"
            queuePopoverClass="left-[-423px] bottom-[46px]"
            queuePopoverFrameClass="h-[597px] w-[448px]"
            queuePopoverBodyClass="px-5 pt-8 pb-0"
            queueVariant="full"
            iconClass="h-[26px] w-[26px]"
          />
        </div>
      </footer>
    </div>
  );
}

interface TimedLyricWord {
  startMs: number;
  endMs: number;
  text: string;
}

interface LyricLine {
  timeMs: number;
  endMs: number;
  text: string;
  words: TimedLyricWord[];
}

function useSmoothPlaybackTime(reportedMs: number, isPlaying: boolean, totalMs: number, resetKey?: string) {
  const [smoothMs, setSmoothMs] = useState(reportedMs);
  const anchorRef = useRef({ reportedMs, timestamp: 0 });

  useEffect(() => {
    anchorRef.current = { reportedMs, timestamp: performance.now() };
    setSmoothMs(reportedMs);
  }, [reportedMs, resetKey]);

  useEffect(() => {
    if (!isPlaying) {
      setSmoothMs(reportedMs);
      return;
    }

    let frame = 0;
    const tick = (now: number) => {
      const anchor = anchorRef.current;
      const elapsedMs = now - anchor.timestamp;
      const nextMs = totalMs > 0 ? Math.min(totalMs, anchor.reportedMs + elapsedMs) : anchor.reportedMs + elapsedMs;
      setSmoothMs(nextMs);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, reportedMs, totalMs]);

  return smoothMs;
}

interface LyricRowProps {
  line: LyricLine;
  active: boolean;
  progress: number;
  currentMs: number;
  accent: string;
  top: number;
  refSetter: (node: HTMLParagraphElement | null) => void;
}

function LyricRow({ line, active, progress, currentMs, accent, top, refSetter }: LyricRowProps) {
  const textClass = active ? "font-semibold text-black/68" : "font-medium text-black/44";
  const rowStyle = active ? ({ "--qq-lyric-accent": accent } as CSSProperties) : undefined;
  const hasWordTiming = active && line.words.length > 0;

  return (
    <div className="absolute left-0 flex h-[34px] w-full items-center justify-center" style={{ top }}>
      <p
        ref={refSetter}
        className="relative max-w-full overflow-hidden whitespace-nowrap text-center text-[18px] leading-[34px] tracking-normal transition-colors duration-150"
        style={rowStyle}
      >
        <span className="relative inline-block max-w-full">
          {hasWordTiming ? (
            <span className={textClass}>
              {line.words.map((word, index) => (
                <LyricWord key={`${word.startMs}-${word.endMs}-${index}`} word={word} progress={wordProgress(word, currentMs)} />
              ))}
            </span>
          ) : (
            <span className={textClass}>{line.text}</span>
          )}
          {active && !hasWordTiming && (
            <span className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-[var(--qq-lyric-accent)]" style={{ width: `${progress * 100}%` }}>
              <span className="font-semibold">{line.text}</span>
            </span>
          )}
        </span>
      </p>
    </div>
  );
}

function LyricWord({ word, progress }: { word: TimedLyricWord; progress: number }) {
  return (
    <span className="relative inline-block whitespace-pre">
      <span>{word.text}</span>
      <span className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden whitespace-pre text-[var(--qq-lyric-accent)]" style={{ width: `${progress * 100}%` }}>
        <span className="font-semibold">{word.text}</span>
      </span>
    </span>
  );
}

function wordProgress(word: TimedLyricWord, currentMs: number): number {
  if (currentMs <= word.startMs) return 0;
  if (currentMs >= word.endMs) return 1;
  const durationMs = Math.max(1, word.endMs - word.startMs);
  return Math.max(0, Math.min(1, (currentMs - word.startMs) / durationMs));
}

function lyricTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--";
  const total = Math.round(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function normalizeLyrics(lyrics: LyricsResp | null): LyricLine[] {
  if (!lyrics) return [];
  if (lyrics.lines.length > 0) {
    return lyrics.lines
      .filter((line) => line.text.trim())
      .map((line) => ({
        timeMs: line.startMs,
        endMs: line.endMs,
        text: line.text,
        words: line.words.map((word) => ({
          startMs: word.startMs,
          endMs: word.endMs,
          text: word.text,
        })),
      }))
      .sort((a, b) => a.timeMs - b.timeMs);
  }
  return parseLyric(lyrics.lyric);
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
      const timeMs = minutes * 60_000 + seconds * 1000 + ms;
      result.push({ timeMs, endMs: timeMs, text, words: [] });
    }
  }
  result.sort((a, b) => a.timeMs - b.timeMs);
  for (let index = 0; index < result.length; index += 1) {
    result[index].endMs = result[index + 1]?.timeMs ?? result[index].timeMs;
  }
  return result;
}

const QQ_BLUE = "#3d8cff";
const QQ_GREEN = "#8ccf22";
const QQ_PROGRESS = "#11110f";
const QQ_TEXT = "rgb(21 18 14)";

interface PlayerTheme {
  background: string;
  shadow: string;
}

const DEFAULT_THEME: PlayerTheme = {
  background: "linear-gradient(112deg, #fffbdc 0%, #fff9df 30%, #fff2dc 57%, #ffecdf 100%)",
  shadow: "rgba(132,120,70,0.16)",
};

function useCoverTheme(artworkUrl?: string, fallbackArtworkUrl?: string): PlayerTheme {
  const [theme, setTheme] = useState<PlayerTheme>(DEFAULT_THEME);

  useEffect(() => {
    if (!artworkUrl) {
      setTheme(DEFAULT_THEME);
      return;
    }

    let cancelled = false;
    let triedFallback = false;
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
      if (!triedFallback && fallbackArtworkUrl && fallbackArtworkUrl !== artworkUrl) {
        triedFallback = true;
        image.src = fallbackArtworkUrl;
        return;
      }
      if (!cancelled) setTheme(DEFAULT_THEME);
    };
    image.src = artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [artworkUrl, fallbackArtworkUrl]);

  return theme;
}

function extractDominantColor(image: HTMLImageElement): RgbColor {
  const canvas = document.createElement("canvas");
  const size = 36;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { r: 246, g: 238, b: 199 };
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
    if (hsl.l < 0.16 || hsl.l > 0.9) continue;
    const saturationWeight = 0.4 + hsl.s * 1.4;
    const midtoneWeight = 1 - Math.abs(hsl.l - 0.52);
    const weight = alpha * saturationWeight * midtoneWeight;
    red += pixel.r * weight;
    green += pixel.g * weight;
    blue += pixel.b * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return { r: 246, g: 238, b: 199 };
  return {
    r: Math.round(red / totalWeight),
    g: Math.round(green / totalWeight),
    b: Math.round(blue / totalWeight),
  };
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

function themeFromRgb(color: RgbColor): PlayerTheme {
  const hsl = rgbToHsl(color);
  const bgS = clamp(hsl.s * 100 * 0.66 + 24, 28, 58);
  const hue = Math.round(hsl.h);
  const yellowHue = Math.round((hsl.h + 336) % 360);
  const warmHue = Math.round((hsl.h + 150) % 360);

  return {
    background: [
      `radial-gradient(circle at 34% 57%, hsl(${hue} ${Math.round(bgS + 18)}% 88% / 0.84) 0%, transparent 34%)`,
      `radial-gradient(circle at 80% 42%, hsl(${warmHue} ${Math.round(bgS + 4)}% 91% / 0.62) 0%, transparent 42%)`,
      `linear-gradient(112deg, hsl(${yellowHue} ${Math.round(bgS + 4)}% 94%) 0%, hsl(${hue} ${Math.round(bgS)}% 93%) 38%, hsl(${warmHue} ${Math.round(bgS)}% 92%) 100%)`,
    ].join(", "),
    shadow: `hsl(${hue} ${Math.round(bgS + 12)}% 44% / 0.2)`,
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
