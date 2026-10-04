import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'blank. · Mayhem-Rangliste', description: 'ARAM Mayhem. Deine Spiele, dein Rang. Die gemeinsame Rangliste für blank.', icons: { icon: '/favicon.svg' } };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="de"><body><header><a className="brand" href="/">blank<span>.</span></a><span className="product">MAYHEM</span><nav><a href="/">Rangliste</a><a href="/api-guide">API</a></nav></header><main>{children}</main><footer><span>Nicht mit Riot Games verbunden.</span><div><a href="/datenschutz">Datenschutz</a><a href="/api/export" download="blank-mayhem.json">Datenexport</a><a href="https://github.com/maltekruse23-oss/blank">Open Source</a></div></footer></body></html>; }
