import "./globals.css";

export const metadata = {
  title: "EXIF Lens",
  description: "Inspect, understand, and clean file metadata.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
