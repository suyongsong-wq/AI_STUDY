-- ============================================================
-- 당근마켓 클론 · Supabase 스키마 (project: ibxhnwovdtnfttfzqpos)
-- Auth(auth.users) + DB(RLS) + Storage(carrot-images)
-- 테이블 접두사 carrot_ : 같은 Supabase 프로젝트를 주차별 앱이 공유하기 때문
--
-- ⚠️ 설계 노트: 사용자 참조는 전부 auth.users 가 아니라 carrot_profiles(id) 를 향한다.
--    PostgREST 는 FK 가 있어야 임베딩(조인)을 해주는데, auth 스키마로는 조인이 안 되기 때문.
--    carrot_profiles.id 자체가 auth.users.id 이므로 무결성은 동일하게 유지된다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 프로필 (닉네임 + 동네)
-- ------------------------------------------------------------
create table if not exists public.carrot_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null,
  region     text not null,                    -- 동네 (예: 서울 강남구 역삼동)
  created_at timestamptz not null default now()
);

alter table public.carrot_profiles enable row level security;

-- 판매자 닉네임/동네는 누구나 볼 수 있어야 함 (상품 상세, 채팅 상대 표시)
create policy "profiles_select_all" on public.carrot_profiles
  for select using (true);
create policy "profiles_insert_own" on public.carrot_profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.carrot_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ------------------------------------------------------------
-- 2. 상품
-- ------------------------------------------------------------
create table if not exists public.carrot_products (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid()
              constraint carrot_products_user_id_fkey
              references public.carrot_profiles(id) on delete cascade,
  title       text not null,
  price       integer not null default 0,
  description text not null default '',
  category    text not null,
  region      text not null default '',        -- 등록 시점 동네 스냅샷
  images      text[] not null default '{}',    -- 최대 3장 (Storage public URL)
  status      text not null default 'selling', -- selling | sold
  created_at  timestamptz not null default now()
);

create index if not exists carrot_products_created_idx  on public.carrot_products (created_at desc);
create index if not exists carrot_products_category_idx on public.carrot_products (category);
create index if not exists carrot_products_user_idx     on public.carrot_products (user_id);

alter table public.carrot_products enable row level security;

-- 목록/검색은 비로그인도 볼 수 있게 공개 읽기
create policy "products_select_all" on public.carrot_products
  for select using (true);
-- 본인만 등록/수정/삭제 (퀘스트 Part 2 요구사항)
create policy "products_insert_own" on public.carrot_products
  for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.carrot_products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_delete_own" on public.carrot_products
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. 관심 (찜)
-- ------------------------------------------------------------
create table if not exists public.carrot_favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid()
             constraint carrot_favorites_user_id_fkey
             references public.carrot_profiles(id) on delete cascade,
  product_id bigint not null references public.carrot_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists carrot_favorites_product_idx on public.carrot_favorites (product_id);

alter table public.carrot_favorites enable row level security;

-- 상세 페이지의 "관심 N" 카운트를 위해 읽기는 공개, 쓰기는 본인만
create policy "favorites_select_all" on public.carrot_favorites
  for select using (true);
create policy "favorites_insert_own" on public.carrot_favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.carrot_favorites
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4. 채팅방 (상품 1개 × 구매자 1명 = 방 1개)
-- ------------------------------------------------------------
create table if not exists public.carrot_chat_rooms (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.carrot_products(id) on delete cascade,
  buyer_id   uuid not null default auth.uid()
             constraint carrot_chat_rooms_buyer_id_fkey
             references public.carrot_profiles(id) on delete cascade,
  seller_id  uuid not null
             constraint carrot_chat_rooms_seller_id_fkey
             references public.carrot_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index if not exists carrot_rooms_buyer_idx  on public.carrot_chat_rooms (buyer_id);
create index if not exists carrot_rooms_seller_idx on public.carrot_chat_rooms (seller_id);

alter table public.carrot_chat_rooms enable row level security;

-- 방 참여자(구매자·판매자)만 조회
create policy "rooms_select_participant" on public.carrot_chat_rooms
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);
-- 구매자가 방을 연다. seller_id 위조 방지를 위해 상품 소유자와 일치해야 통과
create policy "rooms_insert_buyer" on public.carrot_chat_rooms
  for insert with check (
    auth.uid() = buyer_id
    and seller_id = (select p.user_id from public.carrot_products p where p.id = product_id)
    and auth.uid() <> seller_id                -- 자기 상품에 자기가 채팅 걸 수 없음
  );

-- ------------------------------------------------------------
-- 5. 메시지 (폴링으로 실시간처럼 조회)
-- ------------------------------------------------------------
create table if not exists public.carrot_messages (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references public.carrot_chat_rooms(id) on delete cascade,
  sender_id  uuid not null default auth.uid()
             constraint carrot_messages_sender_id_fkey
             references public.carrot_profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists carrot_messages_room_idx on public.carrot_messages (room_id, created_at);

alter table public.carrot_messages enable row level security;

-- 참여 중인 방의 메시지만 읽기
create policy "messages_select_participant" on public.carrot_messages
  for select using (
    exists (
      select 1 from public.carrot_chat_rooms r
      where r.id = room_id and (auth.uid() = r.buyer_id or auth.uid() = r.seller_id)
    )
  );
-- 참여 중인 방에, 본인 명의로만 전송
create policy "messages_insert_participant" on public.carrot_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.carrot_chat_rooms r
      where r.id = room_id and (auth.uid() = r.buyer_id or auth.uid() = r.seller_id)
    )
  );

-- ------------------------------------------------------------
-- 6. Storage — 상품 이미지 버킷
--    경로 규칙: <auth.uid()>/<파일명>  ← 정책이 첫 폴더명으로 소유자를 판별한다
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carrot-images', 'carrot-images', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- 이미지는 누구나 볼 수 있어야 함 (비로그인 목록에서도 썸네일 노출)
drop policy if exists "carrot_images_read_all" on storage.objects;
create policy "carrot_images_read_all" on storage.objects
  for select using (bucket_id = 'carrot-images');

-- 업로드는 로그인 사용자가 본인 uid 폴더에만
drop policy if exists "carrot_images_insert_own" on storage.objects;
create policy "carrot_images_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'carrot-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 삭제도 본인 폴더만
drop policy if exists "carrot_images_delete_own" on storage.objects;
create policy "carrot_images_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'carrot-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
