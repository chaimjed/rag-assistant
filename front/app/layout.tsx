import { Source_Serif_4, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Archive — Assistant documentaire",
  description: "Pose des questions à tes documents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${sourceSerif.variable} ${plexSans.variable}`}>{children}</body>
    </html>
  );
}