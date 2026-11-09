import WorkspaceShell from "./WorkspaceShell";

export const dynamic = "force-dynamic";

export default function Page() {
  return <WorkspaceShell aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
