import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import SiteFooter from '@/components/SiteFooter'
import { Providers } from '@/components/Providers'
import 'mapbox-gl/dist/mapbox-gl.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mālama Labs | Environmental Data Network',
  description: 'Cryptographic environmental data network anchored natively to the Base Layer and Cardano economies.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-malama-deep text-gray-100 min-h-screen flex flex-col`}>
        <Providers>
          <Navbar />
          <main className="flex-grow">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  )
}
