// Reward catalogue.
import React from 'react';

import { asset, fa } from '../lib/api.js';
import { EmptyView } from '../components/states.jsx';

export default function Rewards({ rewards }) {
  // An empty list used to render a bare heading over blank space with no
  // explanation, while the Flutter app has always shown a real empty state.
  if (!rewards?.length) {
    return (
      <section className="card wide">
        <h2>جوایز</h2>
        <EmptyView icon="🎁">هنوز جایزه‌ای تعریف نشده است.</EmptyView>
      </section>
    );
  }

  return (
    <section className="card wide">
      <h2>جوایز</h2>
      <div className="cards">
        {rewards.map(r => (
          <div className="rewardCard" key={r.id}>
            <img alt={r.name || 'جایزه'}
              src={asset(r.image_url) || '/avatars/avatar_2_trophy.png'} />
            <b>{r.name}</b>
            <p>{fa(r.required_points)} امتیاز</p>
            {r.reward_value && <small>{r.reward_value}</small>}
          </div>
        ))}
      </div>
    </section>
  );
}
