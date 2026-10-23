import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LeftPane } from "@/components/LeftPane";
import { WelcomeCenter, HomeRight } from "@/components/Welcome";
import { PaneOverlay } from "@/components/RightPane";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loom — AI Chat Library" },
      {
        name: "description",
        content:
          "Capture, distill, and export AI chat sessions from ChatGPT, Claude, Gemini, DeepSeek, and Perplexity.",
      },
      { property: "og:title", content: "Loom — AI Chat Library" },
      {
        property: "og:description",
        content:
          "Capture, distill, and export AI chat sessions from ChatGPT, Claude, Gemini, DeepSeek, and Perplexity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [sideOpen, setSideOpen] = useState(false);

  return (
    <>
      <LeftPane />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <WelcomeCenter onOpenSide={() => setSideOpen(true)} />
      </main>
      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border xl:block">
        <HomeRight />
      </aside>
      {sideOpen && (
        <PaneOverlay title="Connection & library" onClose={() => setSideOpen(false)}>
          <HomeRight />
        </PaneOverlay>
      )}
    </>
  );
}
