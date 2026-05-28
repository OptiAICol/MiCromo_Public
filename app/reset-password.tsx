import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, Tema } from '@/hooks/useTheme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [password, setPassword]   = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleGuardar() {
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (err) {
      setError('No se pudo actualizar la contraseña. Solicita un nuevo enlace de recuperación.');
    } else {
      Alert.alert(
        '¡Contraseña actualizada!',
        'Ya puedes iniciar sesión con tu nueva contraseña.',
        [{ text: 'Entrar', onPress: () => router.replace('/(tabs)') }],
      );
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.titulo}>MiCromo</Text>
        <Text style={styles.subtitulo}>Nueva contraseña</Text>
        <Text style={styles.descripcion}>Elige una contraseña segura para tu cuenta.</Text>

        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña"
          placeholderTextColor={t.textoDes}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={t.textoDes}
          value={confirmar}
          onChangeText={setConfirmar}
          secureTextEntry
        />

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.boton, loading && styles.botonDeshabilitado]}
          onPress={handleGuardar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botonTexto}>Guardar contraseña</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function crearEstilos(t: Tema) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.fondo,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: t.tarjeta,
      borderRadius: 16,
      padding: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    titulo: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#e63946',
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitulo: {
      fontSize: 16,
      color: t.textoSec,
      textAlign: 'center',
      marginBottom: 12,
    },
    descripcion: {
      fontSize: 14,
      color: t.textoTer,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    input: {
      borderWidth: 1,
      borderColor: t.bordeInput,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.texto,
      marginBottom: 14,
      backgroundColor: t.input,
    },
    error: {
      color: '#e63946',
      fontSize: 14,
      marginBottom: 12,
      textAlign: 'center',
    },
    boton: {
      backgroundColor: '#e63946',
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    botonDeshabilitado: {
      opacity: 0.6,
    },
    botonTexto: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
