import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Lora, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'


const dmSans = Plus_Jakarta_Sans({
  subsets  : ['latin'],
  weight   : ['300', '400', '500', '600'],
  style    : ['normal', 'italic'],
  variable : '--font-sans',
  display  : 'swap',
})

const dmSerif = Lora({
  subsets  : ['latin'],
  weight   : ['400'],
  style    : ['normal', 'italic'],
  variable : '--font-serif',
  display  : 'swap',
})

const dmMono = JetBrains_Mono({
  subsets  : ['latin'],
  weight   : ['400', '500'],
  variable : '--font-mono',
  display  : 'swap',
})

export const metadata: Metadata = {
  title      : 'Project TALA',
  description: 'Poverty Incidence Estimation — Philippines 2025',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} ${dmMono.variable}`}>
      <body className="antialiased">
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}