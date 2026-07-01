import { Heart, Pause, Play } from "lucide-react";
import type { SongDto } from "../types/domain";
import { duration } from "./format";

interface TrackTableProps {
  tracks: SongDto[];
  currentSongmid?: string;
  isPlaying: boolean;
  onPlay: (index: number) => void;
  onPause: () => void;
  dense?: boolean;
}

export function TrackTable({ tracks, currentSongmid, isPlaying, onPlay, onPause, dense = false }: TrackTableProps) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-[minmax(260px,1fr)_48px_minmax(160px,0.5fr)_88px] gap-4 px-3 pb-2 text-xs text-neutral-500">
        <span>歌名/歌手</span>
        <span />
        <span>专辑</span>
        <span>时长</span>
      </div>
      <div className="space-y-1">
        {tracks.map((track, index) => {
          const current = track.songmid === currentSongmid;
          const disabled = !track.playable;
          return (
            <div
              key={`${track.songmid}-${index}`}
              className={`grid grid-cols-[minmax(260px,1fr)_48px_minmax(160px,0.5fr)_88px] items-center gap-4 rounded-md px-3 transition ${
                dense ? "py-1.5" : "py-2"
              } ${current ? "bg-emerald-400/10" : "hover:bg-white/[0.04]"} ${disabled ? "opacity-45" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded disabled:cursor-not-allowed ${
                    track.artworkUrl ? "" : "bg-neutral-800"
                  }`}
                  onClick={() => (current && isPlaying ? onPause() : onPlay(index))}
                >
                  {track.artworkUrl ? <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`truncate text-sm ${current ? "text-emerald-300" : "text-neutral-100"}`}>{track.title}</span>
                    {track.vip && <Badge label="VIP" tone="green" />}
                    {track.vip && <Badge label="臻品母带" tone="gold" />}
                    {disabled && <Badge label="不可播" tone="gray" />}
                  </div>
                  <div className="truncate text-sm text-neutral-400">{track.artist || "未知歌手"}</div>
                </div>
              </div>
              <button
                type="button"
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ${
                  current ? "text-red-400" : "text-neutral-500 hover:text-red-300"
                }`}
              >
                {current && isPlaying ? <Pause className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
              </button>
              <div className="truncate text-sm text-neutral-400">{track.album || "--"}</div>
              <div className="text-sm tabular-nums text-neutral-400">{duration(track.durationMs)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "green" | "gold" | "gray" }) {
  const cls =
    tone === "green"
      ? "border-emerald-400 text-emerald-300"
      : tone === "gold"
        ? "border-amber-400 text-amber-300"
        : "border-neutral-500 text-neutral-400";
  return <span className={`shrink-0 rounded border px-1 text-[10px] leading-4 ${cls}`}>{label}</span>;
}

