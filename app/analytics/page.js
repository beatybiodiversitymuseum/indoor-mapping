import Link from "next/link";
import { getUsageAnalytics } from "../usage-store.js";
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
  const data = getUsageAnalytics(days);
  const maxDaily = Math.max(1, ...data.daily.map((row) => row.sessions));
  const routeRate = data.routeStats.total ? Math.round((data.routeStats.found || 0) / data.routeStats.total * 100) : 0;
  const cards = [
    ["Sessions", data.totals.sessions], ["Searches", data.totals.searches],
    ["Feature selections", data.totals.feature_selections], ["Routes", data.totals.routes],
    ["Images opened", data.totals.images_opened], ["Issues reported", data.totals.issues_reported],
  ];
  return <main className="analytics">
    <header><div><p>Beaty Biodiversity Museum</p><h1>Indoor map analytics</h1></div><Link href="/">Return to map</Link></header>
    <nav aria-label="Date range">{[7, 30, 90, 365].map((option) => <Link className={days === option ? "active" : ""} href={`/analytics?days=${option}`} key={option}>{option === 365 ? "1 year" : `${option} days`}</Link>)}</nav>
    <section className="cards">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value || 0}</strong></article>)}</section>
    <section className="panel activity"><div className="panel-title"><div><h2>Daily sessions</h2><p>Unique anonymous sessions per day</p></div><strong>{data.totals.events || 0} events</strong></div>
      <div className="daily-chart" aria-label="Daily session chart">{data.daily.map((row) => <div className="day" key={row.day} title={`${row.day}: ${row.sessions} sessions, ${row.events} events`}><i style={{ height: `${Math.max(row.sessions ? 5 : 1, row.sessions / maxDaily * 100)}%` }} /><span>{row.day.slice(5)}</span></div>)}</div>
    </section>
    <div className="grid"><section className="panel"><h2>Event mix</h2><Bars rows={data.eventTypes} /></section><section className="panel"><h2>Route completion</h2><div className="route-rate"><strong>{routeRate}%</strong><span>{data.routeStats.found || 0} of {data.routeStats.total || 0} routes found</span></div></section></div>
    <div className="grid"><section className="panel"><h2>Top searches</h2><Bars rows={data.searches} /></section><section className="panel"><h2>Popular features</h2><Bars rows={data.features} /></section></div>
    <footer>Read-only aggregates from the local usage database. Refreshed when this page loads.</footer>
  </main>;
}
