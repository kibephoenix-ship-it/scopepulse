create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on public.workspaces, public.workspace_members from anon, authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

drop policy if exists "Members view their workspaces" on public.workspaces;
create policy "Members view their workspaces"
  on public.workspaces
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members membership
      where membership.workspace_id = id
        and membership.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners create workspaces" on public.workspaces;
create policy "Owners create workspaces"
  on public.workspaces
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners update their workspaces" on public.workspaces;
create policy "Owners update their workspaces"
  on public.workspaces
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners delete their workspaces" on public.workspaces;
create policy "Owners delete their workspaces"
  on public.workspaces
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Members view their own memberships" on public.workspace_members;
create policy "Members view their own memberships"
  on public.workspace_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.initialize_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces (owner_id, name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'workspace_name'), ''), 'My workspace')
  )
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_workspace on auth.users;
create trigger on_auth_user_created_workspace
  after insert on auth.users
  for each row execute function public.initialize_user_workspace();

revoke all on function public.initialize_user_workspace() from public, anon, authenticated;

create or replace function public.create_workspace(workspace_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  new_workspace public.workspaces;
begin
  if current_user_id is null then
    raise exception 'Sign in to create a workspace.';
  end if;
  if workspace_name is null or char_length(btrim(workspace_name)) not between 2 and 80 then
    raise exception 'Workspace names must be between 2 and 80 characters.';
  end if;

  insert into public.workspaces (owner_id, name)
  values (current_user_id, btrim(workspace_name))
  returning * into new_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace.id, current_user_id, 'owner');

  return jsonb_build_object(
    'id', new_workspace.id,
    'name', new_workspace.name,
    'owner_id', new_workspace.owner_id,
    'created_at', new_workspace.created_at
  );
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

insert into public.workspaces (owner_id, name)
select account.id, 'My workspace'
from auth.users account
where not exists (
  select 1 from public.workspaces existing where existing.owner_id = account.id
);

insert into public.workspace_members (workspace_id, user_id, role)
select workspace.id, workspace.owner_id, 'owner'
from public.workspaces workspace
on conflict (workspace_id, user_id) do nothing;

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  project_name text not null default 'Product design',
  brief text not null,
  tone text not null check (tone in ('collaborative', 'formal', 'bold')),
  summary text not null default '',
  proposal_body text not null default '',
  risks jsonb not null default '[]'::jsonb,
  tiers jsonb not null default '{}'::jsonb,
  selected_tier text not null default 'standard'
    check (selected_tier in ('quick', 'standard', 'enterprise')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'won', 'lost')),
  share_slug uuid not null default gen_random_uuid() unique,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposals
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.proposals proposal
set workspace_id = workspace.id
from public.workspaces workspace
where proposal.workspace_id is null
  and workspace.owner_id = proposal.user_id;

alter table public.proposals alter column workspace_id set not null;
alter table public.proposals enable row level security;
revoke all on public.proposals from anon, authenticated;
grant select, insert, update, delete on public.proposals to authenticated;
grant select (
  id,
  client_name,
  project_name,
  summary,
  proposal_body,
  tiers,
  selected_tier,
  share_slug,
  is_shared,
  created_at
) on public.proposals to anon;

drop policy if exists "Owners manage their proposals" on public.proposals;
drop policy if exists "Workspace members manage proposals" on public.proposals;
create policy "Workspace members manage proposals"
  on public.proposals
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members membership
      where membership.workspace_id = proposals.workspace_id
        and membership.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.workspace_members membership
      where membership.workspace_id = proposals.workspace_id
        and membership.user_id = (select auth.uid())
    )
  );

drop policy if exists "Anyone can view a shared proposal" on public.proposals;
create policy "Anyone can view a shared proposal"
  on public.proposals
  for select
  to anon, authenticated
  using (is_shared = true);

create table if not exists public.proposal_acceptances (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  tier text not null check (tier in ('quick', 'standard', 'enterprise')),
  signer_name text not null check (char_length(signer_name) between 2 and 120),
  consent_text text not null,
  accepted_at timestamptz not null default now()
);

alter table public.proposal_acceptances enable row level security;
revoke all on public.proposal_acceptances from anon, authenticated;
grant insert (proposal_id, tier, signer_name, consent_text)
  on public.proposal_acceptances to anon;
grant select on public.proposal_acceptances to authenticated;

drop policy if exists "Clients can accept a shared proposal" on public.proposal_acceptances;
create policy "Clients can accept a shared proposal"
  on public.proposal_acceptances
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.proposals proposal
      where proposal.id = proposal_id
        and proposal.is_shared = true
    )
  );

drop policy if exists "Owners view their proposal acceptances" on public.proposal_acceptances;
drop policy if exists "Workspace members view proposal acceptances" on public.proposal_acceptances;
create policy "Workspace members view proposal acceptances"
  on public.proposal_acceptances
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.proposals proposal
      join public.workspace_members membership
        on membership.workspace_id = proposal.workspace_id
      where proposal.id = proposal_id
        and membership.user_id = (select auth.uid())
    )
  );

create or replace function public.mark_proposal_won_on_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.proposals
  set status = 'won', updated_at = now()
  where id = new.proposal_id;
  return new;
end;
$$;

drop trigger if exists proposal_acceptance_marks_won on public.proposal_acceptances;
create trigger proposal_acceptance_marks_won
  after insert on public.proposal_acceptances
  for each row execute function public.mark_proposal_won_on_acceptance();

revoke all on function public.mark_proposal_won_on_acceptance() from public, anon, authenticated;

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, workspace_id);
create index if not exists proposals_workspace_created_idx
  on public.proposals (workspace_id, created_at desc);
