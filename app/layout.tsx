import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScopePulse — Proposal intelligence",
  description: "A smarter workspace for winning better freelance projects.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
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
