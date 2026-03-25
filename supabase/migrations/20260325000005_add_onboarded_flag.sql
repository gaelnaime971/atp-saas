-- Flag to track first-login onboarding
alter table profiles add column if not exists onboarded boolean default false;
