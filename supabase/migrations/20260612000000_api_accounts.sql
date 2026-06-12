create table if not exists api_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  plan text not null default 'free' check (plan in ('free','pro','publisher','enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table api_keys add column if not exists account_id uuid references api_accounts(id);
alter table api_keys add column if not exists revoked_at timestamptz;
create table if not exists api_requests (
  id bigint generated always as identity primary key,
  api_key_id uuid references api_keys(id),
  account_id uuid references api_accounts(id),
  endpoint text not null,
  status int not null,
  created_at timestamptz not null default now()
);
create index if not exists api_requests_account_month on api_requests (account_id, created_at);
create or replace function monthly_request_count(p_account uuid) returns bigint
language sql stable as $$
  select count(*) from api_requests
  where account_id = p_account
    and created_at >= date_trunc('month', now() at time zone 'utc');
$$;
create index if not exists services_slug_idx on services (slug);
create table if not exists publisher_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references api_accounts(id),
  service_id uuid not null references services(id),
  verified boolean not null default false,
  alert_email text,
  created_at timestamptz not null default now(),
  unique (account_id, service_id)
);
