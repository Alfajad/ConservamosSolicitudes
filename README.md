# Panel Interno — Conservamos Tus Espacios

Panel privado para revisar solicitudes recibidas desde la página pública de proveedores.

## Funcionalidad
- Inicio de sesión por correo y contraseña con Supabase Auth.
- Consulta de solicitudes.
- Filtros Pendiente / Aprobado / Rechazado.
- Buscador.
- Ficha completa.
- Aprobar / Rechazar / volver a Pendiente.
- Cerrar sesión.

## Seguridad
El panel usa la publishable key del proyecto, que no concede por sí sola acceso administrativo.
La protección real se configura mediante Supabase Auth + RLS.

## SQL necesario
Ejecutar en Supabase SQL Editor:

grant select, update on table public.solicitudes_proveedores to authenticated;

create policy "Personal interno puede ver solicitudes"
on public.solicitudes_proveedores
for select
to authenticated
using (true);

create policy "Personal interno puede actualizar solicitudes"
on public.solicitudes_proveedores
for update
to authenticated
using (true)
with check (true);

## Usuario interno
Crear/invitar usuarios desde Supabase Dashboard > Authentication > Users.

No agregar políticas SELECT o UPDATE para anon.

## V7 — aprobación automática
El botón Aprobar llama a `public.aprobar_proveedor(p_solicitud_id)`.
La función:
1. crea el registro en `public.proveedores` si no existe;
2. marca la solicitud como `Aprobado`;
3. evita duplicar una solicitud ya migrada.
