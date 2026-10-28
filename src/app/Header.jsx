export function Header({ onHelp }) {
  return (
    <header>
      <a className="brand" href="./">
        <img
          className="brand-logo"
          src="logo.svg"
          alt=""
          width="44"
          height="44"
        />
        <span>GPX Editor</span>
      </a>
      <button
        id="help-open"
        onClick={onHelp}
        className="help-link"
        aria-haspopup="dialog"
      >
        Как пользоваться?
      </button>
    </header>
  );
}
