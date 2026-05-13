-- BUYERS
create table buyers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  entity_name text,
  phone text,
  email text,
  primary_region text,
  secondary_regions text[],
  min_price int,
  max_price int,
  property_types text[],
  strategy text[],
  preferred_zips text[],
  total_properties_owned int default 0,
  last_purchase_date date,
  source text not null,
  source_confidence int default 3,
  active_flag boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index idx_buyers_phone on buyers(phone) where phone is not null;
create unique index idx_buyers_email on buyers(email) where email is not null;
create index idx_buyers_region_price on buyers(primary_region, min_price, max_price);
create index idx_buyers_active on buyers(active_flag) where active_flag = true;

-- WHOLESALERS (our clients)
create table wholesalers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  subscription_tier text default 'trial',
  mrr int default 0,
  region_focus text[],
  active_flag boolean default true,
  created_at timestamptz default now()
);

-- DEALS
create table deals (
  id uuid primary key default gen_random_uuid(),
  wholesaler_id uuid references wholesalers(id),
  address text not null,
  zip text,
  region text,
  asking_price int,
  est_arv int,
  est_repairs int,
  beds int,
  baths numeric,
  sqft int,
  lot_size int,
  deal_score int,
  status text default 'new',
  kill_reason text,
  zillow_url text,
  notes text,
  created_at timestamptz default now()
);
create index idx_deals_status on deals(status);
create index idx_deals_wholesaler on deals(wholesaler_id);

-- OUTREACH
create table outreach (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  buyer_id uuid references buyers(id),
  channel text check (channel in ('sms', 'email')),
  message_text text,
  sent_at timestamptz,
  response_at timestamptz,
  response_type text,
  closed_flag boolean default false
);
create index idx_outreach_deal on outreach(deal_id);
create index idx_outreach_buyer on outreach(buyer_id);

-- DISCOVERY RUNS (logging)
create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  run_at timestamptz default now(),
  buyers_added int default 0,
  buyers_updated int default 0,
  errors text
);
