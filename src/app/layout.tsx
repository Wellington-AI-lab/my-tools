import type { Metadata } from 'next'
import '@/styles/global.css'
import { TitanHeader } from '@/components/layout/TitanHeader'
import { TitanProvider } from '@/components/layout/TitanProvider'

export const metadata: Metadata = {
  title: 'my tools',
  description: 'Personal tools dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>
        <TitanProvider>
          <div className="titan-wrapper">
            <TitanHeader />
            <main className="titan-main">{children}</main>
          </div>
        </TitanProvider>
      </body>
    </html>
  )
}
