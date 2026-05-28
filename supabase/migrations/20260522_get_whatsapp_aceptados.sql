-- Devuelve el whatsapp de vendedores solo si el usuario llamante
-- tiene un contacto_anuncio en estado 'aceptada' con ellos.
-- SECURITY DEFINER: la función corre con permisos del owner (postgres),
-- pero la lógica verifica auth.uid() para garantizar que solo se
-- devuelven datos para contactos realmente aceptados.
CREATE OR REPLACE FUNCTION get_whatsapp_vendedores_aceptados(p_vendedor_ids UUID[])
RETURNS TABLE (usuario_id UUID, whatsapp TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.usuario_id, p.whatsapp
  FROM perfiles p
  WHERE p.usuario_id = ANY(p_vendedor_ids)
    AND EXISTS (
      SELECT 1
      FROM contactos_anuncio ca
      WHERE ca.vendedor_id  = p.usuario_id
        AND ca.comprador_id = auth.uid()
        AND ca.estado       = 'aceptada'
    );
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_whatsapp_vendedores_aceptados(UUID[]) TO authenticated;
