import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// expo-notifications fue eliminado de Expo Go en SDK 53
// Usamos require() dinámico para que el módulo no crashee al importarse en Expo Go
const enExpoGo = Constants.executionEnvironment === 'storeClient';

// Registrar el handler de notificaciones solo en builds reales
if (!enExpoGo && Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert:  true,
        shouldPlaySound:  true,
        shouldSetBadge:   false,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    });
  } catch {
    // silenciar en entornos sin soporte
  }
}

export async function registrarTokenPush(userId: string): Promise<void> {
  if (enExpoGo || Platform.OS === 'web') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications');

    const { status: existente } = await N.getPermissionsAsync();
    let estadoFinal = existente;

    if (existente !== 'granted') {
      const { status } = await N.requestPermissionsAsync();
      estadoFinal = status;
    }

    if (estadoFinal !== 'granted') return;

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('micromo', {
        name:             'MiCromo',
        importance:       N.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return;

    const token = (await N.getExpoPushTokenAsync({ projectId })).data as string;
    if (!token) return;

    await supabase
      .from('perfiles')
      .update({ expo_push_token: token })
      .eq('usuario_id', userId);
  } catch {
    // no crítico — se reintentará en la próxima sesión
  }
}

export async function enviarNotificacion(
  token: string,
  titulo: string,
  cuerpo: string,
): Promise<void> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to: token, sound: 'default', title: titulo, body: cuerpo, channelId: 'micromo' }),
    });

    const json = await res.json() as { data?: { status?: string; details?: { error?: string } } };
    const ticket = json.data;

    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      await supabase
        .from('perfiles')
        .update({ expo_push_token: null })
        .eq('expo_push_token', token);
    }
  } catch {
    // no crítico — las notificaciones son best-effort
  }
}
