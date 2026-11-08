import WorkspaceShell from "./WorkspaceShell";

export default function Page() {
  return <WorkspaceShell aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
