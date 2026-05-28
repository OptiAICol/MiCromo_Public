import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

// — Contexto de notificaciones pendientes —
interface NotificacionesCtxValue {
  pendientes: number;
  recargar:   () => void;
}
export const NotificacionesCtx = createContext<NotificacionesCtxValue>({
  pendientes: 0,
  recargar:   () => {},
});
export const useNotificaciones = () => useContext(NotificacionesCtx);

// — Barra de navegación personalizada —
function BarraNavegacion({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { pendientes, recargar } = useContext(NotificacionesCtx);
  const { t } = useTheme();

  return (
    <View style={[styles.barra, { paddingBottom: insets.bottom || 10, backgroundColor: t.tarjeta, borderTopColor: t.sep }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        if (options.tabBarButton) return null;
        const label  = (options.title ?? route.name) as string;
        const activo = state.index === index;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!activo && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
              // Refrescar el conteo al cambiar de tab
              if (!activo) recargar();
            }}
          >
            {activo && <View style={styles.indicadorTop} />}
            <View style={[styles.pastilla, activo && styles.pastillaActiva, !activo && { backgroundColor: 'transparent' }]}>
              <Text style={[styles.texto, { color: t.textoTer }, activo && styles.textoActivo]} numberOfLines={1}>
                {label}
              </Text>
              {route.name === 'perfil' && pendientes > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTexto}>
                    {pendientes > 9 ? '9+' : String(pendientes)}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// — Layout principal de tabs —
export default function TabsLayout() {
  const { usuario } = useAuth();
  const [pendientes, setPendientes] = useState(0);

  const recargar = useCallback(async () => {
    if (!usuario?.id) { setPendientes(0); return; }
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabase
        .from('solicitudes')
        .select('id', { count: 'exact', head: true })
        .eq('receptor_id', usuario.id)
        .eq('estado', 'pendiente'),
      supabase
        .from('contactos_anuncio')
        .select('id', { count: 'exact', head: true })
        .eq('vendedor_id', usuario.id)
        .eq('estado', 'pendiente'),
    ]);
    setPendientes((c1 ?? 0) + (c2 ?? 0));
  }, [usuario?.id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return (
    <NotificacionesCtx.Provider value={{ pendientes, recargar }}>
      <Tabs
        tabBar={props => <BarraNavegacion {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index"         options={{ title: 'Mercado' }} />
        <Tabs.Screen name="album"         options={{ title: 'Mi Álbum' }} />
        <Tabs.Screen name="anuncios"      options={{ title: 'Anuncios' }} />
        <Tabs.Screen name="perfil"        options={{ title: 'Perfil' }} />
        <Tabs.Screen name="editar-perfil" options={{ href: null, title: 'Editar perfil' }} />
      </Tabs>
    </NotificacionesCtx.Provider>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 4,
  },
  indicadorTop: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#e63946',
  },
  pastilla: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  pastillaActiva: {
    backgroundColor: '#fef0f1',  // stays red-tinted even in dark — deliberate accent
  },
  texto: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
    textAlign: 'center',
  },
  textoActivo: {
    color: '#e63946',
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#e63946',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeTexto: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
});
