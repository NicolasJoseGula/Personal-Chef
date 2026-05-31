import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Chef",
  description: "Tu chef personal con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}