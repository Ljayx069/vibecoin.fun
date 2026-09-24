import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Masthead from "@/components/Masthead";
import ProjectsTable from "@/components/ProjectsTable";

export const metadata: Metadata = {
  title: "Projects | vibecoin",
  description: "Coins launched through the vibecoin MCP on Solana and Robinhood Chain — every one with a repo and a live URL.",
};

export default function ProjectsPage() {
  return (
    <>
      <Masthead onProjects />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
        <section>
          <h2 className="text-xl font-semibold">Launched projects</h2>
          <p className="mt-2 text-sm text-muted">
            Real apps with real repos, tokenized straight from the terminal — click a token for the full picture:
          </p>
        </section>
        <ProjectsTable />
      </main>
      <Footer />
    </>
  );
}
