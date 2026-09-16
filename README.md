# FLOW

Launcher da Central de Gestão e Operações.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Primeiro acesso

1. Rode `supabase/migrations/0001_flow_auth.sql` no SQL Editor do Supabase.
2. (Opcional) `npm run bootstrap:auth` para criar/atualizar o usuário via Admin API.
3. Login inicial: o e-mail e a senha de primeiro acesso estão no `.env.local`.

A `service_role` nunca vai para o launcher. Só a chave `anon` entra no cliente.

## Instalador

```bash
npm run dist
```

Gera `release/FLOW-Setup-<versão>.exe`.

## Atualização automática

O launcher consulta releases do repositório [MuriloFlow/FlowOne](https://github.com/MuriloFlow/FlowOne).

Para publicar uma versão:

```bash
git tag v1.0.1
git push origin v1.0.1
```

O GitHub Actions só publica o `Setup.exe` depois de typecheck e build passarem.
