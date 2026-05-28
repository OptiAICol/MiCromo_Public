import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { registrarTokenPush } from '@/lib/notificaciones';
import { TemaProvider } from '@/hooks/useTheme';

// Mantiene el splash visible hasta que la app esté lista
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Oculta el splash cuando la sesión ya está resuelta
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Redirecciones de autenticación
  useEffect(() => {
    if (loading) return;

    const enGrupoAuth    = segments[0] === '(auth)';
    const enResetPassword = segments[0] === 'reset-password';

    if (!session && !enGrupoAuth && !enResetPassword) {
      router.replace('/(auth)/login');
    } else if (session && enGrupoAuth) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  // Registrar token de notificaciones cuando hay sesión activa
  useEffect(() => {
    if (session?.user?.id) {
      registrarTokenPush(session.user.id);
    }
  }, [session?.user?.id]);

  // Manejar deep links de recuperación de contraseña
  useEffect(() => {
    function procesarUrl(url: string) {
      if (!url.includes('reset-password')) return;

      // Extraer tokens del fragmento: access_token, refresh_token, type=recovery
      const fragmento = url.split('#')[1] ?? '';
      const params: Record<string, string> = {};
      for (const par of fragmento.split('&')) {
        const [clave, valor] = par.split('=');
        if (clave && valor) params[decodeURIComponent(clave)] = decodeURIComponent(valor);
      }

      if (params.access_token && params.type === 'recovery') {
        supabase.auth
          .setSession({
            access_token:  params.access_token,
            refresh_token: params.refresh_token ?? '',
          })
          .then(({ error }) => {
            if (!error) router.replace('/reset-password');
          });
      }
    }

    // URL que abrió la app (app estaba cerrada)
    Linking.getInitialURL().then(url => { if (url) procesarUrl(url); });

    // URL mientras la app estaba abierta
    const sub = Linking.addEventListener('url', ({ url }) => procesarUrl(url));
    return () => sub.remove();
  }, []);

  // Escuchar evento PASSWORD_RECOVERY como respaldo
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator size="large" color="#e63946" />
      </View>
    );
  }

  return (
    <TemaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </TemaProvider>
  );
}

const styles = StyleSheet.create({
  cargando: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
});
