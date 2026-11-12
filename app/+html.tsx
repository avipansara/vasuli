import { useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <style>{`
          html body [data-safe-area="floating-expense"] {
            bottom: max(env(safe-area-inset-bottom, 0px), 12px);
            right: max(env(safe-area-inset-right, 0px), 0px);
          }
          html body [data-safe-area="friend-floating-expense"] {
            bottom: calc(max(env(safe-area-inset-bottom, 0px), 12px) + 20px);
            right: calc(max(env(safe-area-inset-right, 0px), 0px) + 18px);
          }
          html body [data-safe-area="group-settlement-actions"] {
            padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
          }
          html body [data-safe-area="group-stats-content"] > div {
            padding-bottom: calc(max(env(safe-area-inset-bottom, 0px), 16px) + 100px) !important;
          }
          html body [data-safe-area="error-screen"] {
            padding-top: calc(env(safe-area-inset-top, 0px) + 24px);
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
          }
          html body [data-safe-area="review-sheet"] {
            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
          }
        `}</style>
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
