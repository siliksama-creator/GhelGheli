# دیاگرام ER ساده فاز ۱

```mermaid
erDiagram
  users ||--o{ card_codes : consumes
  users ||--o{ user_card_inventory : owns
  card_types ||--o{ card_codes : has
  card_types ||--o{ user_card_inventory : inventory
  users ||--o{ user_reward_claims : claims
  reward_tiers ||--o{ user_reward_claims : tier
  league_seasons ||--o{ league_leaderboard_entries : ranks
  users ||--o{ league_leaderboard_entries : scores
  league_seasons ||--o{ league_payouts : payouts
  users ||--o{ league_payouts : receives
  users ||--o{ chat_messages : writes
  users ||--o{ support_tickets : opens
  support_tickets ||--o{ support_ticket_messages : includes
  users ||--o{ notifications : receives
  admin_users ||--o{ audit_log : performs

  users {
    uuid id PK
    varchar mobile UNIQUE
    boolean mobile_verified
    varchar password_hash
    varchar first_name
    varchar last_name
    varchar nickname
    text profile_image_url
    varchar bank_account
    integer current_points
    integer lifetime_points
    integer monthly_league_points
    varchar status
    timestamptz joined_at
  }
  card_types {
    uuid id PK
    varchar name
    text image_url
    text description
    integer point_value
    boolean is_active
  }
  card_codes {
    uuid id PK
    varchar code UNIQUE
    uuid card_type_id FK
    varchar status
    uuid used_by_user_id FK
    timestamptz used_at
  }
  user_card_inventory {
    uuid id PK
    uuid user_id FK
    uuid card_type_id FK
    integer quantity
    boolean consumed_in_reward
  }
  reward_tiers {
    uuid id PK
    varchar name
    integer required_points
    varchar reward_type
    text reward_value
    integer display_order
  }
  user_reward_claims {
    uuid id PK
    uuid user_id FK
    uuid reward_tier_id FK
    integer points_at_claim
    varchar status
    timestamptz claimed_at
  }
  league_seasons {
    uuid id PK
    varchar month_year
    timestamptz starts_at
    timestamptz ends_at
    varchar status
    jsonb prize_table
  }
```
