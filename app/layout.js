import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

export const metadata = {
  title: "Beaty Biodiversity Museum Indoor Map",
  description: "Explore the Beaty Biodiversity Museum indoor map and permanent exhibits.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
