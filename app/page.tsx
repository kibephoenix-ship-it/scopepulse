export default function Page() {
  return (
    <main>
      <iframe
        title="ScopePulse proposal workspace"
        src="/scopepulse/index.html"
        allow="clipboard-read; clipboard-write"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
        }}
      />
    </main>
  );
}
