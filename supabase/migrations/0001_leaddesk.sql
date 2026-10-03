-- LeadDesk: leads table, fields from materials/leads.json (camelCase -> snake_case).
create table public.leads (
  id         text primary key check (id ~ '^lead_[0-9]{4}$'),
  full_name  text not null,
  company    text not null,
  email      text not null,
  source     text not null,
  status     text not null default 'new'
             check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  budget     integer,
  message    text not null,
  created_at timestamptz not null default now()
);

-- RLS on, no policies: anon/authenticated roles get no rows through the Data API.
alter table public.leads enable row level security;
