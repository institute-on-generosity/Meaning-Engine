import type { Metadata } from "next";
import { advisorSummary, advisors } from "@/lib/advisors";
import { engineConfig } from "@/lib/config";
import Chat from "../components/Chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "GuideGPT · Institute on Generosity", robots: { index: false } };

/**
 * Shared-screen version for IoG convenings: clears itself between people and offers no downloads.
 * Each visitor picks an advisor on the welcome screen.
 */
export default function Kiosk() {
  const { session, kiosk } = engineConfig();
  return (
    <Chat
      advisors={advisors().map(advisorSummary)}
      reflectionAfter={session.reflection_after_turns}
      maxChars={session.max_message_chars}
      kiosk={{ idleSeconds: kiosk.idle_seconds, warningSeconds: kiosk.warning_seconds }}
    />
  );
}
