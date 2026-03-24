-- Replace token (hex) with a 6-digit numeric code
alter table invitations
  drop column token;

alter table invitations
  add column code char(6) unique not null default lpad((floor(random() * 900000) + 100000)::text, 6, '0');
