import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme, Tema } from '@/hooks/useTheme';

export default function RecuperarScreen() {
  const router = useRouter();
  const { t } = useTheme();
  const styles = useMemo(() => crearEstilos(t), [t]);

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleEnviar() {
    if (!email.trim()) {
      setError('Ingresa tu correo electrónico.');
      return;
    }
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'micromo://reset-password',
    });

    setLoading(false);
    if (err) {
      setError('No se pudo enviar el correo. Verifica la dirección e intenta de nuevo.');
    } else {
      setEnviado(true);
    }
  }

  if (enviado) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.titulo}>MiCromo</Text>
          <View style={styles.exitoBox}>
            <Text style={styles.exitoIcono}>✉️</Text>
            <Text style={styles.exitoTitulo}>¡Correo enviado!</Text>
            <Text style={styles.exitoTexto}>
              Revisa tu bandeja de entrada y sigue el enlace para crear una nueva contraseña.
              {'\n\n'}
              Si no lo encuentras, revisa la carpeta de spam.
            </Text>
          </View>
          <Pressable style={styles.boton} onPress={() => router.back()}>
            <Text style={styles.botonTexto}>Volver al inicio de sesión</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.titulo}>MiCromo</Text>
        <Text style={styles.subtitulo}>Recuperar contraseña</Text>
        <Text style={styles.descripcion}>
          Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor={t.textoDes}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.boton, loading && styles.botonDeshabilitado]}
          onPress={handleEnviar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.botonTexto}>Enviar enlace</Text>}
        </Pressable>

        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.linkVolver}>← Volver al inicio de sesión</Text>
        </TouchableOpacity>
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
      marginBottom: 20,
    },
    botonDeshabilitado: {
      opacity: 0.6,
    },
    botonTexto: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    linkVolver: {
      color: '#e63946',
      fontSize: 14,
      textAlign: 'center',
    },
    exitoBox: {
      alignItems: 'center',
      paddingVertical: 16,
      gap: 8,
      marginBottom: 20,
    },
    exitoIcono: {
      fontSize: 40,
    },
    exitoTitulo: {
      fontSize: 18,
      fontWeight: '700',
      color: t.texto,
    },
    exitoTexto: {
      fontSize: 14,
      color: t.textoSec,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
