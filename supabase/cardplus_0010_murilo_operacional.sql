-- Card+ — função da loja do Murilo Giroldo
-- Rodar no SQL Editor do Supabase do Card+ (não no FLOW).
-- Não mexe no login TI_ADMIN. Só o colaborador "Murilo Giroldo" (não o Murilo vendedor).

update public.collaborators
set
  sub_role = 'Funcionario Operacional',
  is_active = true,
  merged_into_id = null
where merged_into_id is null
  and lower(name) = 'murilo giroldo';

insert into public.collaborators (name, store_id, sub_role, is_active)
select 'Murilo Giroldo', s.id, 'Funcionario Operacional', true
from public.stores s
where s.name ilike '%digaspi%41%'
  and not exists (
    select 1
    from public.collaborators c
    where c.store_id = s.id
      and c.merged_into_id is null
      and lower(c.name) = 'murilo giroldo'
  );
