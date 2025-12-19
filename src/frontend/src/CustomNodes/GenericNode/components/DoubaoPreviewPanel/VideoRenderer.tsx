import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";

type VideoRendererProps = {
  videoUrl?: string;
  poster?: string;
  duration?: string;
  variant?: "inline" | "modal";
  showSpeedControl?: boolean;
  onDownloadClick?: () => void;
};

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

const VideoRenderer = ({
  videoUrl,
  poster,
  duration,
  variant = "inline",
  showSpeedControl = false,
  onDownloadClick,
}: VideoRendererProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const isModal = variant === "modal";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration || 0);
      video.playbackRate = playbackRate;
    };
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
    };
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoDuration(video.duration || 0);
    video.pause();
    video.currentTime = 0;
  }, [videoUrl]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      return;
    }

    video
      .play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        console.error("Failed to play video:", error);
      });
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const video = videoRef.current;
    if (video) {
      video.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const handlePlaybackRateChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const rate = parseFloat(e.target.value);
      setPlaybackRate(rate);
      if (videoRef.current) {
        videoRef.current.playbackRate = rate;
      }
    },
    [],
  );

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "00:00";
    const minutes = Math.floor(time / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(time % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const controlClasses = useMemo(
    () =>
      isModal
        ? "flex flex-col gap-3 rounded-xl border border-white/15 bg-black/70 p-4 text-white"
        : "absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 text-white",
    [isModal],
  );

  if (!videoUrl) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30">
        <div className="text-center">
          <ForwardedIconComponent name="VideoOff" className="mx-auto h-8 w-8" />
          <p className="mt-2 text-xs">视频不可用</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isModal
          ? "flex flex-col gap-4"
          : "relative overflow-hidden rounded-2xl bg-black min-h-[220px]"
      }
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        className={
          isModal
            ? "max-h-[60vh] w-full rounded-xl object-contain"
            : "w-full rounded-2xl object-contain aspect-video max-h-[420px]"
        }
        preload="metadata"
        playsInline
      />

      <div className={controlClasses}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlayback}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
              aria-label={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? (
                <ForwardedIconComponent name="Pause" className="h-4 w-4" />
              ) : (
                <ForwardedIconComponent name="Play" className="h-4 w-4" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max={videoDuration || 0}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 cursor-pointer appearance-none rounded-full bg-white/50 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />

            <span className="text-xs tabular-nums">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>

          {duration && (
            <div className="text-[11px] text-white/80">预计时长：{duration}</div>
          )}
        </div>

        {isModal && showSpeedControl && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-white/80">播放倍速</label>
            <select
              value={playbackRate}
              onChange={handlePlaybackRateChange}
              className="rounded-full border border-white/30 bg-transparent px-3 py-1 text-sm text-white"
            >
              {SPEED_OPTIONS.map((rate) => (
                <option
                  key={rate}
                  value={rate}
                  className="bg-slate-900 text-white"
                >
                  {rate}x
                </option>
              ))}
            </select>

            {onDownloadClick && (
              <button
                onClick={onDownloadClick}
                className="ml-auto flex items-center gap-1 rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
              >
                <ForwardedIconComponent name="Download" className="h-4 w-4" />
                下载
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoRenderer;
