export type Platform = "macArm64" | "macIntel" | "windows" | "linux";

export interface PlatformAsset {
  platform: Platform;
  os: "macOS" | "Windows" | "Linux";
  arch: string;
  filename: string;
  url: string;
}

const REPO = "shahar061/the-office";

export const RELEASE = {
  version: "v0.1.1",
  releasedOn: "2026-05-04",
  releasesUrl: `https://github.com/${REPO}/releases`,
  assets: {
    macArm64: {
      platform: "macArm64",
      os: "macOS",
      arch: "Apple Silicon",
      filename: "The-Office-0.1.1-arm64.dmg",
      url: `https://github.com/${REPO}/releases/download/v0.1.1/The-Office-0.1.1-arm64.dmg`,
    },
    macIntel: {
      platform: "macIntel",
      os: "macOS",
      arch: "Intel",
      filename: "The-Office-0.1.1.dmg",
      url: `https://github.com/${REPO}/releases/download/v0.1.1/The-Office-0.1.1.dmg`,
    },
    windows: {
      platform: "windows",
      os: "Windows",
      arch: "x64",
      filename: "The-Office-0.1.1-x64.exe",
      url: `https://github.com/${REPO}/releases/download/v0.1.1/The-Office-0.1.1-x64.exe`,
    },
    linux: {
      platform: "linux",
      os: "Linux",
      arch: "x86_64 AppImage",
      filename: "The-Office-0.1.1-x86_64.AppImage",
      url: `https://github.com/${REPO}/releases/download/v0.1.1/The-Office-0.1.1-x86_64.AppImage`,
    },
  } satisfies Record<Platform, PlatformAsset>,
} as const;

export type DetectedPlatform = Platform | "unknown";

export function detectPlatform(userAgent: string): DetectedPlatform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  if (ua.includes("mac")) {
    // Apple Silicon detection from UA alone is unreliable — Safari reports
    // Intel for compatibility. Default to arm64 (~80% of active Macs in 2026)
    // and surface the Intel link prominently below the primary button.
    return "macArm64";
  }
  return "unknown";
}

export function getDownloadForUA(userAgent: string): PlatformAsset {
  const detected = detectPlatform(userAgent);
  if (detected === "unknown") return RELEASE.assets.macArm64;
  return RELEASE.assets[detected];
}
