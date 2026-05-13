export type Buyer = {
  id: string;
  full_name: string | null;
  entity_name: string | null;
  phone: string | null;
  email: string | null;
  primary_region: string | null;
  secondary_regions: string[] | null;
  min_price: number | null;
  max_price: number | null;
  property_types: string[] | null;
  strategy: string[] | null;
  preferred_zips: string[] | null;
  total_properties_owned: number;
  last_purchase_date: string | null;
  source: string;
  source_confidence: number;
  active_flag: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Wholesaler = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  subscription_tier: string;
  mrr: number;
  region_focus: string[] | null;
  active_flag: boolean;
  created_at: string;
};

export type Deal = {
  id: string;
  wholesaler_id: string | null;
  address: string;
  zip: string | null;
  region: string | null;
  asking_price: number | null;
  est_arv: number | null;
  est_repairs: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_size: number | null;
  deal_score: number | null;
  status: "new" | "dead" | "matched" | "sent" | "closed";
  kill_reason: string | null;
  zillow_url: string | null;
  notes: string | null;
  created_at: string;
};

export type Outreach = {
  id: string;
  deal_id: string;
  buyer_id: string;
  channel: "sms" | "email";
  message_text: string | null;
  sent_at: string | null;
  response_at: string | null;
  response_type: string | null;
  closed_flag: boolean;
};

export type DiscoveryRun = {
  id: string;
  source: string;
  run_at: string;
  buyers_added: number;
  buyers_updated: number;
  errors: string | null;
};

export type Comp = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  sold_price: number;
  sold_date: string;
  distance_mi: number;
  school_zone?: string;
  has_view?: boolean;
  topography?: "hill" | "flat";
};
