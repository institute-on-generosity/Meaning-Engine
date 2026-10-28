import type { Metadata } from "next";
import { engineConfig } from "@/lib/config";
import Chat from "../components/Chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MeaningEngine · Institute on Generosity", robots: { index: false } };

/** Shared-screen version for IoG convenings: clears itself between people and offers no downloads. */
export default function Kiosk() {
  const { opening_message, session, kiosk } = engineConfig();
  return (
    <Chat
      opening={opening_message}
      reflectionAfter={session.reflection_after_turns}
      maxChars={session.max_message_chars}
      kiosk={{ idleSeconds: kiosk.idle_seconds, warningSeconds: kiosk.warning_seconds }}
    />
  );
}
