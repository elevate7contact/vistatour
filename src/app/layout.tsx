import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Paseo — No es un tour. Es un paseo.',
  description:
    'Convierte 5 a 7 fotos de un inmueble en un recorrido virtual inmersivo. Para realtors en Colombia.',
  icons: { icon: '/favicon.svg' }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
