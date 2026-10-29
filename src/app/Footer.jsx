import { version, releaseDate } from "../../package.json";

export function Footer() {
  const formattedDate = releaseDate.split("-").reverse().join(".");
  return (
    <footer className="app-footer">
      <strong>GPX Editor</strong>
      <span className="app-version">
        v{version} (<time dateTime={releaseDate}>{formattedDate}</time>)
      </span>
    </footer>
  );
}
