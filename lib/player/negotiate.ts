import type { PlayMethod } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import { jf, jfUrl } from "@/lib/jellyfin/client";
import { TICKS_PER_SECOND } from "@/lib/format";
import { audioDeviceProfile } from "./audio-profile";

export interface AudioSource {
  url: string;
  playSessionId: string;
  mediaSourceId: string;
  playMethod: PlayMethod;
  /** Transcoded streams can't byte-range seek; seeking renegotiates at an offset. */
  canByteSeek: boolean;
  /** Seconds into the track where this stream starts (transcode offset). */
  offset: number;
}

/** Asks Jellyfin how to play `itemId` in this browser and returns a proxied stream URL. */
export async function negotiateAudio(itemId: string, startSeconds = 0, signal?: AbortSignal): Promise<AudioSource> {
  const startTimeTicks = Math.round(startSeconds * TICKS_PER_SECOND);
  const { data } = await getMediaInfoApi(jf).getPostedPlaybackInfo(
    {
      itemId,
      playbackInfoDto: {
        DeviceProfile: audioDeviceProfile(),
        MaxStreamingBitrate: 140_000_000,
        StartTimeTicks: startTimeTicks || undefined,
        EnableDirectPlay: true,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AutoOpenLiveStream: false,
      },
    },
    { signal },
  );
  const ms = data.MediaSources?.[0];
  const playSessionId = data.PlaySessionId ?? "";
  if (!ms?.Id) throw new Error(data.ErrorCode ? `Playback error: ${data.ErrorCode}` : "No playable source");

  if (ms.SupportsDirectPlay || ms.SupportsDirectStream) {
    return {
      url: jfUrl(`/Audio/${itemId}/stream`, { static: true, mediaSourceId: ms.Id, playSessionId }),
      playSessionId,
      mediaSourceId: ms.Id,
      playMethod: ms.SupportsDirectPlay ? "DirectPlay" : "DirectStream",
      canByteSeek: true,
      offset: 0,
    };
  }
  if (ms.TranscodingUrl) {
    // The BFF proxy already rewrote this to a token-free /api/jf/... path.
    return { url: ms.TranscodingUrl, playSessionId, mediaSourceId: ms.Id, playMethod: "Transcode", canByteSeek: false, offset: startSeconds };
  }
  throw new Error("This track can't be played in this browser.");
}
