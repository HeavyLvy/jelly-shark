import type { BaseItemDto, MediaStream, PlayMethod } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import { jf, jfUrl } from "@/lib/jellyfin/client";
import { videoDeviceProfile } from "./video-profile";
import type { VideoPrefs } from "./video-prefs";

export interface VideoSource {
  url: string;
  isHls: boolean;
  playSessionId: string;
  mediaSourceId: string;
  playMethod: PlayMethod;
  audioIndex: number | null;
  /** -1 = subtitles off. */
  subtitleIndex: number;
  /** WebVTT track for the chosen text subtitle (null for none / burned-in image subs). */
  textTrack: { src: string; lang: string; label: string } | null;
  /** True when the chosen subtitle is burned into the video (image formats). */
  burnedIn: boolean;
}

export interface TrackChoice {
  audioIndex: number | null;
  subtitleIndex: number;
}

const streamsOf = (item: BaseItemDto): MediaStream[] => item.MediaSources?.[0]?.MediaStreams ?? item.MediaStreams ?? [];
export const audioStreams = (item: BaseItemDto) => streamsOf(item).filter((s) => s.Type === "Audio");
export const subtitleStreams = (item: BaseItemDto) => streamsOf(item).filter((s) => s.Type === "Subtitle");

export function streamLabel(s: MediaStream): string {
  return s.DisplayTitle || [s.Language?.toUpperCase(), s.Codec?.toUpperCase()].filter(Boolean).join(" · ") || `Track ${s.Index}`;
}

/**
 * Initial audio/subtitle choice: last-used language if the file has it, else
 * the file's default audio; subtitles off unless the user picked a language
 * before (forced subtitles in the audio language are always shown).
 * Text subtitles are preferred over image ones (no burn-in transcode).
 */
export function chooseTracks(item: BaseItemDto, prefs: VideoPrefs): TrackChoice {
  const audio = audioStreams(item);
  const subs = subtitleStreams(item);
  const byLang = (lang: string | null) => (s: MediaStream) => !!lang && s.Language?.toLowerCase() === lang.toLowerCase();
  const chosenAudio = audio.find(byLang(prefs.audioLang)) ?? audio.find((s) => s.IsDefault) ?? audio[0];
  const audioLang = chosenAudio?.Language ?? null;

  const textFirst = (list: MediaStream[]) => list.find((s) => s.IsTextSubtitleStream) ?? list[0];
  let sub: MediaStream | undefined;
  if (prefs.subtitleLang !== "off") sub = textFirst(subs.filter(byLang(prefs.subtitleLang)));
  if (!sub) sub = textFirst(subs.filter((s) => s.IsForced && (!audioLang || byLang(audioLang)(s))));
  return { audioIndex: chosenAudio?.Index ?? null, subtitleIndex: sub?.Index ?? -1 };
}

/**
 * Ask Jellyfin how to play this item in this browser. Direct play when the
 * file fits the profile and the default audio track is wanted; otherwise an
 * HLS transcode/remux (TranscodingUrl, already token-free via the proxy).
 */
export async function negotiateVideo(
  item: BaseItemDto,
  choice: TrackChoice,
  maxBitrate: number | null,
  signal?: AbortSignal,
): Promise<VideoSource> {
  const itemId = item.Id ?? "";
  const defaultAudio = audioStreams(item).find((s) => s.IsDefault)?.Index ?? audioStreams(item)[0]?.Index ?? null;
  // Browsers can't switch audio tracks inside a direct-played file: a
  // non-default track needs a remux/transcode that carries only that track.
  const forceStream = choice.audioIndex !== null && choice.audioIndex !== defaultAudio;

  const { data } = await getMediaInfoApi(jf).getPostedPlaybackInfo(
    {
      itemId,
      playbackInfoDto: {
        DeviceProfile: videoDeviceProfile(),
        MaxStreamingBitrate: maxBitrate ?? 120_000_000,
        AudioStreamIndex: choice.audioIndex ?? undefined,
        SubtitleStreamIndex: choice.subtitleIndex,
        EnableDirectPlay: !forceStream && maxBitrate === null,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        AutoOpenLiveStream: true,
      },
    },
    { signal },
  );

  const ms = data.MediaSources?.[0];
  if (!ms?.Id) throw new Error(data.ErrorCode ? `Jellyfin can't play this (${data.ErrorCode}).` : "No playable source.");
  const playSessionId = data.PlaySessionId ?? "";

  const sub = ms.MediaStreams?.find((s) => s.Type === "Subtitle" && s.Index === choice.subtitleIndex);
  const isText = !!sub?.IsTextSubtitleStream;
  const textTrack =
    sub && isText
      ? {
          src: jfUrl(`/Videos/${itemId}/${ms.Id}/Subtitles/${sub.Index}/0/Stream.vtt`),
          lang: sub.Language ?? "und",
          label: streamLabel(sub),
        }
      : null;
  const base = { playSessionId, mediaSourceId: ms.Id, audioIndex: choice.audioIndex, subtitleIndex: choice.subtitleIndex, textTrack, burnedIn: !!sub && !isText };

  if (ms.SupportsDirectPlay && !forceStream && maxBitrate === null) {
    return {
      ...base,
      url: jfUrl(`/Videos/${itemId}/stream`, { static: true, mediaSourceId: ms.Id, playSessionId }),
      isHls: false,
      playMethod: "DirectPlay",
    };
  }
  if (ms.TranscodingUrl) {
    return {
      ...base,
      url: ms.TranscodingUrl,
      isHls: ms.TranscodingSubProtocol === "hls" || ms.TranscodingUrl.includes(".m3u8"),
      playMethod: ms.SupportsDirectStream ? "DirectStream" : "Transcode",
    };
  }
  throw new Error("This video can't be played in this browser.");
}
