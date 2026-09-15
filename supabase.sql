-- 1) Supabase > SQL Editor에서 전체 실행
create extension if not exists pgcrypto;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null check (char_length(item_name) between 1 and 80),
  quantity text not null check (char_length(quantity) between 1 and 40),
  location text not null check (char_length(location) between 1 and 80),
  expiry_date date not null,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

alter table public.inventory_items enable row level security;
revoke all on table public.inventory_items from anon, authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;

-- 로그인한 팀원은 모든 재고를 함께 조회/편집합니다.
drop policy if exists "team read inventory" on public.inventory_items;
create policy "team read inventory"
on public.inventory_items for select
to authenticated
using (true);

drop policy if exists "team insert inventory" on public.inventory_items;
create policy "team insert inventory"
on public.inventory_items for insert
to authenticated
with check ((select auth.uid()) = created_by and (select auth.uid()) = updated_by);

drop policy if exists "team update inventory" on public.inventory_items;
create policy "team update inventory"
on public.inventory_items for update
to authenticated
using (true)
with check ((select auth.uid()) = updated_by);

drop policy if exists "team delete inventory" on public.inventory_items;
create policy "team delete inventory"
on public.inventory_items for delete
to authenticated
using (true);

-- 실시간 동기화 활성화 (이미 추가되어 있다는 오류가 나면 이 줄만 건너뛰세요)
do $$
begin
  alter publication supabase_realtime add table public.inventory_items;
exception
  when duplicate_object then null;
end $$;
