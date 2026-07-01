import type { MediaCenterSnapshot, MediaTrack, RepeatMode } from "@tokimo/sdk";
import {
  Check,
  Heart,
  Link as LinkIcon,
  ListChecks,
  ListMusic,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../api/client";
import type { AudioQualitiesResp, AudioQualityDto, AudioQualityId, SongCommentsResp, SongDto } from "../types/domain";
import { duration, shortCount } from "./format";

type MenuKind = "mode" | "volume" | "quality" | "queue" | "comments" | null;

const qualityResponseCache = new Map<string, AudioQualitiesResp>();
const qualityRequestCache = new Map<string, Promise<AudioQualitiesResp>>();

export interface PlaybackMenusProps {
  snapshot: MediaCenterSnapshot | null;
  current: SongDto | null;
  liked: boolean;
  quality: AudioQualityId;
  openMenu: MenuKind;
  onOpenMenu: (menu: MenuKind) => void;
  onSetShuffle: (on: boolean) => void;
  onSetRepeat: (mode: RepeatMode) => void;
  onSetVolume: (volume: number) => void;
  onSetQuality: (quality: AudioQualityId) => void;
  onSkipToIndex: (index: number) => void;
  onSetQueue: (queue: MediaTrack[], startIndex?: number) => void;
  onClearQueue: () => void;
  onToggleLike: () => void;
  onToggle: () => void;
  modeButtonClass?: string;
  volumeButtonClass?: string;
  qualityButtonClass?: string;
  commentsButtonClass?: string;
  commentsPopoverClass?: string;
  commentsPopoverFrameClass?: string;
  commentsPopoverBodyClass?: string;
  queueButtonClass?: string;
  queuePopoverClass?: string;
  queuePopoverFrameClass?: string;
  queuePopoverBodyClass?: string;
  queueVariant?: "compact" | "full";
  preloadQuality?: boolean;
  iconClass?: string;
  qualityLabelClass?: string;
}

export function PlaybackModeControl(props: PlaybackMenusProps) {
  const active = props.snapshot?.providerId === "qq-music" ? props.snapshot : null;
  const label = active?.shuffle ? "随机播放" : active?.repeatMode === "one" ? "单曲循环" : active?.repeatMode === "all" ? "列表循环" : "顺序播放";
  const Icon = active?.shuffle ? Shuffle : active?.repeatMode === "one" ? Repeat1 : Repeat;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={props.modeButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenMenu(props.openMenu === "mode" ? null : "mode");
        }}
        aria-label={label}
      >
        <Icon className={props.iconClass} />
      </button>
      {props.openMenu === "mode" && (
        <Popover className="bottom-[calc(100%+14px)] left-1/2 w-[132px] -translate-x-1/2 bg-white p-2 text-[14px] text-neutral-900">
          <ModeItem
            icon={<Shuffle className="h-4 w-4" />}
            label="随机播放"
            active={!!active?.shuffle}
            onClick={() => {
              props.onSetShuffle(true);
              props.onSetRepeat("off");
            }}
          />
          <ModeItem
            icon={<Repeat className="h-4 w-4" />}
            label="顺序播放"
            active={!active?.shuffle && active?.repeatMode === "off"}
            onClick={() => {
              props.onSetShuffle(false);
              props.onSetRepeat("off");
            }}
          />
          <ModeItem
            icon={<Repeat1 className="h-4 w-4" />}
            label="单曲循环"
            active={!active?.shuffle && active?.repeatMode === "one"}
            onClick={() => {
              props.onSetShuffle(false);
              props.onSetRepeat("one");
            }}
          />
          <ModeItem
            icon={<Repeat className="h-4 w-4" />}
            label="列表循环"
            active={!active?.shuffle && active?.repeatMode === "all"}
            onClick={() => {
              props.onSetShuffle(false);
              props.onSetRepeat("all");
            }}
          />
        </Popover>
      )}
    </span>
  );
}

