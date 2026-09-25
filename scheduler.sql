-- Mene:Log daily scheduler. Run once in the SQL editor.
-- Replace PASTE_YOUR_CRON_SECRET with the same value saved as MENELOG_CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('menelog-daily-messaging')
where exists (select 1 from cron.job where jobname = 'menelog-daily-messaging');

-- Every day at 06:00 UTC (06:00 in Ghana): trial expiry, birthdays, absence follow-ups, send queue.
select cron.schedule(
  'menelog-daily-messaging',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://project--fa7ecf51-3d30-4b07-a318-3138a21a6cf2.lovable.app/api/public/cron/messaging',
    headers := '{"Content-Type":"application/json","x-menelog-cron-secret":"PASTE_YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
