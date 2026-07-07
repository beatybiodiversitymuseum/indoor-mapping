import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

export const metadata = {
  title: "Beaty IDMF Viewer",
  description: "Explore indoor mapping data for the Beaty Biodiversity Museum.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
