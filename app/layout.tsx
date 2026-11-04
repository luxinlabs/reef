import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Reef — Your next users are out there',
  description: 'Your product. The right audience. A launch worth making. A Muse-powered workspace for founders.',
  icons: {icon:'/favicon.svg'},
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
