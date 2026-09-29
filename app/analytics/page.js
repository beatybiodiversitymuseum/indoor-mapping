import Link from "next/link";
import { getUsageAnalytics } from "../usage-store.js";
import { loadMapData } from "../map-data-store.js";
import "./analytics.css";

export const dynamic = "force-dynamic";

function Bars({ rows, empty = "No activity in this period." }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (!rows.length) return <p className="empty">{empty}</p>;
  return <div className="bars">{rows.map((row) => <div className="bar-row" key={row.label}>
    <span title={row.label}>{row.label.replaceAll("_", " ")}</span>
    <i><b style={{ width: `${Math.max(2, row.count / max * 100)}%` }} /></i>
    <strong>{row.count}</strong>
  </div>)}</div>;
}

export default async function Analytics({ searchParams }) {
  const params = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(params?.days)) ? Number(params.days) : 30;
  const [data, mapData] = await Promise.all([getUsageAnalytics(days), loadMapData()]);
  const featureLabels = new Map(mapData.features.map((feature) => [String(feature.id), feature.properties?.name?.en || feature.properties?.alt_name?.en || String(feature.id)]));
  const labelFeatures = (rows) => rows.map((row) => ({ ...row, label: featureLabels.get(String(row.label)) || row.label }));
  const maxDaily = Math.max(1, ...data.daily.map((row) => row.sessions));
  const routeRate = data.routeStats.total ? Math.round((data.routeStats.found || 0) / data.routeStats.total * 100) : 0;
  const engagementRate = data.totals.sessions ? Math.round((data.totals.engaged_sessions || 0) / data.totals.sessions * 100) : 0;
  const averageInteractions = data.totals.sessions ? ((data.totals.events - data.totals.sessions) / data.totals.sessions).toFixed(1) : "0.0";
  const duration = data.sessionStats.average_duration_seconds == null ? "—" : `${Math.round(data.sessionStats.average_duration_seconds / 60)}m`;
  const cards = [
    ["Sessions", data.totals.sessions, "Anonymous visits"], ["Engaged sessions", `${engagementRate}%`, "Used a map feature"],
    ["Avg. session", duration, "Completed visits"], ["Interactions/session", averageInteractions, "Beyond session start"],
    ["Searches", data.totals.searches, `${data.searchStats.no_results || 0} with no results`], ["Routes requested", data.totals.routes, `${routeRate}% successfully found`],
    ["Features selected", data.totals.feature_selections, "Map and search selections"], ["Images opened", data.totals.images_opened, "Exhibit detail views"],
  ];
  return <main className="analytics">
    <header><div><p>Beaty Biodiversity Museum</p><h1>Indoor map analytics</h1></div><Link href="/">Return to map</Link></header>
    <nav aria-label="Date range">{[7, 30, 90, 365].map((option) => <Link className={days === option ? "active" : ""} href={`/analytics?days=${option}`} key={option}>{option === 365 ? "1 year" : `${option} days`}</Link>)}</nav>
    <section className="cards">{cards.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value ?? 0}</strong><small>{note}</small></article>)}</section>
    <section className="panel activity"><div className="panel-title"><div><h2>Daily sessions</h2><p>Unique anonymous sessions per day</p></div><strong>{data.totals.events || 0} events</strong></div>
      <div className="daily-chart" aria-label="Daily session chart">{data.daily.map((row) => <div className="day" key={row.day} title={`${row.day}: ${row.sessions} sessions, ${row.events} events`}><i style={{ height: `${Math.max(row.sessions ? 5 : 1, row.sessions / maxDaily * 100)}%` }} /><span>{row.day.slice(5)}</span></div>)}</div>
    </section>
    <div className="grid"><section className="panel"><h2>What visitors search for</h2><Bars rows={data.searches} /></section><section className="panel"><h2>Searches needing attention</h2><p className="panel-note">Queries that returned no results</p><Bars rows={data.noResultSearches} empty="No zero-result searches in this period." /></section></div>
    <div className="grid"><section className="panel"><h2>Most-viewed places and exhibits</h2><Bars rows={labelFeatures(data.features)} /></section><section className="panel"><h2>Popular route destinations</h2><Bars rows={labelFeatures(data.routeDestinations)} empty="No routes requested in this period." /></section></div>
    <div className="grid"><section className="panel"><h2>Visitor actions</h2><Bars rows={data.eventTypes} /></section><section className="panel"><h2>Route reliability</h2><div className="route-rate"><strong>{routeRate}%</strong><span>{data.routeStats.found || 0} of {data.routeStats.total || 0} routes found{data.routeStats.average_distance_meters ? ` · average ${Math.round(data.routeStats.average_distance_meters)} m` : ""}</span></div></section></div>
    <footer>Read-only aggregates from the local usage database. Refreshed when this page loads.</footer>
  </main>;
}