export function VolumeControl(props: PlaybackMenusProps) {
  const volume = props.snapshot?.volume ?? 1;
  const lastVolumeRef = useRef(volume > 0 ? volume : 0.6);
  useEffect(() => {
    if (volume > 0) lastVolumeRef.current = volume;
  }, [volume]);
  const Icon = volume <= 0 ? VolumeX : Volume2;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={props.volumeButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenMenu(props.openMenu === "volume" ? null : "volume");
        }}
        aria-label="音量"
      >
        <Icon className={props.iconClass} />
      </button>
      {props.openMenu === "volume" && (
        <Popover className="bottom-[calc(100%+16px)] left-1/2 flex h-[210px] w-[74px] -translate-x-1/2 flex-col items-center justify-center gap-4 px-4 py-5 text-neutral-900">
          <input
            aria-label="音量"
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            className="h-[112px] w-2 accent-[#3d8cff] [writing-mode:vertical-lr]"
            onChange={(event) => props.onSetVolume(Number(event.currentTarget.value) / 100)}
          />
          <div className="text-[18px] leading-none tabular-nums">{Math.round(volume * 100)}%</div>
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer items-center justify-center text-neutral-500 hover:text-neutral-900"
            onClick={(event) => {
              event.stopPropagation();
              props.onSetVolume(volume > 0 ? 0 : lastVolumeRef.current);
            }}
            aria-label={volume > 0 ? "静音" : "恢复音量"}
          >
            <Icon className="h-5 w-5" />
          </button>
        </Popover>
      )}
    </span>
  );
}

