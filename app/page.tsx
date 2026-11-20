import { advisorSummary, advisors } from "@/lib/advisors";
import { engineConfig } from "@/lib/config";
import Chat from "./components/Chat";

export const dynamic = "force-dynamic";

/** Link straight to an advisor with /?advisor=<id> (ids are in config/advisors.yaml). */
export default async function Home({ searchParams }: { searchParams: Promise<{ advisor?: string }> }) {
  const { advisor } = await searchParams;
  const { session } = engineConfig();
  return (
    <Chat
      advisors={advisors().map(advisorSummary)}
      initialAdvisor={advisor}
      reflectionAfter={session.reflection_after_turns}
      maxChars={session.max_message_chars}
    />
  );
}
