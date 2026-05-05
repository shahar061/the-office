"use client";

import { useEffect, useState } from "react";
import {
  RELEASE,
  detectPlatform,
  type DetectedPlatform,
  type PlatformAsset,
} from "@/lib/release";

interface Props {
  className?: string;
  /** Label prefix when OS is known ("Download for macOS"). */
  labelPrefix?: string;
  /** Label shown before hydration (and to crawlers). */
  fallbackLabel?: string;
}

export function PrimaryDownloadButton({
  className = "",
  labelPrefix = "Download for",
  fallbackLabel = "Download",
}: Props) {
  const [detected, setDetected] = useState<DetectedPlatform>("unknown");

  useEffect(() => {
    setDetected(detectPlatform(navigator.userAgent));
  }, []);

  // SSR / pre-hydration: anchor to #download so the button always works,
  // even with JS disabled.
  if (detected === "unknown") {
    return (
      <a href="#download" className={className}>
        {fallbackLabel}
      </a>
    );
  }

  const asset: PlatformAsset = RELEASE.assets[detected];
  return (
    <a href={asset.url} className={className} download>
      {labelPrefix} {asset.os}
    </a>
  );
}