export function QualityControl(props: PlaybackMenusProps) {
  const [data, setData] = useState<AudioQualitiesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const qualityKey = props.current ? `${props.current.songmid}:${props.current.songId}:${props.current.mediaMid}:${props.quality}` : null;

  useEffect(() => {
    const shouldLoad = props.openMenu === "quality" || props.preloadQuality;
    if (!shouldLoad || !props.current || !qualityKey || loadedKey === qualityKey) return;
    const cached = qualityResponseCache.get(qualityKey);
    if (cached) {
      setData(cached);
      setLoadedKey(qualityKey);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    cachedQualities(qualityKey, props.current, props.quality)
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setLoadedKey(qualityKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoadedKey(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadedKey, props.current, props.openMenu, props.preloadQuality, props.quality, qualityKey]);

  const label = qualityShortLabel(props.quality);
  const qualities = loadedKey === qualityKey && data?.qualities ? data.qualities : fallbackQualities(props.quality, props.current);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={props.qualityButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenMenu(props.openMenu === "quality" ? null : "quality");
        }}
        aria-label="音质"
      >
        <span className={props.qualityLabelClass}>{label}</span>
      </button>
      {props.openMenu === "quality" && (
        <Popover className="right-[-96px] bottom-[calc(100%+16px)] w-[318px] bg-[#1f1f21] p-5 text-neutral-100">
          <div className="text-[15px] font-semibold text-[#e0bd66]">超级会员独家尊享</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-[#d6b768]">
            {["臻品母带", "臻品音质", "臻品全景声"].map((title) => (
              <div key={title} className="h-[96px] rounded-md bg-white/8 p-3">
                <div className="text-[13px] font-semibold">{title}</div>
                <div className="mt-2 text-[11px] text-[#bca770]">行业领先技术</div>
              </div>
            ))}
          </div>
          <div className="my-4 h-px bg-white/12" />
          <div className={loading && !data ? "space-y-1 opacity-95" : "space-y-1"}>
            {qualities.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                className={`flex h-11 w-full cursor-pointer items-center justify-between rounded-md px-1 text-left disabled:cursor-not-allowed disabled:opacity-35 ${
                  item.id === props.quality ? "text-white" : "text-neutral-300 hover:bg-white/6"
                }`}
                onClick={() => {
                  props.onSetQuality(item.id);
                  props.onOpenMenu(null);
                }}
              >
                <span>
                  {item.label}
                  {item.sizeBytes > 0 && <span className="ml-2 text-neutral-400">({formatBytes(item.sizeBytes)})</span>}
                </span>
                {item.id === props.quality && <Check className="h-5 w-5 text-[#3d8cff]" />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </span>
  );
}

function cachedQualities(key: string, current: SongDto, quality: AudioQualityId) {
  const cached = qualityResponseCache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = qualityRequestCache.get(key);
  if (pending) return pending;
  const request = api.qualities(current, quality).then((value) => {
    qualityResponseCache.set(key, value);
    return value;
  });
  qualityRequestCache.set(
    key,
    request.finally(() => {
      qualityRequestCache.delete(key);
    }),
  );
  return qualityRequestCache.get(key)!;
}

export function QueueControl(props: PlaybackMenusProps) {
  const active = props.snapshot?.providerId === "qq-music" ? props.snapshot : null;
  const queue = active?.queue ?? [];
  const currentIndex = active?.currentIndex ?? -1;
  const isPlaying = active?.isPlaying ?? false;
  const queueOpen = props.openMenu === "queue";
  const drawer = useDrawerPresence(queueOpen);
  const full = props.queueVariant === "full";
  const positionClass = props.queuePopoverClass ?? "right-[-12px] bottom-[calc(100%+16px)]";
  const frameClass = props.queuePopoverFrameClass ?? "h-[470px] w-[440px]";
  const bodyClass = props.queuePopoverBodyClass ?? "p-5";
  const queueViewportRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!queueOpen || currentIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      const viewport = queueViewportRef.current;
      const row = currentRowRef.current;
      if (!viewport || !row) return;
      const rowHeight = row.getBoundingClientRect().height || (full ? 58 : 64);
      const rowTopInViewportContent = row.offsetTop - viewport.offsetTop;
      viewport.scrollTop = Math.max(0, rowTopInViewportContent - rowHeight * 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [queueOpen, currentIndex, full]);

  function remove(index: number) {
    const next = queue.filter((_, itemIndex) => itemIndex !== index);
    if (next.length === 0) {
      props.onClearQueue();
      props.onOpenMenu(null);
      return;
    }
    const nextIndex = index < currentIndex ? currentIndex - 1 : Math.min(currentIndex, next.length - 1);
    props.onSetQueue(next, nextIndex);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={props.queueButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenMenu(queueOpen ? null : "queue");
        }}
        aria-label="播放队列"
      >
        <ListMusic className={props.iconClass} />
      </button>
      {drawer.mounted && (
        <Popover className={`qq-side-drawer ${drawer.className} ${positionClass} ${frameClass} ${bodyClass} flex flex-col bg-[#242426] text-neutral-100`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[20px] font-semibold">播放队列</div>
              <div className={full ? "mt-7 text-[14px] text-neutral-500" : "mt-4 text-sm text-neutral-500"}>共{queue.length}首歌曲</div>
            </div>
            <div className="flex items-center gap-6 text-neutral-400">
              {full && (
                <button type="button" className="cursor-pointer hover:text-neutral-100" aria-label="队列选项">
                  <ListChecks className="h-6 w-6" />
                </button>
              )}
              <button
                type="button"
                className="cursor-pointer hover:text-red-300"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onClearQueue();
                }}
                aria-label="清空队列"
              >
                <Trash2 className="h-6 w-6" />
              </button>
            </div>
          </div>
          <div ref={queueViewportRef} className={`qq-scrollbar min-h-0 flex-1 overflow-y-auto ${full ? "mt-4 pr-0" : "mt-4 pr-2"}`}>
            {queue.map((track, index) => {
              const song = songFromTrack(track);
              const current = index === currentIndex;
              const OverlayIcon = current && isPlaying ? Pause : Play;
              return (
                <div
                  ref={current ? currentRowRef : undefined}
                  key={`${track.id}-${index}`}
                  className={`group flex items-center rounded-[4px] ${full ? "h-[58px] gap-3 px-2" : "h-[64px] gap-3 px-3"} ${
                    current ? (full ? "bg-[#444446]" : "bg-white/12") : full && index % 2 === 0 ? "bg-white/[0.025] hover:bg-white/[0.05]" : "hover:bg-white/6"
                  }`}
                >
                  <div className={`relative shrink-0 overflow-hidden rounded ${full ? "h-[42px] w-[42px]" : "h-10 w-10"}`}>
                    {track.artworkUrl ? <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-white/10" />}
                    <button
                      type="button"
                      className={`absolute inset-0 flex cursor-pointer items-center justify-center bg-black/45 text-white transition-opacity ${
                        current ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (current) props.onToggle();
                        else props.onSkipToIndex(index);
                      }}
                      aria-label={current ? (isPlaying ? "暂停" : "播放") : `播放 ${track.title}`}
                    >
                      <OverlayIcon className={`h-5 w-5 ${current && isPlaying ? "" : "translate-x-0.5 fill-current"}`} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onSkipToIndex(index);
                    }}
                  >
                    <div className={`flex min-w-0 items-center gap-2 ${full ? "text-[14px]" : "text-[15px]"} ${current ? (full ? "text-[#00d46a]" : "text-[#3d8cff]") : "text-neutral-100"}`}>
                      <span className="truncate">{track.title}</span>
                      {full && <QueueBadges current={current} />}
                    </div>
                    <div className={`truncate ${full ? "mt-1 text-[12px]" : "text-sm"} ${current ? (full ? "text-[#00d46a]" : "text-[#3d8cff]") : "text-neutral-500"}`}>
                      {track.artist || song?.artist || "QQ音乐"}
                    </div>
                  </button>
                  {current && (
                    <div className={`flex items-center ${full ? "gap-4 pr-2 text-neutral-300" : ""}`}>
                      <Heart className={`h-5 w-5 ${props.liked ? "fill-current text-[#ff6c6c]" : "text-neutral-500"}`} />
                      {full && (
                        <>
                          <LinkIcon className="h-5 w-5" />
                          <MoreHorizontal className="h-5 w-5" />
                        </>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`${full ? "hidden" : "hidden group-hover:block"} cursor-pointer text-neutral-500 hover:text-red-300`}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(index);
                    }}
                    aria-label="移出队列"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
          </div>
        </Popover>
      )}
    </span>
  );
}

function QueueBadges({ current }: { current: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-[5px]">
      {!current && <span className="rounded-[3px] border border-[#00d46a] px-[3px] text-[10px] leading-[13px] font-semibold text-[#00d46a]">VIP</span>}
      <span className="rounded-[3px] border border-[#b98b2a] px-[3px] text-[10px] leading-[13px] font-semibold text-[#d2a23a]">臻品母带</span>
      <span className="flex h-[15px] w-[22px] items-center justify-center rounded-[3px] border border-neutral-500/80 text-neutral-400">
        <Play className="h-3 w-3 fill-current" />
      </span>
    </span>
  );
}

export function CommentsControl(props: PlaybackMenusProps) {
  const [data, setData] = useState<SongCommentsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const commentsOpen = props.openMenu === "comments";
  const drawer = useDrawerPresence(commentsOpen);

  useEffect(() => {
    if (!commentsOpen || !props.current?.songId) return;
    let cancelled = false;
    setLoading(true);
    api
      .comments(props.current, 0, 20)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.current?.songId, commentsOpen]);

  const hotComments = data?.hotComments ?? [];
  const recentHotComments = data?.comments ?? [];
  const hasComments = hotComments.length > 0 || recentHotComments.length > 0;
  const positionClass = props.commentsPopoverClass ?? "right-[-138px] bottom-[calc(100%+16px)]";
  const frameClass = props.commentsPopoverFrameClass ?? "h-[510px] w-[470px]";
  const bodyClass = props.commentsPopoverBodyClass ?? "p-5";
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={props.commentsButtonClass}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenMenu(commentsOpen ? null : "comments");
        }}
        aria-label="评论"
      >
        <MessageCircle className={props.iconClass} />
        {data?.total ? <span className="absolute -top-2 left-4 text-[10px] text-[#3d8cff]">{shortCount(data.total)}</span> : null}
      </button>
      {drawer.mounted && (
        <Popover className={`qq-side-drawer ${drawer.className} ${positionClass} ${frameClass} ${bodyClass} flex flex-col bg-[#242426] text-neutral-100`}>
          <div className="flex items-center gap-4">
            {props.current?.artworkUrl ? <img src={props.current.artworkUrl} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-white/10" />}
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold">{props.current?.title ?? "QQ音乐"}</div>
              <div className="truncate text-sm text-neutral-500">{props.current?.artist ?? ""}</div>
            </div>
          </div>
          <div className="mt-7 flex items-center gap-14 text-[17px] font-medium">
            <span className="border-b-[3px] border-[#3d8cff] pb-3 text-[#3d8cff]">评论{data?.total ? shortCount(data.total) : ""}</span>
            <span className="pb-3 text-neutral-300">推荐</span>
            <span className="pb-3 text-neutral-300">详情</span>
          </div>
          <div className="qq-scrollbar min-h-0 flex-1 overflow-y-auto pr-2">
            {loading ? (
              <div className="py-12 text-center text-sm text-neutral-500">加载评论中</div>
            ) : !hasComments ? (
              <div className="py-12 text-center text-sm text-neutral-500">暂无评论</div>
            ) : (
              <>
                {hotComments.length > 0 && (
                  <>
                    <div className="pt-6 pb-1 text-[17px] font-semibold text-neutral-100">音乐人说</div>
                    {hotComments.map((comment, index) => (
                      <CommentRow key={`hot-${comment.id}-${index}`} comment={comment} />
                    ))}
                  </>
                )}
                {recentHotComments.length > 0 && (
                  <>
                    <div className="pt-6 pb-1 text-[17px] font-semibold text-neutral-100">近期热评</div>
                    {recentHotComments.map((comment, index) => (
                      <CommentRow key={`recent-${comment.id}-${index}`} comment={comment} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          <div className="mt-3 flex h-10 items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center rounded-full bg-white/8 px-4 text-sm text-neutral-500">期待你的神评论</div>
            <button type="button" disabled className="h-10 rounded-full bg-[#3d8cff] px-5 text-sm text-white opacity-60">
              发布
            </button>
          </div>
        </Popover>
      )}
    </span>
  );
}

function Popover({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`absolute z-[1000] rounded-[10px] shadow-[0_14px_36px_rgba(0,0,0,0.28)] ${className}`} onClick={(event: MouseEvent) => event.stopPropagation()}>
      {children}
    </div>
  );
}

function useDrawerPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return {
    mounted,
    className: open ? "qq-side-drawer--open" : "qq-side-drawer--closed",
  };
}

function ModeItem({ icon, label, active: _active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left text-neutral-900 hover:bg-black/5" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function CommentRow({ comment }: { comment: SongCommentsResp["hotComments"][number] }) {
  return (
    <div className="py-5">
      <div className="flex gap-3">
        {comment.avatarUrl ? <img src={comment.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="h-9 w-9 rounded-full bg-white/10" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="text-neutral-400">{comment.nick}</span>
            {comment.vipIcon && <img src={comment.vipIcon} alt="" className="h-4" />}
            <span>{formatDate(comment.publishedAt)}</span>
            {comment.location && <span>来自{comment.location}</span>}
          </div>
          <div className="mt-3 text-[16px] leading-7 text-neutral-100">{cleanComment(comment.content)}</div>
          <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
            <Heart className="h-4 w-4" />
            <span>{shortCount(comment.likeCount)}</span>
            {comment.replies.length > 0 && <span>回复</span>}
          </div>
          {comment.replies.slice(0, 1).map((reply) => (
            <div key={reply.id} className="mt-4 rounded-md bg-white/6 px-4 py-3 text-sm text-neutral-200">
              <span className="text-[#3d8cff]">{reply.nick}</span>：{cleanComment(reply.content)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function songFromTrack(track: MediaTrack): SongDto | null {
  const value = track.meta?.song;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.songmid === "string" && typeof record.title === "string" ? (value as SongDto) : null;
}

function qualityShortLabel(quality: AudioQualityId): string {
  if (quality === "master") return "臻品";
  if (quality === "sq") return "SQ";
  if (quality === "hq") return "HQ";
  return "标准";
}

function fallbackQualities(selected: AudioQualityId, song: SongDto | null): AudioQualityDto[] {
  return [
    { id: "master", label: "臻品母带", detail: "Hi-Res", sizeBytes: song?.sizeMaster ?? 0, available: false, selected: selected === "master", requiresLogin: true },
    { id: "sq", label: "SQ无损品质", detail: "FLAC", sizeBytes: song?.sizeFlac ?? 0, available: false, selected: selected === "sq", requiresLogin: true },
    { id: "hq", label: "HQ高品质", detail: "320K MP3", sizeBytes: song?.size320Mp3 ?? 0, available: false, selected: selected === "hq", requiresLogin: true },
    { id: "standard", label: "标准品质", detail: "128K MP3", sizeBytes: song?.size128Mp3 ?? 0, available: true, selected: selected === "standard", requiresLogin: false },
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${(value / 1024 / 1024).toFixed(1)}M`;
}

function formatDate(value: number): string {
  if (!value) return "";
  const date = new Date(value * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function cleanComment(value: string): string {
  return value.replace(/\[em\].*?\[\/em\]/g, " ").replace(/\s+/g, " ").trim();
}
