import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAHLA — Cash Buyer Network",
  description: "Scored cash buyer database + deal matchmaking for CA wholesalers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#10b981",
          colorBackground: "#0e1014",
          colorInputBackground: "#161a21",
          colorInputText: "#e7e9ef",
          colorText: "#e7e9ef",
          colorTextSecondary: "#9ba2b1",
          borderRadius: "0.75rem",
        },
      }}
    >
      <html lang="en" className="dark">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
