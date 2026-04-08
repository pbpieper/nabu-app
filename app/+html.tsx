import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body {
            font-family: 'Geist-Regular', 'Geist', system-ui, -apple-system, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            background-color: #F4F4F5;
          }
          @media (prefers-color-scheme: dark) {
            html, body { background-color: #09090B; }
          }
          html, body, #root { height: 100%; overflow: hidden; }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}
