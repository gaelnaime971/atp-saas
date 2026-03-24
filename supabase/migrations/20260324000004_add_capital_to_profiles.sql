-- Add capital and nb_accounts to profiles for prop firm tracking
alter table profiles add column capital numeric(12,2) default 0;
alter table profiles add column nb_accounts int default 1;
