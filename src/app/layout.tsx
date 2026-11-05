import type { Metadata } from "next"
import { Figtree } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Creative Loop",
  description: "Encargo, producción, revisión y rendimiento de creativos.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
