import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";

type VideoRendererProps = {
  videoUrl?: string;
  poster?: string;
  duration?: string;
  variant?: "inline" | "modal";
  // When embedded in a persistent preview frame that already provides border/radius/bg,
  // avoid rendering another nested container frame.
  frameless?: boolean;
  showSpeedControl?: boolean;
  onDownloadClick?: () => void;
  /**
   * When set, toggles playback programmatically (used for hover-to-preview in persistent frames).
   * - true: play (best-effort)
   * - false: pause + reset to 0
   * - undefined: no programmatic control (default behavior)
   */
  autoPlay?: boolean;
  /**
   * Controls whether hover-autoplay should be muted.
   * - If omitted, hover-autoplay defaults to muted (matches previous behavior).
   * - Has no effect for modal playback or when `autoPlay` is undefined.
   */
  muted?: boolean;
  /**
   * Exposes the underlying <video> element for parent features like "capture frame".
   */
  onVideoElement?: (el: HTMLVideoElement | null) => void;
  onMeta?: (meta: { width?: number; height?: number; aspectRatio?: number }) => void;
  hideControls?: boolean;
};

const SPEED_OPTIONS = [0.5, 1, 1.5, 2];

const VideoRenderer = ({
  videoUrl,
  poster,
  duration,
  variant = "inline",
  frameless = false,
  showSpeedControl = false,
  onDownloadClick,
  autoPlay,
  muted,
  onVideoElement,
  onMeta,
  hideControls = false,
}: VideoRendererProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const tickerRef = useRef<{ rafId: number | null; rvfcId: number | null }>({
    rafId: null,
    rvfcId: null,
  });

  const isModal = variant === "modal";
  const shouldMuteHoverAutoplay = Boolean(autoPlay && !isModal ? muted ?? true : false);
  // Persistent preview frames can overlay extra buttons (e.g. "capture frame") in the bottom-right.
  // Reserve space so the progress bar remains usable and unobstructed.
  const reserveRightForOverlayButton = Boolean(!isModal && autoPlay !== undefined);

  useEffect(() => {
    onVideoElement?.(videoRef.current);
    return () => onVideoElement?.(null);
  }, [onVideoElement]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      const durationValue = video.duration || 0;
      setVideoDuration(durationValue);
      video.playbackRate = playbackRate;
      onMeta?.({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        aspectRatio:
          video.videoWidth && video.videoHeight
            ? video.videoWidth / video.videoHeight
            : undefined,
      });
      if (!videoUrl) return;
      if (durationValue > 0) return;
      if (retryCount >= 2) return;
      const nextCount = retryCount + 1;
      setRetryCount(nextCount);
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = window.setTimeout(() => {
        setReloadToken((token) => token + 1);
      }, 800 * nextCount);
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      if (!videoUrl) return;
      if (retryCount >= 2) return;
      const nextCount = retryCount + 1;
      setRetryCount(nextCount);
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
      retryTimeoutRef.current = window.setTimeout(() => {
        setReloadToken((token) => token + 1);
      }, 800 * nextCount);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, [playbackRate, retryCount, videoUrl]);

  // Smoother progress updates while playing (timeupdate can be coarse).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const anyVideo = video as any;
    const stop = () => {
      const { rafId, rvfcId } = tickerRef.current;
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
      if (rvfcId != null && typeof anyVideo.cancelVideoFrameCallback === "function") {
        try {
          anyVideo.cancelVideoFrameCallback(rvfcId);
        } catch {
          // ignore
        }
      }
      tickerRef.current.rafId = null;
      tickerRef.current.rvfcId = null;
    };

    const tick = () => {
      setCurrentTime(video.currentTime || 0);
      if (video.paused || video.ended) return;
      if (typeof anyVideo.requestVideoFrameCallback === "function") {
        tickerRef.current.rvfcId = anyVideo.requestVideoFrameCallback(() => tick());
      } else {
        tickerRef.current.rafId = window.requestAnimationFrame(() => tick());
      }
    };
    const ensureTicker = () => {
      if (video.paused || video.ended) return;
      if (tickerRef.current.rafId != null || tickerRef.current.rvfcId != null) return;
      tick();
    };

    const onPlay = () => {
      stop();
      tick();
    };
    const onPause = () => {
      stop();
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeking = () => {
      // Avoid stale callbacks while scrubbing; some browsers won't emit `play` again reliably.
      stop();
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeked = () => {
      setCurrentTime(video.currentTime || 0);
      ensureTicker();
    };
    const onTimeUpdate = () => {
      // Backstop: restart ticker if the video is playing but our callbacks got cancelled.
      ensureTicker();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);

    // If we mount while already playing (rare), start ticker.
    if (!video.paused && !video.ended) {
      tick();
    }

    return () => {
      stop();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setVideoDuration(video.duration || 0);
    video.pause();
    video.currentTime = 0;
  }, [videoUrl]);

  useEffect(() => {
    if (autoPlay === undefined) return;
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    if (!autoPlay) {
      video.pause();
      setIsPlaying(false);
      return;
    }

    video
      .play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        // Autoplay on hover can be blocked by browser policies; fall back to manual play.
        console.error("Failed to play video:", error);
      });
  }, [autoPlay, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (autoPlay === undefined) return;
    // Keep `muted` in sync while hover autoplay is active (supports "toggle sound" button).
    video.muted = shouldMuteHoverAutoplay;
  }, [autoPlay, shouldMuteHoverAutoplay]);

  useEffect(() => {
    setRetryCount(0);
    setReloadToken(0);
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
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
        : `absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 text-white ${reserveRightForOverlayButton ? "pr-16" : ""} nodrag`,
    [isModal, reserveRightForOverlayButton],
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
          : frameless
            ? "relative h-full w-full overflow-hidden bg-black"
            : "relative overflow-hidden rounded-2xl bg-black min-h-[220px]"
      }
    >
      <video
        key={`${videoUrl}-${reloadToken}`}
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        muted={shouldMuteHoverAutoplay}
        className={
          isModal
            ? "max-h-[60vh] w-full rounded-xl object-contain"
            : frameless
              ? "h-full w-full object-contain"
              : "w-full rounded-2xl object-contain aspect-video max-h-[420px]"
        }
        preload="metadata"
        playsInline
      />

      {!hideControls && <div className={controlClasses}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlayback}
              className="nodrag flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
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
              step="0.01"
              value={currentTime}
              onChange={handleSeek}
              className="nodrag flex-1 h-1 cursor-pointer appearance-none rounded-full bg-white/50 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
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
      </div>}
    </div>
  );
};

export default VideoRenderer;
