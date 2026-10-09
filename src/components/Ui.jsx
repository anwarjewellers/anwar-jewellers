import { Link } from 'react-router-dom';

export const Loading = () => (
  <div className="text-center py-5"><div className="spinner-border text-warning" role="status"><span className="visually-hidden">Loading…</span></div></div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <div className="container py-5 text-center">
    <p className="text-danger">{error?.message || 'Something went wrong.'}</p>
    {onRetry && <button className="btn btn-outline-gold" onClick={onRetry}>Try again</button>}
  </div>
);

export const FieldError = ({ msg }) => (msg ? <div className="invalid-feedback d-block">{msg}</div> : null);

export const Badge = ({ info }) => <span className={`badge text-bg-${info.badge}`}>{info.label}</span>;

export const Empty = ({ icon = 'bi-bag', title, children }) => (
  <div className="empty-state">
    <i className={`bi ${icon}`} />
    <h2 className="h5 text-light">{title}</h2>
    {children}
  </div>
);

/** Page links that keep the other query parameters. */
export function Pagination({ page, lastPage, makeHref }) {
  if (!lastPage || lastPage <= 1) return null;
  const pages = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(lastPage, page + 2); p++) pages.push(p);
  return (
    <nav className="mt-4" aria-label="Pages">
      <ul className="pagination justify-content-center flex-wrap">
        <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><Link className="page-link" to={makeHref(page - 1)}>‹</Link></li>
        {pages[0] > 1 && <li className="page-item"><Link className="page-link" to={makeHref(1)}>1</Link></li>}
        {pages.map((p) => (
          <li key={p} className={`page-item ${p === page ? 'active' : ''}`}><Link className="page-link" to={makeHref(p)}>{p}</Link></li>
        ))}
        {pages[pages.length - 1] < lastPage && <li className="page-item"><Link className="page-link" to={makeHref(lastPage)}>{lastPage}</Link></li>}
        <li className={`page-item ${page >= lastPage ? 'disabled' : ''}`}><Link className="page-link" to={makeHref(page + 1)}>›</Link></li>
      </ul>
    </nav>
  );
}
