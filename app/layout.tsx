import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Reef — Your next users are out there',
  description: 'Your product. The right audience. A launch worth making. A Muse-powered workspace for founders.',
  icons: {icon:'/favicon.svg'},
};
const fonts='https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/><link rel="stylesheet" href={fonts}/></head><body>{children}</body></html>;
}
