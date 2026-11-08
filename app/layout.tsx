import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScopePulse",
  description: "Administrative co-op and proposal generator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
