import { engineConfig } from "@/lib/config";
import Chat from "./components/Chat";

export const dynamic = "force-dynamic";

export default function Home() {
  const { opening_message, session } = engineConfig();
  return (
    <Chat
      opening={opening_message}
      reflectionAfter={session.reflection_after_turns}
      maxChars={session.max_message_chars}
    />
  );
}
