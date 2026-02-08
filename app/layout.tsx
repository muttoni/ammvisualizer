import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AMM Starter Strategy Visualizer',
  description: 'Code on the left, live market on the right. Step through every trade.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
