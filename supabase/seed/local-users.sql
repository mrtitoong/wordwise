-- Tài khoản mẫu CHỈ dùng cho Supabase cục bộ và CI. KHÔNG chạy trên cloud.
--   admin@wordwise.local / wordwise-local-admin  (vai trò admin)
--   minh@wordwise.local  / wordwise-local-user   (người dùng thường)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'admin@wordwise.local',
   extensions.crypt('wordwise-local-admin', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin WordWise"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'minh@wordwise.local',
   extensions.crypt('wordwise-local-user', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Minh"}', now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002')
on conflict do nothing;

-- Trigger handle_new_user đã tạo profiles; nâng tài khoản admin.
update public.profiles set role = 'admin'
where user_id = 'a0000000-0000-4000-8000-000000000001';
