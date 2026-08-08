// Loading / error / empty views.
//
// Every screen needs all three and they were being re-invented inline (or,
// more often, omitted — which is how the league tab ended up able to hang on
// a spinner forever). One implementation keeps them consistent and makes the
// error state impossible to forget, because AsyncSection demands it.
import React from 'react';
import { SvgIcon, UiIcon } from './IconAsset.jsx';

export function LoadingView({ label = 'در حال بارگذاری...' }) {
  return (
    <div className="card loadingCard">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function ErrorView({ error, onRetry }) {
  const offline = error?.offline;
  return (
    <div className="card errorCard">
      <span className="errIcon"><SvgIcon name={offline ? 'support' : 'warning'} size={32} /></span>
      <b>{offline ? 'اتصال اینترنت برقرار نیست' : 'مشکلی پیش آمد'}</b>
      <p>{error?.message || 'دوباره تلاش کن'}</p>
      {onRetry && (
        <button className="main" onClick={onRetry}>تلاش دوباره</button>
      )}
    </div>
  );
}

export function EmptyView({ icon = 'search', children }) {
  return <div className="empty"><UiIcon name={icon || 'search'} size={30} /> {children}</div>;
}

/**
 * Renders the right view for an async slice of state.
 *
 * Using this makes the error branch mandatory by construction — the whole
 * reason the "stuck forever" bug was possible is that the old pattern let a
 * screen ship with only a loading branch.
 */
export function AsyncSection({ state, children, loadingLabel }) {
  if (state.loading && state.data == null) {
    return <LoadingView label={loadingLabel} />;
  }
  if (state.error && state.data == null) {
    return <ErrorView error={state.error} onRetry={state.reload} />;
  }
  return children(state.data);
}
