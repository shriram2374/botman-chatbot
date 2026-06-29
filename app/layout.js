import { Inter, Outfit, Fira_Code } from 'next/font/google';
import "./globals.css";

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700']
});

const outfit = Outfit({ 
  subsets: ['latin'], 
  variable: '--font-display',
  weight: ['400', '600', '800']
});

const firaCode = Fira_Code({ 
  subsets: ['latin'], 
  variable: '--font-mono',
  weight: ['400', '500']
});

export const metadata = {
  title: "Botman — The Batcomputer AI Assistant",
  description: "Botman is a high-performance AI assistant featuring a custom Batcave theme, persistent cloud storage, and secure Gemini API streaming.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${firaCode.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
