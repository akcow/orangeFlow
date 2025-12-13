import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";

type AudioRendererProps = {
  audioUrl?: string;
  variant?: "inline" | "modal";
  showSpeedControl?: boolean;
  onDownloadClick?: () => void;
};

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

const AudioRenderer = ({
  audioUrl,
  variant = "inline",
  showSpeedControl = false,
  onDownloadClick,
}: AudioRendererProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const isModal = variant === "modal";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      setDuration(audio.duration || 0);
      audio.playbackRate = playbackRate;
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(audio.duration || 0);
    audio.pause();
    audio.currentTime = 0;
  }, [audioUrl]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        console.error("Failed to play audio:", error);
      });
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, []);

  const handlePlaybackRateChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const rate = parseFloat(e.target.value);
      setPlaybackRate(rate);
      if (audioRef.current) {
        audioRef.current.playbackRate = rate;
      }
    },
    [],
  );

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60)
      .toString()
      .padStart(2, "0");
    const seconds = Math.floor(time % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const wrapperClasses = useMemo(
    () =>
      isModal
        ? "rounded-2xl border border-rose-200/40 bg-rose-950/20 p-5 text-white"
        : "rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-50",
    [isModal],
  );

  if (!audioUrl) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-rose-500 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
        <div className="text-center">
          <ForwardedIconComponent name="VolumeX" className="mx-auto h-6 w-6" />
          <p className="mt-2 text-xs">音频暂不可用</p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClasses}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayPause}
            className={
              isModal
                ? "flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                : "flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white transition-all hover:bg-rose-600"
            }
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <ForwardedIconComponent name="Pause" className="h-5 w-5" />
            ) : (
              <ForwardedIconComponent name="Play" className="h-5 w-5" />
            )}
          </button>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-inherit">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1 cursor-pointer appearance-none rounded-full bg-white/40 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current"
              />
              <span className="text-xs text-inherit">{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {isModal && showSpeedControl && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="text-xs text-white/70">播放倍速</label>
            <select
              value={playbackRate}
              onChange={handlePlaybackRateChange}
              className="rounded-full border border-white/30 bg-transparent px-3 py-1 text-sm text-white"
            >
              {SPEED_OPTIONS.map((rate) => (
                <option key={rate} value={rate} className="bg-slate-900 text-white">
                  {rate}x
                </option>
              ))}
            </select>

            {onDownloadClick && (
              <button
                onClick={onDownloadClick}
                className="ml-auto flex items-center gap-1 rounded-full border border-white/30 px-3 py-1.5 text-xs text-white transition hover:bg-white/10"
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

export default AudioRenderer;
