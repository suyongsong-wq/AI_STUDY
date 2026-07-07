-- ============================================================
-- ☕ Ember Roasters · 커피 쇼핑몰 (스페셜티 로스터리)
-- 5주차 Sweet Spot 쇼핑몰과 동일한 Auth + DB 구조
-- Supabase 프로젝트: ibxhnwovdtnfttfzqpos (MEMO)
-- ============================================================

-- ── 상품 테이블 (공개 읽기) ──────────────────────────────
create table if not exists public.coffee_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  price       integer not null,          -- KRW (원)
  image_url   text,
  description text,
  category    text,                       -- 싱글오리진 / 블렌드 / 드립백
  origin      text,                       -- 원산지
  roast       text,                       -- 로스팅 (라이트/미디엄/다크)
  created_at  timestamptz not null default now()
);

alter table public.coffee_products enable row level security;

drop policy if exists "coffee_products public read" on public.coffee_products;
create policy "coffee_products public read"
  on public.coffee_products for select
  using (true);   -- 비로그인 포함 누구나 상품 조회 가능

-- ── 장바구니 테이블 (본인만) ─────────────────────────────
create table if not exists public.coffee_cart (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  uuid not null references public.coffee_products(id) on delete cascade,
  quantity    integer not null default 1 check (quantity > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.coffee_cart enable row level security;

drop policy if exists "coffee_cart select own" on public.coffee_cart;
create policy "coffee_cart select own"
  on public.coffee_cart for select using (auth.uid() = user_id);

drop policy if exists "coffee_cart insert own" on public.coffee_cart;
create policy "coffee_cart insert own"
  on public.coffee_cart for insert with check (auth.uid() = user_id);

drop policy if exists "coffee_cart update own" on public.coffee_cart;
create policy "coffee_cart update own"
  on public.coffee_cart for update using (auth.uid() = user_id);

drop policy if exists "coffee_cart delete own" on public.coffee_cart;
create policy "coffee_cart delete own"
  on public.coffee_cart for delete using (auth.uid() = user_id);

-- ── 상품 관리자 쓰기 (로그인 사용자 = 데모 관리자) ────────
-- 6주차 이미지 업로드(상품 등록) 기능용
drop policy if exists "coffee_products insert authenticated" on public.coffee_products;
create policy "coffee_products insert authenticated"
  on public.coffee_products for insert to authenticated with check (true);

drop policy if exists "coffee_products delete authenticated" on public.coffee_products;
create policy "coffee_products delete authenticated"
  on public.coffee_products for delete to authenticated using (true);

-- ── 주문 테이블 (본인만) · 6주차 마이페이지/결제 ─────────
create table if not exists public.coffee_orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  total_price  integer not null,
  status       text not null default 'paid',   -- paid / pending / cancelled
  paid_at      timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.coffee_orders enable row level security;

drop policy if exists "coffee_orders select own" on public.coffee_orders;
create policy "coffee_orders select own"
  on public.coffee_orders for select using (auth.uid() = user_id);

drop policy if exists "coffee_orders insert own" on public.coffee_orders;
create policy "coffee_orders insert own"
  on public.coffee_orders for insert with check (auth.uid() = user_id);

-- ── 주문 상품 (주문 소유자만) · 상품명/단가 스냅샷 보존 ──
create table if not exists public.coffee_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.coffee_orders(id) on delete cascade,
  product_id    uuid references public.coffee_products(id) on delete set null,
  product_name  text not null,
  quantity      integer not null check (quantity > 0),
  price         integer not null
);

alter table public.coffee_order_items enable row level security;

drop policy if exists "coffee_order_items select own" on public.coffee_order_items;
create policy "coffee_order_items select own"
  on public.coffee_order_items for select using (
    exists (select 1 from public.coffee_orders o where o.id = order_id and o.user_id = auth.uid())
  );

drop policy if exists "coffee_order_items insert own" on public.coffee_order_items;
create policy "coffee_order_items insert own"
  on public.coffee_order_items for insert with check (
    exists (select 1 from public.coffee_orders o where o.id = order_id and o.user_id = auth.uid())
  );
