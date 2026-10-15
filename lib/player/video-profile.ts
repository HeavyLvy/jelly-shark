import type { DeviceProfile, DirectPlayProfile, SubtitleProfile } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Browser video DeviceProfile for PlaybackInfo, modelled on jellyfin-web's
 * browserDeviceProfile: probe what this browser decodes (canPlayType /
 * MediaSource.isTypeSupported), direct-play those, and have Jellyfin
 * transcode the rest to HLS (fMP4, H.264/HEVC + AAC).
 *
 * Subtitles: text formats are delivered as external WebVTT tracks;
 * image formats (PGS / DVD / DVB) must be burned in, which forces a transcode.
 */

function can(mime: string): boolean {
  const v = document.createElement("video");
  if (v.canPlayType(mime) !== "") return true;
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(mime);
}

let cached: DeviceProfile | null = null;

export function videoDeviceProfile(): DeviceProfile {
  if (cached) return cached;
  const ua = navigator.userAgent;
  // Chrome, Edge, Brave, … (all include "Chrome/" in the UA).
  const chromium = /Chrome\//.test(ua);

  const h264 = can('video/mp4; codecs="avc1.640029"');
  const hevc = can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"');
  const av1 = can('video/mp4; codecs="av01.0.08M.08"');
  const vp9 = can('video/webm; codecs="vp09.00.10.08"');
  const aac = can('audio/mp4; codecs="mp4a.40.2"');
  const mp3 = can("audio/mpeg");
  const opus = can('audio/webm; codecs="opus"');
  const flac = can('audio/mp4; codecs="flac"') || can("audio/flac");
  const ac3 = can('audio/mp4; codecs="ac-3"');
  const eac3 = can('audio/mp4; codecs="ec-3"');

  const mp4Video = [h264 && "h264", hevc && "hevc", av1 && "av1", vp9 && "vp9"].filter(Boolean).join(",");
  const mp4Audio = [aac && "aac", mp3 && "mp3", opus && "opus", flac && "flac", ac3 && "ac3", eac3 && "eac3"].filter(Boolean).join(",");
  const webmVideo = [vp9 && "vp9", av1 && "av1", "vp8"].filter(Boolean).join(",");
  const webmAudio = ["vorbis", opus && "opus"].filter(Boolean).join(",");

  const direct: DirectPlayProfile[] = [
    { Container: "mp4,m4v", Type: "Video", VideoCodec: mp4Video, AudioCodec: mp4Audio },
    { Container: "webm", Type: "Video", VideoCodec: webmVideo, AudioCodec: webmAudio },
  ];
  // Chromium plays Matroska with codecs it knows (H.264/HEVC/VP9/AV1 + AAC/MP3/Opus/FLAC).
  if (chromium) direct.push({ Container: "mkv", Type: "Video", VideoCodec: mp4Video, AudioCodec: [aac && "aac", mp3 && "mp3", opus && "opus", flac && "flac"].filter(Boolean).join(",") });

  // Text subtitles of any format are converted to WebVTT and loaded as <track>s
  // (we request Stream.vtt ourselves), so only "vtt" is offered as external.
  const textSubs: SubtitleProfile[] = [{ Format: "vtt", Method: "External" }];
  const imageSubs: SubtitleProfile[] = ["pgssub", "pgs", "dvdsub", "dvbsub", "dvb_subtitle", "sub", "idx"].map((f) => ({ Format: f, Method: "Encode" }));

  cached = {
    Name: "Jelly Shark web",
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 100_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: direct,
    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Video",
        VideoCodec: hevc ? "hevc,h264" : "h264",
        AudioCodec: "aac",
        Protocol: "hls",
        Context: "Streaming",
        MaxAudioChannels: "6",
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [...textSubs, ...imageSubs],
  };
  return cached;
}
